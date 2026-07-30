import { createHash, timingSafeEqual } from 'node:crypto';
import type {
  CashierReportTotal,
  DimensionReportTotal,
  OrderReportRecord,
  ReportDateRange,
  SalesReportAggregate,
} from './report-types';
import {
  isValidDailyReportTime,
  type ReportConfig,
  type TelegramBotIdentity,
  type TelegramOwner,
} from './report-config';
import {
  chunkTelegramMessage,
  escapeTelegramHtml,
  formatCashierDetail,
  formatRecentOrders,
  formatTodaySummary,
  formatWeekSummary,
  parseTelegramCommand,
  type ReportBreakdownRow,
  type ReportCashierSummary,
  type TodayReportSummary,
} from './telegram-format';
import {
  sendTelegramDocument,
  setTelegramProfilePhoto,
  telegramCall,
  TelegramApiError,
} from './telegram-api';

interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  is_bot?: boolean;
}

interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
}

interface TelegramMessage {
  message_id: number;
  text?: string;
  chat: TelegramChat;
  from?: TelegramUser;
}

interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  data?: string;
  message?: TelegramMessage;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

interface TelegramMe extends TelegramUser {
  username: string;
}

interface ReplyMarkup {
  inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
}

export interface ReportBotDataSource {
  queryBusinessDate(date: string): Promise<OrderReportRecord[]>;
  queryRange(range: ReportDateRange): Promise<OrderReportRecord[]>;
  aggregateRange(range: ReportDateRange): Promise<SalesReportAggregate>;
}

export interface ReportBotHealth {
  orderCount: number;
  lastSyncAt: string | null;
  lastCaptureAt: string | null;
  lastSyncError: string | null;
}

export interface TelegramReportBotOptions {
  config: ReportConfig;
  data: ReportBotDataSource;
  health: () => Promise<ReportBotHealth>;
  refresh: () => Promise<void>;
  /**
   * Runtime role guard. Production binds this to the authoritative main-PC
   * check so an in-flight poll cannot send after the configured backend host
   * changes this terminal into a secondary till.
   */
  enabled?: () => boolean;
  onStateChanged?: () => void;
}

const PUBLIC_COMMANDS = [
  { command: 'start', description: 'Botni ulash' },
  { command: 'help', description: 'Yordam' },
];

const OWNER_COMMANDS = [
  { command: 'today', description: 'Bugungi savdo' },
  { command: 'yesterday', description: 'Kecha yakunlangan savdo' },
  { command: 'week', description: 'Oxirgi 7 kun' },
  { command: 'cashiers', description: 'Bugun ishlagan kassirlar' },
  { command: 'orders', description: 'Bugungi buyurtmalar' },
  { command: 'export', description: 'Bugungi buyurtmalar CSV fayli' },
  { command: 'status', description: 'Mahalliy hisobot holati' },
  { command: 'help', description: 'Barcha buyruqlar' },
];

const CANCELLED = new Set(['CANCELED', 'CANCELLED']);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tokenHash(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest();
}

function pairingMatches(expectedHex: string, supplied: string): boolean {
  try {
    const expected = Buffer.from(expectedHex, 'hex');
    const actual = tokenHash(supplied);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function localDateParts(date: Date): { date: string; hour: number; minute: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tashkent',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

function shiftIsoDate(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const shifted = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, (day ?? 1) + days));
  return [
    shifted.getUTCFullYear().toString().padStart(4, '0'),
    (shifted.getUTCMonth() + 1).toString().padStart(2, '0'),
    shifted.getUTCDate().toString().padStart(2, '0'),
  ].join('-');
}

// The backend business window is D 07:00 through D+1 03:00. During the quiet
// 03:00-07:00 gap, "today" means the service day that just finished.
export function latestBusinessDate(now = new Date()): string {
  const local = localDateParts(now);
  return local.hour < 7 ? shiftIsoDate(local.date, -1) : local.date;
}

export function scheduledBusinessDate(
  now: Date,
  dailyTime: string,
): string | null {
  if (!isValidDailyReportTime(dailyTime)) return null;
  const local = localDateParts(now);
  if (local.hour < 3) return null;
  const targetHour = Number(dailyTime.slice(0, 2));
  const targetMinute = Number(dailyTime.slice(3, 5));
  const afterTarget =
    local.hour > targetHour ||
    (local.hour === targetHour && local.minute >= targetMinute);
  return afterTarget ? shiftIsoDate(local.date, -1) : null;
}

function includedSale(order: OrderReportRecord): boolean {
  return order.isPaid && !CANCELLED.has(order.status.toUpperCase());
}

function paymentLabel(order: OrderReportRecord): string {
  const extended = order as OrderReportRecord & {
    payments?: Array<{ method: string }>;
    paymentMethod?: string | null;
  };
  const methods = Array.from(
    new Set(
      (extended.payments ?? [])
        .map((payment) => payment.method?.trim().toUpperCase())
        .filter(Boolean),
    ),
  );
  if (methods.length > 1) return 'MIXED';
  return methods[0] || extended.paymentMethod || 'UNKNOWN';
}

function paymentRows(totals: DimensionReportTotal[]): ReportBreakdownRow[] {
  return totals.map((row) => ({
    label: row.key,
    orderCount: row.orderCount,
    totalUzs: row.totalMinor,
  }));
}

function cashierRows(totals: CashierReportTotal[]): ReportCashierSummary[] {
  return totals.map((row) => ({
    id: row.cashierId,
    name: row.cashierName,
    orderCount: row.orderCount,
    totalUzs: row.totalMinor,
  }));
}

function displayName(user: TelegramUser): string {
  return [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || 'Telegram user';
}

export function formatCsvCell(
  value: string | number | boolean | null | undefined,
): string {
  const raw = String(value ?? '');
  // Quoting alone does not stop Excel/LibreOffice from evaluating a cell as
  // a formula. Prefix dangerous leading characters (including after leading
  // whitespace) with an apostrophe so exported restaurant data stays text.
  const spreadsheetSafe = /^\s*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${spreadsheetSafe.replace(/"/g, '""')}"`;
}

export async function validateAndConfigureTelegramBot(
  token: string,
  avatarJpgPath?: string,
): Promise<TelegramBotIdentity> {
  const me = await telegramCall<TelegramMe>(token, 'getMe');
  if (!me.is_bot || !me.username) throw new Error('Token does not belong to a Telegram bot');

  await Promise.all([
    telegramCall(token, 'setMyName', { name: 'Alfa POS Daily Reports' }),
    telegramCall(token, 'setMyDescription', {
      description:
        'Alfa POS restoranining shaxsiy savdo hisobotlari. Faqat ulangan egasi ma’lumotlarni ko‘ra oladi.',
    }),
    telegramCall(token, 'setMyShortDescription', {
      short_description: 'Alfa POS: kunlik savdo va kassir hisobotlari',
    }),
    telegramCall(token, 'setMyCommands', { commands: PUBLIC_COMMANDS }),
  ]);
  if (avatarJpgPath) {
    await setTelegramProfilePhoto(token, avatarJpgPath);
  }

  return {
    id: String(me.id),
    firstName: me.first_name,
    username: me.username,
  };
}

export class TelegramReportBot {
  private readonly config: ReportConfig;
  private readonly data: ReportBotDataSource;
  private readonly health: () => Promise<ReportBotHealth>;
  private readonly refresh: () => Promise<void>;
  private readonly enabled: () => boolean;
  private readonly onStateChanged: () => void;
  private abortController: AbortController | null = null;
  private generation = 0;
  private active = false;
  private lastErrorValue: string | null = null;

  constructor(options: TelegramReportBotOptions) {
    this.config = options.config;
    this.data = options.data;
    this.health = options.health;
    this.refresh = options.refresh;
    this.enabled = options.enabled ?? (() => true);
    this.onStateChanged = options.onStateChanged ?? (() => undefined);
  }

  get running(): boolean {
    return this.active;
  }

  get lastError(): string | null {
    return this.lastErrorValue;
  }

  start(): void {
    this.stop();
    if (!this.enabled()) return;
    const token = this.config.getToken();
    if (!token) return;
    this.active = true;
    this.lastErrorValue = null;
    const generation = ++this.generation;
    void this.pollLoop(token, generation);
    this.onStateChanged();
  }

  stop(): void {
    this.generation += 1;
    this.active = false;
    this.abortController?.abort();
    this.abortController = null;
    this.onStateChanged();
  }

  async sendTestReport(): Promise<void> {
    const token = this.requireToken();
    const owner = this.requireOwner();
    await this.refreshWithNotice(token, owner.chatId);
    await this.sendDaySummary(token, owner.chatId, latestBusinessDate(), 'Bugungi sinov hisoboti');
  }

  async sendToOwner(message: string): Promise<void> {
    const token = this.requireToken();
    const owner = this.requireOwner();
    await this.sendHtml(token, owner.chatId, message);
  }

  async applyOwnerCommands(): Promise<void> {
    const token = this.config.getToken();
    const owner = this.config.owner();
    if (!token || !owner) return;
    await this.callTelegram(token, 'setMyCommands', {
      commands: OWNER_COMMANDS,
      scope: { type: 'chat', chat_id: owner.chatId },
    });
  }

  async removeOwnerCommands(): Promise<void> {
    const token = this.config.getToken();
    const owner = this.config.owner();
    if (!token || !owner) return;
    await this.callTelegram(token, 'deleteMyCommands', {
      scope: { type: 'chat', chat_id: owner.chatId },
    });
  }

  private requireToken(): string {
    const token = this.config.getToken();
    if (!token) throw new Error('Telegram bot is not connected');
    return token;
  }

  private requireOwner(): TelegramOwner {
    const owner = this.config.owner();
    if (!owner) throw new Error('Telegram owner is not paired');
    return owner;
  }

  private async pollLoop(token: string, generation: number): Promise<void> {
    let retryDelay = 1_000;
    while (this.active && generation === this.generation && this.enabled()) {
      this.abortController = new AbortController();
      try {
        const updates = await this.callTelegram<TelegramUpdate[]>(
          token,
          'getUpdates',
          {
            offset: this.config.updateOffset(),
            timeout: 25,
            allowed_updates: ['message', 'callback_query'],
          },
          this.abortController.signal,
        );
        if (!this.enabled()) break;
        for (const update of updates) {
          try {
            await this.processUpdate(token, update);
          } catch (error) {
            this.setError(error);
          } finally {
            this.config.setUpdateOffset(update.update_id + 1);
          }
        }
        await this.maybeSendScheduledReport(token);
        this.lastErrorValue = null;
        retryDelay = 1_000;
      } catch (error) {
        if (!this.active || generation !== this.generation || !this.enabled()) break;
        this.setError(error);
        const retryAfter =
          error instanceof TelegramApiError ? error.retryAfterSeconds : null;
        await sleep(retryAfter ? retryAfter * 1_000 : retryDelay);
        retryDelay = Math.min(30_000, retryDelay * 2);
      }
    }
    if (generation === this.generation) {
      this.active = false;
      this.onStateChanged();
    }
  }

  private setError(error: unknown): void {
    const message = error instanceof Error ? error.message : 'Unknown Telegram error';
    // Never include a request URL or token-bearing error value.
    this.lastErrorValue = message.replace(/bot\d+:[A-Za-z0-9_-]+/g, 'bot[hidden]');
    this.onStateChanged();
  }

  private async processUpdate(token: string, update: TelegramUpdate): Promise<void> {
    this.assertEnabled();
    if (update.message) {
      await this.processMessage(token, update.message);
    } else if (update.callback_query) {
      await this.processCallback(token, update.callback_query);
    }
  }

  private async processMessage(token: string, message: TelegramMessage): Promise<void> {
    const text = message.text?.trim();
    const from = message.from;
    if (!text || !from) return;

    const startMatch = text.match(/^\/start(?:@[A-Za-z0-9_]+)?(?:\s+(\S+))?$/i);
    if (startMatch) {
      await this.processStart(token, message, from, startMatch[1]);
      return;
    }

    const owner = this.config.owner();
    if (
      !owner ||
      message.chat.type !== 'private' ||
      String(message.chat.id) !== owner.chatId ||
      String(from.id) !== owner.userId
    ) {
      await this.sendHtml(
        token,
        String(message.chat.id),
        '🔒 Bu restoran hisobotlari shaxsiy. Asosiy kompyuterdagi bir martalik havola orqali ulang.',
      );
      return;
    }

    const bot = this.config.bot();
    const parsed = parseTelegramCommand(text, bot?.username);
    if (!parsed) return;
    await this.runCommand(token, owner.chatId, parsed.command);
  }

  private async processStart(
    token: string,
    message: TelegramMessage,
    from: TelegramUser,
    supplied?: string,
  ): Promise<void> {
    const chatId = String(message.chat.id);
    const current = this.config.owner();
    if (
      current &&
      current.chatId === chatId &&
      current.userId === String(from.id) &&
      message.chat.type === 'private'
    ) {
      await this.sendHtml(token, chatId, this.helpText());
      return;
    }

    const pairing = this.config.pairing();
    const valid =
      message.chat.type === 'private' &&
      Boolean(supplied) &&
      Boolean(pairing) &&
      Date.parse(pairing?.expiresAt ?? '') > Date.now() &&
      pairingMatches(pairing?.tokenHash ?? '', supplied ?? '');

    if (!valid) {
      await this.sendHtml(
        token,
        chatId,
        '🔒 Ulanish havolasi yo‘q yoki muddati tugagan. Alfa POS asosiy kompyuterida yangi havola yarating.',
      );
      return;
    }

    const owner: TelegramOwner = {
      chatId,
      userId: String(from.id),
      displayName: displayName(from),
      ...(from.username ? { username: from.username } : {}),
      pairedAt: new Date().toISOString(),
    };
    this.assertEnabled();
    this.config.pairOwner(owner);
    await this.applyOwnerCommands();
    this.onStateChanged();
    await this.sendHtml(
      token,
      chatId,
      `✅ <b>${escapeTelegramHtml(owner.displayName)}</b>, Alfa POS hisobotlari sizga xavfsiz ulandi.`,
    );
    await this.sendDaySummary(token, chatId, latestBusinessDate());
  }

  private async processCallback(
    token: string,
    callback: TelegramCallbackQuery,
  ): Promise<void> {
    const message = callback.message;
    const owner = this.config.owner();
    if (
      !message ||
      !owner ||
      message.chat.type !== 'private' ||
      String(message.chat.id) !== owner.chatId ||
      String(callback.from.id) !== owner.userId
    ) {
      await this.callTelegram(token, 'answerCallbackQuery', {
        callback_query_id: callback.id,
        text: 'Ruxsat yo‘q',
        show_alert: true,
      });
      return;
    }

    await this.callTelegram(token, 'answerCallbackQuery', {
      callback_query_id: callback.id,
    });
    const data = callback.data ?? '';
    if (data.startsWith('cashier:')) {
      await this.sendCashier(token, owner.chatId, data.slice('cashier:'.length));
    } else if (data.startsWith('orders:')) {
      const page = Math.max(1, Number(data.slice('orders:'.length)) || 1);
      await this.sendOrders(token, owner.chatId, latestBusinessDate(), page);
    }
  }

  private async runCommand(
    token: string,
    chatId: string,
    command: string,
  ): Promise<void> {
    await this.refreshWithNotice(token, chatId);
    const today = latestBusinessDate();
    switch (command) {
      case 'today':
        await this.sendDaySummary(token, chatId, today);
        break;
      case 'yesterday':
        await this.sendDaySummary(token, chatId, shiftIsoDate(today, -1), 'Kecha yakunlangan savdo');
        break;
      case 'week':
        await this.sendWeek(token, chatId, shiftIsoDate(today, -6), today);
        break;
      case 'cashiers':
        await this.sendDaySummary(token, chatId, today, 'Bugun ishlagan kassirlar', true);
        break;
      case 'orders':
        await this.sendOrders(token, chatId, today, 1);
        break;
      case 'export':
        await this.sendExport(token, chatId, today);
        break;
      case 'status':
        await this.sendStatus(token, chatId);
        break;
      case 'help':
        await this.sendHtml(token, chatId, this.helpText());
        break;
      default:
        break;
    }
  }

  private async refreshWithNotice(token: string, chatId: string): Promise<void> {
    try {
      await this.refresh();
    } catch {
      // Manual commands remain useful when the POS is logged out, but cached
      // figures must never be presented as freshly verified.
      await this.sendHtml(
        token,
        chatId,
        '⚠️ Backend bilan hozir sinxronlab bo‘lmadi. Quyidagi natija asosiy kompyuterda oxirgi saqlangan ma’lumotlardan tuzildi.',
      );
    }
  }

  private async daySummary(date: string): Promise<{
    summary: TodayReportSummary;
    aggregate: SalesReportAggregate;
    records: OrderReportRecord[];
  }> {
    const [records, aggregate] = await Promise.all([
      this.data.queryBusinessDate(date),
      this.data.aggregateRange({ from: date, to: date }),
    ]);
    const paid = records.filter(includedSale);
    const times = paid
      .map((order) => Date.parse(order.paidAt || order.createdAt))
      .filter(Number.isFinite)
      .sort((left, right) => left - right);
    return {
      records,
      aggregate,
      summary: {
        businessDate: `${date}T07:00:00+05:00`,
        periodStart: times.length ? new Date(times[0] as number) : null,
        periodEnd: times.length ? new Date(times.at(-1) as number) : null,
        paidOrderCount: aggregate.orderCount,
        totalUzs: aggregate.totalMinor,
        averageCheckUzs:
          aggregate.orderCount > 0 ? aggregate.totalMinor / aggregate.orderCount : 0,
        cancelledOrderCount: records.filter((order) =>
          CANCELLED.has(order.status.toUpperCase()),
        ).length,
        cashiers: cashierRows(aggregate.byCashier),
        payments: paymentRows(aggregate.byPaymentMethod),
        orderTypes: paymentRows(aggregate.byOrderType),
      },
    };
  }

  private async sendDaySummary(
    token: string,
    chatId: string,
    date: string,
    title?: string,
    forceCashierButtons = false,
  ): Promise<void> {
    const { summary, aggregate } = await this.daySummary(date);
    let message = formatTodaySummary(summary);
    if (title) {
      message = message.replace('Bugungi savdo', escapeTelegramHtml(title));
    }
    const buttons = aggregate.byCashier
      .filter((cashier) => String(cashier.cashierId ?? '').length <= 40)
      .slice(0, 12)
      .map((cashier) => [
        {
          text: `👤 ${cashier.cashierName}`,
          callback_data: `cashier:${String(cashier.cashierId ?? '')}`,
        },
      ]);
    const replyMarkup =
      buttons.length > 0 && (forceCashierButtons || aggregate.byCashier.length > 0)
        ? { inline_keyboard: buttons }
        : undefined;
    await this.sendHtml(token, chatId, message, replyMarkup);
  }

  private async sendCashier(token: string, chatId: string, cashierId: string): Promise<void> {
    const date = latestBusinessDate();
    const records = (await this.data.queryBusinessDate(date)).filter(
      (order) =>
        includedSale(order) && String(order.cashier.id ?? '') === cashierId,
    );
    const total = records.reduce((sum, order) => sum + order.totalMinor, 0);
    const paymentTotals = new Map<string, { orderCount: number; totalUzs: number }>();
    const typeTotals = new Map<string, { orderCount: number; totalUzs: number }>();
    for (const order of records) {
      const method = paymentLabel(order);
      const payment = paymentTotals.get(method) ?? { orderCount: 0, totalUzs: 0 };
      payment.orderCount += 1;
      payment.totalUzs += order.totalMinor;
      paymentTotals.set(method, payment);
      const type = order.orderType || 'UNKNOWN';
      const orderType = typeTotals.get(type) ?? { orderCount: 0, totalUzs: 0 };
      orderType.orderCount += 1;
      orderType.totalUzs += order.totalMinor;
      typeTotals.set(type, orderType);
    }
    const sortedTimes = records
      .map((order) => order.paidAt || order.createdAt)
      .sort((left, right) => Date.parse(left) - Date.parse(right));
    await this.sendHtml(
      token,
      chatId,
      formatCashierDetail({
        id: cashierId,
        name: records[0]?.cashier.name || 'Noma’lum kassir',
        businessDate: `${date}T07:00:00+05:00`,
        orderCount: records.length,
        totalUzs: total,
        averageCheckUzs: records.length ? total / records.length : 0,
        firstOrderAt: sortedTimes[0] ?? null,
        lastOrderAt: sortedTimes.at(-1) ?? null,
        payments: Array.from(paymentTotals, ([label, value]) => ({ label, ...value })),
        orderTypes: Array.from(typeTotals, ([label, value]) => ({ label, ...value })),
      }),
    );
  }

  private async sendOrders(
    token: string,
    chatId: string,
    date: string,
    requestedPage: number,
  ): Promise<void> {
    const pageSize = 15;
    const records = (await this.data.queryBusinessDate(date)).sort(
      (left, right) =>
        Date.parse(right.paidAt || right.createdAt) -
        Date.parse(left.paidAt || left.createdAt),
    );
    const totalPages = Math.max(1, Math.ceil(records.length / pageSize));
    const page = Math.min(totalPages, Math.max(1, requestedPage));
    const orders = records.slice((page - 1) * pageSize, page * pageSize);
    const keyboard: ReplyMarkup = {
      inline_keyboard: [
        [
          ...(page > 1
            ? [{ text: '⬅️ Oldingi', callback_data: `orders:${page - 1}` }]
            : []),
          ...(page < totalPages
            ? [{ text: 'Keyingi ➡️', callback_data: `orders:${page + 1}` }]
            : []),
        ],
      ].filter((row) => row.length > 0),
    };
    await this.sendHtml(
      token,
      chatId,
      formatRecentOrders({
        title: `${date} buyurtmalari`,
        orders: orders.map((order) => ({
          displayId: order.displayId,
          createdAt: order.createdAt,
          totalUzs: order.totalMinor,
          cashierName: order.cashier.name,
          orderType: order.orderType,
          paymentMethod: paymentLabel(order),
          status: order.status,
        })),
        page,
        totalPages,
        totalCount: records.length,
      }),
      keyboard.inline_keyboard.length ? keyboard : undefined,
    );
  }

  private async sendWeek(
    token: string,
    chatId: string,
    from: string,
    to: string,
  ): Promise<void> {
    const aggregate = await this.data.aggregateRange({ from, to });
    const days: Array<{ businessDate: string; paidOrderCount: number; totalUzs: number }> = [];
    for (let cursor = from; cursor <= to; cursor = shiftIsoDate(cursor, 1)) {
      const day = await this.data.aggregateRange({ from: cursor, to: cursor });
      days.push({
        businessDate: `${cursor}T07:00:00+05:00`,
        paidOrderCount: day.orderCount,
        totalUzs: day.totalMinor,
      });
    }
    await this.sendHtml(
      token,
      chatId,
      formatWeekSummary({
        startDate: `${from}T07:00:00+05:00`,
        endDate: `${to}T07:00:00+05:00`,
        paidOrderCount: aggregate.orderCount,
        totalUzs: aggregate.totalMinor,
        averageCheckUzs:
          aggregate.orderCount > 0 ? aggregate.totalMinor / aggregate.orderCount : 0,
        days,
        cashiers: cashierRows(aggregate.byCashier),
      }),
    );
  }

  private async sendExport(token: string, chatId: string, date: string): Promise<void> {
    const records = await this.data.queryBusinessDate(date);
    const lines = [
      [
        'order_id',
        'display_id',
        'created_at',
        'paid_at',
        'status',
        'is_paid',
        'total_uzs',
        'creator',
        'cashier',
        'order_type',
        'item_count',
        'payment_methods',
      ].join(','),
      ...records.map((order) =>
        [
          order.orderId,
          order.displayId,
          order.createdAt,
          order.paidAt ?? '',
          order.status,
          order.isPaid,
          order.totalMinor,
          order.creator.name,
          order.cashier.name,
          order.orderType,
          order.itemCount,
          order.payments.map((payment) => payment.method).join('+'),
        ]
          .map(formatCsvCell)
          .join(','),
      ),
    ];
    this.assertEnabled();
    await sendTelegramDocument(
      token,
      chatId,
      `alfa-pos-orders-${date}.csv`,
      `\uFEFF${lines.join('\r\n')}`,
      `${date}: ${records.length} ta buyurtma`,
    );
  }

  private async sendStatus(token: string, chatId: string): Promise<void> {
    const health = await this.health();
    const message = [
      '<b>⚙️ Alfa POS mahalliy hisobot holati</b>',
      '',
      `Saqlangan buyurtmalar: <b>${health.orderCount}</b>`,
      `Oxirgi sinxronlash: <b>${escapeTelegramHtml(health.lastSyncAt || 'hali yo‘q')}</b>`,
      `Oxirgi saqlash: <b>${escapeTelegramHtml(health.lastCaptureAt || 'hali yo‘q')}</b>`,
      health.lastSyncError
        ? `⚠️ ${escapeTelegramHtml(health.lastSyncError)}`
        : '✅ Sinxronlash xatosi yo‘q',
    ].join('\n');
    await this.sendHtml(token, chatId, message);
  }

  private helpText(): string {
    return [
      '<b>Alfa POS Daily Reports</b>',
      '',
      '/today — bugungi savdo va kassirlar',
      '/yesterday — kecha yakunlangan savdo',
      '/week — oxirgi 7 kun',
      '/cashiers — kassirlar bo‘yicha natija',
      '/orders — bugungi barcha buyurtmalar',
      '/export — bugungi buyurtmalarni CSV fayl qilib olish',
      '/status — mahalliy baza va sinxronlash',
      '/help — ushbu yordam',
      '',
      '<i>Savdo: to‘langan va hozir bekor qilinmagan buyurtmalar.</i>',
    ].join('\n');
  }

  private async sendHtml(
    token: string,
    chatId: string,
    message: string,
    replyMarkup?: ReplyMarkup,
  ): Promise<void> {
    const chunks = chunkTelegramMessage(message);
    for (let index = 0; index < chunks.length; index += 1) {
      await this.callTelegram(token, 'sendMessage', {
        chat_id: chatId,
        text: chunks[index],
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...(replyMarkup && index === chunks.length - 1
          ? { reply_markup: replyMarkup }
          : {}),
      });
    }
  }

  private assertEnabled(): void {
    if (!this.enabled()) {
      throw new Error('Telegram reports can run only on the main PC');
    }
  }

  private callTelegram<T>(
    token: string,
    method: string,
    params?: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<T> {
    this.assertEnabled();
    return telegramCall<T>(token, method, params, signal);
  }

  private async maybeSendScheduledReport(token: string): Promise<void> {
    this.assertEnabled();
    const owner = this.config.owner();
    const preferences = this.config.preferences();
    if (!owner || !preferences.dailyEnabled) return;

    const completedBusinessDate = scheduledBusinessDate(
      new Date(),
      preferences.dailyTime,
    );
    if (!completedBusinessDate) return;
    if (this.config.lastDailyBusinessDate() === completedBusinessDate) return;
    // A "final" report must never silently use a stale local snapshot. If
    // refresh fails, leave lastDailyBusinessDate untouched so the poll loop
    // retries after the backend recovers.
    await this.refresh();
    await this.sendDaySummary(
      token,
      owner.chatId,
      completedBusinessDate,
      'Kunlik yakuniy hisobot',
    );
    this.config.setLastDailyBusinessDate(completedBusinessDate);
  }
}
