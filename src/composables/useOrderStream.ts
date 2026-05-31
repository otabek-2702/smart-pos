// Server-Sent Events subscription to /orders/stream (per backend BE-3).
//
// The backend pushes order lifecycle events; we use those as a "refresh
// trigger" — the page's existing fetch is the source of truth, the stream
// just makes refreshes near-instant instead of waiting on the 3s poll.
// Polling stays on as the fallback so a dropped stream never silently stops
// updates (the spec explicitly says "polling stays as fallback").
//
// EventSource cannot set headers, so auth is via ?token=<bearer> (matched
// to the same token validation the backend uses for the Authorization
// header).
//
// Reconnect with exponential backoff capped at 30s. If the endpoint is
// missing (404) or rejected (401/403), the EventSource transitions to
// `error` and we back off — pages keep working on polling alone, no FE
// regression.

import { onMounted, onUnmounted, ref } from 'vue';
import { api } from 'boot/axios';
import { read } from 'src/utils/storage';

export type OrderEventName =
  | 'order.created'
  | 'order.updated'
  | 'order.status_changed'
  | 'order.paid'
  | 'order.cancelled';

interface UseOrderStreamOptions {
  onEvent: (name: OrderEventName, data: unknown) => void;
}

const EVENT_NAMES: ReadonlyArray<OrderEventName> = [
  'order.created',
  'order.updated',
  'order.status_changed',
  'order.paid',
  'order.cancelled',
];

const INITIAL_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 30_000;

export function useOrderStream(opts: UseOrderStreamOptions): { connected: ReturnType<typeof ref<boolean>> } {
  const connected = ref<boolean>(false);
  let source: EventSource | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let backoffMs = INITIAL_BACKOFF_MS;
  let disposed = false;

  function buildUrl(): string | null {
    const token = read<string>('auth_token');
    if (!token) return null;
    const base = api.defaults.baseURL ?? '';
    if (!base) return null;
    return `${base}/orders/stream?token=${encodeURIComponent(token)}`;
  }

  function close(): void {
    if (source) {
      source.close();
      source = null;
    }
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    connected.value = false;
  }

  function scheduleReconnect(): void {
    if (disposed) return;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    const delay = backoffMs;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      open();
    }, delay);
    backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
  }

  function open(): void {
    if (disposed) return;
    const url = buildUrl();
    if (!url) {
      scheduleReconnect();
      return;
    }

    try {
      source = new EventSource(url);
    } catch (e) {
      console.warn('[useOrderStream] EventSource construct failed:', e);
      scheduleReconnect();
      return;
    }

    source.onopen = (): void => {
      connected.value = true;
      backoffMs = INITIAL_BACKOFF_MS;
    };

    for (const name of EVENT_NAMES) {
      const eventName = name;
      source.addEventListener(eventName, (event: Event) => {
        const messageEvent = event as MessageEvent<string>;
        let data: unknown = null;
        try {
          data = messageEvent.data ? JSON.parse(messageEvent.data) : null;
        } catch (e) {
          console.warn(`[useOrderStream] failed to parse ${eventName} payload:`, e);
        }
        opts.onEvent(eventName, data);
      });
    }

    source.onerror = (): void => {
      // EventSource auto-reconnects internally, but with no backoff and
      // with the credentials it was opened with — if the token rotated we
      // want a fresh URL. Close and re-open ourselves on a backoff.
      connected.value = false;
      if (source) {
        source.close();
        source = null;
      }
      scheduleReconnect();
    };
  }

  onMounted(() => {
    open();
  });

  onUnmounted(() => {
    disposed = true;
    close();
  });

  return { connected };
}
