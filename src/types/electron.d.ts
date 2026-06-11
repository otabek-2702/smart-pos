// src/electron.d.ts
export {};

interface IpcResult {
  success: boolean;
  error?: string;
}

interface PrinterStatusResult {
  online: boolean;
  reason: 'connected' | 'offline' | 'paper-out' | 'paused' | 'not-found' | 'unreachable' | 'error' | 'unknown';
  detail?: string;
  connectionType: 'usb' | 'network';
  printerStatus?: number;
  workOffline?: boolean;
  jobErrors?: number;
}

interface LocalIp {
  address: string;
  subnet: string;
  iface: string;
}

interface ProbeResult {
  ok: boolean;
  ms: number | null;
}

interface FoundServer {
  ip: string;
  ms: number;
}

declare global {
  interface Window {
    electron: {
      kv: {
        get<T = unknown>(key: string): Promise<T | null>;
        set<T = unknown>(key: string, value: T): Promise<boolean>;
        delete(key: string): Promise<boolean>;
        clear(): Promise<boolean>;
        getAll(): Promise<Record<string, unknown>>;
        // Subscribe to cross-window store changes; returns an unsubscribe fn.
        onChanged(callback: (all: Record<string, unknown>) => void): () => void;
      };
      system: {
        openWifi(): Promise<IpcResult>;
        openNetwork(): Promise<IpcResult>;
        openPrinters(): Promise<IpcResult>;
        getLocalIps(): Promise<LocalIp[]>;
        probeTcp(host: string, port: number, timeoutMs: number): Promise<ProbeResult>;
        scanForServers(subnet: string, port: number): Promise<FoundServer[]>;
        cancelScan(): Promise<boolean>;
      };
      settings: {
        getDisplay(): Promise<unknown>;
        saveDisplay(settings: unknown): Promise<IpcResult>;
        getReceipt(): Promise<unknown>;
        saveReceipt(settings: unknown): Promise<IpcResult>;
        getPrinter(): Promise<unknown>;
        savePrinter(settings: unknown): Promise<IpcResult>;
      };
      clientDisplay: {
        status(): Promise<unknown>;
        open(): Promise<void>;
        // Returns an unsubscribe fn — the renderer MUST call it on unmount,
        // otherwise each ClientDisplay mount stacks another IPC listener.
        onSettingsUpdated(callback: (settings: unknown) => void): () => void;
      };
      printer: {
        test(): Promise<IpcResult>;
        printReceipt(data: unknown): Promise<IpcResult>;
        list(): Promise<{ name: string; displayName: string; isDefault: boolean }[]>;
        status(): Promise<PrinterStatusResult>;
      };
    };
    backend: {
      onError: (callback: (msg: string) => void) => void;
      onLog: (callback: (msg: string) => void) => void;
    };
  }
}
