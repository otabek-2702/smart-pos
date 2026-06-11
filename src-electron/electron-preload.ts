/**
 * This file is used specifically for security reasons.
 * Here you can access Nodejs stuff and inject functionality into
 * the renderer thread (accessible there through the "window" object)
 *
 * WARNING!
 * If you import anything from node_modules, then make sure that the package is specified
 * in package.json > dependencies and NOT in devDependencies
 *
 * Example (injects window.myAPI.doAThing() into renderer thread):
 *
 *   import { contextBridge } from 'electron'
 *
 *   contextBridge.exposeInMainWorld('myAPI', {
 *     doAThing: () => {}
 *   })
 *
 * WARNING!
 * If accessing Node functionality (like importing @electron/remote) then in your
 * electron-main.ts you will need to set the following when you instantiate BrowserWindow:
 *
 * mainWindow = new BrowserWindow({
 *   // ...
 *   webPreferences: {
 *     // ...
 *     sandbox: false // <-- to be able to import @electron/remote in preload script
 *   }
 * }
 */

import { contextBridge, ipcRenderer } from 'electron';

// Channel-specific, typed IPC surface. The renderer can ONLY reach the
// channels enumerated below — there is no generic `ipcRenderer.invoke(anyString)`
// passthrough, so a compromised renderer can't reach arbitrary main-process
// handlers. Grouped by domain (kv / system / settings / clientDisplay / printer).
const invoke = <T = unknown>(channel: string, ...args: unknown[]): Promise<T> =>
  ipcRenderer.invoke(channel, ...args) as Promise<T>;

contextBridge.exposeInMainWorld('electron', {
  // Persistent key-value store backed by electron-store in the main process
  // (atomic writes, single source of truth across windows). Used to replace
  // localStorage for IP, auth token, cached users, etc.
  kv: {
    get: <T>(key: string): Promise<T | null> => invoke<T | null>('kv:get', key),
    set: <T>(key: string, value: T): Promise<boolean> => invoke<boolean>('kv:set', key, value),
    delete: (key: string): Promise<boolean> => invoke<boolean>('kv:delete', key),
    clear: (): Promise<boolean> => invoke<boolean>('kv:clear'),
    getAll: (): Promise<Record<string, unknown>> =>
      invoke<Record<string, unknown>>('kv:getAll'),
    // Live cross-window sync: fires with the full store whenever any window
    // mutates it. Returns an unsubscribe fn. Lets a renderer's hot cache stay
    // current (e.g. customer-display window picking up the token at login).
    onChanged: (callback: (all: Record<string, unknown>) => void): (() => void) => {
      const handler = (_event: unknown, all: Record<string, unknown>): void => callback(all);
      ipcRenderer.on('kv:changed', handler);
      return () => ipcRenderer.removeListener('kv:changed', handler);
    },
  },

  // OS deep-links (WiFi/network/printer panels) + LAN discovery used to find
  // the kitchen "main computer" running the backend.
  system: {
    openWifi: () => invoke('system:openWifi'),
    openNetwork: () => invoke('system:openNetwork'),
    openPrinters: () => invoke('system:openPrinters'),
    getLocalIps: () => invoke('system:getLocalIps'),
    probeTcp: (host: string, port: number, timeoutMs: number) =>
      invoke('system:probeTcp', host, port, timeoutMs),
    scanForServers: (subnet: string, port: number) =>
      invoke('system:scanForServers', subnet, port),
    cancelScan: () => invoke('system:cancelScan'),
  },

  // Persisted display / receipt / printer settings (main-process JSON files).
  settings: {
    getDisplay: () => invoke('settings:getDisplay'),
    saveDisplay: (settings: unknown) => invoke('settings:saveDisplay', settings),
    getReceipt: () => invoke('settings:getReceipt'),
    saveReceipt: (settings: unknown) => invoke('settings:saveReceipt', settings),
    getPrinter: () => invoke('settings:getPrinter'),
    savePrinter: (settings: unknown) => invoke('settings:savePrinter', settings),
  },

  // Second-monitor customer display window.
  clientDisplay: {
    status: () => invoke('client-display:status'),
    open: () => invoke('client-display:open'),
    // Returns an unsubscribe fn so the renderer can detach on unmount —
    // without it, every ClientDisplay mount leaks another listener on the
    // same channel (eventually MaxListenersExceededWarning + N× handler runs).
    onSettingsUpdated: (callback: (settings: unknown) => void): (() => void) => {
      const handler = (_event: unknown, settings: unknown): void => callback(settings);
      ipcRenderer.on('display-settings-updated', handler);
      return () => ipcRenderer.removeListener('display-settings-updated', handler);
    },
  },

  // Receipt printer.
  printer: {
    test: () => invoke('print-test'),
    printReceipt: (data: unknown) => invoke('print-receipt', data),
    // Windows-installed printers (for the USB/driver picker in settings).
    list: () => invoke('printer:list'),
    // Real connectivity verdict (no paper used).
    status: () => invoke('printer:status'),
  },
});

contextBridge.exposeInMainWorld('backend', {
  onError: (callback: (msg: string) => void) =>
    ipcRenderer.on('backend-error', (_, msg) => callback(msg)),

  onLog: (callback: (msg: string) => void) =>
    ipcRenderer.on('backend-log', (_, msg) => callback(msg))
})