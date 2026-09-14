// src/stores/operator.ts
//
// CTI "operator mode" store. The Electron main process runs a LAN WebSocket
// server; the operator's phone pairs by scanning a QR and then streams caller
// numbers. On each incoming call this store either pops a dialog with the
// caller's open orders, or — if the operator is already on the create-order
// page — lets that page silently fill the caller number into the phone field
// (the page watches `activeCall`).
//
// NO backend changes: customer + open orders are derived from the EXISTING
// orders list endpoint (there is no phone-search param, so we fetch recent
// orders and match the phone client-side; there is no separate customer-search
// or per-order detail route in this app).

import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { Router } from 'vue-router';
import QRCode from 'qrcode';
import { api } from 'src/boot/axios';
import { read } from 'src/utils/storage';
import type { OperatorStatus } from 'src/types/operator';

/* ---- assumed repo names (verified where possible) — change here if they move ---- */
const ORDERS_ENDPOINT = '/orders'; // GET orders list (data.orders[])
const CREATE_ORDER_ROUTE = 'create-order'; // router name of the create-order page
const ORDERS_ROUTE = 'orders'; // router name of the orders list (no per-order detail route)
// The list has no phone filter, so pull a recent page and match client-side.
const ORDERS_FETCH_PARAMS = { per_page: 200, order_by: '-created_at' } as const;

export interface OpenOrder {
  id: number;
  displayId: number;
  status: string;
  total: number;
}
export interface OperatorCustomer {
  id?: number;
  name?: string;
  phone?: string;
  is_staff?: boolean;
}
interface ListOrder {
  id: number;
  display_id: number;
  status: string;
  is_paid: boolean;
  total_amount: string | number;
  phone_number?: string | null;
  customer?: OperatorCustomer | null;
}
interface CallStartEvent {
  type: 'call_start';
  phone: string;
  direction: 'in' | 'out';
}
interface CallEndEvent {
  type: 'call_end';
  phone: string;
}
type CallEvent = CallStartEvent | CallEndEvent;

// Uzbek national mobile number = last 9 digits of the raw number.
function normalizePhone(raw: string): string {
  return (raw || '').replace(/\D/g, '').slice(-9);
}

export const useOperatorStore = defineStore('operator', () => {
  const operatorMode = ref<boolean>(false);
  const busy = ref(false);
  const running = ref(false);
  const error = ref<string | null>(null);
  const qrVisible = ref(false);
  const deviceName = ref('');
  const qrDataUrl = ref<string | null>(null);
  const activeCall = ref<{ phone: string; direction: 'in' | 'out' } | null>(null);
  const popup = ref<{
    phone: string;
    customer: OperatorCustomer | null;
    openOrders: OpenOrder[];
  } | null>(null);

  let router: Router | null = null;
  let registered = false;
  let callGeneration = 0;

  function applyStatus(status: OperatorStatus): void {
    operatorMode.value = status.enabled;
    running.value = status.running;
    error.value = status.error;
    deviceName.value = status.name;
    if (!status.enabled) {
      callGeneration += 1;
      activeCall.value = null;
      popup.value = null;
    }
  }

  // Called once at app start (from MainLayout) — wires the router + the single
  // call-event subscription.
  function init(r: Router): void {
    router = r;
    if (registered) return;
    registered = true;
    r.afterEach((route) => {
      if (route.name === 'users' || route.name === 'pin') {
        callGeneration += 1;
        activeCall.value = null;
        popup.value = null;
        qrVisible.value = false;
      }
    });
    if (typeof window !== 'undefined' && window.operator?.onCallEvent) {
      window.operator.onCallEvent((data) => void onCallEvent(data as CallEvent));
      window.operator.onState(applyStatus);
      busy.value = true;
      void window.operator
        .status()
        .then(applyStatus)
        .catch((cause: unknown) => {
          error.value =
            cause instanceof Error ? cause.message : 'Operator holatini yuklab bo‘lmadi';
        })
        .finally(() => {
          busy.value = false;
        });
    }
  }

  async function toggle(): Promise<void> {
    if (busy.value || !window.operator) return;
    busy.value = true;
    try {
      applyStatus(await (operatorMode.value ? window.operator.stop() : window.operator.start()));
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Operator holatini saqlab bo‘lmadi';
    } finally {
      busy.value = false;
    }
  }

  async function showPairing(): Promise<void> {
    if (busy.value || !window.operator) return;
    busy.value = true;
    qrDataUrl.value = null;
    qrVisible.value = true;
    try {
      const pairing = await window.operator.pairing();
      deviceName.value = pairing.name;
      qrDataUrl.value = await QRCode.toDataURL(JSON.stringify(pairing), { width: 360, margin: 2 });
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'QR kodni yuklab bo‘lmadi';
    } finally {
      busy.value = false;
    }
  }

  function hidePairing(): void {
    qrVisible.value = false;
  }

  async function onCallEvent(ev: CallEvent): Promise<void> {
    if (!ev || typeof ev !== 'object') return;
    if (
      !operatorMode.value ||
      !read<string>('auth_token') ||
      router?.currentRoute.value.name === 'users' ||
      router?.currentRoute.value.name === 'pin'
    )
      return;
    if (typeof ev.phone !== 'string') return;

    if (ev.type === 'call_start') {
      const phone = ev.phone || '';
      const generation = ++callGeneration;
      activeCall.value = { phone, direction: ev.direction === 'out' ? 'out' : 'in' };
      // Always show the popup (even on the create-order page). The caller's number
      // reaches an order ONLY when the operator presses "+ Yangi buyurtma" — it is
      // never auto-filled, so a walk-in order can't inherit a caller's number.
      const { customer, openOrders } = await lookup(phone);
      if (customer?.name) {
        void window.operator?.customerName(phone, customer.name).catch((cause: unknown) => {
          console.error('[operator] failed to save customer name:', cause);
        });
      }
      if (generation === callGeneration && operatorMode.value && read<string>('auth_token')) {
        popup.value = { phone, customer, openOrders };
      }
    } else if (ev.type === 'call_end') {
      // Leave any open popup so the operator can still act on it.
      activeCall.value = null;
    }
  }

  // Look up the caller's customer + OPEN orders from the existing orders list.
  // OPEN = not closed: NOT paid OR NOT prepared (READY); never CANCELLED.
  async function lookup(
    phone: string,
  ): Promise<{ customer: OperatorCustomer | null; openOrders: OpenOrder[] }> {
    const want = normalizePhone(phone);
    if (want.length < 7) return { customer: null, openOrders: [] };
    try {
      const res = await api.get<{ data?: { orders?: ListOrder[] } }>(ORDERS_ENDPOINT, {
        params: ORDERS_FETCH_PARAMS,
      });
      const orders = res.data?.data?.orders ?? [];
      const mine = orders.filter((o) => normalizePhone(o.phone_number ?? '') === want);
      const open = mine.filter(
        (o) => o.status !== 'CANCELLED' && (!o.is_paid || o.status !== 'READY'),
      );
      const openOrders: OpenOrder[] = open.map((o) => ({
        id: o.id,
        displayId: o.display_id,
        status: o.status,
        total: Number(o.total_amount) || 0,
      }));
      const customer = mine.find((o) => o.customer)?.customer ?? null;
      return { customer, openOrders };
    } catch (e) {
      console.error('[operator] lookup failed:', e);
      return { customer: null, openOrders: [] };
    }
  }

  function dismissPopup(): void {
    popup.value = null;
  }

  // No per-order detail route exists in this app — go to the orders list.
  function goToOrder(): void {
    void router?.push({ name: ORDERS_ROUTE });
    dismissPopup();
  }

  function createOrder(phone: string): void {
    void router?.push({ name: CREATE_ORDER_ROUTE, query: { phone } });
    dismissPopup();
  }

  return {
    operatorMode,
    busy,
    running,
    error,
    qrVisible,
    deviceName,
    qrDataUrl,
    activeCall,
    popup,
    init,
    toggle,
    showPairing,
    hidePairing,
    onCallEvent,
    dismissPopup,
    goToOrder,
    createOrder,
  };
});
