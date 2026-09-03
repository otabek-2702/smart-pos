import { safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { getPersistDir } from '../persist-path';

export interface TelegramOwner {
  chatId: string;
  userId: string;
  displayName: string;
  username?: string;
  pairedAt: string;
}

export interface TelegramBotIdentity {
  id: string;
  firstName: string;
  username: string;
}

export interface TelegramReportPreferences {
  dailyEnabled: boolean;
  dailyTime: string;
  performanceLoggingEnabled: boolean;
}

interface StoredReportConfig {
  version: 1;
  encryptedToken?: string;
  bot?: TelegramBotIdentity;
  owner?: TelegramOwner;
  pairingTokenHash?: string;
  pairingExpiresAt?: string;
  updateOffset: number;
  preferences: TelegramReportPreferences;
  lastDailyBusinessDate?: string;
}

const DEFAULT_CONFIG: StoredReportConfig = {
  version: 1,
  updateOffset: 0,
  preferences: {
    dailyEnabled: true,
    dailyTime: '03:10',
    performanceLoggingEnabled: false,
  },
};

const SAFE_DAILY_REPORT_TIME = /^(?:0[3-9]|1\d|2[0-3]):[0-5]\d$/;

export function isValidDailyReportTime(value: string): boolean {
  return SAFE_DAILY_REPORT_TIME.test(value);
}

function configPath(): string {
  return path.join(getPersistDir(), 'telegram-reports.json');
}

function readStored(): StoredReportConfig {
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath(), 'utf8')) as Partial<StoredReportConfig>;
    const storedDailyTime = parsed.preferences?.dailyTime;
    const performanceLoggingEnabled = parsed.preferences?.performanceLoggingEnabled === true;
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      version: 1,
      updateOffset:
        Number.isSafeInteger(parsed.updateOffset) && Number(parsed.updateOffset) >= 0
          ? Number(parsed.updateOffset)
          : 0,
      preferences: {
        ...DEFAULT_CONFIG.preferences,
        ...(parsed.preferences ?? {}),
        dailyTime:
          typeof storedDailyTime === 'string' && isValidDailyReportTime(storedDailyTime)
            ? storedDailyTime
            : DEFAULT_CONFIG.preferences.dailyTime,
        performanceLoggingEnabled,
      },
    };
  } catch {
    return structuredClone(DEFAULT_CONFIG);
  }
}

function writeStored(config: StoredReportConfig): void {
  const target = configPath();
  const temp = `${target}.next`;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(temp, JSON.stringify(config, null, 2), 'utf8');
  fs.renameSync(temp, target);
}

export class ReportConfig {
  private value: StoredReportConfig = readStored();

  hasToken(): boolean {
    return this.getToken() !== null;
  }

  getToken(): string | null {
    const encrypted = this.value.encryptedToken;
    if (!encrypted || !safeStorage.isEncryptionAvailable()) return null;
    try {
      return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
    } catch {
      return null;
    }
  }

  saveToken(token: string, bot: TelegramBotIdentity): void {
    const clean = token.trim();
    if (!clean) throw new Error('Bot token is empty');
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Windows secure token storage is unavailable');
    }
    this.value.encryptedToken = safeStorage.encryptString(clean).toString('base64');
    // A replacement token points at a different Telegram chat identity. Never
    // carry the previous bot's authorization into the new one.
    delete this.value.owner;
    delete this.value.pairingTokenHash;
    delete this.value.pairingExpiresAt;
    delete this.value.lastDailyBusinessDate;
    this.value.bot = bot;
    this.value.updateOffset = 0;
    writeStored(this.value);
  }

  clearConnection(): void {
    delete this.value.encryptedToken;
    delete this.value.bot;
    delete this.value.owner;
    delete this.value.pairingTokenHash;
    delete this.value.pairingExpiresAt;
    delete this.value.lastDailyBusinessDate;
    this.value.updateOffset = 0;
    writeStored(this.value);
  }

  bot(): TelegramBotIdentity | undefined {
    return this.value.bot ? { ...this.value.bot } : undefined;
  }

  owner(): TelegramOwner | undefined {
    return this.value.owner ? { ...this.value.owner } : undefined;
  }

  pairOwner(owner: TelegramOwner): void {
    this.value.owner = { ...owner };
    delete this.value.pairingTokenHash;
    delete this.value.pairingExpiresAt;
    writeStored(this.value);
  }

  unpairOwner(): void {
    delete this.value.owner;
    delete this.value.pairingTokenHash;
    delete this.value.pairingExpiresAt;
    writeStored(this.value);
  }

  setPairing(tokenHash: string, expiresAt: string): void {
    this.value.pairingTokenHash = tokenHash;
    this.value.pairingExpiresAt = expiresAt;
    writeStored(this.value);
  }

  pairing(): { tokenHash: string; expiresAt: string } | null {
    if (!this.value.pairingTokenHash || !this.value.pairingExpiresAt) return null;
    return {
      tokenHash: this.value.pairingTokenHash,
      expiresAt: this.value.pairingExpiresAt,
    };
  }

  updateOffset(): number {
    return this.value.updateOffset;
  }

  setUpdateOffset(offset: number): void {
    if (!Number.isSafeInteger(offset) || offset < 0) return;
    this.value.updateOffset = offset;
    writeStored(this.value);
  }

  preferences(): TelegramReportPreferences {
    return { ...this.value.preferences };
  }

  savePreferences(preferences: TelegramReportPreferences): void {
    if (!isValidDailyReportTime(preferences.dailyTime)) {
      throw new Error('Daily report time must be between 03:00 and 23:59');
    }
    this.value.preferences = {
      dailyEnabled: Boolean(preferences.dailyEnabled),
      dailyTime: preferences.dailyTime,
      performanceLoggingEnabled: preferences.performanceLoggingEnabled === true,
    };
    writeStored(this.value);
  }

  lastDailyBusinessDate(): string | undefined {
    return this.value.lastDailyBusinessDate;
  }

  setLastDailyBusinessDate(value: string): void {
    this.value.lastDailyBusinessDate = value;
    writeStored(this.value);
  }
}
