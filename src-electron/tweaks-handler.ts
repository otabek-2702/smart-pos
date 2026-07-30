// src-electron/tweaks-handler.ts
//
// Scope-aware app "tweaks" (granular settings). Every tweak is keyed by a string
// (e.g. "print.HALL.afterPayment", "receipt.size.items") and has a SCOPE:
//   - 'this-pc' : the value is per-machine (stored in tweaks.local.json here)
//   - 'global'  : one value shared by all tills, owned by the MAIN PC
//
// The MAIN PC (the one whose configured backend IP is loopback — it runs the
// backend locally) is the source of truth for global tweaks: its Electron
// process serves them over the LAN on :8770 (GET read, POST write). Any till can
// POST a global change; it lands on the main PC and propagates. Secondary PCs
// fetch + cache the globals (offline-tolerant).
//
// Persistence lives under %PROGRAMDATA%\AlphaPOS (machine-wide, survives
// uninstall/update). Export/Import move everything to another PC as one JSON.

import { ipcMain, BrowserWindow, dialog } from 'electron';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { getPersistDir } from './persist-path';
import { getConfiguredBackendHost, isMainPc } from './device-role';

const SETTINGS_PORT = 8770;
// Main-PC resolution is shared with the other Electron services. A fresh
// install follows Axios' existing loopback default.

export type TweakScope = 'this-pc' | 'global';

interface GlobalTweaks {
  version: number;
  scopes: Record<string, TweakScope>;
  values: Record<string, unknown>;
}
interface LocalTweaks {
  values: Record<string, unknown>;
}

let local: LocalTweaks = { values: {} };
let global: GlobalTweaks = { version: 0, scopes: {}, values: {} };

function localPath(): string {
  return path.join(getPersistDir(), 'tweaks.local.json');
}
function globalPath(): string {
  return path.join(getPersistDir(), 'tweaks.global.json'); // main PC = source of truth
}
function globalCachePath(): string {
  return path.join(getPersistDir(), 'tweaks.global.cache.json'); // secondary PC cache
}

function readJson<T>(p: string, def: T): T {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as T;
  } catch {
    return def;
  }
}
function writeJson(p: string, data: unknown): void {
  try {
    fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error('[tweaks] write failed:', p, e);
  }
}

function mainIp(): string {
  return getConfiguredBackendHost();
}

// Main-process resolved read — used by the print path to apply per-part sizes.
// Defensive against a malformed `global` (missing scopes/values) so printing
// never throws.
export function getTweakValue<T>(key: string, def: T, defaultScope: TweakScope = 'this-pc'): T {
  const scope = (global.scopes ?? {})[key] ?? defaultScope;
  const store = scope === 'global' ? global.values ?? {} : local.values ?? {};
  const v = store[key];
  return v === undefined ? def : (v as T);
}

// Accept a payload only if it has the right shape — a foreign responder on the
// configured IP:8770 or a version skew could otherwise poison `global` (and the
// cache, surviving restart), breaking reads everywhere.
function isValidGlobal(d: unknown): d is GlobalTweaks {
  return (
    !!d &&
    typeof d === 'object' &&
    typeof (d as GlobalTweaks).scopes === 'object' &&
    (d as GlobalTweaks).scopes !== null &&
    typeof (d as GlobalTweaks).values === 'object' &&
    (d as GlobalTweaks).values !== null
  );
}

function broadcast(): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send('tweaks:changed', { local, global });
  }
}

function applyGlobal(key: string, value: unknown, scope: TweakScope | undefined): void {
  if (scope !== undefined) global.scopes[key] = scope;
  if (value !== undefined) global.values[key] = value;
  global.version = (global.version || 0) + 1;
  writeJson(globalPath(), global);
  broadcast();
}

/* ---------------- main-PC LAN settings server ---------------- */

let server: http.Server | null = null;
function startServerIfMain(): void {
  if (!isMainPc() || server) return;
  server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(global));
      return;
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', (c) => {
        body += c;
        if (body.length > 1_000_000) req.destroy();
      });
      req.on('end', () => {
        try {
          const { key, value, scope } = JSON.parse(body) as {
            key: string;
            value?: unknown;
            scope?: TweakScope;
          };
          if (key) applyGlobal(key, value, scope);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(global));
        } catch {
          res.writeHead(400);
          res.end('bad request');
        }
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });
  server.on('error', (e) => console.error('[tweaks] settings server error:', e));
  server.listen(SETTINGS_PORT, '0.0.0.0');
}

/* ---------------- secondary-PC fetch/push ---------------- */

function httpJson(method: 'GET' | 'POST', url: string, body?: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : undefined;
    const u = new URL(url);
    const req = http.request(
      {
        method,
        hostname: u.hostname,
        port: u.port,
        path: u.pathname,
        timeout: 4000,
        headers: payload ? { 'Content-Type': 'application/json' } : undefined,
      },
      (res) => {
        let b = '';
        res.on('data', (c) => (b += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(b));
          } catch (e) {
            reject(e instanceof Error ? e : new Error('parse'));
          }
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

async function fetchGlobalFromMain(): Promise<void> {
  if (isMainPc()) return;
  const ip = mainIp();
  if (!ip) return;
  try {
    const data = await httpJson('GET', `http://${ip}:${SETTINGS_PORT}/settings`);
    if (isValidGlobal(data)) {
      global = data;
      writeJson(globalCachePath(), global);
      broadcast();
    }
  } catch {
    /* main PC offline → keep cached globals */
  }
}

async function pushGlobalToMain(
  key: string,
  value: unknown,
  scope: TweakScope | undefined,
): Promise<void> {
  const ip = mainIp();
  if (!ip) return;
  const data = await httpJson('POST', `http://${ip}:${SETTINGS_PORT}/settings`, {
    key,
    value,
    scope,
  });
  if (isValidGlobal(data)) {
    global = data;
    writeJson(globalCachePath(), global);
    broadcast();
  }
}

/* ---------------- registration ---------------- */

export function registerTweaksHandler(): void {
  local = readJson<LocalTweaks>(localPath(), { values: {} });
  if (!local.values || typeof local.values !== 'object') local = { values: {} };
  global = readJson<GlobalTweaks>(isMainPc() ? globalPath() : globalCachePath(), {
    version: 0,
    scopes: {},
    values: {},
  });
  // Guard against a malformed file on disk (e.g. an old poisoned cache).
  if (!global.scopes || typeof global.scopes !== 'object') global.scopes = {};
  if (!global.values || typeof global.values !== 'object') global.values = {};

  ipcMain.handle('tweaks:get', () => ({ local, global, isMainPc: isMainPc() }));

  ipcMain.handle('tweaks:setLocal', (_e, key: string, value: unknown) => {
    local.values[key] = value;
    writeJson(localPath(), local);
    broadcast();
    return { local, global };
  });

  ipcMain.handle(
    'tweaks:setGlobal',
    async (_e, key: string, value: unknown, scope?: TweakScope) => {
      if (isMainPc()) {
        applyGlobal(key, value, scope);
      } else {
        try {
          await pushGlobalToMain(key, value, scope);
        } catch (e) {
          console.error('[tweaks] push to main failed:', e);
          return { local, global, error: 'main-unreachable' };
        }
      }
      return { local, global };
    },
  );

  // Export EVERYTHING (local + global) as one JSON the user can carry to another PC.
  ipcMain.handle('tweaks:export', async (): Promise<{ ok: boolean; path?: string }> => {
    const r = await dialog.showSaveDialog({
      title: 'Sozlamalarni eksport qilish',
      defaultPath: 'alphapos-sozlamalar.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (r.canceled || !r.filePath) return { ok: false };
    writeJson(r.filePath, { local, global });
    return { ok: true, path: r.filePath };
  });

  ipcMain.handle('tweaks:import', async (): Promise<{ ok: boolean }> => {
    const r = await dialog.showOpenDialog({
      title: 'Sozlamalarni import qilish',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile'],
    });
    if (r.canceled || !r.filePaths[0]) return { ok: false };
    const data = readJson<{ local?: LocalTweaks; global?: GlobalTweaks } | null>(r.filePaths[0], null);
    if (!data) return { ok: false };
    if (data.local?.values) {
      local = { values: { ...local.values, ...data.local.values } };
      writeJson(localPath(), local);
    }
    if (data.global && isMainPc()) {
      global = {
        version: (global.version || 0) + 1,
        scopes: { ...global.scopes, ...data.global.scopes },
        values: { ...global.values, ...data.global.values },
      };
      writeJson(globalPath(), global);
    }
    broadcast();
    return { ok: true };
  });

  startServerIfMain();
  if (!isMainPc()) {
    void fetchGlobalFromMain();
    setInterval(() => void fetchGlobalFromMain(), 30_000);
  }
}
