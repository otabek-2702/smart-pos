// src/electron.d.ts
export {};

declare global {
  interface Window {
    electron: {
      ipcRenderer: {
        invoke(channel: string, ...args: unknown[]): Promise<unknown>;
        send(channel: string, ...args: unknown[]): void;
        on(channel: string, func: (...args: unknown[]) => void): void;
      };
    };
  }
}