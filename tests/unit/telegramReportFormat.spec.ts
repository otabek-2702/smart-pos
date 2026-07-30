import { describe, expect, it } from 'vitest';
import {
  TELEGRAM_MESSAGE_LIMIT,
  chunkTelegramMessage,
  escapeTelegramHtml,
  formatCashierDetail,
  formatMoneyUzs,
  formatRecentOrders,
  formatReportDate,
  formatReportDateTime,
  formatReportTime,
  formatTodaySummary,
  formatWeekSummary,
  parseTelegramCommand,
} from '../../src-electron/reporting/telegram-format';

describe('Telegram report primitives', () => {
  it('escapes every HTML-sensitive character in untrusted text', () => {
    expect(escapeTelegramHtml(`<Ali & "Otabek's">`)).toBe(
      '&lt;Ali &amp; &quot;Otabek&#39;s&quot;&gt;',
    );
  });

  it('formats UZS and Tashkent-local dates deterministically', () => {
    const instant = '2026-07-28T20:30:00.000Z';

    expect(formatMoneyUzs(1_234_567.8)).toBe('1 234 568 so‘m');
    expect(formatReportDate(instant)).toBe('29.07.2026');
    expect(formatReportTime(instant)).toBe('01:30');
    expect(formatReportDateTime(instant)).toBe('29.07.2026 01:30');
    expect(formatReportDate('not-a-date')).toBe('—');
  });
});

describe('Telegram report command parsing', () => {
  it.each([
    'today',
    'yesterday',
    'week',
    'cashiers',
    'orders',
    'export',
    'status',
    'help',
  ] as const)('parses /%s', (command) => {
    expect(parseTelegramCommand(`/${command}`)).toEqual({
      command,
      args: [],
      rawArgs: '',
      botUsername: null,
    });
  });

  it('accepts a matching @bot suffix and splits command arguments', () => {
    expect(parseTelegramCommand(' /orders@Daily_Reports_Bot  2  20 ', '@daily_reports_bot'))
      .toEqual({
        command: 'orders',
        args: ['2', '20'],
        rawArgs: '2  20',
        botUsername: 'Daily_Reports_Bot',
      });
  });

  it('ignores commands addressed to another bot and unknown messages', () => {
    expect(parseTelegramCommand('/today@another_bot', 'daily_reports_bot')).toBeNull();
    expect(parseTelegramCommand('/unknown')).toBeNull();
    expect(parseTelegramCommand('today')).toBeNull();
  });
});

describe('Telegram-safe message chunking', () => {
  it('keeps normal lines intact when moving them to a new chunk', () => {
    expect(chunkTelegramMessage('alpha\nbeta\ngamma', 10)).toEqual([
      'alpha\nbeta',
      'gamma',
    ]);
  });

  it('uses the Telegram limit by default', () => {
    const message = `${'a'.repeat(TELEGRAM_MESSAGE_LIMIT)}\nsecond line`;
    const chunks = chunkTelegramMessage(message);

    expect(chunks).toEqual(['a'.repeat(TELEGRAM_MESSAGE_LIMIT), 'second line']);
    expect(chunks.every((chunk) => chunk.length <= TELEGRAM_MESSAGE_LIMIT)).toBe(true);
  });

  it('splits only an individually oversized line and preserves Unicode pairs', () => {
    const oversized = `123456789🙂abcdefghij`;
    const chunks = chunkTelegramMessage(oversized, 10);

    expect(chunks.every((chunk) => chunk.length <= 10)).toBe(true);
    expect(chunks.join('')).toBe(oversized);
    expect(chunks.some((chunk) => chunk.includes('�'))).toBe(false);
  });

  it('rejects invalid limits and emits no empty Telegram message', () => {
    expect(() => chunkTelegramMessage('text', 1)).toThrow(RangeError);
    expect(chunkTelegramMessage('')).toEqual([]);
  });
});

describe('Telegram sales report formatting', () => {
  it('puts worked cashiers before totals, ranks them, and escapes their names', () => {
    const message = formatTodaySummary({
      businessDate: '2026-07-29',
      periodStart: '2026-07-28T22:00:00.000Z',
      periodEnd: '2026-07-29T10:00:00.000Z',
      paidOrderCount: 5,
      totalUzs: 250_000,
      cancelledOrderCount: 1,
      cashiers: [
        { id: 1, name: 'Ali <Admin>', orderCount: 2, totalUzs: 90_000 },
        { id: 2, name: 'Zarina & Co', orderCount: 3, totalUzs: 160_000 },
      ],
      payments: [
        { label: 'Naqd & qaytim', orderCount: 3, totalUzs: 150_000 },
        { label: 'HUMO', orderCount: 2, totalUzs: 100_000 },
      ],
    });

    expect(message.indexOf('Bugun ishlagan kassirlar')).toBeLessThan(
      message.indexOf('<b>Jami</b>'),
    );
    expect(message.indexOf('Zarina &amp; Co')).toBeLessThan(
      message.indexOf('Ali &lt;Admin&gt;'),
    );
    expect(message).toContain('To‘langan buyurtmalar: <b>5 ta</b>');
    expect(message).toContain('Savdo: <b>250 000 so‘m</b>');
    expect(message).toContain('O‘rtacha chek: <b>50 000 so‘m</b>');
    expect(message).toContain('Naqd &amp; qaytim');
  });

  it('formats cashier detail with activity and breakdowns', () => {
    const message = formatCashierDetail({
      id: 7,
      name: `O'Brian <Lead>`,
      businessDate: '2026-07-29',
      orderCount: 4,
      totalUzs: 120_000,
      firstOrderAt: '2026-07-29T03:00:00.000Z',
      lastOrderAt: '2026-07-29T10:15:00.000Z',
      orderTypes: [{ label: 'Zal', orderCount: 4, totalUzs: 120_000 }],
    });

    expect(message).toContain(`O&#39;Brian &lt;Lead&gt;`);
    expect(message).toContain('To‘langan buyurtmalar: <b>4 ta</b>');
    expect(message).toContain('O‘rtacha chek: <b>30 000 so‘m</b>');
    expect(message).toContain('<b>🍽 Buyurtma turlari</b>');
  });

  it('formats recent orders as compact escaped records with pagination', () => {
    const message = formatRecentOrders({
      title: 'Bugun <hammasi>',
      orders: [
        {
          displayId: 501,
          createdAt: '2026-07-29T08:05:00.000Z',
          totalUzs: 75_000,
          cashierName: 'Ali & Vali',
          orderType: 'Zal',
          paymentMethod: 'Naqd',
          status: 'PAID',
        },
      ],
      page: 2,
      totalPages: 4,
      totalCount: 35,
    });

    expect(message).toContain('Bugun &lt;hammasi&gt;');
    expect(message).toContain('<b>1. #501</b>');
    expect(message).toContain('Ali &amp; Vali');
    expect(message).toContain('75 000 so‘m · Naqd · PAID');
    expect(message).toContain('Sahifa 2/4 · jami 35');
  });

  it('formats and chronologically sorts a seven-day summary', () => {
    const message = formatWeekSummary({
      startDate: '2026-07-23',
      endDate: '2026-07-29',
      paidOrderCount: 10,
      totalUzs: 500_000,
      days: [
        { businessDate: '2026-07-29', paidOrderCount: 6, totalUzs: 320_000 },
        { businessDate: '2026-07-23', paidOrderCount: 4, totalUzs: 180_000 },
      ],
      cashiers: [
        { id: 1, name: 'Ali', orderCount: 4, totalUzs: 180_000 },
        { id: 2, name: 'Zarina', orderCount: 6, totalUzs: 320_000 },
      ],
    });

    expect(message).toContain('To‘langan buyurtmalar: <b>10 ta</b>');
    expect(message).toContain('O‘rtacha chek: <b>50 000 so‘m</b>');
    expect(message.indexOf('23.07.2026')).toBeLessThan(
      message.lastIndexOf('29.07.2026'),
    );
    expect(message).toContain('<b>👥 Kassirlar (2)</b>');
  });
});
