// src/composables/useNetworkStatus.ts
//
// Reactive network state for the renderer. Reports both a coarse `quality`
// and a fine-grained `failureReason` so the UI can show the user a useful
// tip ("server is off?", "wrong IP?", "LAN unplugged?") instead of just
// "no connection".
//
// Probe channel: the existing axios `api` instance. Why not raw fetch?
// Because the backend has no CORS headers; in `quasar dev` the renderer
// runs at localhost:9300 and fetch() throws on CORS even when the server
// responds with 401. Axios uses XHR and inherits whatever the project's
// existing requests use, so if login works, the probe works too.
//
// Single shared poll loop refcounted across consumers. 8s interval, 4s
// per-probe timeout. Tap-to-refresh forces an immediate probe.

import { ref, computed, onMounted, onUnmounted, type ComputedRef, type Ref } from 'vue';
import { api } from 'boot/axios';

export type Quality = 'excellent' | 'good' | 'poor' | 'offline';

/**
 * Why the server is unreachable. Helps the UI tell the user *which* knob
 * to turn — power on the main computer, plug in the cable, fix the IP, etc.
 */
export type FailureReason =
  | 'ok'                  // everything fine
  | 'no-network'          // navigator.onLine === false (LAN/WiFi down on this device)
  | 'server-unreachable'  // we have a network but the configured baseURL doesn't answer
  | 'server-error'        // server answered with 5xx (running but crashed)
  | 'unknown';            // probe never ran (initial state)

const online = ref<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
const serverReachable = ref<boolean>(false);
const latencyMs = ref<number | null>(null);
const lastProbeAt = ref<number | null>(null);
const lastStatus = ref<number | null>(null);
const failureReason = ref<FailureReason>('unknown');

// Separate INTERNET reachability — independent of LAN/local-backend. The
// local backend works fully without internet; this just tells us whether
// upstream sync to the global backend is currently possible. UI uses it
// for the small "no internet" icon and (on the main PC) for the launch
// warning dialog.
const internetReachable = ref<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
const internetLatencyMs = ref<number | null>(null);
const internetLastProbeAt = ref<number | null>(null);

let consumers = 0;
let pollHandle: ReturnType<typeof setInterval> | null = null;
let internetPollHandle: ReturnType<typeof setInterval> | null = null;

const POLL_INTERVAL_MS = 8000;
const PROBE_TIMEOUT_MS = 4000;
// Internet probes happen less often than local-backend probes — internet
// drops are rarer, the cost is real bandwidth (kitchen WiFi may be metered),
// and visibility-change re-fires on tab focus anyway.
const INTERNET_POLL_INTERVAL_MS = 30_000;
const INTERNET_PROBE_TIMEOUT_MS = 4000;
// Yandex favicon: small (~3KB), reliable in UZ/RU networks. Using no-cors
// mode means we get an opaque response — we only care that the network
// completed, not what came back, so this is the right tool. Cache-busting
// avoids "internet up" being a stale answer from the disk cache.
const INTERNET_PROBE_URL = 'https://ya.ru/favicon.ico';

async function probeServer(): Promise<void> {
  // Deliberately NOT gating on navigator.onLine. In Chromium / Electron
  // navigator.onLine returns false when the PC has LAN connectivity but
  // no public internet route — exactly the kitchen-LAN-without-internet
  // case this app is designed for. Gating here would mark the server
  // unreachable and pop the diagnostic, even though the local backend
  // is alive on the LAN. The probe response is the source of truth.

  const baseURL = api.defaults.baseURL;
  if (!baseURL) {
    serverReachable.value = false;
    latencyMs.value = null;
    failureReason.value = 'server-unreachable';
    return;
  }

  // Probe the public /healthz — allowlisted (works even under license block),
  // needs no auth, and returns 200, so the logged-out picker doesn't spam the
  // console with 401s. Any HTTP response = server reachable.
  const start = performance.now();
  try {
    const res = await api.get('/healthz', {
      timeout: PROBE_TIMEOUT_MS,
      validateStatus: () => true,
    });
    latencyMs.value = Math.round(performance.now() - start);
    serverReachable.value = true;
    lastStatus.value = res.status;
    if (res.status >= 500) {
      failureReason.value = 'server-error';
    } else {
      failureReason.value = 'ok';
    }
  } catch {
    // Network error, timeout, DNS failure, refused connection — all collapse
    // to "we have local network but the configured server isn't answering".
    latencyMs.value = null;
    serverReachable.value = false;
    lastStatus.value = null;
    failureReason.value = 'server-unreachable';
  } finally {
    lastProbeAt.value = Date.now();
  }
}

async function probeInternet(): Promise<void> {
  if (!online.value) {
    internetReachable.value = false;
    internetLatencyMs.value = null;
    return;
  }
  const start = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), INTERNET_PROBE_TIMEOUT_MS);
  try {
    // no-cors: opaque response, but resolves on any network success. We
    // never read the body — just need to know the request completed.
    // cache: no-store keeps us from getting a stale "yes" from the cache.
    await fetch(`${INTERNET_PROBE_URL}?_=${Date.now()}`, {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal,
    });
    internetReachable.value = true;
    internetLatencyMs.value = Math.round(performance.now() - start);
  } catch {
    internetReachable.value = false;
    internetLatencyMs.value = null;
  } finally {
    clearTimeout(timer);
    internetLastProbeAt.value = Date.now();
  }
}

function handleOnline(): void {
  online.value = true;
  void probeServer();
  void probeInternet();
}
function handleOffline(): void {
  online.value = false;
  // DON'T touch serverReachable / failureReason here. The local backend
  // may still be reachable over LAN even when navigator says we're
  // offline (LAN-only kitchen scenario). probeServer decides; trigger
  // it immediately so the UI updates fast rather than waiting 8s.
  void probeServer();
  // Internet status DOES collapse with the offline event — no network
  // means no internet by definition.
  internetReachable.value = false;
  internetLatencyMs.value = null;
}

function handleVisibility(): void {
  if (document.visibilityState === 'visible') {
    void probeServer();
    void probeInternet();
  }
}

function startPolling(): void {
  if (pollHandle != null) return;
  void probeServer();
  void probeInternet();
  pollHandle = setInterval(() => void probeServer(), POLL_INTERVAL_MS);
  internetPollHandle = setInterval(() => void probeInternet(), INTERNET_POLL_INTERVAL_MS);
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  document.addEventListener('visibilitychange', handleVisibility);
}

function stopPolling(): void {
  if (pollHandle != null) {
    clearInterval(pollHandle);
    pollHandle = null;
  }
  if (internetPollHandle != null) {
    clearInterval(internetPollHandle);
    internetPollHandle = null;
  }
  window.removeEventListener('online', handleOnline);
  window.removeEventListener('offline', handleOffline);
  document.removeEventListener('visibilitychange', handleVisibility);
}

export interface NetworkStatus {
  online: Ref<boolean>;
  serverReachable: Ref<boolean>;
  latencyMs: Ref<number | null>;
  lastStatus: Ref<number | null>;
  failureReason: Ref<FailureReason>;
  quality: ComputedRef<Quality>;
  qualityLabel: ComputedRef<string>;
  failureLabel: ComputedRef<string>;
  /** Internet (public-facing) reachability — independent of LAN. */
  internetReachable: Ref<boolean>;
  internetLatencyMs: Ref<number | null>;
  internetLastProbeAt: Ref<number | null>;
  refresh: () => Promise<void>;
  refreshInternet: () => Promise<void>;
}

export function useNetworkStatus(): NetworkStatus {
  onMounted(() => {
    consumers += 1;
    if (consumers === 1) startPolling();
  });
  onUnmounted(() => {
    consumers -= 1;
    if (consumers === 0) stopPolling();
  });

  const quality = computed<Quality>(() => {
    if (!online.value || !serverReachable.value) return 'offline';
    if (latencyMs.value == null) return 'offline';
    if (latencyMs.value < 80) return 'excellent';
    if (latencyMs.value < 300) return 'good';
    return 'poor';
  });

  const qualityLabel = computed<string>(() => {
    switch (quality.value) {
      case 'excellent': return "A'lo";
      case 'good':      return 'Yaxshi';
      case 'poor':      return 'Sekin';
      case 'offline':   return "Aloqa yo'q";
      default:          return '';
    }
  });

  // Localized human-readable cause for the diagnostics panel
  const failureLabel = computed<string>(() => {
    switch (failureReason.value) {
      case 'no-network':         return "Internet yoki LAN aloqasi yo'q";
      case 'server-unreachable': return 'Server javob bermayapti';
      case 'server-error':       return 'Serverda xatolik';
      case 'ok':                 return 'Hammasi joyida';
      case 'unknown':            return 'Tekshirilmoqda...';
      default:                   return '';
    }
  });

  return {
    online,
    serverReachable,
    latencyMs,
    lastStatus,
    failureReason,
    quality,
    qualityLabel,
    failureLabel,
    internetReachable,
    internetLatencyMs,
    internetLastProbeAt,
    refresh: probeServer,
    refreshInternet: probeInternet,
  };
}
