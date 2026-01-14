// src-electron/electron-main.ts

import { app, BrowserWindow, screen } from 'electron';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

import { registerPrintHandler } from './print-handler';
import { registerSettingsHandler } from './settings-handler';

// Register handlers
registerSettingsHandler();
registerPrintHandler();

const platform = process.platform || os.platform();
const currentDir = fileURLToPath(new URL('.', import.meta.url));

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

function createClientWindow(display: Electron.Display): BrowserWindow {
  const win = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    fullscreen: true,
    kiosk: true,
    icon: path.resolve(currentDir, 'icons/icon.png'),
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
    },
  });

  const route = '#/client-display';

  if (process.env.DEV) {
    void win.loadURL(`${process.env.APP_URL}${route}`);
  } else {
    void win.loadFile('index.html', { hash: '/client-display' });
  }

  return win;
}

function setupWindows(): void {
  const displays = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();
  const secondary = displays.find((d) => d.id !== primary.id);

  // MAIN WINDOW
  if (!mainWindow) {
    mainWindow = createMainWindow(primary);
    mainWindow.on('closed', () => {
      mainWindow = null;
    });
  }

  // CLIENT DISPLAY (ONLY IF SECOND MONITOR EXISTS)
  if (secondary && !clientWindow) {
    clientWindow = createClientWindow(secondary);
    clientWindow.on('closed', () => {
      clientWindow = null;
    });
  }
}

/* ================= APP LIFECYCLE ================= */

void app.whenReady().then(() => {
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
