// src/utils/storage.ts
//
// Renderer-side wrapper around the main-process kv-store (electron-store).
// Use this instead of localStorage for anything we want to survive a reload
// AND be safe across multiple BrowserWindows.
//
// Why a sync getter?
//   The axios request interceptor needs the auth token on EVERY request and
//   it has to return synchronously. So we hot-cache the whole store in memory
//   at boot time (one IPC round trip in `initStorage()`), then reads are
//   synchronous and writes go async to the main process.
//
// Why fallback to localStorage?
//   `quasar dev` in a plain browser (no Electron) wouldn't have window.electron.
//   We still want the app to work for development.

const isElectron = typeof window !== 'undefined' && !!window.electron?.kv;

// Hot cache. Populated by initStorage() at boot from electron-store, kept in
// sync by every set/delete call.
let cache: Record<string, unknown> = {};
let initialized = false;

/**
 * One-shot at app boot. Pulls the whole kv-store into memory AND migrates any
 * legacy localStorage values (from before this refactor) into the kv-store
 * exactly once. After this resolves, every read is synchronous.
 */
export async function initStorage(): Promise<void> {
  if (initialized) return;

  if (isElectron) {
    cache = await window.electron.kv.getAll();

    // Keep this renderer's hot cache live when ANOTHER window mutates the
    // store (e.g. the main window writing the auth token at login while the
    // customer-display window is already open). Without this, sync read()s
    // would serve a stale boot-time snapshot forever.
    window.electron.kv.onChanged((all) => {
      cache = all;
    });

    // One-time migration from localStorage. Anything in localStorage that's
    // not yet in kv-store wins. After migration we wipe the localStorage key
    // so future reads only consult kv-store.
    const LEGACY_KEYS = ['pos:IpAdress', 'pos:cachedUsers', 'auth_token', 'auth_user'];
    for (const k of LEGACY_KEYS) {
      const legacy = localStorage.getItem(k);
      if (legacy != null && cache[k] == null) {
        // Stored values were JSON for objects, raw strings for scalars
        let parsed: unknown = legacy;
        if (legacy.startsWith('{') || legacy.startsWith('[')) {
          try {
            parsed = JSON.parse(legacy);
          } catch {
            parsed = legacy;
          }
        }
        cache[k] = parsed;
        await window.electron.kv.set(k, parsed);
        localStorage.removeItem(k);
      }
    }
  } else {
    // Browser-only fallback (e.g., quasar dev in a tab). Mirror localStorage
    // into the cache so reads stay synchronous and consistent.
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      const v = localStorage.getItem(k);
      if (v == null) continue;
      cache[k] = v.startsWith('{') || v.startsWith('[')
        ? safeParse(v) ?? v
        : v;
    }
  }

  initialized = true;
}

function safeParse<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

/**
 * Synchronous read from the in-memory cache. `initStorage()` must have
 * resolved before this is called (it's called once in the axios boot file
 * which runs before the rest of the app).
 */
export function read<T = unknown>(key: string): T | null {
  return (cache[key] as T | null) ?? null;
}

/**
 * Async write — mirrors to the cache immediately, persists to disk in the
 * background. Returns the promise so callers that need the persistence to
 * complete (e.g., before a reload) can await it.
 */
export async function write<T>(key: string, value: T): Promise<void> {
  cache[key] = value;
  if (isElectron) {
    // The IPC bridge structured-clones the payload; a Vue reactive Proxy (or
    // anything with functions/refs) throws "object could not be cloned".
    // Round-trip objects through JSON to a plain, cloneable value first.
    const plain =
      value !== null && typeof value === 'object'
        ? (JSON.parse(JSON.stringify(value)) as T)
        : value;
    await window.electron.kv.set(key, plain);
  } else {
    localStorage.setItem(
      key,
      typeof value === 'string' ? value : JSON.stringify(value),
    );
  }
}

/**
 * Async delete — mirrors to cache immediately, persists in background.
 */
export async function remove(key: string): Promise<void> {
  delete cache[key];
  if (isElectron) {
    await window.electron.kv.delete(key);
  } else {
    localStorage.removeItem(key);
  }
}
