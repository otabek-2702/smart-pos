// src-electron/kv-store.ts
//
// Generic key-value store for renderer-side persistent state that used to live
// in localStorage. Owned by the main process so multiple BrowserWindows / app
// instances can never race on the same file (electron-store does atomic
// write-file-atomic writes under the hood — safe across power loss).
//
// Renderer talks to it via window.electron.kv.{get,set,delete,clear} (see
// electron-preload.ts). Each call is a single IPC round trip.

import { ipcMain, BrowserWindow, app } from 'electron';
import Store from 'electron-store';
import fs from 'fs';
import path from 'path';
import { getPersistDir } from './persist-path';

// Stored MACHINE-WIDE under ProgramData/AlphaPOS so config is one-per-PC and
// survives reinstall (see persist-path.ts). Schema-less on purpose — the
// renderer owns the value shapes (auth tokens, IP, cached users, order-type
// labels, payment methods, etc.). Atomic writes are on by default in v11.
const store = new Store({
  name: 'kv-store',
  cwd: getPersistDir(),
  clearInvalidConfig: true,
});

// One-time migration from the legacy per-user location (<userData>/kv-store.json)
// so existing installs keep their IP / cached users after the move. Never
// deletes the old file; only imports when the new store is still empty.
(function migrateLegacyKv(): void {
  try {
    if (Object.keys(store.store).length > 0) return;
    const legacy = path.join(app.getPath('userData'), 'kv-store.json');
    if (legacy === path.join(getPersistDir(), 'kv-store.json')) return;
    if (fs.existsSync(legacy)) {
      const data = JSON.parse(fs.readFileSync(legacy, 'utf-8')) as Record<string, unknown>;
      if (data && typeof data === 'object') store.store = data;
    }
  } catch {
    // best-effort; fall through with an empty store
  }
})();

// Push the full store snapshot to every window so each renderer's hot cache
// stays live. Without this, a second window (e.g. the customer display) booted
// before login would never see the auth token the main window writes at login.
function broadcast(): void {
  const all = store.store;
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('kv:changed', all);
    }
  }
}

// Read a kv value from the main process (e.g. the receipt template needs the
// order-type labels, which live in the same store the renderer writes).
export function kvGet<T>(key: string, fallback: T): T {
  const v = store.get(key);
  return (v as T | undefined) ?? fallback;
}

export function registerKvHandlers(): void {
  ipcMain.handle('kv:get', (_event, key: string): unknown => {
    return store.get(key) ?? null;
  });

  ipcMain.handle('kv:set', (_event, key: string, value: unknown): boolean => {
    store.set(key, value);
    broadcast();
    return true;
  });

  ipcMain.handle('kv:delete', (_event, key: string): boolean => {
    store.delete(key);
    broadcast();
    return true;
  });

  ipcMain.handle('kv:clear', (): boolean => {
    store.clear();
    broadcast();
    return true;
  });

  // Bulk read used at app boot so we don't pay N round trips
  ipcMain.handle('kv:getAll', (): Record<string, unknown> => {
    return store.store;
  });
}
