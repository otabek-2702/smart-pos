// src/electron.d.ts
export {};

interface IpcResult {
  success: boolean;
  error?: string;
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
        onSettingsUpdated(callback: (settings: unknown) => void): void;
      };
      printer: {
        test(): Promise<IpcResult>;
        printReceipt(data: unknown): Promise<IpcResult>;
      };
    };
    backend: {
      onError: (callback: (msg: string) => void) => void;
      onLog: (callback: (msg: string) => void) => void;
    };
  }
}
