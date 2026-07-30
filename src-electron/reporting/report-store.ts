import { mkdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import type {
  CashierReportTotal,
  DimensionReportTotal,
  OrderReportRecord,
  ReportDateRange,
  ReportEntityId,
  ReportOrderItem,
  ReportPaymentLine,
  ReportPerson,
  SalesReportAggregate,
} from './report-types';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CANCELLED_STATUSES = new Set(['CANCELED', 'CANCELLED']);
const DEFAULT_TIME_ZONE = 'Asia/Tashkent';
const DATABASE_FILE = 'sales-reports.sqlite3';
const CHILD_QUERY_CHUNK = 500;

type SqlPrimitive = null | string | number | bigint | Uint8Array;
type SqlRow = Record<string, SqlPrimitive>;

export interface SqliteStatement {
  all(...values: SqlPrimitive[]): SqlRow[];
  get(...values: SqlPrimitive[]): SqlRow | undefined;
  run(...values: SqlPrimitive[]): unknown;
}

export interface SqliteDatabase {
  close(): void;
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
}

type SqliteDatabaseConstructor = new (filename: string) => SqliteDatabase;

export interface ReportStoreOptions {
  baseDir: string;
  clock?: () => Date;
  timeZone?: string;
  /**
   * Test seam. Production uses Electron's bundled `node:sqlite`; tests may
   * inject a compatible in-memory database without importing that Node 22 API.
   */
  database?: SqliteDatabase;
  databaseFactory?: (filename: string) => SqliteDatabase;
  databasePath?: string;
}

export interface ReportStoreStats {
  orderCount: number;
  earliestBusinessDate: string | null;
  latestBusinessDate: string | null;
  databaseBytes: number;
}

/**
 * Load the Electron 39 / Node 22 built-in lazily.
 *
 * The module name is deliberately assembled at runtime. Development and
 * type-checking run on Node 20, which neither exposes nor types `node:sqlite`;
 * Electron production does. Keeping it out of a static import also means
 * esbuild leaves packaging alone and no native addon/rebuild is required.
 */
function loadBuiltInDatabase(): SqliteDatabaseConstructor {
  const require = createRequire(import.meta.url);
  const moduleName = `node:${'sqlite'}`;
  try {
    const loaded = require(moduleName) as {
      DatabaseSync?: SqliteDatabaseConstructor;
    };
    if (typeof loaded.DatabaseSync === 'function') return loaded.DatabaseSync;
  } catch {
    // Replaced below with one stable, actionable error.
  }
  throw new Error('Local sales reporting requires Electron 39 (Node 22 node:sqlite).');
}

export function isBuiltInSqliteAvailable(): boolean {
  try {
    loadBuiltInDatabase();
    return true;
  } catch {
    return false;
  }
}

export class ReportStore {
  readonly baseDir: string;
  readonly databasePath: string;

  private readonly clock: () => Date;
  private readonly timeZone: string;
  private readonly database: SqliteDatabase;
  private closed = false;

  constructor(options: ReportStoreOptions) {
    if (!options.baseDir.trim()) throw new Error('Report store baseDir is required');

    this.baseDir = path.resolve(options.baseDir);
    this.databasePath =
      options.databasePath === ':memory:'
        ? ':memory:'
        : path.resolve(options.databasePath ?? path.join(this.baseDir, DATABASE_FILE));
    this.clock = options.clock ?? (() => new Date());
    this.timeZone = options.timeZone ?? DEFAULT_TIME_ZONE;

    mkdirSync(this.baseDir, { recursive: true });
    this.database =
      options.database ??
      (options.databaseFactory
        ? options.databaseFactory(this.databasePath)
        : new (loadBuiltInDatabase())(this.databasePath));
    this.initializeSchema();
  }

  initialize(): Promise<void> {
    this.assertOpen();
    return Promise.resolve();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.database.close();
  }

  /**
   * Replace the latest state of one backend order in one transaction.
   *
   * The backend order ID is the idempotency key. An out-of-order snapshot with
   * an older `updatedAt` is ignored, so a slow retry cannot roll a paid order
   * back to its earlier unpaid state.
   */
  async upsert(record: OrderReportRecord): Promise<OrderReportRecord> {
    this.assertOpen();
    const normalized = normalizeReportRecord(record);
    const orderId = canonicalId(normalized.orderId);
    const now = checkedDate(this.clock(), 'clock').toISOString();
    const sourceUpdatedAt = normalized.updatedAt ?? now;

    const existing = this.database
      .prepare(
        `SELECT source_updated_at
           FROM report_orders
          WHERE order_id = ?`,
      )
      .get(orderId);
    const existingUpdatedAt = nullableText(existing?.source_updated_at);
    if (normalized.updatedAt && existingUpdatedAt && normalized.updatedAt < existingUpdatedAt) {
      return (await this.get(normalized.orderId)) ?? normalized;
    }

    const businessDate = businessDateFor(
      new Date(normalized.paidAt || normalized.createdAt),
      this.timeZone,
    );

    this.database.exec('BEGIN IMMEDIATE');
    try {
      this.database
        .prepare(
          `INSERT INTO report_orders (
             order_id, display_id, order_number, created_at, paid_at,
             source_updated_at, business_date, status, is_paid, total_uzs,
             creator_id, creator_name, cashier_id, cashier_name, order_type,
             item_count, captured_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(order_id) DO UPDATE SET
             display_id = excluded.display_id,
             order_number = excluded.order_number,
             created_at = excluded.created_at,
             paid_at = excluded.paid_at,
             source_updated_at = excluded.source_updated_at,
             business_date = excluded.business_date,
             status = excluded.status,
             is_paid = excluded.is_paid,
             total_uzs = excluded.total_uzs,
             creator_id = excluded.creator_id,
             creator_name = excluded.creator_name,
             cashier_id = excluded.cashier_id,
             cashier_name = excluded.cashier_name,
             order_type = excluded.order_type,
             item_count = excluded.item_count,
             captured_at = excluded.captured_at`,
        )
        .run(
          orderId,
          canonicalId(normalized.displayId),
          normalized.orderNumber == null ? null : canonicalId(normalized.orderNumber),
          normalized.createdAt,
          normalized.paidAt ?? null,
          sourceUpdatedAt,
          businessDate,
          normalized.status,
          normalized.isPaid ? 1 : 0,
          normalized.totalMinor,
          nullableCanonicalId(normalized.creator.id),
          normalized.creator.name,
          nullableCanonicalId(normalized.cashier.id),
          normalized.cashier.name,
          normalized.orderType,
          normalized.itemCount,
          now,
        );

      this.database.prepare('DELETE FROM report_order_items WHERE order_id = ?').run(orderId);
      this.database.prepare('DELETE FROM report_order_payments WHERE order_id = ?').run(orderId);

      const itemInsert = this.database.prepare(
        `INSERT INTO report_order_items (
           order_id, line_index, item_id, product_id, product_name,
           category_name, quantity, unit_price_uzs, line_total_uzs
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      normalized.items.forEach((item, index) => {
        itemInsert.run(
          orderId,
          index,
          nullableCanonicalId(item.itemId),
          nullableCanonicalId(item.productId),
          item.name,
          item.categoryName ?? null,
          item.quantity,
          item.unitPriceMinor,
          item.lineTotalMinor,
        );
      });

      const paymentInsert = this.database.prepare(
        `INSERT INTO report_order_payments (
           order_id, line_index, method, tendered_uzs
         ) VALUES (?, ?, ?, ?)`,
      );
      normalized.payments.forEach((payment, index) => {
        paymentInsert.run(orderId, index, payment.method, payment.amountMinor);
      });

      this.database.exec('COMMIT');
    } catch (error) {
      try {
        this.database.exec('ROLLBACK');
      } catch {
        // Preserve the original write error.
      }
      throw error;
    }

    return cloneRecord(normalized);
  }

  get(orderId: ReportEntityId): Promise<OrderReportRecord | null> {
    this.assertOpen();
    const records = this.readRecords('WHERE order_id = ?', [canonicalId(orderId)], true, true);
    return Promise.resolve(records[0] ?? null);
  }

  all(): Promise<OrderReportRecord[]> {
    this.assertOpen();
    return Promise.resolve(this.readRecords('', [], true, true));
  }

  async queryBusinessDate(date: string): Promise<OrderReportRecord[]> {
    return this.queryRange({ from: date, to: date });
  }

  queryRange(range: ReportDateRange): Promise<OrderReportRecord[]> {
    this.assertOpen();
    validateRange(range);
    return Promise.resolve(
      this.readRecords(
        'WHERE business_date >= ? AND business_date <= ?',
        [range.from, range.to],
        true,
        true,
      ),
    );
  }

  aggregateRange(range: ReportDateRange): Promise<SalesReportAggregate> {
    this.assertOpen();
    validateRange(range);
    // Aggregates need payment lines but not product-line payloads. Avoid loading
    // thousands of item rows for a week/month summary.
    return Promise.resolve(
      aggregateSales(
        this.readRecords(
          'WHERE business_date >= ? AND business_date <= ?',
          [range.from, range.to],
          false,
          true,
        ),
      ),
    );
  }

  businessDateAt(value: string | Date): string | null {
    const date =
      typeof value === 'string'
        ? checkedDate(new Date(value), 'timestamp')
        : checkedDate(value, 'timestamp');
    return businessDateFor(date, this.timeZone);
  }

  stats(): Promise<ReportStoreStats> {
    this.assertOpen();
    const row = this.database
      .prepare(
        `SELECT COUNT(*) AS order_count,
                MIN(business_date) AS earliest_business_date,
                MAX(business_date) AS latest_business_date
           FROM report_orders`,
      )
      .get();

    let databaseBytes = 0;
    if (this.databasePath !== ':memory:') {
      for (const suffix of ['', '-wal', '-shm']) {
        try {
          databaseBytes += statSync(`${this.databasePath}${suffix}`).size;
        } catch {
          // A WAL/SHM sidecar is optional.
        }
      }
    }

    return Promise.resolve({
      orderCount: integerFromSql(row?.order_count),
      earliestBusinessDate: nullableText(row?.earliest_business_date),
      latestBusinessDate: nullableText(row?.latest_business_date),
      databaseBytes,
    });
  }

  private initializeSchema(): void {
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;

      CREATE TABLE IF NOT EXISTS report_orders (
        order_id TEXT PRIMARY KEY,
        display_id TEXT NOT NULL,
        order_number TEXT,
        created_at TEXT NOT NULL,
        paid_at TEXT,
        source_updated_at TEXT NOT NULL,
        business_date TEXT,
        status TEXT NOT NULL,
        is_paid INTEGER NOT NULL CHECK (is_paid IN (0, 1)),
        total_uzs INTEGER NOT NULL CHECK (total_uzs >= 0),
        creator_id TEXT,
        creator_name TEXT NOT NULL,
        cashier_id TEXT,
        cashier_name TEXT NOT NULL,
        order_type TEXT NOT NULL,
        item_count INTEGER NOT NULL CHECK (item_count >= 0),
        captured_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS report_order_items (
        order_id TEXT NOT NULL,
        line_index INTEGER NOT NULL,
        item_id TEXT,
        product_id TEXT,
        product_name TEXT NOT NULL,
        category_name TEXT,
        quantity INTEGER NOT NULL CHECK (quantity >= 0),
        unit_price_uzs INTEGER NOT NULL CHECK (unit_price_uzs >= 0),
        line_total_uzs INTEGER NOT NULL CHECK (line_total_uzs >= 0),
        PRIMARY KEY (order_id, line_index),
        FOREIGN KEY (order_id) REFERENCES report_orders(order_id)
          ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS report_order_payments (
        order_id TEXT NOT NULL,
        line_index INTEGER NOT NULL,
        method TEXT NOT NULL,
        tendered_uzs INTEGER NOT NULL CHECK (tendered_uzs >= 0),
        PRIMARY KEY (order_id, line_index),
        FOREIGN KEY (order_id) REFERENCES report_orders(order_id)
          ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS report_orders_business_date_idx
        ON report_orders (business_date);
      CREATE INDEX IF NOT EXISTS report_orders_cashier_date_idx
        ON report_orders (cashier_id, business_date);
      CREATE INDEX IF NOT EXISTS report_orders_paid_at_idx
        ON report_orders (paid_at);

      PRAGMA user_version = 1;
    `);
  }

  private readRecords(
    whereSql: string,
    values: SqlPrimitive[],
    includeItems: boolean,
    includePayments: boolean,
  ): OrderReportRecord[] {
    const rows = this.database
      .prepare(
        `SELECT order_id, display_id, order_number, created_at, paid_at,
                source_updated_at, status, is_paid, total_uzs,
                creator_id, creator_name, cashier_id, cashier_name,
                order_type, item_count
           FROM report_orders
           ${whereSql}
          ORDER BY COALESCE(paid_at, created_at), order_id`,
      )
      .all(...values);

    if (rows.length === 0) return [];

    const orderIds = rows.map((row) => requiredSqlText(row.order_id, 'order_id'));
    const itemsByOrder = includeItems
      ? this.readItems(orderIds)
      : new Map<string, ReportOrderItem[]>();
    const paymentsByOrder = includePayments
      ? this.readPayments(orderIds)
      : new Map<string, ReportPaymentLine[]>();

    return rows.map((row) => {
      const id = requiredSqlText(row.order_id, 'order_id');
      return {
        orderId: entityIdFromSql(id),
        displayId: entityIdFromSql(requiredSqlText(row.display_id, 'display_id')),
        orderNumber:
          row.order_number == null
            ? null
            : entityIdFromSql(requiredSqlText(row.order_number, 'order_number')),
        createdAt: requiredSqlText(row.created_at, 'created_at'),
        paidAt: nullableText(row.paid_at),
        updatedAt: nullableText(row.source_updated_at),
        status: requiredSqlText(row.status, 'status'),
        isPaid: integerFromSql(row.is_paid) === 1,
        totalMinor: integerFromSql(row.total_uzs),
        creator: {
          id:
            row.creator_id == null
              ? null
              : entityIdFromSql(requiredSqlText(row.creator_id, 'creator_id')),
          name: requiredSqlText(row.creator_name, 'creator_name'),
        },
        cashier: {
          id:
            row.cashier_id == null
              ? null
              : entityIdFromSql(requiredSqlText(row.cashier_id, 'cashier_id')),
          name: requiredSqlText(row.cashier_name, 'cashier_name'),
        },
        orderType: requiredSqlText(row.order_type, 'order_type'),
        itemCount: integerFromSql(row.item_count),
        items: itemsByOrder.get(id) ?? [],
        payments: paymentsByOrder.get(id) ?? [],
      };
    });
  }

  private readItems(orderIds: string[]): Map<string, ReportOrderItem[]> {
    const result = new Map<string, ReportOrderItem[]>();
    for (const chunk of chunks(orderIds, CHILD_QUERY_CHUNK)) {
      const placeholders = chunk.map(() => '?').join(',');
      const rows = this.database
        .prepare(
          `SELECT order_id, item_id, product_id, product_name, category_name,
                  quantity, unit_price_uzs, line_total_uzs
             FROM report_order_items
            WHERE order_id IN (${placeholders})
            ORDER BY order_id, line_index`,
        )
        .all(...chunk);
      for (const row of rows) {
        const orderId = requiredSqlText(row.order_id, 'order_id');
        const items = result.get(orderId) ?? [];
        items.push({
          itemId:
            row.item_id == null ? null : entityIdFromSql(requiredSqlText(row.item_id, 'item_id')),
          productId:
            row.product_id == null
              ? null
              : entityIdFromSql(requiredSqlText(row.product_id, 'product_id')),
          name: requiredSqlText(row.product_name, 'product_name'),
          categoryName: nullableText(row.category_name),
          quantity: integerFromSql(row.quantity),
          unitPriceMinor: integerFromSql(row.unit_price_uzs),
          lineTotalMinor: integerFromSql(row.line_total_uzs),
        });
        result.set(orderId, items);
      }
    }
    return result;
  }

  private readPayments(orderIds: string[]): Map<string, ReportPaymentLine[]> {
    const result = new Map<string, ReportPaymentLine[]>();
    for (const chunk of chunks(orderIds, CHILD_QUERY_CHUNK)) {
      const placeholders = chunk.map(() => '?').join(',');
      const rows = this.database
        .prepare(
          `SELECT order_id, method, tendered_uzs
             FROM report_order_payments
            WHERE order_id IN (${placeholders})
            ORDER BY order_id, line_index`,
        )
        .all(...chunk);
      for (const row of rows) {
        const orderId = requiredSqlText(row.order_id, 'order_id');
        const payments = result.get(orderId) ?? [];
        payments.push({
          method: requiredSqlText(row.method, 'method'),
          amountMinor: integerFromSql(row.tendered_uzs),
        });
        result.set(orderId, payments);
      }
    }
    return result;
  }

  private assertOpen(): void {
    if (this.closed) throw new Error('Report store is closed');
  }
}

export function aggregateSales(records: ReadonlyArray<OrderReportRecord>): SalesReportAggregate {
  const included = records.filter(isIncludedSale);
  const byCashier = new Map<string, CashierReportTotal>();
  const byOrderType = new Map<string, DimensionReportTotal>();
  const byPaymentMethod = new Map<string, DimensionReportTotal>();

  let totalMinor = 0;
  let itemCount = 0;

  for (const record of included) {
    totalMinor += record.totalMinor;
    itemCount += record.itemCount;

    const cashierName = record.cashier.name || 'Unknown cashier';
    const cashierKey =
      record.cashier.id === null
        ? `name:${cashierName.toLocaleLowerCase()}`
        : `id:${canonicalId(record.cashier.id)}`;
    const cashier = byCashier.get(cashierKey) ?? {
      cashierId: record.cashier.id,
      cashierName,
      orderCount: 0,
      totalMinor: 0,
      itemCount: 0,
    };
    addRecord(cashier, record);
    byCashier.set(cashierKey, cashier);

    addDimension(byOrderType, record.orderType || 'UNKNOWN', record);

    for (const allocation of allocatePaymentRevenue(record)) {
      const total = byPaymentMethod.get(allocation.method) ?? {
        key: allocation.method,
        orderCount: 0,
        totalMinor: 0,
        itemCount: 0,
      };
      total.totalMinor += allocation.amountMinor;
      total.orderCount += 1;
      total.itemCount += record.itemCount;
      byPaymentMethod.set(allocation.method, total);
    }
  }

  return {
    orderCount: included.length,
    totalMinor,
    itemCount,
    byCashier: [...byCashier.values()].sort(compareCashierTotals),
    byOrderType: [...byOrderType.values()].sort(compareDimensionTotals),
    byPaymentMethod: [...byPaymentMethod.values()].sort(compareDimensionTotals),
  };
}

export function normalizeReportRecord(record: OrderReportRecord): OrderReportRecord {
  if (!record || typeof record !== 'object') {
    throw new Error('Order report record must be an object');
  }

  const createdAt = checkedDate(new Date(record.createdAt), 'createdAt').toISOString();
  const paidAt =
    record.paidAt == null || record.paidAt === ''
      ? null
      : checkedDate(new Date(record.paidAt), 'paidAt').toISOString();
  const updatedAt =
    record.updatedAt == null || record.updatedAt === ''
      ? null
      : checkedDate(new Date(record.updatedAt), 'updatedAt').toISOString();
  const items = normalizeItems(record.items);
  const itemCount =
    items.length > 0
      ? items.reduce((total, item) => total + item.quantity, 0)
      : nonNegativeInteger(record.itemCount, 'itemCount');

  return {
    orderId: normalizedId(record.orderId, 'orderId'),
    displayId: normalizedId(record.displayId, 'displayId'),
    orderNumber:
      record.orderNumber == null ? null : normalizedId(record.orderNumber, 'orderNumber'),
    createdAt,
    paidAt,
    updatedAt,
    status: requiredText(record.status, 'status').toUpperCase(),
    isPaid: requiredBoolean(record.isPaid, 'isPaid'),
    totalMinor: nonNegativeInteger(record.totalMinor, 'totalMinor'),
    creator: normalizePerson(record.creator, 'creator'),
    cashier: normalizePerson(record.cashier, 'cashier'),
    orderType: requiredText(record.orderType, 'orderType').toUpperCase(),
    itemCount,
    items,
    payments: normalizePayments(record.payments),
  };
}

/**
 * Canonical restaurant service date in Asia/Tashkent:
 *   D 07:00 <= timestamp < D+1 03:00
 *
 * 03:00-06:59 is a deliberate quiet gap and therefore has no business date.
 */
export function businessDateFor(date: Date, timeZone = DEFAULT_TIME_ZONE): string | null {
  const checked = checkedDate(date, 'timestamp');
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(checked)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const hour = Number(parts.hour);

  if (hour >= 7) return `${parts.year}-${parts.month}-${parts.day}`;
  if (hour >= 3) return null;

  const previous = new Date(Date.UTC(year, month - 1, day - 1));
  return [
    previous.getUTCFullYear().toString().padStart(4, '0'),
    (previous.getUTCMonth() + 1).toString().padStart(2, '0'),
    previous.getUTCDate().toString().padStart(2, '0'),
  ].join('-');
}

function normalizePerson(value: ReportPerson | null | undefined, field: string): ReportPerson {
  return {
    id: value?.id == null ? null : normalizedId(value.id, `${field}.id`),
    name: value?.name?.trim() || `Unknown ${field}`,
  };
}

function normalizeItems(
  items: ReadonlyArray<ReportOrderItem> | null | undefined,
): ReportOrderItem[] {
  if (!Array.isArray(items)) throw new Error('items must be an array');

  return items.map((item, index) => ({
    itemId: item.itemId == null ? null : normalizedId(item.itemId, `items[${index}].itemId`),
    productId:
      item.productId == null ? null : normalizedId(item.productId, `items[${index}].productId`),
    name: requiredText(item.name, `items[${index}].name`),
    categoryName: item.categoryName?.trim() || null,
    quantity: nonNegativeInteger(item.quantity, `items[${index}].quantity`),
    unitPriceMinor: nonNegativeInteger(item.unitPriceMinor, `items[${index}].unitPriceMinor`),
    lineTotalMinor: nonNegativeInteger(item.lineTotalMinor, `items[${index}].lineTotalMinor`),
  }));
}

function normalizePayments(
  payments: ReadonlyArray<ReportPaymentLine> | null | undefined,
): ReportPaymentLine[] {
  if (!Array.isArray(payments)) throw new Error('payments must be an array');
  return payments.map((payment, index) => ({
    method: requiredText(payment.method, `payments[${index}].method`).toUpperCase(),
    amountMinor: nonNegativeInteger(payment.amountMinor, `payments[${index}].amountMinor`),
  }));
}

function allocatePaymentRevenue(
  record: OrderReportRecord,
): Array<{ method: string; amountMinor: number }> {
  if (record.totalMinor === 0) return [];

  const tenderByMethod = new Map<string, number>();
  for (const payment of record.payments) {
    const method = payment.method.trim().toUpperCase() || 'UNKNOWN';
    tenderByMethod.set(method, (tenderByMethod.get(method) ?? 0) + payment.amountMinor);
  }
  if (tenderByMethod.size === 0) {
    return [{ method: 'UNKNOWN', amountMinor: record.totalMinor }];
  }

  const result: Array<{ method: string; amountMinor: number }> = [];
  let remaining = record.totalMinor;

  // Non-cash is exact tender. CASH is allocated last because its raw amount
  // may include customer change and must not inflate reported revenue.
  for (const [method, tendered] of tenderByMethod) {
    if (method === 'CASH' || remaining === 0) continue;
    const amountMinor = Math.min(remaining, tendered);
    if (amountMinor > 0) result.push({ method, amountMinor });
    remaining -= amountMinor;
  }

  if (remaining > 0 && tenderByMethod.has('CASH')) {
    result.push({ method: 'CASH', amountMinor: remaining });
    remaining = 0;
  }
  if (remaining > 0) result.push({ method: 'UNKNOWN', amountMinor: remaining });
  return result;
}

function isIncludedSale(record: OrderReportRecord): boolean {
  return record.isPaid && !CANCELLED_STATUSES.has(record.status.toUpperCase());
}

function addRecord(
  target: Pick<CashierReportTotal, 'orderCount' | 'totalMinor' | 'itemCount'>,
  record: OrderReportRecord,
): void {
  target.orderCount += 1;
  target.totalMinor += record.totalMinor;
  target.itemCount += record.itemCount;
}

function addDimension(
  target: Map<string, DimensionReportTotal>,
  rawKey: string,
  record: OrderReportRecord,
): void {
  const key = rawKey.trim().toUpperCase() || 'UNKNOWN';
  const total = target.get(key) ?? {
    key,
    orderCount: 0,
    totalMinor: 0,
    itemCount: 0,
  };
  addRecord(total, record);
  target.set(key, total);
}

function compareCashierTotals(left: CashierReportTotal, right: CashierReportTotal): number {
  return (
    right.totalMinor - left.totalMinor ||
    right.orderCount - left.orderCount ||
    left.cashierName.localeCompare(right.cashierName)
  );
}

function compareDimensionTotals(left: DimensionReportTotal, right: DimensionReportTotal): number {
  return (
    right.totalMinor - left.totalMinor ||
    right.orderCount - left.orderCount ||
    left.key.localeCompare(right.key)
  );
}

function cloneRecord(record: OrderReportRecord): OrderReportRecord {
  return {
    ...record,
    creator: { ...record.creator },
    cashier: { ...record.cashier },
    items: record.items.map((item) => ({ ...item })),
    payments: record.payments.map((payment) => ({ ...payment })),
  };
}

function validateRange(range: ReportDateRange): void {
  if (!ISO_DATE.test(range.from) || !ISO_DATE.test(range.to)) {
    throw new Error('Report range dates must use YYYY-MM-DD');
  }
  if (range.from > range.to) {
    throw new Error('Report range from date must not be after to date');
  }
}

function checkedDate(value: Date, field: string): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error(`${field} must be a valid date`);
  }
  return new Date(value.getTime());
}

function normalizedId(value: ReportEntityId, field: string): ReportEntityId {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new Error(`${field} must be a safe integer or non-empty string`);
    }
    return value;
  }
  if (typeof value === 'string' && value.trim()) return value.trim();
  throw new Error(`${field} must be a safe integer or non-empty string`);
}

function canonicalId(value: ReportEntityId): string {
  return String(normalizedId(value, 'id'));
}

function nullableCanonicalId(value: ReportEntityId | null | undefined): string | null {
  return value == null ? null : canonicalId(value);
}

function entityIdFromSql(value: string): ReportEntityId {
  if (/^-?\d+$/.test(value)) {
    const number = Number(value);
    if (Number.isSafeInteger(number)) return number;
  }
  return value;
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value.trim();
}

function requiredBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${field} must be a boolean`);
  return value;
}

function nonNegativeInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative safe integer`);
  }
  return value;
}

function requiredSqlText(value: SqlPrimitive | undefined, field: string): string {
  if (typeof value !== 'string') throw new Error(`Invalid ${field} in report database`);
  return value;
}

function nullableText(value: SqlPrimitive | undefined): string | null {
  return typeof value === 'string' ? value : null;
}

function integerFromSql(value: SqlPrimitive | undefined): number {
  if (typeof value === 'bigint') {
    const number = Number(value);
    if (Number.isSafeInteger(number)) return number;
  }
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  if (typeof value === 'string' && /^-?\d+$/.test(value)) {
    const number = Number(value);
    if (Number.isSafeInteger(number)) return number;
  }
  return 0;
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}
