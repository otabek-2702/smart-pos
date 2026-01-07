// src-electron/print-handler.ts
import { ipcMain } from 'electron';
import { ThermalPrinter } from './thermal-printer';
import { htmlToImage } from './html-to-image';
import { generateReceiptHtml } from './receipt-template';

const printer = new ThermalPrinter('192.168.123.100', 9100);

interface PrintReceiptData {
  displayId: number;
  orderType: string;
  cashierName: string;
  items: Array<{ name: string; quantity: number; price: number }>;
  total: number;
  description?: string;
  phoneNumber?: string;
  logoBase64?: string;
}

interface PrintResult {
  success: boolean;
  error?: string;
}

export function registerPrintHandler(): void {
  ipcMain.handle('print-receipt', async (_event, data: PrintReceiptData): Promise<PrintResult> => {
    try {
      const html = generateReceiptHtml(data, data.logoBase64 || '');
      const imageBuffer = await htmlToImage(html);
      await printer.printImage(imageBuffer);

      return { success: true };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      console.error('Print error:', error);
      return { success: false, error };
    }
  });
}