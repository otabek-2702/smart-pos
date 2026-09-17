// src/stores/operator.ts
//
// CTI "operator mode" store. The Electron main process runs a LAN WebSocket
// server (src-electron/operator-handler.ts); paired phones stream their calls
// and every event arrives here over `operator:call-event`.
//
// Protocol 3 phones say `operator_hello` (role per POS) and send `call_state`
// snapshots; protocol 2 phones (no hello) are operators that only send
// call_start/call_end, which keep their old behaviour (modal on every start).
//
// - Role 'cashier': never the modal, never a customer lookup.
// - Role 'operator': a new ringing incoming (or started outgoing) call opens
//   IncomingCallDialog, unless an order is being entered (create-order page or
//   OrderDetailsDialog open) — then only the non-blocking IncomingCallBanner.
//   A call waiting behind an active one only gets the banner.
// - Both roles: current + recent (10 min, max 5) calls feed the quick-fill
//   chips in OrderDetailsDialog. A caller number never reaches an order by
//   itself; the cashier taps a chip or "+ Yangi buyurtma".
//
// Customer + open orders come from GET /clients/lookup (client and their 20
// latest orders), cached per number for 5 minutes. After an order with a phone
// is saved, `order_created` is sent to the phones through the main process.

import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { Router } from 'vue-router';
import QRCode from 'qrcode';
import { api } from 'src/boot/axios';
import { read } from 'src/utils/storage';
import { normalizeUzPhone } from 'src/utils/phone';
import {
  buildQuickFill,
  callAlert,
  effectiveRole,
  isOperatorRole,
  phoneKey,
  pruneRecentCalls,
  rememberRecentCall,
  sortCurrentCalls,
  type RecentCall,
} from 'src/utils/operatorCalls';
import type {
  OperatorCallEvent,
  OperatorLiveCall,
  OperatorRole,
  OperatorStatus,
} from 'src/types/operator';

/* ---- repo names — change here if they move ---- */
const LOOKUP_ENDPOINT = '/clients/lookup'; // GET ?phone= → data.client, data.orders[] (latest 20)
const CREATE_ORDER_ROUTE = 'create-order'; // router name of the create-order page
const ORDERS_ROUTE = 'orders'; // router name of the orders list (no per-order detail route)
const LOOKUP_TTL_MS = 5 * 60_000;
const LEGACY_SOURCE = 'legacy';
const MAX_KNOWN_NAMES = 100;

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
export interface CallBanner {
  source: string;
  callId: string;
  phone: string;
  direction: 'in' | 'out';
  /** Waiting behind the call the operator is on. */
  waiting: boolean;
  name?: string;
}
interface ListOrder {
  id: number;
  display_id: number;
  status: string;
  is_paid: boolean;
  total_amount: string | number;
}
interface ClientLookupData {
  client?: OperatorCustomer | null;
  orders?: ListOrder[];
}
interface LookupResult {
  customer: OperatorCustomer | null;
  openOrders: OpenOrder[];
}
interface PhoneSource {
  role: OperatorRole;
  calls: OperatorLiveCall[];
}

const NO_CUSTOMER: LookupResult = { customer: null, openOrders: [] };

// OPEN = not closed: NOT paid OR NOT prepared (READY); never CANCELLED.
function openOrdersOf(orders: ListOrder[]): OpenOrder[] {
  return orders
    .filter((o) => o.status !== 'CANCELLED' && (!o.is_paid || o.status !== 'READY'))
    .map((o) => ({
      id: o.id,
      displayId: o.display_id,
      status: o.status,
      total: Number(o.total_amount) || 0,
    }));
}

export const useOperatorStore = defineStore('operator', () => {
  const operatorMode = ref<boolean>(false);
  const busy = ref(false);
  const running = ref(false);
  const error = ref<string | null>(null);
  const qrVisible = ref(false);
  const deviceName = ref('');
  const qrDataUrl = ref<string | null>(null);
  const popup = ref<{
    phone: string;
    direction: 'in' | 'out';
    customer: OperatorCustomer | null;
    openOrders: OpenOrder[];
  } | null>(null);
  const banner = ref<CallBanner | null>(null);
  const phones = ref<Record<string, PhoneSource>>({});
  const recentCalls = ref<RecentCall[]>([]);
  const knownNames = ref<Record<string, string>>({});
  const orderDialogOpen = ref(false);

  const role = computed<OperatorRole>(() =>
    effectiveRole(Object.values(phones.value).map((phone) => phone.role)),
  );
  const currentCalls = computed(() =>
    sortCurrentCalls(Object.values(phones.value).flatMap((phone) => phone.calls)),
  );
  const activeCall = computed(() => {
    const call = currentCalls.value[0];
    return call ? { phone: call.phone, direction: call.direction } : null;
  });
  const quickFillCalls = computed(() =>
    buildQuickFill(currentCalls.value, recentCalls.value, knownNames.value),
  );

  let router: Router | null = null;
  let registered = false;
  let callGeneration = 0;
  // `${source}\n${callId}` → last state seen; decides what is "new".
  const seenCalls = new Map<string, OperatorLiveCall['state']>();
  const lookupCache = new Map<string, { at: number; result: Promise<LookupResult | null> }>();

  function clearCalls(): void {
    callGeneration += 1;
    popup.value = null;
    banner.value = null;
    phones.value = {};
    recentCalls.value = [];
    seenCalls.clear();
  }

  function applyStatus(status: OperatorStatus): void {
    operatorMode.value = status.enabled;
    running.value = status.running;
    error.value = status.error;
    deviceName.value = status.name;
    if (!status.enabled) clearCalls();
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
        popup.value = null;
        banner.value = null;
        qrVisible.value = false;
      }
    });
    if (typeof window !== 'undefined' && window.operator?.onCallEvent) {
      window.operator.onCallEvent((data) => void onCallEvent(data as OperatorCallEvent));
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

  /* ---- call tracking ---- */

  // Dialogs and lookups only for a logged-in cashier session.
  function uiAllowed(): boolean {
    const name = router?.currentRoute.value.name;
    return operatorMode.value && !!read<string>('auth_token') && name !== 'users' && name !== 'pin';
  }

  function orderEntryActive(): boolean {
    return router?.currentRoute.value.name === CREATE_ORDER_ROUTE || orderDialogOpen.value;
  }

  function rememberName(phone: string, name: string | undefined): void {
    const key = phoneKey(phone);
    const clean = name?.trim();
    if (!key || !clean || knownNames.value[key] === clean) return;
    const next = { ...knownNames.value, [key]: clean };
    const keys = Object.keys(next);
    if (keys.length > MAX_KNOWN_NAMES) delete next[keys[0]!];
    knownNames.value = next;
  }

  function rememberEnded(call: Pick<OperatorLiveCall, 'phone' | 'direction' | 'customerName'>) {
    if (!call.phone) return;
    const now = Date.now();
    recentCalls.value = rememberRecentCall(
      recentCalls.value,
      {
        key: phoneKey(call.phone) || call.phone,
        phone: call.phone,
        direction: call.direction,
        endedAt: now,
        ...(call.customerName ? { name: call.customerName } : {}),
      },
      now,
    );
  }

  function setPhone(source: string, phoneRole: OperatorRole, calls: OperatorLiveCall[]): void {
    phones.value = { ...phones.value, [source]: { role: phoneRole, calls } };
  }

  function dropPhone(source: string): void {
    const phone = phones.value[source];
    if (!phone) return;
    for (const call of phone.calls) rememberEnded(call);
    const next = { ...phones.value };
    delete next[source];
    phones.value = next;
    for (const key of [...seenCalls.keys()]) {
      if (key.startsWith(`${source}\n`)) seenCalls.delete(key);
    }
    if (banner.value?.source === source) banner.value = null;
  }

  function forgetOldCalls(keep: Set<string>): void {
    if (seenCalls.size <= 200) return;
    for (const key of [...seenCalls.keys()]) {
      if (seenCalls.size <= 100) break;
      if (!keep.has(key)) seenCalls.delete(key);
    }
  }

  async function onCallEvent(ev: OperatorCallEvent | null | undefined): Promise<void> {
    if (!ev || typeof ev !== 'object' || !operatorMode.value) return;
    const source = typeof ev.source === 'string' && ev.source ? ev.source : LEGACY_SOURCE;
    switch (ev.type) {
      case 'phone_role':
        if (isOperatorRole(ev.role)) setPhone(source, ev.role, phones.value[source]?.calls ?? []);
        return;
      case 'phone_gone':
        dropPhone(source);
        return;
      case 'call_state':
        if (isOperatorRole(ev.role) && Array.isArray(ev.calls)) {
          await applyCallState(source, ev.role, ev.calls);
        }
        return;
      case 'call_start':
        if (typeof ev.phone === 'string') {
          await legacyCallStart(source, ev.phone, ev.direction === 'out' ? 'out' : 'in');
        }
        return;
      case 'call_end':
        if (typeof ev.phone === 'string') legacyCallEnd(source, ev.phone);
        return;
    }
  }

  // Protocol 2: always the modal, as before (only the direction now sticks).
  async function legacyCallStart(
    source: string,
    phone: string,
    direction: 'in' | 'out',
  ): Promise<void> {
    const others = (phones.value[source]?.calls ?? []).filter((call) => call.phone !== phone);
    const call: OperatorLiveCall = {
      id: `legacy:${phone}`,
      phone,
      direction,
      state: 'active',
      since: Date.now(),
    };
    setPhone(source, 'operator', [...others, call]);
    if (!uiAllowed()) return;
    // The caller's number reaches an order ONLY when the operator presses
    // "+ Yangi buyurtma" or taps a quick-fill chip — never automatically.
    await openPopup(phone, direction);
  }

  function legacyCallEnd(source: string, phone: string): void {
    const calls = phones.value[source]?.calls ?? [];
    const ended = calls.filter((call) => call.phone === phone);
    if (ended.length) {
      setPhone(
        source,
        phones.value[source]!.role,
        calls.filter((call) => call.phone !== phone),
      );
    }
    for (const call of ended.length ? ended : [{ phone, direction: 'in' as const }]) {
      rememberEnded(call);
    }
    // Leave any open popup so the operator can still act on it.
  }

  async function applyCallState(
    source: string,
    phoneRole: OperatorRole,
    calls: OperatorLiveCall[],
  ): Promise<void> {
    const previous = phones.value[source]?.calls ?? [];
    const live = calls.filter((call) => call.state !== 'ended');
    const listed = new Set(calls.map((call) => call.id));
    const fresh: OperatorLiveCall[] = [];
    setPhone(source, phoneRole, live);
    for (const call of calls) {
      rememberName(call.phone, call.customerName);
      const key = `${source}\n${call.id}`;
      const before = seenCalls.get(key);
      seenCalls.set(key, call.state);
      if (call.state === 'ended') {
        if (before !== 'ended') rememberEnded(call);
      } else if (before === undefined) {
        fresh.push(call);
      }
    }
    for (const call of previous) {
      if (listed.has(call.id)) continue;
      seenCalls.set(`${source}\n${call.id}`, 'ended');
      rememberEnded(call);
    }
    forgetOldCalls(new Set(calls.map((call) => `${source}\n${call.id}`)));
    if (banner.value?.source === source && !live.some((call) => call.id === banner.value?.callId)) {
      banner.value = null;
    }

    if (!uiAllowed()) return;
    for (const call of fresh) {
      const alert = callAlert(call, phoneRole, orderEntryActive());
      const notice: CallBanner = {
        source,
        callId: call.id,
        phone: call.phone,
        direction: call.direction,
        waiting: call.state === 'waiting',
        ...(call.customerName ? { name: call.customerName } : {}),
      };
      if (alert === 'banner') banner.value = notice;
      else if (alert === 'modal') await openPopup(call.phone, call.direction, notice);
    }
  }

  // `notice` (protocol 3) turns into the banner if order entry started meanwhile.
  async function openPopup(
    phone: string,
    direction: 'in' | 'out',
    notice?: CallBanner,
  ): Promise<void> {
    const generation = ++callGeneration;
    const { customer: found, openOrders } = await lookup(phone);
    const knownName = notice?.name;
    if (found?.name) {
      rememberName(phone, found.name);
      if (found.name !== knownName) {
        void window.operator?.customerName(phone, found.name).catch((cause: unknown) => {
          console.error('[operator] failed to save customer name:', cause);
        });
      }
    }
    if (generation !== callGeneration || !operatorMode.value || !read<string>('auth_token')) {
      return;
    }
    if (notice && orderEntryActive()) {
      banner.value = notice;
      return;
    }
    const customer = found ?? (knownName ? { name: knownName, phone } : null);
    popup.value = { phone, direction, customer, openOrders };
  }

  /* ---- customer lookup (cached, operator role only) ---- */

  async function fetchClient(phone: string): Promise<LookupResult | null> {
    try {
      const res = await api.get<{ data?: ClientLookupData }>(LOOKUP_ENDPOINT, {
        params: { phone },
        validateStatus: () => true,
      });
      if (res.status === 404) return NO_CUSTOMER;
      if (res.status !== 200) return null;
      const data = res.data?.data;
      const client = data?.client;
      if (!client?.id) return NO_CUSTOMER;
      return {
        customer: {
          id: client.id,
          ...(client.name ? { name: client.name } : {}),
          ...(client.phone ? { phone: client.phone } : {}),
          ...(client.is_staff !== undefined ? { is_staff: client.is_staff } : {}),
        },
        openOrders: openOrdersOf(data?.orders ?? []),
      };
    } catch (e) {
      console.error('[operator] lookup failed:', e);
      return null;
    }
  }

  async function lookup(phone: string): Promise<LookupResult> {
    const key = phoneKey(phone);
    if (key.length < 7) return NO_CUSTOMER;
    const now = Date.now();
    const cached = lookupCache.get(key);
    if (cached && now - cached.at < LOOKUP_TTL_MS) return (await cached.result) ?? NO_CUSTOMER;
    if (lookupCache.size > 100) {
      for (const [k, entry] of lookupCache) {
        if (now - entry.at >= LOOKUP_TTL_MS) lookupCache.delete(k);
      }
    }
    const entry = { at: now, result: fetchClient(normalizeUzPhone(phone) || key) };
    lookupCache.set(key, entry);
    const result = await entry.result;
    // Failures are not cached, so the next call retries.
    if (!result && lookupCache.get(key) === entry) lookupCache.delete(key);
    return result ?? NO_CUSTOMER;
  }

  /* ---- UI actions ---- */

  function dismissPopup(): void {
    popup.value = null;
  }

  function dismissBanner(): void {
    banner.value = null;
  }

  function openBanner(): void {
    const notice = banner.value;
    if (!notice) return;
    banner.value = null;
    void openPopup(notice.phone, notice.direction);
  }

  function setOrderDialogOpen(open: boolean): void {
    orderDialogOpen.value = open;
    if (open) recentCalls.value = pruneRecentCalls(recentCalls.value, Date.now());
  }

  // After a saved order: refresh the cached customer and tell the phones.
  function notifyOrderCreated(phone: string, orderId: number, name?: string): void {
    const key = phoneKey(phone);
    if (!key) return;
    lookupCache.delete(key);
    if (typeof window === 'undefined' || !window.operator?.orderCreated) return;
    void window.operator.orderCreated(phone, orderId).catch((cause: unknown) => {
      console.error('[operator] failed to report the order:', cause);
    });
    const clean = name?.trim();
    if (clean) {
      rememberName(phone, clean);
      void window.operator.customerName(phone, clean).catch((cause: unknown) => {
        console.error('[operator] failed to save customer name:', cause);
      });
    }
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
    banner,
    role,
    currentCalls,
    recentCalls,
    quickFillCalls,
    init,
    toggle,
    showPairing,
    hidePairing,
    onCallEvent,
    dismissPopup,
    dismissBanner,
    openBanner,
    setOrderDialogOpen,
    notifyOrderCreated,
    goToOrder,
    createOrder,
  };
});
