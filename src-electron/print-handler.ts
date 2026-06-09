import { ipcMain, app, BrowserWindow } from 'electron';
import { ThermalPrinter } from './thermal-printer';
import { htmlToImage } from './html-to-image';
import { generateReceiptHtml } from './receipt-template';
import { getSettings } from './settings-handler';
import fs from 'fs';
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

// Print the receipt HTML to a Windows-installed printer (USB or driver) via the
// OS print pipeline, in a hidden window. deviceName '' = the OS default printer.
// Thermal paper width in mm (the 576px receipt design = 80mm @ 203 DPI).
const PAPER_WIDTH_MM = 80;

async function printViaWindows(html: string, deviceName: string): Promise<PrintResult> {
  // The receipt HTML is authored at 576px for the 203-DPI ESC/POS raster path.
  // Chromium prints at 96 DPI, so printing that HTML directly mis-scales it
  // (the "2x" bug). Instead rasterize the receipt to the exact 576px image
  // (same as the network path) and print THAT scaled to the paper width — the
  // image fills the page width 1:1 regardless of source DPI.
  const img = await htmlToImage(html);
  // PNG IHDR holds width/height as big-endian uint32 at byte offsets 16 and 20.
  const imgW = img.readUInt32BE(16) || 576;
  const imgH = img.readUInt32BE(20) || imgW;
  const heightMm = Math.max(1, Math.ceil((imgH / imgW) * PAPER_WIDTH_MM));
  const b64 = img.toString('base64');

  const printHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: ${PAPER_WIDTH_MM}mm ${heightMm}mm; margin: 0; }
    html, body { margin: 0; padding: 0; }
    img { width: 100%; display: block; }
  </style></head><body><img src="data:image/png;base64,${b64}"></body></html>`;

  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: false } });
  try {
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(printHtml));
    // Let the image decode/lay out before printing.
    await new Promise((r) => setTimeout(r, 250));
    return await new Promise<PrintResult>((resolve) => {
      win.webContents.print(
        {
          silent: true,
          printBackground: true,
          scaleFactor: 100,
          margins: { marginType: 'none' },
          // microns; matches @page so it's one correctly-sized page (no A4, no 2x)
          pageSize: { width: PAPER_WIDTH_MM * 1000, height: heightMm * 1000 },
          ...(deviceName ? { deviceName } : {}),
        },
        (success, failureReason) =>
          resolve(success ? { success: true } : { success: false, error: failureReason }),
      );
    });
  } finally {
    if (!win.isDestroyed()) win.close();
  }
}

// Route a receipt to the configured printer: USB/Windows or network ESC/POS.
async function doPrint(html: string): Promise<PrintResult> {
  const printerSettings = getSettings().printer;
  if (printerSettings.connectionType === 'usb') {
    return printViaWindows(html, printerSettings.usbPrinterName || '');
  }
  const imageBuffer = await htmlToImage(html);
  const printer = new ThermalPrinter(printerSettings.ip, printerSettings.port);
  await printer.printImage(imageBuffer);
  return { success: true };
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

      const html = generateReceiptHtml(data, logoBase64, receiptSettings);
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

      const html = generateReceiptHtml(testData, logoBase64, receiptSettings);
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