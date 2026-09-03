import { beforeEach, describe, expect, it, vi } from 'vitest';

const configStorage = vi.hoisted(() => ({
  stored: undefined as string | undefined,
  pending: undefined as string | undefined,
}));

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(`encrypted:${value}`, 'utf8'),
    decryptString: (value: Buffer) => value.toString('utf8').replace(/^encrypted:/, ''),
  },
}));

vi.mock('../../src-electron/persist-path', () => ({
  getPersistDir: () => 'C:\\temporary-alpha-pos-report-config-tests',
}));

vi.mock('node:fs', () => ({
  default: {
    readFileSync: vi.fn(() => {
      if (configStorage.stored === undefined) {
        throw new Error('Config does not exist');
      }
      return configStorage.stored;
    }),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn((_path: string, value: string) => {
      configStorage.pending = String(value);
    }),
    renameSync: vi.fn(() => {
      configStorage.stored = configStorage.pending;
      configStorage.pending = undefined;
    }),
  },
}));

import {
  isValidDailyReportTime,
  ReportConfig,
  type TelegramBotIdentity,
} from '../../src-electron/reporting/report-config';

const FIRST_BOT: TelegramBotIdentity = {
  id: '100',
  firstName: 'First reports bot',
  username: 'first_reports_bot',
};

const REPLACEMENT_BOT: TelegramBotIdentity = {
  id: '200',
  firstName: 'Replacement reports bot',
  username: 'replacement_reports_bot',
};

beforeEach(() => {
  configStorage.stored = undefined;
  configStorage.pending = undefined;
});

describe('daily Telegram report preference', () => {
  it.each(['03:00', '03:10', '12:45', '23:59'])('accepts safe post-close time %s', (value) => {
    expect(isValidDailyReportTime(value)).toBe(true);
  });

  it.each(['00:00', '02:59', '24:00', '3:10', '03:60', 'invalid'])(
    'rejects unsafe or malformed time %s',
    (value) => {
      expect(isValidDailyReportTime(value)).toBe(false);
    },
  );

  it('defaults backend performance logging to off and persists an explicit opt-in', () => {
    const config = new ReportConfig();
    expect(config.preferences().performanceLoggingEnabled).toBe(false);

    config.savePreferences({
      dailyEnabled: true,
      dailyTime: '03:10',
      performanceLoggingEnabled: true,
    });

    expect(new ReportConfig().preferences().performanceLoggingEnabled).toBe(true);
  });
});

describe('Telegram report connection reset', () => {
  it('clears the last sent business date when replacing the bot token', () => {
    const config = new ReportConfig();
    config.saveToken('first-token', FIRST_BOT);
    config.setLastDailyBusinessDate('2026-07-29');

    config.saveToken('replacement-token', REPLACEMENT_BOT);

    expect(config.lastDailyBusinessDate()).toBeUndefined();
    expect(new ReportConfig().lastDailyBusinessDate()).toBeUndefined();
  });

  it('clears the last sent business date when disconnecting the bot', () => {
    const config = new ReportConfig();
    config.saveToken('first-token', FIRST_BOT);
    config.setLastDailyBusinessDate('2026-07-29');

    config.clearConnection();

    expect(config.lastDailyBusinessDate()).toBeUndefined();
    expect(new ReportConfig().lastDailyBusinessDate()).toBeUndefined();
  });
});
