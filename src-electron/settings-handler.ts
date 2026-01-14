// src-electron/settings-handler.ts

import { ipcMain, app } from 'electron';
import fs from 'fs';
import path from 'path';

export interface ReceiptSettings {
  logoBase64: string | null;
  useDefaultLogo: boolean;
  thankYouMessage: string;
  showThankYouMessage: boolean;
  footerTitle: string;
  footerPhone: string;
  showFooterPhone: boolean;
  additionalFooterText: string;
  showAdditionalFooter: boolean;
}

export interface PrinterSettings {
  ip: string;
  port: number;
  paperWidth: 58 | 80;
}

export interface AppSettings {
  receipt: ReceiptSettings;
  printer: PrinterSettings;
}

const DEFAULT_RECEIPT_SETTINGS: ReceiptSettings = {
  logoBase64: null,
  useDefaultLogo: true,
  thankYouMessage: 'XARIDINGIZ UCHUN RAHMAT!',
  showThankYouMessage: true,
  footerTitle: 'FIKR BILDIRISH UCHUN TEL:',
  footerPhone: '+998 90 205 50 80',
  showFooterPhone: true,
  additionalFooterText: '',
  showAdditionalFooter: false,
};

const DEFAULT_PRINTER_SETTINGS: PrinterSettings = {
  ip: '192.168.123.100',
  port: 9100,
  paperWidth: 80,
};

const DEFAULT_APP_SETTINGS: AppSettings = {
  receipt: DEFAULT_RECEIPT_SETTINGS,
  printer: DEFAULT_PRINTER_SETTINGS,
};

function getSettingsPath(): string {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'app-settings.json');
}

function loadSettings(): AppSettings {
  const settingsPath = getSettingsPath();

  try {
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf-8');
      const parsed = JSON.parse(data) as Partial<AppSettings>;

      // Merge with defaults to ensure all fields exist
      return {
        receipt: { ...DEFAULT_RECEIPT_SETTINGS, ...parsed.receipt },
        printer: { ...DEFAULT_PRINTER_SETTINGS, ...parsed.printer },
      };
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
  }

  return DEFAULT_APP_SETTINGS;
}

function saveSettings(settings: AppSettings): boolean {
  const settingsPath = getSettingsPath();

  try {
    const dir = path.dirname(settingsPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error('Failed to save settings:', error);
    return false;
  }
}

// Cache settings in memory for quick access
let cachedSettings: AppSettings | null = null;

export function getSettings(): AppSettings {
  if (!cachedSettings) {
    cachedSettings = loadSettings();
  }
  return cachedSettings;
}

export function registerSettingsHandler(): void {
  // Get all settings
  ipcMain.handle('settings:get', (): AppSettings => {
    return getSettings();
  });

  // Save all settings
  ipcMain.handle(
    'settings:save',
    (_event, settings: AppSettings): { success: boolean; error?: string } => {
      try {
        const success = saveSettings(settings);
        if (success) {
          cachedSettings = settings; // Update cache
        }
        return { success };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: errorMessage };
      }
    }
  );

  // Get receipt settings only
  ipcMain.handle('settings:getReceipt', (): ReceiptSettings => {
    return getSettings().receipt;
  });

  // Save receipt settings only
  ipcMain.handle(
    'settings:saveReceipt',
    (_event, receiptSettings: ReceiptSettings): { success: boolean; error?: string } => {
      try {
        const current = getSettings();
        const updated: AppSettings = {
          ...current,
          receipt: receiptSettings,
        };
        const success = saveSettings(updated);
        if (success) {
          cachedSettings = updated;
        }
        return { success };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: errorMessage };
      }
    }
  );

  // Get printer settings only
  ipcMain.handle('settings:getPrinter', (): PrinterSettings => {
    return getSettings().printer;
  });

  // Save printer settings only
  ipcMain.handle(
    'settings:savePrinter',
    (_event, printerSettings: PrinterSettings): { success: boolean; error?: string } => {
      try {
        const current = getSettings();
        const updated: AppSettings = {
          ...current,
          printer: printerSettings,
        };
        const success = saveSettings(updated);
        if (success) {
          cachedSettings = updated;
        }
        return { success };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: errorMessage };
      }
    }
  );

  // Reset to defaults
  ipcMain.handle('settings:reset', (): { success: boolean; error?: string } => {
    try {
      const success = saveSettings(DEFAULT_APP_SETTINGS);
      if (success) {
        cachedSettings = DEFAULT_APP_SETTINGS;
      }
      return { success };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  });
}
