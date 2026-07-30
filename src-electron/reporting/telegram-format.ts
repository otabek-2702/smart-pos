export const TELEGRAM_MESSAGE_LIMIT = 4096;
export const REPORT_LOCALE = 'uz-UZ';
export const REPORT_TIME_ZONE = 'Asia/Tashkent';

export type ReportDateInput = Date | string | number;

export type TelegramReportCommand =
  | 'today'
  | 'yesterday'
  | 'week'
  | 'cashiers'
  | 'orders'
  | 'export'
  | 'status'
  | 'help';

export interface ParsedTelegramCommand {
  command: TelegramReportCommand;
  args: string[];
  rawArgs: string;
  botUsername: string | null;
}

export interface ReportCashierSummary {
  id?: number | string | null;
  name: string;
  orderCount: number;
  totalUzs: number;
}

export interface ReportBreakdownRow {
  label: string;
  orderCount?: number;
  totalUzs: number;
}

export interface TodayReportSummary {
  businessDate: ReportDateInput;
  periodStart?: ReportDateInput | null;
  periodEnd?: ReportDateInput | null;
  paidOrderCount: number;
  totalUzs: number;
  averageCheckUzs?: number | null;
  cancelledOrderCount?: number;
  cashiers: ReportCashierSummary[];
  payments?: ReportBreakdownRow[];
  orderTypes?: ReportBreakdownRow[];
}

export interface CashierReportDetail extends ReportCashierSummary {
  businessDate: ReportDateInput;
  averageCheckUzs?: number | null;
  firstOrderAt?: ReportDateInput | null;
  lastOrderAt?: ReportDateInput | null;
  payments?: ReportBreakdownRow[];
  orderTypes?: ReportBreakdownRow[];
}

export interface RecentReportOrder {
  displayId: number | string;
  createdAt: ReportDateInput;
  totalUzs: number;
  cashierName?: string | null;
  orderType?: string | null;
  paymentMethod?: string | null;
  status?: string | null;
}

export interface RecentOrdersReport {
  title?: string;
  orders: RecentReportOrder[];
  page?: number;
  totalPages?: number;
  totalCount?: number;
}

export interface ReportDaySummary {
  businessDate: ReportDateInput;
  paidOrderCount: number;
  totalUzs: number;
}

export interface WeekReportSummary {
  startDate: ReportDateInput;
  endDate: ReportDateInput;
  paidOrderCount: number;
  totalUzs: number;
  averageCheckUzs?: number | null;
  days: ReportDaySummary[];
  cashiers?: ReportCashierSummary[];
}

const REPORT_COMMANDS: ReadonlySet<string> = new Set<TelegramReportCommand>([
  'today',
  'yesterday',
  'week',
  'cashiers',
  'orders',
  'export',
  'status',
  'help',
]);

const integerFormatter = new Intl.NumberFormat(REPORT_LOCALE, {
  maximumFractionDigits: 0,
});

const datePartsFormatter = new Intl.DateTimeFormat(REPORT_LOCALE, {
  timeZone: REPORT_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const timePartsFormatter = new Intl.DateTimeFormat(REPORT_LOCALE, {
  timeZone: REPORT_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function finiteNumber(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function nonNegativeInteger(value: number): number {
  return Math.max(0, Math.round(finiteNumber(value)));
}

function normalizeIntlSpaces(value: string): string {
  return value.replace(/[\u00a0\u202f]/g, ' ');
}

function toDate(value: ReportDateInput): Date | null {
  const result = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(result.getTime()) ? null : result;
}

function part(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): string {
  return parts.find((candidate) => candidate.type === type)?.value ?? '';
}

function plainText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return value.toString();
  }
  if (typeof value === 'symbol') return value.description ?? '';
  if (typeof value === 'function') return '';
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return '';
  }
}

function safeLabel(value: unknown, maximumLength = 120): string {
  const text = plainText(value).trim() || 'Noma’lum';
  const symbols = Array.from(text);
  const shortened =
    symbols.length > maximumLength
      ? `${symbols.slice(0, Math.max(1, maximumLength - 1)).join('')}…`
      : text;
  return escapeTelegramHtml(shortened);
}

function countLabel(value: number): string {
  return `${formatReportNumber(nonNegativeInteger(value))} ta`;
}

function averageAmount(
  totalUzs: number,
  orderCount: number,
  explicit?: number | null,
): number {
  if (explicit !== undefined && explicit !== null && Number.isFinite(explicit)) {
    return explicit;
  }
  return orderCount > 0 ? finiteNumber(totalUzs) / orderCount : 0;
}

function formatPeriod(
  start: ReportDateInput | null | undefined,
  end: ReportDateInput | null | undefined,
): string | null {
  if (!start && !end) return null;
  if (start && end) return `${formatReportTime(start)}–${formatReportTime(end)}`;
  if (start) return `${formatReportTime(start)} dan`;
  return `${formatReportTime(end as ReportDateInput)} gacha`;
}

function sortedCashiers(cashiers: readonly ReportCashierSummary[]): ReportCashierSummary[] {
  return [...cashiers].sort(
    (left, right) =>
      finiteNumber(right.totalUzs) - finiteNumber(left.totalUzs) ||
      nonNegativeInteger(right.orderCount) - nonNegativeInteger(left.orderCount) ||
      left.name.localeCompare(right.name, REPORT_LOCALE),
  );
}

function appendCashierRows(lines: string[], cashiers: readonly ReportCashierSummary[]): void {
  const ranked = sortedCashiers(cashiers);
  if (ranked.length === 0) {
    lines.push('Buyurtma yaratgan kassir yo‘q.');
    return;
  }

  ranked.forEach((cashier, index) => {
    lines.push(
      `${index + 1}. <b>${safeLabel(cashier.name)}</b> — ` +
        `${countLabel(cashier.orderCount)} · ${formatMoneyUzs(cashier.totalUzs)}`,
    );
  });
}

function appendBreakdown(
  lines: string[],
  heading: string,
  rows: readonly ReportBreakdownRow[] | undefined,
): void {
  if (!rows?.length) return;
  lines.push('', `<b>${heading}</b>`);
  for (const row of rows) {
    const count =
      row.orderCount === undefined ? '' : ` · ${countLabel(row.orderCount)}`;
    lines.push(`• ${safeLabel(row.label)}${count} · ${formatMoneyUzs(row.totalUzs)}`);
  }
}

/**
 * Escapes arbitrary text for Telegram's HTML parse mode.
 *
 * Call this only for dynamic text. Formatter-owned tags such as <b> must stay
 * outside the escaped value.
 */
export function escapeTelegramHtml(value: unknown): string {
  return plainText(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatReportNumber(value: number): string {
  return normalizeIntlSpaces(integerFormatter.format(Math.round(finiteNumber(value))));
}

export function formatMoneyUzs(value: number): string {
  return `${formatReportNumber(value)} so‘m`;
}

/** Returns a stable DD.MM.YYYY date in the restaurant's Tashkent time zone. */
export function formatReportDate(value: ReportDateInput): string {
  const date = toDate(value);
  if (!date) return '—';
  const parts = datePartsFormatter.formatToParts(date);
  return `${part(parts, 'day')}.${part(parts, 'month')}.${part(parts, 'year')}`;
}

/** Returns a stable 24-hour HH:MM time in the restaurant's Tashkent time zone. */
export function formatReportTime(value: ReportDateInput): string {
  const date = toDate(value);
  if (!date) return '—';
  const parts = timePartsFormatter.formatToParts(date);
  return `${part(parts, 'hour')}:${part(parts, 'minute')}`;
}

export function formatReportDateTime(value: ReportDateInput): string {
  const date = toDate(value);
  if (!date) return '—';
  return `${formatReportDate(date)} ${formatReportTime(date)}`;
}

/**
 * Parses only commands understood by the reports bot.
 *
 * When expectedBotUsername is provided, a command explicitly addressed to a
 * different bot is ignored. Usernames may be supplied with or without "@".
 */
export function parseTelegramCommand(
  text: string,
  expectedBotUsername?: string,
): ParsedTelegramCommand | null {
  const match = text
    .trim()
    .match(/^\/([a-z][a-z0-9_]*)(?:@([a-z][a-z0-9_]*))?(?:\s+([\s\S]*))?$/i);
  if (!match) return null;

  const command = match[1]?.toLowerCase() ?? '';
  if (!REPORT_COMMANDS.has(command)) return null;

  const botUsername = match[2] ?? null;
  const expected = expectedBotUsername?.trim().replace(/^@/, '').toLowerCase();
  if (expected && botUsername && botUsername.toLowerCase() !== expected) return null;

  const rawArgs = (match[3] ?? '').trim();
  return {
    command: command as TelegramReportCommand,
    args: rawArgs ? rawArgs.split(/\s+/) : [],
    rawArgs,
    botUsername,
  };
}

/**
 * Splits a Telegram message without breaking ordinary lines. A single line
 * longer than the requested limit is the only case where that line is split.
 */
export function chunkTelegramMessage(
  message: string,
  maximumLength = TELEGRAM_MESSAGE_LIMIT,
): string[] {
  if (!Number.isInteger(maximumLength) || maximumLength < 2) {
    throw new RangeError('Telegram chunk length must be an integer of at least 2');
  }
  if (message.length === 0) return [];

  const result: string[] = [];
  let current: string | null = null;

  function pushCurrent(): void {
    if (current !== null) result.push(current);
    current = null;
  }

  for (const line of message.split('\n')) {
    if (current !== null) {
      const candidate: string = `${current}\n${line}`;
      if (candidate.length <= maximumLength) {
        current = candidate;
        continue;
      }
      pushCurrent();
    }

    if (line.length <= maximumLength) {
      current = line;
      continue;
    }

    const pieces = splitOversizedLine(line, maximumLength);
    for (let index = 0; index < pieces.length - 1; index += 1) {
      result.push(pieces[index] ?? '');
    }
    current = pieces.at(-1) ?? '';
  }

  pushCurrent();
  return result;
}

function splitOversizedLine(line: string, maximumLength: number): string[] {
  const result: string[] = [];
  let current = '';

  for (const symbol of Array.from(line)) {
    if (current && current.length + symbol.length > maximumLength) {
      result.push(current);
      current = '';
    }
    current += symbol;
  }

  if (current) result.push(current);
  return result;
}

export function formatTodaySummary(summary: TodayReportSummary): string {
  const lines = [
    `<b>📊 Bugungi savdo — ${formatReportDate(summary.businessDate)}</b>`,
  ];
  const period = formatPeriod(summary.periodStart, summary.periodEnd);
  if (period) lines.push(`<i>${period} · ${REPORT_TIME_ZONE}</i>`);

  lines.push('', `<b>👥 Bugun ishlagan kassirlar (${summary.cashiers.length})</b>`);
  appendCashierRows(lines, summary.cashiers);

  lines.push(
    '',
    '<b>Jami</b>',
    `🧾 To‘langan buyurtmalar: <b>${countLabel(summary.paidOrderCount)}</b>`,
    `💰 Savdo: <b>${formatMoneyUzs(summary.totalUzs)}</b>`,
    `📈 O‘rtacha chek: <b>${formatMoneyUzs(
      averageAmount(summary.totalUzs, summary.paidOrderCount, summary.averageCheckUzs),
    )}</b>`,
  );

  if (summary.cancelledOrderCount !== undefined) {
    lines.push(`❌ Bekor qilingan: <b>${countLabel(summary.cancelledOrderCount)}</b>`);
  }

  appendBreakdown(lines, '💳 To‘lovlar', summary.payments);
  appendBreakdown(lines, '🍽 Buyurtma turlari', summary.orderTypes);
  return lines.join('\n');
}

export function formatCashierDetail(detail: CashierReportDetail): string {
  const lines = [
    `<b>👤 ${safeLabel(detail.name)}</b>`,
    `<i>${formatReportDate(detail.businessDate)}</i>`,
    '',
    `🧾 To‘langan buyurtmalar: <b>${countLabel(detail.orderCount)}</b>`,
    `💰 Savdo: <b>${formatMoneyUzs(detail.totalUzs)}</b>`,
    `📈 O‘rtacha chek: <b>${formatMoneyUzs(
      averageAmount(detail.totalUzs, detail.orderCount, detail.averageCheckUzs),
    )}</b>`,
  ];

  if (detail.firstOrderAt || detail.lastOrderAt) {
    lines.push(
      `🕒 Faollik: <b>${formatPeriod(detail.firstOrderAt, detail.lastOrderAt) ?? '—'}</b>`,
    );
  }

  appendBreakdown(lines, '💳 To‘lovlar', detail.payments);
  appendBreakdown(lines, '🍽 Buyurtma turlari', detail.orderTypes);
  return lines.join('\n');
}

export function formatRecentOrders(report: RecentOrdersReport): string {
  const title = safeLabel(report.title || 'So‘nggi buyurtmalar');
  const lines = [`<b>🧾 ${title}</b>`];

  if (report.orders.length === 0) {
    lines.push('', 'Buyurtmalar topilmadi.');
  } else {
    report.orders.forEach((order, index) => {
      const details = [
        formatReportTime(order.createdAt),
        order.cashierName ? safeLabel(order.cashierName, 80) : null,
        order.orderType ? safeLabel(order.orderType, 50) : null,
      ].filter((value): value is string => Boolean(value));
      const payment = order.paymentMethod
        ? ` · ${safeLabel(order.paymentMethod, 40)}`
        : '';
      const status = order.status ? ` · ${safeLabel(order.status, 40)}` : '';

      lines.push(
        '',
        `<b>${index + 1}. #${safeLabel(order.displayId, 32)}</b> · ${details.join(' · ')}`,
        `${formatMoneyUzs(order.totalUzs)}${payment}${status}`,
      );
    });
  }

  if (report.page !== undefined || report.totalCount !== undefined) {
    const page = nonNegativeInteger(report.page ?? 1) || 1;
    const totalPages = Math.max(page, nonNegativeInteger(report.totalPages ?? page) || page);
    const total =
      report.totalCount === undefined
        ? ''
        : ` · jami ${formatReportNumber(nonNegativeInteger(report.totalCount))}`;
    lines.push('', `<i>Sahifa ${page}/${totalPages}${total}</i>`);
  }

  return lines.join('\n');
}

export function formatWeekSummary(summary: WeekReportSummary): string {
  const lines = [
    '<b>📅 7 kunlik savdo</b>',
    `<i>${formatReportDate(summary.startDate)}–${formatReportDate(summary.endDate)}</i>`,
    '',
    `🧾 To‘langan buyurtmalar: <b>${countLabel(summary.paidOrderCount)}</b>`,
    `💰 Savdo: <b>${formatMoneyUzs(summary.totalUzs)}</b>`,
    `📈 O‘rtacha chek: <b>${formatMoneyUzs(
      averageAmount(summary.totalUzs, summary.paidOrderCount, summary.averageCheckUzs),
    )}</b>`,
  ];

  if (summary.days.length > 0) {
    const days = [...summary.days].sort((left, right) => {
      const leftTime = toDate(left.businessDate)?.getTime() ?? 0;
      const rightTime = toDate(right.businessDate)?.getTime() ?? 0;
      return leftTime - rightTime;
    });
    lines.push('', '<b>Kunlar bo‘yicha</b>');
    for (const day of days) {
      lines.push(
        `• ${formatReportDate(day.businessDate)} — ` +
          `${countLabel(day.paidOrderCount)} · ${formatMoneyUzs(day.totalUzs)}`,
      );
    }
  }

  if (summary.cashiers?.length) {
    lines.push('', `<b>👥 Kassirlar (${summary.cashiers.length})</b>`);
    appendCashierRows(lines, summary.cashiers);
  }

  return lines.join('\n');
}
