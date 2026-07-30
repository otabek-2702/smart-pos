import { beforeEach, describe, expect, it, vi } from 'vitest';

const telegramApi = vi.hoisted(() => ({
  call: vi.fn(),
  sendDocument: vi.fn(),
  setProfilePhoto: vi.fn(),
}));

vi.mock('../../src-electron/reporting/telegram-api', () => ({
  TelegramApiError: class TelegramApiError extends Error {
    readonly retryAfterSeconds = null;
  },
  telegramCall: telegramApi.call,
  sendTelegramDocument: telegramApi.sendDocument,
  setTelegramProfilePhoto: telegramApi.setProfilePhoto,
}));

import {
  formatCsvCell,
  latestBusinessDate,
  scheduledBusinessDate,
  TelegramReportBot,
} from '../../src-electron/reporting/telegram-report-bot';
import type { ReportConfig } from '../../src-electron/reporting/report-config';

describe('Telegram report business-date selection', () => {
  it('uses the active service date overnight and the just-finished date in the quiet gap', () => {
    // Asia/Tashkent = UTC+5
    expect(latestBusinessDate(new Date('2026-07-29T20:30:00Z'))).toBe('2026-07-29');
    expect(latestBusinessDate(new Date('2026-07-29T23:00:00Z'))).toBe('2026-07-29');
  });

  it('moves to the new business date at 07:00 Tashkent', () => {
    expect(latestBusinessDate(new Date('2026-07-30T01:59:59Z'))).toBe('2026-07-29');
    expect(latestBusinessDate(new Date('2026-07-30T02:00:00Z'))).toBe('2026-07-30');
  });
});

describe('Telegram scheduled report date', () => {
  it('never schedules before the 03:00 business close', () => {
    expect(
      scheduledBusinessDate(new Date('2026-07-29T21:59:59Z'), '03:10'),
    ).toBeNull();
  });

  it('waits until the configured post-close time', () => {
    expect(
      scheduledBusinessDate(new Date('2026-07-29T22:09:59Z'), '03:10'),
    ).toBeNull();
    expect(
      scheduledBusinessDate(new Date('2026-07-29T22:10:00Z'), '03:10'),
    ).toBe('2026-07-29');
  });

  it('rejects an unsafe pre-close schedule even if it reaches the bot', () => {
    expect(
      scheduledBusinessDate(new Date('2026-07-29T22:30:00Z'), '02:30'),
    ).toBeNull();
  });
});

describe('Telegram CSV export cells', () => {
  it('neutralizes spreadsheet formulas and escapes embedded quotes', () => {
    expect(formatCsvCell('=HYPERLINK("https://bad")')).toBe(
      '"\'=HYPERLINK(""https://bad"")"',
    );
  });

  it('neutralizes formulas hidden behind leading whitespace', () => {
    expect(formatCsvCell(' +SUM(A1:A2)')).toBe('"\' +SUM(A1:A2)"');
  });

  it('keeps ordinary values intact apart from CSV quoting', () => {
    expect(formatCsvCell('Ali "Chef"')).toBe('"Ali ""Chef"""');
  });
});

describe('Telegram main-PC runtime guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not poll or send any Telegram request while the bot is disabled', async () => {
    const config = {
      getToken: vi.fn(() => '123456:encrypted-at-rest-token'),
      owner: vi.fn(() => ({
        chatId: '99',
        userId: '88',
        displayName: 'Owner',
        pairedAt: '2026-07-30T00:00:00.000Z',
      })),
    } as unknown as ReportConfig;
    const bot = new TelegramReportBot({
      config,
      data: {
        queryBusinessDate: vi.fn(),
        queryRange: vi.fn(),
        aggregateRange: vi.fn(),
      },
      health: vi.fn(),
      refresh: vi.fn(),
      enabled: () => false,
    });

    bot.start();
    expect(bot.running).toBe(false);
    expect(config.getToken).not.toHaveBeenCalled();

    await expect(bot.sendToOwner('must not be sent')).rejects.toThrow(
      'only on the main PC',
    );
    await expect(bot.applyOwnerCommands()).rejects.toThrow(
      'only on the main PC',
    );

    expect(telegramApi.call).not.toHaveBeenCalled();
    expect(telegramApi.sendDocument).not.toHaveBeenCalled();
    expect(telegramApi.setProfilePhoto).not.toHaveBeenCalled();
  });
});
