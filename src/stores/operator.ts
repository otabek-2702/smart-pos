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
import { api } from 'boot/axios';

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
  const qrDataUrl = ref<string | null>(null);
  const activeCall = ref<{ phone: string; direction: 'in' | 'out' } | null>(null);
  // The last caller's number, kept AFTER the call ends so a new order started
  // any way (the popup button OR the normal "new order" flow) still prefills it.
  // Cleared when the create-order page closes (so the next order starts clean).
  const pendingPhone = ref<string | null>(null);
  const popup = ref<{
    phone: string;
    customer: OperatorCustomer | null;
    openOrders: OpenOrder[];
  } | null>(null);

  let router: Router | null = null;
  let registered = false;

  // Called once at app start (from MainLayout) — wires the router + the single
  // call-event subscription.
  function init(r: Router): void {
    router = r;
    if (registered) return;
    registered = true;
    if (typeof window !== 'undefined' && window.operator?.onCallEvent) {
      window.operator.onCallEvent((data) => void onCallEvent(data as CallEvent));
    }
  }

  async function toggle(): Promise<void> {
    if (operatorMode.value) {
      operatorMode.value = false;
      qrDataUrl.value = null;
      await window.operator?.stop();
      return;
    }
    operatorMode.value = true;
    try {
      const res = await window.operator?.start();
      if (res?.url) {
        qrDataUrl.value = await QRCode.toDataURL(res.url, { width: 320, margin: 1 });
      }
    } catch (e) {
      console.error('[operator] start failed:', e);
      operatorMode.value = false;
      qrDataUrl.value = null;
    }
  }

  function onCreateOrderPage(): boolean {
    return router?.currentRoute.value.name === CREATE_ORDER_ROUTE;
  }

  async function onCallEvent(ev: CallEvent): Promise<void> {
    if (!ev || typeof ev !== 'object') return;

    if (ev.type === 'call_start') {
      const phone = ev.phone || '';
      activeCall.value = { phone, direction: ev.direction === 'out' ? 'out' : 'in' };
      pendingPhone.value = phone; // survives call_end; cleared on create-order close
      // On the create-order page: DON'T pop the dialog — the page fills the
      // phone field itself (it watches activeCall).
      if (onCreateOrderPage()) return;
      const { customer, openOrders } = await lookup(phone);
      popup.value = { phone, customer, openOrders };
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

  // Clear the caller number prefill — called when the create-order page closes so
  // the next order doesn't inherit a stale caller's phone.
  function clearPending(): void {
    pendingPhone.value = null;
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
    qrDataUrl,
    activeCall,
    pendingPhone,
    popup,
    init,
    toggle,
    onCallEvent,
    dismissPopup,
    clearPending,
    goToOrder,
    createOrder,
  };
});
