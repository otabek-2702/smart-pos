// src-electron/electron-main.ts

import { app, BrowserWindow, screen, ipcMain } from 'electron';
import path from 'path';
// import { spawn } from 'child_process'
import os from 'os';
import { fileURLToPath } from 'url';

import { registerPrintHandler } from './print-handler';
import { registerSettingsHandler } from './settings-handler';

// Register handlers
registerSettingsHandler();
registerPrintHandler();

const platform = process.platform || os.platform();
const currentDir = fileURLToPath(new URL('.', import.meta.url));
// let backendProcess = null

let mainWindow: BrowserWindow | null = null;
let clientWindow: BrowserWindow | null = null;

function createMainWindow(display: Electron.Display): BrowserWindow {
  const preloadFolder = process.env.QUASAR_ELECTRON_PRELOAD_FOLDER ?? 'src-electron';
  const preloadExt = process.env.QUASAR_ELECTRON_PRELOAD_EXTENSION ?? '.js';

  const win = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    fullscreen: true,
    kiosk: true,
    icon: path.resolve(currentDir, 'icons/icon.png'),
    webPreferences: {
      contextIsolation: true,
      preload: path.resolve(currentDir, path.join(preloadFolder, 'electron-preload' + preloadExt)),
    },
  });

  if (process.env.DEV) {
    void win.loadURL(process.env.APP_URL);
  } else {
    void win.loadFile('index.html');
  }

  return win;
}

function createClientWindow(display: Electron.Display | null, isPreview = false): BrowserWindow {
  const preloadFolder = process.env.QUASAR_ELECTRON_PRELOAD_FOLDER ?? 'src-electron';
  const preloadExt = process.env.QUASAR_ELECTRON_PRELOAD_EXTENSION ?? '.js';

  // If preview mode (no second display), show as normal window on primary
  const primary = screen.getPrimaryDisplay();
  const targetDisplay = display || primary;
  
  // Window options based on mode
  const windowOptions: Electron.BrowserWindowConstructorOptions = {
    icon: path.resolve(currentDir, 'icons/icon.png'),
    webPreferences: {
      contextIsolation: true,
      preload: path.resolve(currentDir, path.join(preloadFolder, 'electron-preload' + preloadExt)),
    },
  };

  if (isPreview) {
    // Preview mode: normal window with controls, 16:9 aspect ratio
    const previewWidth = Math.min(1280, primary.workAreaSize.width - 100);
    const previewHeight = Math.round(previewWidth * 9 / 16);
    
    Object.assign(windowOptions, {
      width: previewWidth,
      height: previewHeight,
      minWidth: 800,
      minHeight: 450,
      center: true,
      fullscreen: false,
      kiosk: false,
      frame: true,  // Show window controls
      resizable: true,
      title: 'Mijozlar displeyi (Ko\'rish)',
    });
  } else {
    // Second monitor mode: fullscreen kiosk
    Object.assign(windowOptions, {
      x: targetDisplay.bounds.x,
      y: targetDisplay.bounds.y,
      width: targetDisplay.bounds.width,
      height: targetDisplay.bounds.height,
      fullscreen: true,
      kiosk: true,
    });
  }

  const win = new BrowserWindow(windowOptions);

  const route = '#/client-display';

  if (process.env.DEV) {
    void win.loadURL(`${process.env.APP_URL}${route}`);
  } else {
    void win.loadFile('index.html', { hash: '/client-display' });
  }

  return win;
}


// function startBackend() {
//   const backendPath = app.isPackaged
//     ? path.join(process.resourcesPath, 'backend')
//     : path.join(process.cwd(), 'backend')

//   const pythonPath = path.join(
//     backendPath,
//     '.venv',
//     'Scripts',
//     'python.exe'
//   )

//   backendProcess = spawn(
//     pythonPath,
//     ['manage.py', 'runserver', '127.0.0.1:8000', '--noreload'],
//     {
//       cwd: backendPath,
//       windowsHide: true
//     }
//   )

//   backendProcess.stdout.on('data', (data) => {
//     console.log(`Backend: ${data}`)
//   })

//   backendProcess.stderr.on('data', (data) => {
//     console.error(`Backend Error: ${data}`)
//   })
// }

function getSecondaryDisplay(): Electron.Display | null {
  const displays = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();
  return displays.find((d) => d.id !== primary.id) || null;
}

function openClientDisplay(forcePreview = false): { success: boolean; mode: 'secondary' | 'preview' | 'focused' } {
  // If window already exists, just focus it
  if (clientWindow && !clientWindow.isDestroyed()) {
    clientWindow.focus();
    return { success: true, mode: 'focused' };
  }

  const secondary = getSecondaryDisplay();

  if (secondary && !forcePreview) {
    // Has second monitor - open fullscreen on it
    clientWindow = createClientWindow(secondary, false);
    clientWindow.on('closed', () => {
      clientWindow = null;
    });
    return { success: true, mode: 'secondary' };
  } else {
    // No second monitor or force preview - open as preview window
    clientWindow = createClientWindow(null, true);
    clientWindow.on('closed', () => {
      clientWindow = null;
    });
    return { success: true, mode: 'preview' };
  }
}

function closeClientDisplay(): boolean {
  if (clientWindow && !clientWindow.isDestroyed()) {
    clientWindow.close();
    clientWindow = null;
    return true;
  }
  return false;
}

function getClientDisplayStatus(): { isOpen: boolean; mode: 'secondary' | 'preview' | 'none'; hasSecondMonitor: boolean } {
  const secondary = getSecondaryDisplay();
  
  if (!clientWindow || clientWindow.isDestroyed()) {
    return { isOpen: false, mode: 'none', hasSecondMonitor: !!secondary };
  }

  // Check if it's in fullscreen (secondary monitor) or preview mode
  const isFullscreen = clientWindow.isFullScreen() || clientWindow.isKiosk();
  
  return {
    isOpen: true,
    mode: isFullscreen ? 'secondary' : 'preview',
    hasSecondMonitor: !!secondary,
  };
}

function setupWindows(): void {
  const primary = screen.getPrimaryDisplay();
  const secondary = getSecondaryDisplay();

  // MAIN WINDOW
  if (!mainWindow) {
    mainWindow = createMainWindow(primary);
    mainWindow.on('closed', () => {
      mainWindow = null;
    });
  }

  // CLIENT DISPLAY (ONLY IF SECOND MONITOR EXISTS AND NO WINDOW YET)
  if (secondary && !clientWindow) {
    clientWindow = createClientWindow(secondary, false);
    clientWindow.on('closed', () => {
      clientWindow = null;
    });
  }
}

// Register IPC handlers for client display control
function registerClientDisplayHandlers(): void {
  // Open client display
  ipcMain.handle('client-display:open', (_event, forcePreview?: boolean): { success: boolean; mode: string } => {
    return openClientDisplay(forcePreview || false);
  });

  // Close client display
  ipcMain.handle('client-display:close', (): boolean => {
    return closeClientDisplay();
  });

  // Get status
  ipcMain.handle('client-display:status', (): { isOpen: boolean; mode: string; hasSecondMonitor: boolean } => {
    return getClientDisplayStatus();
  });
}

/* ================= APP LIFECYCLE ================= */

void app.whenReady().then(() => {
  // startBackend()
  registerClientDisplayHandlers();
  setupWindows();

  // React to monitor plug/unplug
  screen.on('display-added', setupWindows);
  screen.on('display-removed', setupWindows);
});

app.on('window-all-closed', () => {
  if (platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (!mainWindow) {
    setupWindows();
  }
});