// src-electron/update-handler.ts
//
// In-app auto-update via electron-updater + GitHub Releases. Installers and
// `latest.yml` are published to the PUBLIC `smart-pos-releases` repo (see the
// `publish` block in quasar.config.ts), so the packaged app reads releases with
// no embedded token. The renderer drives the flow (check / download / install)
// from the gated Update page; this module just wraps autoUpdater and mirrors its
// state to every window so the OrdersPage footer can show an "update available"
// badge.

import electronUpdater, { type UpdateInfo, type ProgressInfo } from 'electron-updater';
import { app, ipcMain, BrowserWindow } from 'electron';

const { autoUpdater } = electronUpdater;

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export interface UpdateState {
  status: UpdateStatus;
  currentVersion: string;
  version: string | null; // the available version, when status='available'/downloaded
  releaseNotes: string | null;
  percent: number; // download progress 0..100
  error: string | null;
}

let state: UpdateState = {
  status: 'idle',
  currentVersion: app.getVersion(),
  version: null,
  releaseNotes: null,
  percent: 0,
  error: null,
};

function broadcast(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('updater:state', state);
  }
}

function patch(p: Partial<UpdateState>): void {
  state = { ...state, ...p };
  broadcast();
}

function normalizeNotes(notes: UpdateInfo['releaseNotes']): string | null {
  if (!notes) return null;
  if (typeof notes === 'string') return notes;
  // electron-updater can hand back an array of { version, note }
  const joined = notes
    .map((n) => n.note ?? '')
    .filter(Boolean)
    .join('\n\n');
  return joined || null;
}

let wired = false;
function wireEvents(): void {
  if (wired) return;
  wired = true;

  // The renderer decides when to download and install — never silently.
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('checking-for-update', () => patch({ status: 'checking', error: null }));
  autoUpdater.on('update-available', (info: UpdateInfo) =>
    patch({
      status: 'available',
      version: info.version,
      releaseNotes: normalizeNotes(info.releaseNotes),
    }),
  );
  autoUpdater.on('update-not-available', () =>
    patch({ status: 'not-available', version: null, percent: 0 }),
  );
  autoUpdater.on('download-progress', (p: ProgressInfo) =>
    patch({ status: 'downloading', percent: Math.round(p.percent) }),
  );
  autoUpdater.on('update-downloaded', (info: UpdateInfo) =>
    patch({ status: 'downloaded', version: info.version, percent: 100 }),
  );
  autoUpdater.on('error', (err: Error) =>
    patch({ status: 'error', error: err == null ? 'unknown' : err.message || String(err) }),
  );
}

async function check(): Promise<void> {
  // Dev / unpacked builds have no app-update.yml; checkForUpdates() would throw.
  if (!app.isPackaged) {
    patch({ status: 'not-available' });
    return;
  }
  try {
    wireEvents();
    await autoUpdater.checkForUpdates();
  } catch (e) {
    patch({ status: 'error', error: e instanceof Error ? e.message : 'Tekshirib bo‘lmadi' });
  }
}

export function registerUpdateHandler(): void {
  wireEvents();

  ipcMain.handle('updater:get', (): UpdateState => state);

  ipcMain.handle('updater:check', async (): Promise<UpdateState> => {
    await check();
    return state;
  });

  ipcMain.handle('updater:download', async (): Promise<UpdateState> => {
    if (!app.isPackaged) {
      patch({ status: 'error', error: 'Yangilash faqat o‘rnatilgan ilovada ishlaydi' });
      return state;
    }
    try {
      patch({ status: 'downloading', percent: 0, error: null });
      await autoUpdater.downloadUpdate();
    } catch (e) {
      patch({ status: 'error', error: e instanceof Error ? e.message : 'Yuklab bo‘lmadi' });
    }
    return state;
  });

  ipcMain.handle('updater:install', (): void => {
    // Quit and run the downloaded installer; forceRunAfter restarts the POS.
    // isSilent=false shows the NSIS UI (operator is supervising the update).
    autoUpdater.quitAndInstall(false, true);
  });

  // Auto-check shortly after launch + every 6h so the footer badge surfaces a
  // new release without anyone opening the update page.
  if (app.isPackaged) {
    setTimeout(() => {
      void check();
    }, 8000);
    setInterval(
      () => {
        void check();
      },
      6 * 60 * 60 * 1000,
    );
  }
}
