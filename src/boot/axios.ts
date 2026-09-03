import axios, { type AxiosInstance } from 'axios';
import { boot } from 'quasar/wrappers';
import { initStorage, read, remove } from 'src/utils/storage';
import { applyLicenseRefusal, type LicenseRefusalBody } from 'src/composables/useLicenseStatus';

declare module 'vue' {
  interface ComponentCustomProperties {
    $axios: AxiosInstance;
    $api: AxiosInstance;
  }
}

// Created with no baseURL — set during boot() once kv-store has been read.
// Other modules import `api` at module-load time but don't fire requests
// until Vue components mount, which is after all boot files resolve.
const api = axios.create({
  timeout: 10_000,
});

interface TimedAxiosConfig {
  url?: string;
  method?: string;
  __backendTimingStartedAt?: number;
}

type TimingOutcome = 'success' | 'http_error' | 'network_error' | 'timeout';

let backendTimingLoggingEnabled = false;

async function syncBackendTimingSetting(
  reports: Window['electron']['reports'],
  attempt = 0,
): Promise<void> {
  try {
    backendTimingLoggingEnabled = await reports.performanceLoggingEnabled();
  } catch {
    backendTimingLoggingEnabled = false;
    // The renderer can boot a fraction earlier than the main process finishes
    // registering reporting IPC. Retry briefly so a persisted opt-in still
    // takes effect without requiring the manager to revisit Settings.
    if (attempt < 5) {
      setTimeout(() => void syncBackendTimingSetting(reports, attempt + 1), 1_000);
    }
  }
}

function recordBackendTiming(
  config: TimedAxiosConfig | undefined,
  status: number | null,
  outcome: TimingOutcome,
): void {
  const startedAt = config?.__backendTimingStartedAt;
  const reports = typeof window !== 'undefined' ? window.electron?.reports : undefined;
  if (!backendTimingLoggingEnabled || startedAt === undefined || !reports || !config?.url) return;

  void reports
    .recordBackendTiming({
      timestamp: new Date().toISOString(),
      method: config.method || 'GET',
      url: config.url,
      status,
      durationMs: Math.max(0, performance.now() - startedAt),
      outcome,
    })
    .catch(() => undefined);
}

/* REQUEST INTERCEPTOR — ADD TOKEN
   read() is synchronous because initStorage() pre-populated the in-memory
   cache during boot. */
api.interceptors.request.use((config) => {
  const token = read<string>('auth_token');

  if (backendTimingLoggingEnabled) {
    (config as TimedAxiosConfig).__backendTimingStartedAt = performance.now();
  }

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

/* BOOT */
export default boot(async ({ app, router }) => {
  // 1. Pull the entire kv-store into the renderer's hot cache (one IPC).
  //    Also one-shot migrates any pre-refactor localStorage values.
  await initStorage();

  // Response-time logging is opt-in and cached in the renderer. This avoids an
  // IPC/settings read on every API request while still applying changes live.
  const reports = window.electron?.reports;
  if (reports) {
    reports.onPerformanceLoggingChanged((enabled) => {
      backendTimingLoggingEnabled = enabled;
    });
    await syncBackendTimingSetting(reports);
  }

  // 2. Resolve baseURL from the cached IP. Fallback to 127.0.0.1 for first
  //    boot before the user has set anything.
  const ip = read<string>('pos:IpAdress');
  api.defaults.baseURL = ip ? `http://${ip}:8000` : 'http://127.0.0.1:8000';

  /* RESPONSE INTERCEPTOR — HANDLE 401 */
  api.interceptors.response.use(
    (response) => {
      recordBackendTiming(response.config as TimedAxiosConfig, response.status, 'success');
      return response;
    },
    (error) => {
      const status = error.response?.status;
      const outcome: TimingOutcome =
        error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT'
          ? 'timeout'
          : error.response
            ? 'http_error'
            : 'network_error';
      recordBackendTiming(error.config as TimedAxiosConfig | undefined, status ?? null, outcome);

      if (status === 401) {
        // Clear BOTH token and user. The router guards key admin access off
        // auth_user, so leaving it behind lets a revoked session keep
        // navigating into /settings client-side until the next API call fails.
        void remove('auth_token');
        void remove('auth_user');

        // POS-safe redirect
        void router.push({ name: 'users' });
      } else if (status === 503) {
        // License kill switch: every business endpoint 503s with a
        // `license_*` code until the License row is active. Flip the
        // LicenseBlockedScreen immediately instead of waiting up to 30s for
        // the next /status poll.
        const data = error.response?.data as (LicenseRefusalBody & { code?: string }) | undefined;
        if (typeof data?.code === 'string' && data.code.startsWith('license_')) {
          applyLicenseRefusal(data);
        }
      }

      return Promise.reject(error instanceof Error ? error : new Error('Request failed'));
    },
  );

  app.config.globalProperties.$axios = axios;
  app.config.globalProperties.$api = api;
});

export { api };
