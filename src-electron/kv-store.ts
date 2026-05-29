// src-electron/kv-store.ts
//
// Generic key-value store for renderer-side persistent state that used to live
// in localStorage. Owned by the main process so multiple BrowserWindows / app
// instances can never race on the same file (electron-store does atomic
// write-file-atomic writes under the hood — safe across power loss).
//
// Renderer talks to it via window.electron.kv.{get,set,delete,clear} (see
// electron-preload.ts). Each call is a single IPC round trip.

import { ipcMain } from 'electron';
import Store from 'electron-store';

// One file at <userData>/kv-store.json. Schema-less on purpose — the renderer
// owns the value shapes (auth tokens, IP, cached users, etc.). Atomic writes
// are on by default in electron-store v11.
const store = new Store({
  name: 'kv-store',
  // Disable cwd check so first-run on a fresh box still works
  clearInvalidConfig: true,
});

export function registerKvHandlers(): void {
  ipcMain.handle('kv:get', (_event, key: string): unknown => {
    return store.get(key) ?? null;
  });

  ipcMain.handle('kv:set', (_event, key: string, value: unknown): boolean => {
    store.set(key, value);
    return true;
  });

  ipcMain.handle('kv:delete', (_event, key: string): boolean => {
    store.delete(key);
    return true;
  });

  ipcMain.handle('kv:clear', (): boolean => {
    store.clear();
    return true;
  });

  // Bulk read used at app boot so we don't pay N round trips
  ipcMain.handle('kv:getAll', (): Record<string, unknown> => {
    return store.store;
  });
}
