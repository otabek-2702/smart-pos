// src-electron/settings-handler.ts

import { ipcMain, app, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import { getPersistDir } from './persist-path';

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
  // 'network' = ESC/POS over TCP to ip:port; 'usb' = a Windows-installed
  // printer (USB or driver) printed via the OS, selected by name.
  connectionType: 'network' | 'usb';
  ip: string;
  port: number;
  paperWidth: 58 | 80;
  // Windows printer device name for connectionType 'usb'. '' = OS default.
  usbPrinterName: string;
}

export interface DisplaySettings {
  companyName: string;
  // Index/login + client-display logo. null = built-in placeholder.
  logoBase64: string | null;
  titleFontSize: 'small' | 'medium' | 'large' | 'xlarge';
  brandColor: string;
  readyColor: string;
  headerTextColor: string;
  clientDisplayEnabled: boolean;
}

export interface AppSettings {
  receipt: ReceiptSettings;
  printer: PrinterSettings;
  display: DisplaySettings;
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
  connectionType: 'network',
  ip: '192.168.123.100',
  port: 9100,
  paperWidth: 80,
  usbPrinterName: '',
};

const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  companyName: 'SMART FOOD',
  logoBase64: null,
  titleFontSize: 'large',
  brandColor: '#ff6b00',
  readyColor: '#16a34a',
  headerTextColor: '#ffffff',
  clientDisplayEnabled: true,
};

const DEFAULT_APP_SETTINGS: AppSettings = {
  receipt: DEFAULT_RECEIPT_SETTINGS,
  printer: DEFAULT_PRINTER_SETTINGS,
  display: DEFAULT_DISPLAY_SETTINGS,
};

function getSettingsPath(): string {
  // Machine-wide + reinstall-proof (see persist-path.ts).
  return path.join(getPersistDir(), 'app-settings.json');
}

// One-time import from the legacy per-user path so existing installs keep their
// receipt/printer/display settings after the move. Never deletes the old file.
function migrateLegacySettings(): void {
  try {
    const newPath = getSettingsPath();
    if (fs.existsSync(newPath)) return;
    const legacy = path.join(app.getPath('userData'), 'app-settings.json');
    if (legacy === newPath) return;
    if (fs.existsSync(legacy)) {
      fs.copyFileSync(legacy, newPath);
    }
  } catch {
    // best-effort
  }
}

function loadSettings(): AppSettings {
  migrateLegacySettings();
  const settingsPath = getSettingsPath();

  try {
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf-8');
      const parsed = JSON.parse(data) as Partial<AppSettings>;

      // Merge with defaults to ensure all fields exist
      return {
        receipt: { ...DEFAULT_RECEIPT_SETTINGS, ...parsed.receipt },
        printer: { ...DEFAULT_PRINTER_SETTINGS, ...parsed.printer },
        display: { ...DEFAULT_DISPLAY_SETTINGS, ...parsed.display },
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

// Broadcast display settings to all windows (for live update)
function broadcastDisplaySettings(displaySettings: DisplaySettings): void {
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    win.webContents.send('display-settings-updated', displaySettings);
  }
}

export function registerSettingsHandler(
  // Optional callback fired whenever display.clientDisplayEnabled changes.
  // electron-main passes a function that closes/opens the client window in
  // response. Optional so this module remains usable in isolation.
  onClientDisplayEnabledChange?: (enabled: boolean) => void,
): void {
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
          cachedSettings = settings;
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

  // Get display settings only
  ipcMain.handle('settings:getDisplay', (): DisplaySettings => {
    return getSettings().display;
  });

  // Save display settings only (with broadcast for live update)
  ipcMain.handle(
    'settings:saveDisplay',
    (_event, displaySettings: DisplaySettings): { success: boolean; error?: string } => {
      try {
        const current = getSettings();
        const previousEnabled = current.display.clientDisplayEnabled;
        const updated: AppSettings = {
          ...current,
          display: displaySettings,
        };
        const success = saveSettings(updated);
        if (success) {
          cachedSettings = updated;
          // Broadcast to all windows for live update
          broadcastDisplaySettings(displaySettings);
          // React to the auto-open toggle changing — close window if turned
          // off, open window (if a 2nd monitor is connected) if turned on.
          if (
            previousEnabled !== displaySettings.clientDisplayEnabled &&
            onClientDisplayEnabledChange
          ) {
            onClientDisplayEnabledChange(displaySettings.clientDisplayEnabled);
          }
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