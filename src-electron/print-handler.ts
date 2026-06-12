import { ipcMain, app, BrowserWindow } from 'electron';
import { ThermalPrinter } from './thermal-printer';
import { htmlToImage } from './html-to-image';
import { generateReceiptHtml } from './receipt-template';
import { getSettings } from './settings-handler';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Get the path to the default logo
function getDefaultLogoPath(): string {
  // Get app paths
  const appPath = app.getAppPath();
  const isDev = process.env.DEV === 'true' || process.env.NODE_ENV === 'development' || appPath.includes('node_modules');
  
  // console.log('=== Logo Path Debug ===');
  // console.log('App path:', appPath);
  // console.log('Is development:', isDev);
  // console.log('__dirname:', __dirname);
  // console.log('process.cwd():', process.cwd());
  
  // Possible logo filenames (in order of preference)
  const logoFilenames = [
    'logo-black-default.png',
    'logo-default.png',
    'logo-black.png',
    'logo-black.jpg',
    'logo.png',
    'logo.jpg',
  ];

  // Possible directories to search
  const directories: string[] = [];
  
  if (isDev) {
    // Development paths
    directories.push(
      path.join(process.cwd(), 'src', 'assets'),
      path.join(appPath, 'src', 'assets'),
      path.join(appPath, '..', 'src', 'assets'),
      // path.join(__dirname, '..', 'src', 'assets'),
      // path.join(__dirname, '..', '..', 'src', 'assets'),
    );
  }
  
  // Production paths
  directories.push(
    path.join(process.resourcesPath || '', 'assets'),
    path.join(appPath, 'assets'),
    path.join(appPath, '..', 'assets'),
    path.join(appPath, 'dist', 'assets'),
  );

  console.log('Searching directories:', directories);

  // Try all combinations
  for (const dir of directories) {
    for (const filename of logoFilenames) {
      const logoPath = path.join(dir, filename);
      console.log('Checking:', logoPath);
      if (fs.existsSync(logoPath)) {
        console.log('✅ Found default logo at:', logoPath);
        return logoPath;
      }
    }
  }

  console.warn('❌ Default logo not found!');
  return '';
}

// Load the default logo and convert to base64
function loadDefaultLogo(): string {
  const logoPath = getDefaultLogoPath();

  if (!logoPath) {
    console.warn('No default logo path found');
    return '';
  }

  try {
    const buffer = fs.readFileSync(logoPath);
    const base64 = buffer.toString('base64');
    const ext = path.extname(logoPath).toLowerCase();
    const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';
    const dataUrl = `data:${mimeType};base64,${base64}`;
    console.log('✅ Default logo loaded successfully, size:', buffer.length, 'bytes');
    return dataUrl;
  } catch (error) {
    console.error('❌ Failed to load default logo:', error);
    return '';
  }
}

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

// Print the receipt HTML to a Windows printer. The HTML is authored in physical
// mm (@page 80mm + mm units), so an offscreen window just loads it, measures the
// content height, and prints one continuous page at 80mm × that height (microns),
// margins:none. No zoom/scale. deviceName '' = the OS default printer.
async function printViaWindows(html: string, deviceName: string): Promise<PrintResult> {
  const paperWidthMicrons = 80 * 1000; // 80mm thermal paper

  const tmp = path.join(os.tmpdir(), 'smartpos-receipt-' + Date.now() + '.html');
  fs.writeFileSync(tmp, html, 'utf8');

  const win = new BrowserWindow({ width: 400, height: 800, show: false, webPreferences: { offscreen: true } });
  try {
    await win.loadFile(tmp);
    // The HTML is authored in physical mm (@page + mm units) — no zoom. Just
    // measure the content height and print one continuous page at that size.
    // await new Promise((r) => setTimeout(r, 400));
    let h = (await win.webContents.executeJavaScript(
      'Math.max(document.body.scrollHeight,document.documentElement.scrollHeight)',
    )) as number;
    if (!h || h < 50) h = 400;
    // px (96 DPI) → microns, + ~25mm trailing feed for the cutter.
    const pageHeight = Math.ceil((h * 25400) / 96) + 25000;
    return await new Promise<PrintResult>((resolve) => {
      win.webContents.print(
        {
          silent: true,
          printBackground: true,
          deviceName: deviceName || '',
          pageSize: { width: paperWidthMicrons, height: pageHeight },
          margins: { marginType: 'none' },
        },
        (success, failureReason) =>
          resolve(success ? { success: true } : { success: false, error: failureReason }),
      );
    });
  } finally {
    if (!win.isDestroyed()) win.close();
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
  }
}

// Route a receipt to the configured printer: USB/Windows (via the OS) or the
// network ESC/POS path. Simple — like the shipped build.
async function doPrint(html: string): Promise<PrintResult> {
  const printerSettings = getSettings().printer;

  if (printerSettings.connectionType === 'usb') {
    return printViaWindows(html, printerSettings.usbPrinterName || '');
  }

  try {
    const imageBuffer = await htmlToImage(html);
    const printer = new ThermalPrinter(printerSettings.ip, printerSettings.port);
    await printer.printImage(imageBuffer);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Tarmoq printeri xatosi' };
  }
}

export function registerPrintHandler(): void {
  // Log on startup to help debug
  console.log('=== Print Handler Registered ===');
  const testLogoPath = getDefaultLogoPath();
  if (testLogoPath) {
    console.log('Default logo is available at:', testLogoPath);
  } else {
    console.log('⚠️ WARNING: Default logo not found! Please check your assets folder.');
  }

  ipcMain.handle('print-receipt', async (_event, data: PrintReceiptData): Promise<PrintResult> => {
    try {
      const settings = getSettings();
      const receiptSettings = settings.receipt;

      let logoBase64 = '';

      if (receiptSettings.logoBase64 && !receiptSettings.useDefaultLogo) {
        logoBase64 = receiptSettings.logoBase64;
        console.log('Using custom logo from settings');
      } else if (receiptSettings.useDefaultLogo) {
        logoBase64 = loadDefaultLogo();
        console.log('Using default logo, loaded:', logoBase64 ? 'yes' : 'no');
      } else if (data.logoBase64) {
        logoBase64 = data.logoBase64;
        console.log('Using logo from print data');
      }

      const html = generateReceiptHtml(data, logoBase64, receiptSettings, { print: settings.printer.connectionType === 'usb' });
      return await doPrint(html);
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      console.error('Print error:', error);
      return { success: false, error };
    }
  });

  ipcMain.handle('print-test', async (): Promise<PrintResult> => {
    try {
      const settings = getSettings();
      const receiptSettings = settings.receipt;

      let logoBase64 = '';
      if (receiptSettings.logoBase64 && !receiptSettings.useDefaultLogo) {
        logoBase64 = receiptSettings.logoBase64;
      } else if (receiptSettings.useDefaultLogo) {
        logoBase64 = loadDefaultLogo();
      }

      const testData = {
        displayId: 999,
        orderType: 'HALL',
        cashierName: 'Test Kassir',
        items: [
          { name: 'Lavash (Test)', quantity: 2, price: 25000 },
          { name: 'Cola 0.5L', quantity: 1, price: 8000 },
          { name: 'Kartoshka Fri', quantity: 1, price: 12000 },
        ],
        total: 70000,
        description: 'Test buyurtma',
        phoneNumber: '+998901234567',
      };

      const html = generateReceiptHtml(testData, logoBase64, receiptSettings, { print: settings.printer.connectionType === 'usb' });
      return await doPrint(html);
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      console.error('Test print error:', error);
      return { success: false, error };
    }
  });

  // List Windows-installed printers for the USB/driver picker in settings.
  ipcMain.handle('printer:list', async (): Promise<{ name: string; displayName: string; isDefault: boolean }[]> => {
    try {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return [];
      const printers = await win.webContents.getPrintersAsync();
      return printers.map((p) => ({
        name: p.name,
        displayName: p.displayName || p.name,
        isDefault: Boolean((p as { isDefault?: boolean }).isDefault),
      }));
    } catch (e) {
      console.error('printer:list failed:', e);
      return [];
    }
  });

  ipcMain.handle('print-preview', (): { success: boolean; html?: string; error?: string } => {
    try {
      const settings = getSettings();
      const receiptSettings = settings.receipt;

      let logoBase64 = '';
      if (receiptSettings.logoBase64 && !receiptSettings.useDefaultLogo) {
        logoBase64 = receiptSettings.logoBase64;
      } else if (receiptSettings.useDefaultLogo) {
        logoBase64 = loadDefaultLogo();
      }

      const previewData = {
        displayId: 123,
        orderType: 'HALL',
        cashierName: 'Kassir Ismi',
        items: [
          { name: 'Lavash Klassik', quantity: 2, price: 25000 },
          { name: 'Cola 0.5L', quantity: 1, price: 8000 },
          { name: 'Kartoshka Fri', quantity: 1, price: 12000 },
        ],
        total: 70000,
        description: 'Qoshimcha sous',
        phoneNumber: '+998901234567',
      };

      const html = generateReceiptHtml(previewData, logoBase64, receiptSettings);

      return { success: true, html };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, error };
    }
  });

  ipcMain.handle('print-test-save', async (): Promise<PrintResult & { filePath?: string }> => {
    try {
      const settings = getSettings();
      const receiptSettings = settings.receipt;

      let logoBase64 = '';
      if (receiptSettings.logoBase64 && !receiptSettings.useDefaultLogo) {
        logoBase64 = receiptSettings.logoBase64;
      } else if (receiptSettings.useDefaultLogo) {
        logoBase64 = loadDefaultLogo();
      }

      const testData = {
        displayId: 999,
        orderType: 'HALL',
        cashierName: 'Test Kassir',
        items: [
          { name: 'Lavash (Test)', quantity: 2, price: 25000 },
          { name: 'Cola 0.5L', quantity: 1, price: 8000 },
          { name: 'Kartoshka Fri', quantity: 1, price: 12000 },
        ],
        total: 70000,
        description: 'Test buyurtma',
        phoneNumber: '+998901234567',
      };

      const html = generateReceiptHtml(testData, logoBase64, receiptSettings);
      const imageBuffer = await htmlToImage(html);

      const desktopPath = app.getPath('desktop');
      const fileName = `receipt-test-${Date.now()}.png`;
      const filePath = path.join(desktopPath, fileName);

      fs.writeFileSync(filePath, imageBuffer);
      console.log('Test receipt saved to:', filePath);

      return { success: true, filePath };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      console.error('Test save error:', error);
      return { success: false, error };
    }
  });

  // Debug handler - returns logo search info
  ipcMain.handle('debug-logo-path', (): { found: boolean; path: string; searchedPaths: string[] } => {
    const searchedPaths: string[] = [];
    const appPath = app.getAppPath();
    
    const directories = [
      path.join(process.cwd(), 'src', 'assets'),
      path.join(appPath, 'src', 'assets'),
      path.join(appPath, '..', 'src', 'assets'),
      path.join(__dirname, '..', 'src', 'assets'),
      path.join(__dirname, '..', '..', 'src', 'assets'),
      path.join(process.resourcesPath || '', 'assets'),
    ];
    
    const filenames = ['logo-black-default.png', 'logo-default.png', 'logo-black.png'];
    
    for (const dir of directories) {
      for (const filename of filenames) {
        searchedPaths.push(path.join(dir, filename));
      }
    }
    
    const foundPath = getDefaultLogoPath();
    
    return {
      found: !!foundPath,
      path: foundPath,
      searchedPaths
    };
  });
}