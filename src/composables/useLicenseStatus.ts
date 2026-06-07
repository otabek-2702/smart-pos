// src/composables/useLicenseStatus.ts
//
// Backend ships a licensing kill-switch (`licensing/middleware.py`). When
// the License row is UNREGISTERED / SUSPENDED / EXPIRED / offline-grace-
// exceeded, EVERY business endpoint returns 503 with code `license_*`.
// Only `/api/licensing/*` (status, setup, plans, plan-change) and `/healthz`
// stay open.
//
// If we don't display this state, the cashier sees confusing 5xx errors
// everywhere. This composable polls /api/licensing/status (always 200)
// and drives a full-screen LicenseBlockedScreen overlay.

import { ref, computed, onMounted, onUnmounted, type ComputedRef, type Ref } from 'vue';
import { api } from 'boot/axios';

// Mirrors licensing/models.py License.Status (PERPETUAL_UNLOCK was removed in
// migration 0004 — the backend can never emit it). UNKNOWN is a client-only
// placeholder for "haven't polled yet".
export type LicenseStatusCode =
  | 'UNREGISTERED'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'EXPIRED'
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
  // GET /api/licensing/status intentionally OMITS tenant identity (it's
  // unauthenticated — see licensing/views.py:26-30). The only place tenant
  // arrives is the 503 kill-switch refusal body, fed in via applyRefusal().
  // So it must be treated as optional on the client.
  tenant?: LicenseTenant | undefined;
  is_blocked: boolean;
  reason: string | null;
  // Prepaid-billing snapshot — present on /status so the renderer can show a
  // non-blocking "top up soon" banner before the kill switch fires.
  balance: string | null;
  days_remaining: number | null;
  warn: boolean;
}

const snapshot = ref<LicenseSnapshot>({
  status: 'UNKNOWN',
  expires_at: null,
  last_heartbeat_at: null,
  grace_until: null,
  message: null,
  is_blocked: false,
  reason: null,
  balance: null,
  days_remaining: null,
  warn: false,
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

/* Called by the axios response interceptor the instant ANY business endpoint
   returns a 503 license refusal. Without this, the LicenseBlockedScreen would
   only appear on the next 30s /status poll — leaving up to 30s of raw 5xx
   errors on every page. We flip the overlay immediately from the refusal body
   (which carries status + code + tenant), then kick a real /status poll to
   reconcile the authoritative snapshot. */
export interface LicenseRefusalBody {
  code?: string;
  status?: string;
  message?: string;
  tenant?: { org_name: string | null; email: string | null };
  banner?: string;
}

export function applyLicenseRefusal(body: LicenseRefusalBody | undefined): void {
  const status = (body?.status as LicenseStatusCode) ?? snapshot.value.status;
  snapshot.value = {
    ...snapshot.value,
    status,
    is_blocked: true,
    reason: body?.code ?? snapshot.value.reason,
    message: body?.banner ?? body?.message ?? snapshot.value.message,
    tenant: body?.tenant ?? snapshot.value.tenant,
  };
  // Reconcile against the source of truth without blocking the interceptor.
  void refresh();
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
