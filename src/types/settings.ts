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

export interface DisplaySettings {
  companyName: string;
  titleFontSize: 'small' | 'medium' | 'large' | 'xlarge';
  brandColor: string;
  readyColor: string;
  headerTextColor: string;
  // When false, the client display window is never auto-opened — even if a
  // second monitor is connected — and any open one gets closed immediately.
  // Default true to preserve existing behavior on upgrade.
  clientDisplayEnabled: boolean;
}

export interface AppSettings {
  receipt: ReceiptSettings;
  printer: PrinterSettings;
  display: DisplaySettings;
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

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  companyName: 'SMART FOOD',
  titleFontSize: 'large',
  brandColor: '#ff6b00',
  readyColor: '#16a34a',
  headerTextColor: '#ffffff',
  clientDisplayEnabled: true,
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  receipt: DEFAULT_RECEIPT_SETTINGS,
  printer: DEFAULT_PRINTER_SETTINGS,
  display: DEFAULT_DISPLAY_SETTINGS,
};

// Helper: Font size mapping
export const FONT_SIZE_MAP: Record<DisplaySettings['titleFontSize'], string> = {
  small: '1.5rem',
  medium: '2rem',
  large: '2.5rem',
  xlarge: '3rem',
};

// Helper: Check if color is dark
export function isColorDark(hexColor: string): boolean {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  // Calculate luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.5;
}

// Helper: Lighten a color
export function lightenColor(hexColor: string, percent: number): string {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  const newR = Math.min(255, Math.floor(r + (255 - r) * (percent / 100)));
  const newG = Math.min(255, Math.floor(g + (255 - g) * (percent / 100)));
  const newB = Math.min(255, Math.floor(b + (255 - b) * (percent / 100)));

  return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
}

// Helper: Darken a color
export function darkenColor(hexColor: string, percent: number): string {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  const newR = Math.max(0, Math.floor(r * (1 - percent / 100)));
  const newG = Math.max(0, Math.floor(g * (1 - percent / 100)));
  const newB = Math.max(0, Math.floor(b * (1 - percent / 100)));

  return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
}

// Helper: Generate all colors from brand color
export function generateDisplayColors(brandColor: string, readyColor: string) {
  const isDark = isColorDark(brandColor);

  return {
    // Gradient
    gradientStart: brandColor,
    gradientEnd: isDark ? lightenColor(brandColor, 20) : lightenColor(brandColor, 15),

    // Text color (white for dark backgrounds, dark for light backgrounds)
    textColor: isDark ? '#ffffff' : '#1a1d23',

    // Ready section background (very light tint of brand)
    readySectionBg: lightenColor(brandColor, 92),

    // Ready color (green or custom)
    readyColor: readyColor,
    readyLightBg: lightenColor(readyColor, 85),
  };
}
