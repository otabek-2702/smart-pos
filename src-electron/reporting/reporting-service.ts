import { ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { getConfiguredBackendHost, isMainPc, localBackendBaseUrl } from '../device-role';
import { kvGet, onKvChanged } from '../kv-store';
import { getPersistDir } from '../persist-path';
import {
  mapBackendOrder,
  unwrapBackendOrder,
  unwrapBackendOrders,
  type BackendOrderSnapshot,
} from './backend-order-mapper';
import { assertReportManagerPayload } from './report-access';
import { ReportConfig, type TelegramReportPreferences } from './report-config';
import { ReportOutbox, type ReportMutationKind } from './report-outbox';
import { ReportStore } from './report-store';
import type { OrderReportRecord, ReportEntityId } from './report-types';
import {
  TelegramReportBot,
  validateAndConfigureTelegramBot,
  type ReportBotHealth,
} from './telegram-report-bot';

const REPORT_SERVER_PORT = 8771;
const OUTBOX_INTERVAL_MS = 2_000;
const RECONCILE_INTERVAL_MS = 10 * 60_000;
const LIST_PAGE_SIZE = 100;
const WATERMARK_OVERLAP_MS = 5 * 60_000;
const DETAIL_FETCH_CONCURRENCY = 8;

export interface ReportingStatus {
  isMainPc: boolean;
  backendHost: string;
  configured: boolean;
  running: boolean;
  botName: string | null;
  botUsername: string | null;
  pairedOwner: {
    displayName: string;
    username?: string;
    pairedAt: string;
  } | null;
  pairingExpiresAt: string | null;
  preferences: TelegramReportPreferences;
  storedOrderCount: number;
  databaseSizeBytes: number;
  earliestOrderAt: string | null;
  latestOrderAt: string | null;
  lastSyncAt: string | null;
  lastCaptureAt: string | null;
  pendingRefreshCount: number;
  lastError: string | null;
}

export interface PairingResult {
  url: string;
  expiresAt: string;
}

export interface ReportingServiceOptions {
  /**
   * Test seam. Production opens the SQLite report store only after this
   * machine has been identified as the main PC.
   */
  storeFactory?: (baseDir: string) => ReportStore;
}

export interface ReportingReconciliationOptions {
  includeWeek: boolean;
  fromBusinessDate: string;
  currentWatermark: string | null;
  pageSize?: number;
  detailConcurrency?: number;
  fetchPage: (
    page: number,
    orderBy: '-created_at' | '-updated_at',
    pageSize: number,
  ) => Promise<{
    orders: BackendOrderSnapshot[];
    hasNext: boolean | null;
  }>;
  fetchDetail: (orderId: string) => Promise<BackendOrderSnapshot>;
  getExisting: (orderId: ReportEntityId) => Promise<OrderReportRecord | null>;
  upsert: (record: OrderReportRecord) => Promise<OrderReportRecord>;
  commitWatermark: (updatedAt: string) => Promise<void> | void;
}

export interface ReportingReconciliationResult {
  updatedCount: number;
  unchangedCount: number;
  pageCount: number;
  watermark: string | null;
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Unknown reporting error';
  return message
    .replace(/Bearer\s+\S+/gi, 'Bearer [hidden]')
    .replace(/bot\d+:[A-Za-z0-9_-]+/g, 'bot[hidden]')
    .slice(0, 500);
}

function isoDateShift(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const shifted = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, (day ?? 1) + days));
  return [
    shifted.getUTCFullYear().toString().padStart(4, '0'),
    (shifted.getUTCMonth() + 1).toString().padStart(2, '0'),
    shifted.getUTCDate().toString().padStart(2, '0'),
  ].join('-');
}

function latestServiceDate(now = new Date()): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tashkent',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  return Number(parts.hour) < 7 ? isoDateShift(date, -1) : date;
}

function syncStatePath(reportingDir: string): string {
  return path.join(reportingDir, 'sync-state.json');
}

function readWatermark(reportingDir: string): string | null {
  try {
    const value = (
      JSON.parse(fs.readFileSync(syncStatePath(reportingDir), 'utf8')) as {
        updatedAt?: unknown;
      }
    ).updatedAt;
    if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return null;
    return new Date(value).toISOString();
  } catch {
    return null;
  }
}

function writeWatermark(reportingDir: string, updatedAt: string): void {
  const target = syncStatePath(reportingDir);
  const temp = `${target}.next`;
  fs.writeFileSync(temp, JSON.stringify({ updatedAt }, null, 2), 'utf8');
  fs.renameSync(temp, target);
}

function hostForUrl(host: string): string {
  return host === '::1' || host.includes(':') ? `[${host}]` : host;
}

async function fetchJson(
  url: string,
  authorization: string,
  init: RequestInit = {},
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        Authorization: authorization,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Backend returned HTTP ${response.status}`);
    }
    return (await response.json()) as unknown;
  } finally {
    clearTimeout(timeout);
  }
}

function canonicalSnapshotId(value: ReportEntityId | null | undefined): string {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) {
    return String(value);
  }
  if (typeof value === 'string' && value.trim()) return value.trim();
  throw new Error('Backend order list row is missing a valid id');
}

function latestTimestamp(left: string | null, right: string): string {
  return !left || Date.parse(right) > Date.parse(left) ? right : left;
}

async function reconcileSnapshot(
  snapshot: BackendOrderSnapshot,
  snapshotTimestamp: string,
  options: ReportingReconciliationOptions,
): Promise<'updated' | 'unchanged'> {
  const orderId = canonicalSnapshotId(snapshot.id);
  const existing = await options.getExisting(orderId);
  const existingTimestamp = optionalSnapshotTime(existing?.updatedAt);
  if (
    existing &&
    existingTimestamp &&
    Date.parse(existingTimestamp) >= Date.parse(snapshotTimestamp)
  ) {
    return 'unchanged';
  }

  const detail = await options.fetchDetail(orderId);
  const detailOrderId = canonicalSnapshotId(detail.id);
  if (detailOrderId !== orderId) {
    throw new Error(
      `Backend order detail id ${detailOrderId} does not match requested order ${orderId}`,
    );
  }

  const detailTimestamp =
    optionalSnapshotTime(detail.updated_at) ?? optionalSnapshotTime(detail.created_at);
  if (
    detailTimestamp &&
    Date.parse(detailTimestamp) < Date.parse(snapshotTimestamp)
  ) {
    throw new Error(`Backend order ${orderId} detail is older than its list snapshot`);
  }

  await options.upsert(mapBackendOrder(detail, existing));
  return 'updated';
}

/**
 * Reconcile the paginated order feed without treating list rows as report data.
 *
 * List snapshots are change indicators only. Every new/changed ID is refreshed
 * from the authoritative detail endpoint, and the durable watermark is committed
 * only after every relevant row and every page succeeds.
 */
export async function reconcileBackendOrders(
  options: ReportingReconciliationOptions,
): Promise<ReportingReconciliationResult> {
  const pageSize = Math.max(1, Math.floor(options.pageSize ?? LIST_PAGE_SIZE));
  const detailConcurrency = Math.max(
    1,
    Math.floor(options.detailConcurrency ?? DETAIL_FETCH_CONCURRENCY),
  );
  const incrementalWatermark = options.includeWeek ? null : options.currentWatermark;
  const overlapBoundary = incrementalWatermark
    ? Date.parse(incrementalWatermark) - WATERMARK_OVERLAP_MS
    : null;
  const initialBoundary = `${options.fromBusinessDate}T02:00:00.000Z`;
  const orderBy = incrementalWatermark ? '-updated_at' : '-created_at';
  const seenPageSignatures = new Set<string>();
  let newestSeen = options.currentWatermark;
  let updatedCount = 0;
  let unchangedCount = 0;
  let pageCount = 0;
  let page = 1;

  while (true) {
    const { orders, hasNext } = await options.fetchPage(page, orderBy, pageSize);
    pageCount += 1;

    if (hasNext === true && orders.length === 0) {
      throw new Error(`Backend pagination returned an empty page ${page} with has_next=true`);
    }

    const signature = orders
      .map(
        (snapshot) =>
          `${canonicalSnapshotId(snapshot.id)}@${
            optionalSnapshotTime(snapshot.updated_at) ??
            optionalSnapshotTime(snapshot.created_at) ??
            'invalid'
          }`,
      )
      .join('|');
    if (orders.length > 0 && seenPageSignatures.has(signature)) {
      throw new Error(`Backend pagination repeated page ${page}; reconciliation was stopped`);
    }
    if (orders.length > 0) seenPageSignatures.add(signature);

    const relevant: Array<{
      snapshot: BackendOrderSnapshot;
      timestamp: string;
    }> = [];
    let reachedBoundary = false;

    for (const snapshot of orders) {
      const snapshotTimestamp =
        optionalSnapshotTime(snapshot.updated_at) ??
        optionalSnapshotTime(snapshot.created_at);
      if (!snapshotTimestamp) {
        throw new Error(
          `Backend order ${canonicalSnapshotId(snapshot.id)} has no valid update timestamp`,
        );
      }

      if (
        incrementalWatermark &&
        overlapBoundary !== null &&
        Date.parse(snapshotTimestamp) < overlapBoundary
      ) {
        reachedBoundary = true;
        break;
      }
      if (
        !incrementalWatermark &&
        snapshot.created_at &&
        Number.isFinite(Date.parse(snapshot.created_at)) &&
        new Date(snapshot.created_at).toISOString() < initialBoundary
      ) {
        reachedBoundary = true;
        break;
      }

      relevant.push({ snapshot, timestamp: snapshotTimestamp });
    }

    for (let index = 0; index < relevant.length; index += detailConcurrency) {
      const batch = relevant.slice(index, index + detailConcurrency);
      const settled = await Promise.allSettled(
        batch.map(({ snapshot, timestamp }) =>
          reconcileSnapshot(snapshot, timestamp, options),
        ),
      );
      const failed = settled.find(
        (result): result is PromiseRejectedResult => result.status === 'rejected',
      );
      if (failed) throw failed.reason;

      settled.forEach((result, resultIndex) => {
        if (result.status !== 'fulfilled') return;
        if (result.value === 'updated') updatedCount += 1;
        else unchangedCount += 1;
        newestSeen = latestTimestamp(
          newestSeen,
          (batch[resultIndex] as { timestamp: string }).timestamp,
        );
      });
    }

    if (
      reachedBoundary ||
      hasNext === false ||
      (hasNext === null && orders.length < pageSize)
    ) {
      break;
    }
    page += 1;
  }

  if (newestSeen) await options.commitWatermark(newestSeen);
  return {
    updatedCount,
    unchangedCount,
    pageCount,
    watermark: newestSeen,
  };
}

export class ReportingService {
  private readonly reportingDir = path.join(getPersistDir(), 'reporting');
  private readonly outbox = new ReportOutbox(this.reportingDir);
  private readonly config = new ReportConfig();
  private readonly bot: TelegramReportBot;
  private readonly avatarJpgPath: string | undefined;
  private readonly storeFactory: (baseDir: string) => ReportStore;
  private store: ReportStore | null = null;
  private server: http.Server | null = null;
  private outboxTimer: ReturnType<typeof setInterval> | null = null;
  private reconcileTimer: ReturnType<typeof setInterval> | null = null;
  private processingOutbox = false;
  private reconciling: Promise<void> | null = null;
  private started = false;
  private lastSyncAt: string | null = null;
  private lastCaptureAt: string | null = null;
  private lastSyncError: string | null = null;
  private watermarkUpdatedAt = readWatermark(this.reportingDir);
  private unsubscribeKv: (() => void) | null = null;
  private managerAuthorizationCache: {
    digest: string;
    validUntil: number;
  } | null = null;

  constructor(
    avatarJpgPath?: string,
    options: ReportingServiceOptions = {},
  ) {
    this.avatarJpgPath = avatarJpgPath;
    this.storeFactory =
      options.storeFactory ?? ((baseDir) => new ReportStore({ baseDir }));
    this.bot = new TelegramReportBot({
      config: this.config,
      data: {
        queryBusinessDate: (date) => this.requireStore().queryBusinessDate(date),
        queryRange: (range) => this.requireStore().queryRange(range),
        aggregateRange: (range) => this.requireStore().aggregateRange(range),
      },
      health: () => this.botHealth(),
      refresh: () => this.reconcileRecent(false),
      enabled: () => isMainPc(),
    });
  }

  async start(): Promise<void> {
    if (this.started) return;
    // Fail before installing timers/listeners if the main PC cannot open its
    // authoritative archive. Secondary PCs deliberately skip SQLite entirely.
    if (isMainPc()) await this.requireStore().initialize();
    this.started = true;
    this.outboxTimer = setInterval(() => void this.processOutbox(), OUTBOX_INTERVAL_MS);
    this.unsubscribeKv = onKvChanged((key) => {
      if (key === 'pos:IpAdress' || key === null) {
        this.managerAuthorizationCache = null;
        void this.reconfigureRole();
      } else if (key === 'auth_token') {
        this.managerAuthorizationCache = null;
        void this.processOutbox();
        if (isMainPc()) void this.reconcileRecent(false).catch(() => undefined);
      }
    });
    if (isMainPc()) {
      this.startReconcileTimer();
      this.startRefreshServer();
      this.bot.start();
      void this.reconcileRecent(this.watermarkUpdatedAt === null).catch(() => undefined);
    }
    void this.processOutbox();
  }

  stop(): void {
    this.started = false;
    if (this.outboxTimer) clearInterval(this.outboxTimer);
    this.outboxTimer = null;
    this.stopReconcileTimer();
    this.unsubscribeKv?.();
    this.unsubscribeKv = null;
    this.bot.stop();
    this.server?.close();
    this.server = null;
    this.store?.close();
    this.store = null;
  }

  async reconfigureRole(): Promise<void> {
    if (!this.started) return;
    if (isMainPc()) {
      await this.requireStore().initialize();
      this.startReconcileTimer();
      this.startRefreshServer();
      this.bot.start();
      await this.reconcileRecent(this.watermarkUpdatedAt === null).catch(() => undefined);
    } else {
      this.server?.close();
      this.server = null;
      this.bot.stop();
      this.stopReconcileTimer();
      // A secondary terminal needs only its durable JSON outbox. Closing the
      // store also prevents an in-flight role change from leaving B/C with an
      // active local sales archive.
      this.store?.close();
      this.store = null;
    }
  }

  async capture(orderId: number | string, kind: ReportMutationKind): Promise<void> {
    await this.outbox.enqueue(orderId, kind);
    void this.processOutbox();
  }

  async status(): Promise<ReportingStatus> {
    await this.assertReportManager();
    const store = this.requireStore();
    const [stats, pendingRefreshCount] = await Promise.all([
      store.stats(),
      this.outbox.size(),
    ]);
    const identity = this.config.bot();
    const owner = this.config.owner();
    const pairing = this.config.pairing();
    return {
      isMainPc: isMainPc(),
      backendHost: getConfiguredBackendHost(),
      configured: this.config.hasToken(),
      running: this.bot.running,
      botName: identity?.firstName ?? null,
      botUsername: identity?.username ?? null,
      pairedOwner: owner
        ? {
            displayName: owner.displayName,
            ...(owner.username ? { username: owner.username } : {}),
            pairedAt: owner.pairedAt,
          }
        : null,
      pairingExpiresAt:
        pairing && Date.parse(pairing.expiresAt) > Date.now()
          ? pairing.expiresAt
          : null,
      preferences: this.config.preferences(),
      storedOrderCount: stats.orderCount,
      databaseSizeBytes: stats.databaseBytes,
      earliestOrderAt: stats.earliestBusinessDate
        ? `${stats.earliestBusinessDate}T07:00:00+05:00`
        : null,
      latestOrderAt: stats.latestBusinessDate
        ? `${stats.latestBusinessDate}T07:00:00+05:00`
        : null,
      lastSyncAt: this.lastSyncAt,
      lastCaptureAt: this.lastCaptureAt,
      pendingRefreshCount,
      lastError: this.bot.lastError || this.lastSyncError,
    };
  }

  async connectTelegram(token: string): Promise<ReportingStatus> {
    await this.assertReportManager();
    const identity = await validateAndConfigureTelegramBot(token.trim(), this.avatarJpgPath);
    await this.bot.removeOwnerCommands().catch(() => undefined);
    this.bot.stop();
    this.config.saveToken(token, identity);
    this.bot.start();
    return this.status();
  }

  async disconnectTelegram(): Promise<ReportingStatus> {
    await this.assertReportManager();
    await this.bot.removeOwnerCommands().catch(() => undefined);
    this.bot.stop();
    this.config.clearConnection();
    return this.status();
  }

  async createPairing(): Promise<PairingResult> {
    await this.assertReportManager();
    const bot = this.config.bot();
    if (!this.config.hasToken() || !bot) throw new Error('Connect a Telegram bot first');
    if (this.config.owner()) {
      throw new Error('Disconnect the current Telegram owner before creating a new pairing');
    }
    const token = randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    const hash = createHash('sha256').update(token, 'utf8').digest('hex');
    this.config.setPairing(hash, expiresAt);
    return {
      url: `https://t.me/${bot.username}?start=${token}`,
      expiresAt,
    };
  }

  async unpair(): Promise<ReportingStatus> {
    await this.assertReportManager();
    await this.bot.removeOwnerCommands().catch(() => undefined);
    this.config.unpairOwner();
    return this.status();
  }

  async savePreferences(
    preferences: TelegramReportPreferences,
  ): Promise<ReportingStatus> {
    await this.assertReportManager();
    this.config.savePreferences(preferences);
    return this.status();
  }

  async sendTest(): Promise<void> {
    await this.assertReportManager();
    await this.bot.sendTestReport();
  }

  async refreshNow(): Promise<ReportingStatus> {
    await this.assertReportManager();
    await this.reconcileRecent(true);
    return this.status();
  }

  private assertMainPc(): void {
    if (!isMainPc()) throw new Error('Telegram reports are available only on the main PC');
  }

  private async assertReportManager(): Promise<void> {
    this.assertMainPc();
    const authorization = this.tokenAuthorization();
    const digest = createHash('sha256').update(authorization, 'utf8').digest('hex');
    if (
      this.managerAuthorizationCache?.digest === digest &&
      this.managerAuthorizationCache.validUntil > Date.now()
    ) {
      return;
    }

    const payload = await fetchJson(
      `${localBackendBaseUrl()}/auth-me`,
      authorization,
    );
    assertReportManagerPayload(payload);
    this.managerAuthorizationCache = {
      digest,
      // Avoid turning the Settings status poll into a constant backend load,
      // while keeping role/session revocation responsive.
      validUntil: Date.now() + 30_000,
    };
  }

  private tokenAuthorization(): string {
    const token = String(kvGet<string>('auth_token', '') || '').trim();
    if (!token) throw new Error('POS login is required to refresh reports');
    return `Bearer ${token}`;
  }

  private async processOutbox(): Promise<void> {
    if (this.processingOutbox) return;
    this.processingOutbox = true;
    try {
      const events = await this.outbox.ready(new Date(), 25);
      for (const event of events) {
        try {
          const authorization = this.tokenAuthorization();
          if (isMainPc()) {
            await this.refreshOne(event.orderId, authorization);
          } else {
            await this.forwardRefresh(event.orderId, authorization);
          }
          await this.outbox.acknowledge(event);
        } catch (error) {
          const message = safeError(error);
          this.lastSyncError = message;
          await this.outbox.fail(event, message);
        }
      }
    } finally {
      this.processingOutbox = false;
    }
  }

  private async forwardRefresh(orderId: string, authorization: string): Promise<void> {
    const host = hostForUrl(getConfiguredBackendHost());
    await fetchJson(
      `http://${host}:${REPORT_SERVER_PORT}/v1/orders/${encodeURIComponent(orderId)}/refresh`,
      authorization,
      { method: 'POST' },
    );
  }

  private async refreshOne(orderId: string, authorization: string): Promise<void> {
    if (!isMainPc()) throw new Error('Authoritative refresh can run only on the main PC');
    const store = this.requireStore();
    const payload = await fetchJson(
      `${localBackendBaseUrl()}/orders/${encodeURIComponent(orderId)}`,
      authorization,
    );
    // The configured server IP can change while the detail request is in
    // flight. Once this PC becomes secondary, do not write that response here;
    // the durable outbox will retry it against the newly configured main PC.
    if (!isMainPc()) throw new Error('PC role changed during authoritative refresh');
    const snapshot = unwrapBackendOrder(payload);
    const existing = await store.get(orderId);
    await store.upsert(mapBackendOrder(snapshot, existing));
    this.lastCaptureAt = new Date().toISOString();
    this.lastSyncError = null;
  }

  private startRefreshServer(): void {
    if (this.server || !isMainPc()) return;
    const server = http.createServer((request, response) => {
      void this.handleRefreshRequest(request, response);
    });
    server.on('error', (error) => {
      this.lastSyncError = `Report LAN service: ${safeError(error)}`;
      if (this.server === server) this.server = null;
    });
    server.listen(REPORT_SERVER_PORT, '0.0.0.0');
    this.server = server;
  }

  private startReconcileTimer(): void {
    if (this.reconcileTimer || !isMainPc()) return;
    this.reconcileTimer = setInterval(
      () => void this.reconcileRecent(false).catch(() => undefined),
      RECONCILE_INTERVAL_MS,
    );
  }

  private stopReconcileTimer(): void {
    if (this.reconcileTimer) clearInterval(this.reconcileTimer);
    this.reconcileTimer = null;
  }

  private async handleRefreshRequest(
    request: http.IncomingMessage,
    response: http.ServerResponse,
  ): Promise<void> {
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    const match = request.url?.match(/^\/v1\/orders\/(\d+)\/refresh$/);
    if (request.method !== 'POST' || !match) {
      response.writeHead(404);
      response.end(JSON.stringify({ ok: false }));
      return;
    }
    const authorization = request.headers.authorization;
    if (
      typeof authorization !== 'string' ||
      !authorization.startsWith('Bearer ') ||
      authorization.length > 4096
    ) {
      response.writeHead(401);
      response.end(JSON.stringify({ ok: false }));
      return;
    }
    try {
      await this.refreshOne(match[1] as string, authorization);
      response.writeHead(200);
      response.end(JSON.stringify({ ok: true }));
    } catch (error) {
      this.lastSyncError = safeError(error);
      response.writeHead(502);
      response.end(JSON.stringify({ ok: false, error: 'authoritative refresh failed' }));
    }
  }

  async reconcileRecent(includeWeek: boolean): Promise<void> {
    if (!isMainPc()) return;
    if (this.reconciling) return this.reconciling;
    this.reconciling = this.runReconcile(includeWeek).finally(() => {
      this.reconciling = null;
    });
    return this.reconciling;
  }

  private async runReconcile(includeWeek: boolean): Promise<void> {
    const store = this.requireStore();
    const to = latestServiceDate();
    const from = isoDateShift(to, includeWeek ? -6 : -1);
    try {
      const authorization = this.tokenAuthorization();
      const result = await reconcileBackendOrders({
        includeWeek,
        fromBusinessDate: from,
        currentWatermark: this.watermarkUpdatedAt,
        fetchPage: async (page, orderBy, pageSize) => {
          this.assertMainPc();
          const query = new URLSearchParams({
            per_page: String(pageSize),
            page: String(page),
            order_by: orderBy,
          });
          const payload = await fetchJson(
            `${localBackendBaseUrl()}/orders?${query.toString()}`,
            authorization,
          );
          return unwrapBackendOrders(payload);
        },
        fetchDetail: async (orderId) => {
          this.assertMainPc();
          const payload = await fetchJson(
            `${localBackendBaseUrl()}/orders/${encodeURIComponent(orderId)}`,
            authorization,
          );
          return unwrapBackendOrder(payload);
        },
        getExisting: (orderId) => {
          this.assertMainPc();
          return store.get(orderId);
        },
        upsert: (record) => {
          this.assertMainPc();
          return store.upsert(record);
        },
        commitWatermark: (updatedAt) => {
          this.assertMainPc();
          writeWatermark(this.reportingDir, updatedAt);
          this.watermarkUpdatedAt = updatedAt;
        },
      });
      this.lastSyncAt = new Date().toISOString();
      this.lastSyncError = null;
      if (result.updatedCount > 0) this.lastCaptureAt = this.lastSyncAt;
    } catch (error) {
      this.lastSyncError = safeError(error);
      throw error;
    }
  }

  private async botHealth(): Promise<ReportBotHealth> {
    const stats = await this.requireStore().stats();
    return {
      orderCount: stats.orderCount,
      lastSyncAt: this.lastSyncAt,
      lastCaptureAt: this.lastCaptureAt,
      lastSyncError: this.lastSyncError,
    };
  }

  private requireStore(): ReportStore {
    if (!isMainPc()) {
      throw new Error('Local sales report storage is available only on the main PC');
    }
    if (!this.store) this.store = this.storeFactory(this.reportingDir);
    return this.store;
  }
}

function optionalSnapshotTime(value: string | null | undefined): string | null {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

export function registerReportingHandlers(
  service: ReportingService,
  getMainWindow: () => BrowserWindow | null,
): void {
  function validateSender(event: Electron.IpcMainInvokeEvent): void {
    const mainWindow = getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed() || event.sender.id !== mainWindow.webContents.id) {
      throw new Error('Reporting IPC is available only to the main POS window');
    }
  }

  ipcMain.handle('reports:status', async (event): Promise<ReportingStatus> => {
    validateSender(event);
    return service.status();
  });
  ipcMain.handle(
    'reports:capture',
    async (
      event,
      orderId: number | string,
      kind: ReportMutationKind,
    ): Promise<boolean> => {
      validateSender(event);
      await service.capture(orderId, kind);
      return true;
    },
  );
  ipcMain.handle(
    'reports:connectTelegram',
    async (event, token: string): Promise<ReportingStatus> => {
      validateSender(event);
      return service.connectTelegram(token);
    },
  );
  ipcMain.handle(
    'reports:disconnectTelegram',
    async (event): Promise<ReportingStatus> => {
      validateSender(event);
      return service.disconnectTelegram();
    },
  );
  ipcMain.handle('reports:createPairing', async (event): Promise<PairingResult> => {
    validateSender(event);
    return service.createPairing();
  });
  ipcMain.handle('reports:unpair', async (event): Promise<ReportingStatus> => {
    validateSender(event);
    return service.unpair();
  });
  ipcMain.handle(
    'reports:savePreferences',
    async (
      event,
      preferences: TelegramReportPreferences,
    ): Promise<ReportingStatus> => {
      validateSender(event);
      return service.savePreferences(preferences);
    },
  );
  ipcMain.handle('reports:sendTest', async (event): Promise<boolean> => {
    validateSender(event);
    await service.sendTest();
    return true;
  });
  ipcMain.handle('reports:refreshNow', async (event): Promise<ReportingStatus> => {
    validateSender(event);
    return service.refreshNow();
  });
}
