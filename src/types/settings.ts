// src/types/settings.ts

export interface ReceiptSettings {
  // Logo
  logoBase64: string | null; // null = use default logo
  useDefaultLogo: boolean;

  // Thank you message
  thankYouMessage: string;
  showThankYouMessage: boolean;

  // Footer
  footerTitle: string;
  footerPhone: string;
  showFooterPhone: boolean;

  // Additional footer text (Instagram, address, etc.)
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

export const DEFAULT_RECEIPT_SETTINGS: ReceiptSettings = {
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

export const DEFAULT_PRINTER_SETTINGS: PrinterSettings = {
  ip: '192.168.123.100',
  port: 9100,
  paperWidth: 80,
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  receipt: DEFAULT_RECEIPT_SETTINGS,
  printer: DEFAULT_PRINTER_SETTINGS,
};
