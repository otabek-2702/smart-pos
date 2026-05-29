// src/composables/useLicenseStatus.ts
//
// Backend ships a licensing kill-switch (`licensing/middleware.py`). When
// the License row is UNREGISTERED / SUSPENDED / EXPIRED / offline-grace-
// exceeded, EVERY business endpoint returns 503 with code `license_*`.
// Only `/api/licensing/{status,setup,unlock}` and `/healthz` stay open.
//
// If we don't display this state, the cashier sees confusing 5xx errors
// everywhere. This composable polls /api/licensing/status (always 200)
// and drives a full-screen LicenseBlockedScreen overlay.

import { ref, computed, onMounted, onUnmounted, type ComputedRef, type Ref } from 'vue';
import { api } from 'boot/axios';

export type LicenseStatusCode =
  | 'UNREGISTERED'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'EXPIRED'
  | 'PERPETUAL_UNLOCK'
  | 'UNKNOWN';

export interface LicenseTenant {
  org_name: string | null;
  email: string | null;
}

export interface LicenseSnapshot {
  status: LicenseStatusCode;
  expires_at: string | null;
  last_heartbeat_at: string | null;
  grace_until: string | null;
  message: string | null;
  tenant: LicenseTenant;
  is_blocked: boolean;
  reason: string | null;
}

const snapshot = ref<LicenseSnapshot>({
  status: 'UNKNOWN',
  expires_at: null,
  last_heartbeat_at: null,
  grace_until: null,
  message: null,
  tenant: { org_name: null, email: null },
  is_blocked: false,
  reason: null,
});

const lastFetchedAt = ref<number | null>(null);
const fetching = ref<boolean>(false);

let consumers = 0;
let pollHandle: ReturnType<typeof setInterval> | null = null;

const POLL_INTERVAL_MS = 30_000; // every 30s — license state changes rarely

async function refresh(): Promise<void> {
  if (fetching.value) return;
  fetching.value = true;
  try {
    const res = await api.get('/api/licensing/status', {
      timeout: 4000,
      validateStatus: () => true,
    });
    if (res.status === 200 && res.data?.success && res.data.data) {
      snapshot.value = res.data.data as LicenseSnapshot;
    }
    // Any non-200 leaves the prior snapshot intact (could be transient
    // network blip; the kill-switch endpoint itself always returns 200).
  } catch {
    // Same — keep the last good snapshot if we can't reach the backend.
  } finally {
    fetching.value = false;
    lastFetchedAt.value = Date.now();
  }
}

function startPolling(): void {
  if (pollHandle != null) return;
  void refresh();
  pollHandle = setInterval(() => void refresh(), POLL_INTERVAL_MS);
}

function stopPolling(): void {
  if (pollHandle != null) {
    clearInterval(pollHandle);
    pollHandle = null;
  }
}

export interface LicenseStatus {
  snapshot: Ref<LicenseSnapshot>;
  fetching: Ref<boolean>;
  isBlocked: ComputedRef<boolean>;
  isUnregistered: ComputedRef<boolean>;
  refresh: () => Promise<void>;
}

export function useLicenseStatus(): LicenseStatus {
  onMounted(() => {
    consumers += 1;
    if (consumers === 1) startPolling();
  });
  onUnmounted(() => {
    consumers -= 1;
    if (consumers === 0) stopPolling();
  });

  const isBlocked = computed<boolean>(() => snapshot.value.is_blocked === true);
  const isUnregistered = computed<boolean>(() => snapshot.value.status === 'UNREGISTERED');

  return {
    snapshot,
    fetching,
    isBlocked,
    isUnregistered,
    refresh,
  };
}
