import { ipcMain, app, BrowserWindow } from 'electron';
import { ThermalPrinter } from './thermal-printer';
import { htmlToImage } from './html-to-image';
import { generateReceiptHtml } from './receipt-template';
import { getSettings } from './settings-handler';
import { execFile } from 'node:child_process';
import net from 'net';
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
// No rasterizing — prints the HTML directly. An injected @page pins the page to
// the paper width (one continuous page, no margins) and `scaleFactor` (the
// adjustable printScale setting) corrects the size so it lands 1:1.
async function printViaWindows(html: string, deviceName: string): Promise<PrintResult> {
  const printer = getSettings().printer;
  const paperWidth = printer.paperWidth || 80;
  const scale = Math.min(300, Math.max(20, Math.round(printer.printScale || 100)));

  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: false } });
  try {
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    // Pin the print page to the paper width (continuous, no margins) so the
    // driver doesn't fall back to A4 / paginate to a second page.
    try {
      await win.webContents.insertCSS(
        `@page { size: ${paperWidth}mm auto; margin: 0; } html, body { margin: 0 !important; }`,
      );
    } catch { /* non-fatal */ }
    // Let layout/images settle before printing.
    await new Promise((r) => setTimeout(r, 300));
    return await new Promise<PrintResult>((resolve) => {
      win.webContents.print(
        {
          silent: true,
          printBackground: true,
          scaleFactor: scale,
          margins: { marginType: 'none' },
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

// ===================================================================
// Real connectivity detection. webContents.print() only confirms the job
// reached the Windows spooler (not that it printed), and Electron's
// PrinterInfo.status is always 0 on Windows — so an offline USB printer
// still "succeeds". We query the OS instead.
// ===================================================================

export type PrinterStatusReason =
  | 'connected' | 'offline' | 'paper-out' | 'paused'
  | 'not-found' | 'unreachable' | 'error' | 'unknown';

export interface PrinterStatusResult {
  online: boolean;
  reason: PrinterStatusReason;
  detail?: string;
  connectionType: 'usb' | 'network';
  printerStatus?: number;
  workOffline?: boolean;
  jobErrors?: number;
}

// Get-Printer.PrinterStatus is a FLAGS enum (verified on the real machine:
// healthy = 0, a dead/unplugged XP-80C = 6 = Error|PendingDeletion).
const PS_PAUSED = 1;
const PS_ERROR = 2;
const PS_PAPER_JAM = 8;
const PS_PAPER_OUT = 16;
const PS_OFFLINE = 128;

function runPwsh(script: string, timeoutMs = 5000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 1024 * 1024 },
      (err, stdout, stderr) => {
        const e = err as (NodeJS.ErrnoException & { killed?: boolean }) | null;
        if (e && e.killed) return reject(new Error('printer status query timed out'));
        if (e) return reject(new Error((stderr && stderr.trim()) || e.message));
        resolve(stdout);
      },
    );
    child.on('error', reject);
  });
}

// Pass the queue name as a here-string ARGUMENT; build the WMI filter from
// $Name inside PowerShell (no JS interpolation into the script body).
function pwshNameArg(name: string): string {
  return `@'\n${name.replace(/\r?\n/g, ' ')}\n'@`;
}

interface RawHealth {
  found: boolean;
  status?: number;
  workOffline?: boolean;
  detectedError?: number;
  jobErrors?: number;
}

// USB/Windows health read (read-only, no admin, no paper).
async function getPrinterHealth(name: string): Promise<PrinterStatusResult> {
  if (!name) return { online: false, reason: 'not-found', detail: 'no printer name', connectionType: 'usb' };
  const body = `
    param([string]$Name)
    $ErrorActionPreference = 'Stop'
    try {
      $p = Get-Printer -Name $Name
      $filter = "Name='" + ($Name -replace "'","''") + "'"
      $wmi = Get-CimInstance Win32_Printer -Filter $filter -ErrorAction SilentlyContinue
      $errs = @(Get-PrintJob -PrinterName $Name -ErrorAction SilentlyContinue |
                Where-Object { $_.JobStatus -match 'Error|Blocked|Offline|PaperOut|UserIntervention' }).Count
      [pscustomobject]@{
        found = $true
        status = [int]$p.PrinterStatus
        workOffline = [bool]$wmi.WorkOffline
        detectedError = [int]$wmi.DetectedErrorState
        jobErrors = $errs
      } | ConvertTo-Json -Compress
    } catch { '{"found":false}' }`;
  const wrapped = `& { ${body} } -Name ${pwshNameArg(name)}`;

  let parsed: RawHealth;
  try {
    const out = (await runPwsh(wrapped)).trim();
    parsed = JSON.parse(out || '{"found":false}') as RawHealth;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { online: false, reason: 'error', detail, connectionType: 'usb' };
  }

  if (!parsed.found) return { online: false, reason: 'not-found', connectionType: 'usb' };

  const ps = parsed.status ?? 0;
  const workOffline = Boolean(parsed.workOffline);
  const jobErrors = parsed.jobErrors ?? 0;

  // Bitwise on the flags enum + the Error bit (the signal that actually flips
  // for a dead USB XP-80C here). A clean 0 (Normal) = online.
  let reason: PrinterStatusReason = 'connected';
  let online = true;
  if (workOffline || ps & PS_OFFLINE) { reason = 'offline'; online = false; }
  else if (ps & PS_PAPER_OUT) { reason = 'paper-out'; online = false; }
  else if (ps & (PS_ERROR | PS_PAPER_JAM)) { reason = 'offline'; online = false; }
  else if (ps & PS_PAUSED) { reason = 'paused'; online = false; }
  else if (jobErrors > 0) { reason = 'offline'; online = false; }

  return { online, reason, connectionType: 'usb', printerStatus: ps, workOffline, jobErrors };
}

// TCP-connect probe for the network ESC/POS path (no bytes sent).
function probeNetworkPrinter(ip: string, port: number, timeoutMs = 2500): Promise<PrinterStatusResult> {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    let done = false;
    const finish = (r: PrinterStatusResult): void => {
      if (done) return;
      done = true;
      sock.removeAllListeners();
      sock.destroy();
      resolve(r);
    };
    sock.setTimeout(timeoutMs);
    sock.once('connect', () => finish({ online: true, reason: 'connected', connectionType: 'network' }));
    sock.once('timeout', () => finish({ online: false, reason: 'unreachable', detail: 'timeout', connectionType: 'network' }));
    sock.once('error', (err: NodeJS.ErrnoException) =>
      finish({ online: false, reason: 'unreachable', detail: err.code || err.message, connectionType: 'network' }));
    sock.connect(port, ip);
  });
}

// Resolve the USB queue name (the configured one, else the OS default).
async function resolveUsbName(configured: string): Promise<string> {
  if (configured) return configured;
  try {
    const win = BrowserWindow.getAllWindows()[0];
    const printers = win ? await win.webContents.getPrintersAsync() : [];
    const def = printers.find((p) => (p as { isDefault?: boolean }).isDefault);
    if (def) return def.name;
  } catch { /* fall through */ }
  return '';
}

// Verdict used by both the Test button and the receipt pre-flight.
async function getConnectivity(): Promise<PrinterStatusResult> {
  const ps = getSettings().printer;
  if (ps.connectionType === 'usb') {
    const name = await resolveUsbName(ps.usbPrinterName || '');
    return getPrinterHealth(name);
  }
  return probeNetworkPrinter(ps.ip, ps.port);
}

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// Best-effort: clear stuck/errored jobs so a failed print doesn't block the next.
async function clearStuckJobs(name: string): Promise<void> {
  const body = `param([string]$Name)
    Get-PrintJob -PrinterName $Name -ErrorAction SilentlyContinue | Remove-PrintJob -ErrorAction SilentlyContinue`;
  try {
    await runPwsh(`& { ${body} } -Name ${pwshNameArg(name)}`, 4000);
  } catch { /* ignore */ }
}

// Post-submit truth: watch the spool job. On a working printer it drains in a
// second or two; on an off/unplugged/out-of-paper printer it sticks or errors.
// This is the only signal that reliably flips for bare USB power-off.
async function waitForQueueResult(name: string, timeoutMs = 9000): Promise<PrintResult> {
  if (!name) return { success: true }; // can't watch an unnamed queue
  const body = `param([string]$Name)
    $ErrorActionPreference='SilentlyContinue'
    $jobs = @(Get-PrintJob -PrinterName $Name)
    $bad  = @($jobs | Where-Object { $_.JobStatus -match 'Error|Offline|PaperOut|Blocked|UserIntervention' })
    [pscustomobject]@{ open=$jobs.Count; bad=$bad.Count } | ConvertTo-Json -Compress`;
  const wrapped = `& { ${body} } -Name ${pwshNameArg(name)}`;

  const start = Date.now();
  const deadline = start + timeoutMs;
  let seen = false;
  await delay(350); // let the spooler register the job
  for (;;) {
    let j: { open: number; bad: number };
    try {
      j = JSON.parse((await runPwsh(wrapped, 4000)).trim() || '{"open":0,"bad":0}') as { open: number; bad: number };
    } catch {
      return { success: true }; // query flaked — don't block the cashier
    }
    if (j.bad > 0) {
      await clearStuckJobs(name);
      return { success: false, error: "Chop etishda xatolik (printer oflayn yoki qog'oz tugagan)" };
    }
    if (j.open > 0) seen = true;
    if (seen && j.open === 0) return { success: true }; // drained = printed
    // Drained before our first poll could see it → treat as printed.
    if (!seen && j.open === 0 && Date.now() - start > 1800) return { success: true };
    if (Date.now() > deadline) {
      await clearStuckJobs(name);
      return { success: false, error: 'Chop etish amalga oshmadi (printer javob bermadi)' };
    }
    await delay(500);
  }
}

// Route a receipt to the configured printer: USB/Windows or network ESC/POS.
// Now fails fast on a real offline printer instead of silently "succeeding".
async function doPrint(html: string): Promise<PrintResult> {
  const printerSettings = getSettings().printer;

  if (printerSettings.connectionType === 'usb') {
    const name = await resolveUsbName(printerSettings.usbPrinterName || '');
    const health = await getPrinterHealth(name);
    if (!health.online) {
      return { success: false, error: reasonToUz(health.reason) };
    }
    const res = await printViaWindows(html, name);
    if (!res.success) return res;
    // Confirm the job actually drained (catches a printer that's off but whose
    // Windows status still reads "Normal" — the raw-USB blind spot).
    return waitForQueueResult(name);
  }

  // NETWORK ESC/POS — transport unchanged, but surface real failures now.
  try {
    const imageBuffer = await htmlToImage(html);
    const printer = new ThermalPrinter(printerSettings.ip, printerSettings.port);
    await printer.printImage(imageBuffer);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Tarmoq printeri xatosi' };
  }
}

// Uzbek-facing reason text for failures.
function reasonToUz(reason: PrinterStatusReason): string {
  switch (reason) {
    case 'paper-out': return "Qog'oz tugagan";
    case 'paused': return "Printer to'xtatilgan";
    case 'not-found': return 'Printer topilmadi';
    case 'unreachable': return "Printerga ulanib bo'lmadi (tarmoq/IP)";
    case 'offline': return "Printer oflayn (o'chiq yoki uzilgan)";
    default: return 'Printer xatosi';
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

  // Real connectivity verdict (USB: Windows status read; network: TCP probe).
  ipcMain.handle('printer:status', async (): Promise<PrinterStatusResult> => {
    try {
      return await getConnectivity();
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return { online: false, reason: 'error', detail, connectionType: getSettings().printer.connectionType };
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