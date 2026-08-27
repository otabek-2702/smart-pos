// src-electron/electron-main.ts

import { app, BrowserWindow, screen, ipcMain, session } from 'electron';
import path from 'path';
// import { spawn } from 'child_process'
import os from 'os';
import { fileURLToPath } from 'url';

import { registerPrintHandler } from './print-handler';
import { registerSettingsHandler, getSettings } from './settings-handler';
import { registerKvHandlers } from './kv-store';
import { registerSystemHandler } from './system-handler';
import { registerUpdateHandler } from './update-handler';
import { registerOperatorHandler } from './operator-handler';
import { registerTweaksHandler } from './tweaks-handler';
import {
  registerReportingHandlers,
  ReportingService,
} from './reporting/reporting-service';

const platform = process.platform || os.platform();
const currentDir = fileURLToPath(new URL('.', import.meta.url));
// let backendProcess = null

let mainWindow: BrowserWindow | null = null;
let clientWindow: BrowserWindow | null = null;
let reportingService: ReportingService | null = null;
let clientDisplayHealthTimer: ReturnType<typeof setInterval> | null = null;

const CLIENT_DISPLAY_HEALTH_CHECK_MS = 5 * 60 * 1000;

// Enforce single instance — repeated launcher clicks must focus the
// existing window instead of spawning a new process. Multiple processes
// race on the same localStorage (Chromium LevelDB) and silently lose
// settings like the saved server IP.
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

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
      // Backend ships django-cors-headers per task #12 but the response
      // headers observed in DevTools (2026-05-11) do not include
      // Access-Control-Allow-Origin — either the backend isn't running
      // with DEBUG=True (their conditional only enables CORS_ALLOW_ALL_
      // ORIGINS in DEBUG) or CORS_ALLOWED_ORIGINS doesn't include
      // localhost:9300 / file://. Until that's verified working in
      // their actual run env, keep the bypass on. Trusted kiosk app,
      // closed-LAN deployment — safe.
      webSecurity: false,
    },
  });
  // The renderer is a kiosk surface, not a general-purpose browser. Never
  // allow remote links to inherit this window's permissive webSecurity
  // setting in an unmanaged child BrowserWindow.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

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
      // Mirror the main window's CORS bypass — same reason. See
      // createMainWindow for the rationale.
      webSecurity: false,
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
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  // Build the URL via the URL constructor so the slash before the hash is
  // guaranteed regardless of whether APP_URL ends with '/' or not. In dev
  // we observed that `${APP_URL}#/client-display` (no slash before #) made
  // Vite's HMR-aware page initialize at `/` first, then the SPA didn't
  // pick up the hash route — both windows ended up on IndexPage.
  if (process.env.DEV) {
    const url = new URL(process.env.APP_URL);
    url.hash = '#/client-display';
    void win.loadURL(url.href);
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

function attachClientWindow(win: BrowserWindow): void {
  clientWindow = win;
  win.once('closed', () => {
    // A stale `closed` handler from a replaced window must never clear a
    // newly-opened customer display window.
    if (clientWindow === win) clientWindow = null;
  });
}

/**
 * Keep the second-screen customer display available without stealing focus
 * from the cashier. This is deliberately automatic-only: a manually opened
 * preview still works without a second monitor, while the health check only
 * restores the real second-monitor kiosk when the feature is enabled.
 */
function ensureClientDisplayOpen(): void {
  if (!getSettings().display.clientDisplayEnabled) return;
  if (clientWindow && !clientWindow.isDestroyed()) return;

  const secondary = getSecondaryDisplay();
  if (!secondary) return;

  attachClientWindow(createClientWindow(secondary, false));
}

function startClientDisplayHealthCheck(): void {
  if (clientDisplayHealthTimer) return;
  clientDisplayHealthTimer = setInterval(() => {
    ensureClientDisplayOpen();
  }, CLIENT_DISPLAY_HEALTH_CHECK_MS);
}

function stopClientDisplayHealthCheck(): void {
  if (!clientDisplayHealthTimer) return;
  clearInterval(clientDisplayHealthTimer);
  clientDisplayHealthTimer = null;
}

function openClientDisplay(forcePreview = false, manual = false): { success: boolean; mode: 'secondary' | 'preview' | 'focused' | 'disabled' } {
  // The toggle only controls AUTO-open. A manual "open" from Settings works
  // regardless, so the operator can preview the display any time.
  if (!manual && !getSettings().display.clientDisplayEnabled) {
    return { success: false, mode: 'disabled' };
  }

  // If window already exists, just focus it
  if (clientWindow && !clientWindow.isDestroyed()) {
    clientWindow.focus();
    return { success: true, mode: 'focused' };
  }

  const secondary = getSecondaryDisplay();

  if (secondary && !forcePreview) {
    // Has second monitor - open fullscreen on it
    attachClientWindow(createClientWindow(secondary, false));
    return { success: true, mode: 'secondary' };
  } else {
    // No second monitor or force preview - open as preview window
    attachClientWindow(createClientWindow(null, true));
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

  // CLIENT DISPLAY — only auto-open if:
  //   1. a second monitor is connected,
  //   2. no client window already exists,
  //   3. the user hasn't disabled the feature in display settings.
  // Setting check is the new gate added for the toggle on IndexPage modal.
  if (secondary) ensureClientDisplayOpen();
}

// Called by settings-handler whenever display settings are saved. If the
// toggle flipped to OFF and a client window is open, close it. If it flipped
// to ON and a second monitor is connected, open it. Both directions take
// effect immediately without an app restart.
export function applyClientDisplayEnabled(enabled: boolean): void {
  if (!enabled) {
    if (clientWindow && !clientWindow.isDestroyed()) {
      clientWindow.close();
      clientWindow = null;
    }
    return;
  }
  // Enabled: if there's a secondary monitor and no window yet, open it.
  ensureClientDisplayOpen();
}

// Register handlers AFTER applyClientDisplayEnabled is in scope so
// settings-handler can wire its broadcast hook to it.
registerSettingsHandler(applyClientDisplayEnabled);
registerPrintHandler();
registerKvHandlers();
registerSystemHandler();
registerUpdateHandler();
registerOperatorHandler(() => mainWindow);
registerTweaksHandler();

// Register IPC handlers for client display control
function registerClientDisplayHandlers(): void {
  // Open client display
  ipcMain.handle('client-display:open', (_event, forcePreview?: boolean): { success: boolean; mode: string } => {
    // Manual open from the Settings button — bypass the auto-open toggle.
    return openClientDisplay(forcePreview || false, true);
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
  // Windows occasionally drops a secondary BrowserWindow after display sleep
  // or a cable/monitor handshake. Re-check it every five minutes while the
  // setting remains enabled; do not open a preview or focus the cashier view.
  startClientDisplayHealthCheck();
  try {
    const reportAvatar = app.isPackaged
      ? path.join(process.resourcesPath, 'report-bot-avatar.jpg')
      : path.resolve(process.cwd(), 'src-electron/assets/report-bot-avatar.jpg');
    reportingService = new ReportingService(reportAvatar, {
      // Django binds the login session to the renderer's User-Agent. Reuse
      // that exact identity for authoritative background report requests.
      getUserAgent: () =>
        mainWindow && !mainWindow.isDestroyed()
          ? mainWindow.webContents.getUserAgent()
          : session.defaultSession.getUserAgent(),
    });
    registerReportingHandlers(reportingService, () => mainWindow);
    void reportingService.start().catch((error: unknown) => {
      console.error('[reports] failed to start:', error);
    });
  } catch (error) {
    // Reporting must never prevent the cashier window from starting.
    console.error('[reports] failed to initialize:', error);
  }

  // React to monitor plug/unplug
  screen.on('display-added', setupWindows);
  screen.on('display-removed', setupWindows);
});

app.on('before-quit', () => {
  stopClientDisplayHealthCheck();
  reportingService?.stop();
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
