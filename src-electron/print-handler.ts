import { ipcMain, app } from 'electron';
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
      const printerSettings = settings.printer;

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
      const imageBuffer = await htmlToImage(html);

      const printer = new ThermalPrinter(printerSettings.ip, printerSettings.port);
      await printer.printImage(imageBuffer);

      return { success: true };
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
      const printerSettings = settings.printer;

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

      const printer = new ThermalPrinter(printerSettings.ip, printerSettings.port);
      await printer.printImage(imageBuffer);

      return { success: true };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      console.error('Test print error:', error);
      return { success: false, error };
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