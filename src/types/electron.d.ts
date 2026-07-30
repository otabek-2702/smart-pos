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

type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

interface UpdateState {
  status: UpdateStatus;
  currentVersion: string;
  version: string | null;
  releaseNotes: string | null;
  percent: number;
  error: string | null;
}

type TweakScope = 'this-pc' | 'global';
interface TweaksState {
  local: { values: Record<string, unknown> };
  global: { version: number; scopes: Record<string, TweakScope>; values: Record<string, unknown> };
  isMainPc?: boolean;
}

type ReportMutationKind = 'created' | 'paid' | 'cancelled' | 'updated';

interface TelegramReportPreferences {
  dailyEnabled: boolean;
  dailyTime: string;
}

interface ReportingStatus {
  isMainPc: boolean;
  backendHost: string;
  configured: boolean;
  running: boolean;
  botName: string | null;
  botUsername: string | null;
  pairedOwner: {
    displayName: string;
    username?: string;
    pairedAt: string;
  } | null;
  pairingExpiresAt: string | null;
  preferences: TelegramReportPreferences;
  storedOrderCount: number;
  databaseSizeBytes: number;
  earliestOrderAt: string | null;
  latestOrderAt: string | null;
  lastSyncAt: string | null;
  lastCaptureAt: string | null;
  pendingRefreshCount: number;
  lastError: string | null;
}

interface ReportPairingResult {
  url: string;
  expiresAt: string;
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
      };
      updater: {
        get(): Promise<UpdateState>;
        check(): Promise<UpdateState>;
        download(): Promise<UpdateState>;
        install(): Promise<void>;
        // Subscribe to live update state from main; returns an unsubscribe fn.
        onState(callback: (state: UpdateState) => void): () => void;
      };
      reports: {
        status(): Promise<ReportingStatus>;
        capture(orderId: number | string, kind: ReportMutationKind): Promise<boolean>;
        connectTelegram(token: string): Promise<ReportingStatus>;
        disconnectTelegram(): Promise<ReportingStatus>;
        createPairing(): Promise<ReportPairingResult>;
        unpair(): Promise<ReportingStatus>;
        savePreferences(preferences: TelegramReportPreferences): Promise<ReportingStatus>;
        sendTest(): Promise<boolean>;
        refreshNow(): Promise<ReportingStatus>;
      };
    };
    backend: {
      onError: (callback: (msg: string) => void) => void;
      onLog: (callback: (msg: string) => void) => void;
    };
    operator: {
      start(): Promise<{ url: string }>;
      stop(): Promise<void>;
      // Subscribe to caller events from the phone; returns an unsubscribe fn.
      onCallEvent(callback: (data: unknown) => void): () => void;
    };
    tweaks: {
      get(): Promise<TweaksState>;
      setLocal(key: string, value: unknown): Promise<unknown>;
      setGlobal(key: string, value: unknown, scope?: TweakScope): Promise<unknown>;
      export(): Promise<{ ok: boolean; path?: string }>;
      import(): Promise<{ ok: boolean }>;
      onChanged(callback: (state: TweaksState) => void): () => void;
    };
  }
}
