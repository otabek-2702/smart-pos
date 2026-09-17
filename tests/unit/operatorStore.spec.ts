import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { OperatorLiveCall } from 'src/types/operator';

const mocks = vi.hoisted(() => ({ get: vi.fn(), read: vi.fn(), qr: vi.fn() }));
vi.mock('src/boot/axios', () => ({ api: { get: mocks.get } }));
vi.mock('src/utils/storage', () => ({ read: mocks.read }));
vi.mock('qrcode', () => ({ default: { toDataURL: mocks.qr } }));

import { useOperatorStore } from 'src/stores/operator';

const NOT_FOUND = { status: 404, data: { success: false } };
function clientFound(name: string, orders: unknown[] = []) {
  return {
    status: 200,
    data: { data: { client: { id: 5, name, phone: '998901234567' }, orders } },
  };
}
function live(overrides: Partial<OperatorLiveCall>): OperatorLiveCall {
  return {
    id: 'c1',
    phone: '+998901234567',
    direction: 'in',
    state: 'ringing',
    since: 1_758_000_000_000,
    ...overrides,
  };
}

async function setup(enabled = true) {
  const state = { enabled, running: enabled, id: 'machine-one', name: 'Counter 1', error: null };
  const native = {
    status: vi.fn(() => Promise.resolve({ ...state })),
    start: vi.fn(() => Promise.resolve({ ...state, enabled: true, running: true })),
    stop: vi.fn(() => Promise.resolve({ ...state, enabled: false, running: false })),
    pairing: vi.fn(() =>
      Promise.resolve({
        version: 2,
        id: state.id,
        name: state.name,
        url: 'ws://192.168.1.2:8765?token=stable',
        discoveryPort: 8766,
      }),
    ),
    onState: vi.fn(),
    onCallEvent: vi.fn(),
    customerName: vi.fn(() => Promise.resolve()),
    orderCreated: vi.fn(() => Promise.resolve(true)),
  };
  vi.stubGlobal('window', { operator: native });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'users', component: {} },
      { path: '/pin', name: 'pin', component: {} },
      { path: '/orders', name: 'orders', component: {} },
      { path: '/create-order', name: 'create-order', component: {} },
    ],
  });
  await router.push('/orders');
  const store = useOperatorStore();
  store.init(router);
  await vi.waitFor(() => expect(store.busy).toBe(false));
  return { store, native, router };
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  mocks.read.mockReturnValue('logged-in-token');
  mocks.qr.mockResolvedValue('data:image/png;base64,qr');
  mocks.get.mockResolvedValue(NOT_FOUND);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('operator controls', () => {
  it('restores saved mode without showing a QR, and short toggles only save on/off', async () => {
    const { store, native } = await setup();
    expect(store.operatorMode).toBe(true);
    expect(store.qrVisible).toBe(false);
    await store.toggle();
    expect(native.stop).toHaveBeenCalledOnce();
    expect(store.operatorMode).toBe(false);
    await store.toggle();
    expect(native.start).toHaveBeenCalledOnce();
    expect(store.operatorMode).toBe(true);
    expect(native.pairing).not.toHaveBeenCalled();
    expect(mocks.qr).not.toHaveBeenCalled();
    expect(store.qrVisible).toBe(false);
  });

  it('opens the persistent machine QR separately, including when the saved mode is off', async () => {
    const { store, native } = await setup(false);
    await store.showPairing();
    expect(store.qrVisible).toBe(true);
    expect(store.operatorMode).toBe(false);
    expect(native.start).not.toHaveBeenCalled();
    expect(native.stop).not.toHaveBeenCalled();
    expect(JSON.parse(mocks.qr.mock.calls[0]![0] as string)).toMatchObject({
      version: 2,
      id: 'machine-one',
      discoveryPort: 8766,
    });
    store.hidePairing();
    await store.showPairing();
    expect(store.qrVisible).toBe(true);
  });

  it('keeps enabled mode through logout/login while dismissing calls and suppressing unauthenticated lookup', async () => {
    const { store, native, router } = await setup();
    await store.onCallEvent({ type: 'call_start', phone: '+998901234567', direction: 'in' });
    expect(store.popup).not.toBeNull();
    await router.push('/');
    mocks.read.mockReturnValue(null);
    expect(store.popup).toBeNull();
    expect(store.operatorMode).toBe(true);
    mocks.get.mockClear();
    await store.onCallEvent({ type: 'call_start', phone: '+998931112233', direction: 'in' });
    await store.onCallEvent({
      type: 'call_state',
      source: 'p1',
      role: 'operator',
      calls: [live({ id: 'x', phone: '+998941112233' })],
    });
    expect(mocks.get).not.toHaveBeenCalled();
    expect(store.popup).toBeNull();
    expect(store.banner).toBeNull();
    mocks.read.mockReturnValue('new-login-token');
    await router.push('/orders');
    expect(store.operatorMode).toBe(true);
    expect(native.stop).not.toHaveBeenCalled();
    expect(native.start).not.toHaveBeenCalled();
  });

  it('sends the resolved customer name to the phone on call start, before any final record', async () => {
    const { store, native } = await setup();
    mocks.get.mockResolvedValue(
      clientFound('Aziza', [
        { id: 3, display_id: 13, status: 'OPEN', is_paid: false, total_amount: '15000.00' },
        { id: 2, display_id: 12, status: 'READY', is_paid: true, total_amount: 20000 },
        { id: 1, display_id: 11, status: 'CANCELLED', is_paid: false, total_amount: 9000 },
        { id: 0, display_id: 10, status: 'READY', is_paid: false, total_amount: 7000 },
      ]),
    );
    await store.onCallEvent({ type: 'call_start', phone: '+998901234567', direction: 'in' });
    expect(native.customerName).toHaveBeenCalledWith('+998901234567', 'Aziza');
    expect(store.popup?.customer?.name).toBe('Aziza');
    expect(store.popup?.openOrders).toEqual([
      { id: 3, displayId: 13, status: 'OPEN', total: 15000 },
      { id: 0, displayId: 10, status: 'READY', total: 7000 },
    ]);
    // The per-number client endpoint replaces the 200-order download.
    expect(mocks.get).toHaveBeenCalledOnce();
    expect(mocks.get).toHaveBeenCalledWith('/clients/lookup', {
      params: { phone: '998901234567' },
      validateStatus: expect.any(Function),
    });
  });
});

describe('operator calls (protocol 2 and 3)', () => {
  it('caches a lookup per number for five minutes and never caches a failure', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { store } = await setup();
    const start = { type: 'call_start', phone: '+998901234567', direction: 'in' } as const;
    await store.onCallEvent(start);
    await store.onCallEvent({ ...start, phone: '0901234567' });
    expect(mocks.get).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 5 * 60_000 + 1);
    await store.onCallEvent(start);
    expect(mocks.get).toHaveBeenCalledTimes(2);

    mocks.get.mockResolvedValue({ status: 500, data: {} });
    await store.onCallEvent({ ...start, phone: '+998931112233' });
    await store.onCallEvent({ ...start, phone: '+998931112233' });
    expect(mocks.get).toHaveBeenCalledTimes(4);
    expect(store.popup).toMatchObject({ phone: '+998931112233', customer: null, openOrders: [] });
  });

  it('keeps the original direction in the popup after hang-up', async () => {
    const { store } = await setup();
    await store.onCallEvent({ type: 'call_start', phone: '+998901234567', direction: 'out' });
    expect(store.activeCall).toEqual({ phone: '+998901234567', direction: 'out' });
    await store.onCallEvent({ type: 'call_end', phone: '+998901234567' });
    expect(store.activeCall).toBeNull();
    expect(store.popup).toMatchObject({ phone: '+998901234567', direction: 'out' });
    expect(store.quickFillCalls).toMatchObject([{ digits: '901234567', state: 'ended' }]);
  });

  it('keeps the protocol 2 modal even while an order is being entered', async () => {
    const { store, router } = await setup();
    await router.push('/create-order');
    await store.onCallEvent({ type: 'call_start', phone: '+998901234567', direction: 'in' });
    expect(store.popup).not.toBeNull();
    expect(store.banner).toBeNull();
  });

  it('never shows the modal or looks up a customer for a cashier phone, but offers quick fill', async () => {
    const { store } = await setup();
    expect(store.role).toBe('operator');
    await store.onCallEvent({ type: 'phone_role', source: 'p1', role: 'cashier' });
    expect(store.role).toBe('cashier');
    await store.onCallEvent({
      type: 'call_state',
      source: 'p1',
      role: 'cashier',
      calls: [
        live({ id: 'a', state: 'active', customerName: 'Aziza' }),
        live({ id: 'r', phone: '+998931112233', state: 'ringing' }),
      ],
    });
    expect(store.popup).toBeNull();
    expect(store.banner).toBeNull();
    expect(mocks.get).not.toHaveBeenCalled();
    expect(store.quickFillCalls).toEqual([
      expect.objectContaining({ digits: '901234567', state: 'active', name: 'Aziza' }),
      expect.objectContaining({ digits: '931112233', state: 'ringing' }),
    ]);
    store.openBanner();
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('shows the operator modal only outside order entry and the banner otherwise', async () => {
    const { store, router } = await setup();
    const state = (calls: OperatorLiveCall[]) =>
      store.onCallEvent({ type: 'call_state', source: 'p1', role: 'operator', calls });

    await store.onCallEvent({ type: 'phone_role', source: 'p1', role: 'operator' });
    await state([live({ id: 'c1', state: 'ringing' })]);
    expect(store.popup).toMatchObject({ phone: '+998901234567', direction: 'in' });
    expect(store.banner).toBeNull();
    await state([live({ id: 'c1', state: 'active' })]);
    expect(mocks.get).toHaveBeenCalledOnce();
    store.dismissPopup();

    // A second caller waits behind the active call: banner only.
    await state([
      live({ id: 'c1', state: 'active' }),
      live({ id: 'c2', phone: '+998931112233', state: 'waiting', customerName: 'Bobur' }),
    ]);
    expect(store.popup).toBeNull();
    expect(store.banner).toMatchObject({ phone: '+998931112233', waiting: true, name: 'Bobur' });
    expect(store.currentCalls.map((call) => call.id)).toEqual(['c1', 'c2']);
    // Even when it later rings on its own it is not new, so still no modal.
    await state([live({ id: 'c2', phone: '+998931112233', state: 'active' })]);
    expect(store.popup).toBeNull();
    expect(mocks.get).toHaveBeenCalledOnce();

    // On the create-order page a new call is announced without blocking.
    await router.push('/create-order');
    await state([
      live({ id: 'c2', phone: '+998931112233', state: 'active' }),
      live({ id: 'c3', phone: '+998941112233', state: 'waiting' }),
    ]);
    await state([live({ id: 'c3', phone: '+998941112233', state: 'active' })]);
    await state([live({ id: 'c4', phone: '+998951112233', direction: 'out', state: 'active' })]);
    expect(store.popup).toBeNull();
    expect(store.banner).toMatchObject({ callId: 'c4', direction: 'out', waiting: false });
    expect(mocks.get).toHaveBeenCalledOnce();
    // The banner can be opened on request.
    store.openBanner();
    expect(store.banner).toBeNull();
    await vi.waitFor(() =>
      expect(store.popup).toMatchObject({ phone: '+998951112233', direction: 'out' }),
    );
    store.dismissPopup();

    // The order details panel counts as order entry on any page.
    await router.push('/orders');
    store.setOrderDialogOpen(true);
    await state([live({ id: 'c5', phone: '+998971112233' })]);
    expect(store.banner).toMatchObject({ callId: 'c5' });
    expect(store.popup).toBeNull();
    // The banner goes away with its call.
    await state([live({ id: 'c5', phone: '+998971112233', state: 'ended' })]);
    expect(store.banner).toBeNull();
    store.setOrderDialogOpen(false);
    store.dismissBanner();
    await state([live({ id: 'c6', phone: '+998981112233' })]);
    await vi.waitFor(() => expect(store.popup).toMatchObject({ phone: '+998981112233' }));
  });

  it('keeps recent calls once, for ten minutes, including calls of a disconnected phone', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { store } = await setup();
    const cashier = (calls: OperatorLiveCall[]) =>
      store.onCallEvent({ type: 'call_state', source: 'p1', role: 'cashier', calls });

    await cashier([live({ id: 'c1', state: 'active' })]);
    expect(store.currentCalls).toHaveLength(1);
    await cashier([live({ id: 'c1', state: 'ended' })]);
    expect(store.currentCalls).toHaveLength(0);
    expect(store.recentCalls).toHaveLength(1);
    const endedAt = store.recentCalls[0]!.endedAt;
    vi.setSystemTime(Date.now() + 60_000);
    // The phone repeats ended calls in every snapshot; they are not refreshed.
    await cashier([live({ id: 'c1', state: 'ended' }), live({ id: 'c2', phone: '0931112233' })]);
    expect(store.recentCalls).toHaveLength(1);
    expect(store.recentCalls[0]!.endedAt).toBe(endedAt);

    await store.onCallEvent({ type: 'phone_gone', source: 'p1' });
    expect(store.currentCalls).toHaveLength(0);
    expect(store.role).toBe('operator');
    expect(store.quickFillCalls.map((chip) => [chip.digits, chip.state])).toEqual([
      ['931112233', 'ended'],
      ['901234567', 'ended'],
    ]);

    vi.setSystemTime(Date.now() + 9.5 * 60_000);
    store.setOrderDialogOpen(true);
    expect(store.recentCalls.map((call) => call.key)).toEqual(['931112233']);
    vi.setSystemTime(Date.now() + 60_000);
    store.setOrderDialogOpen(true);
    expect(store.quickFillCalls).toEqual([]);
  });

  it('reports a saved order to the phones and refreshes that cached customer', async () => {
    const { store, native } = await setup();
    const start = { type: 'call_start', phone: '+998901234567', direction: 'in' } as const;
    await store.onCallEvent(start);
    expect(mocks.get).toHaveBeenCalledOnce();
    store.notifyOrderCreated('998901234567', 42, ' Aziza ');
    expect(native.orderCreated).toHaveBeenCalledWith('998901234567', 42);
    expect(native.customerName).toHaveBeenCalledWith('998901234567', 'Aziza');
    expect(store.quickFillCalls[0]).toMatchObject({ digits: '901234567', name: 'Aziza' });
    await store.onCallEvent(start);
    expect(mocks.get).toHaveBeenCalledTimes(2);

    native.customerName.mockClear();
    store.notifyOrderCreated('998931112233', 43);
    expect(native.orderCreated).toHaveBeenLastCalledWith('998931112233', 43);
    expect(native.customerName).not.toHaveBeenCalled();
  });

  it('forgets calls when operator mode is turned off', async () => {
    const { store } = await setup();
    await store.onCallEvent({
      type: 'call_state',
      source: 'p1',
      role: 'cashier',
      calls: [live({ state: 'active' })],
    });
    expect(store.quickFillCalls).toHaveLength(1);
    await store.toggle();
    expect(store.quickFillCalls).toEqual([]);
    expect(store.role).toBe('operator');
    await store.onCallEvent({
      type: 'call_state',
      source: 'p1',
      role: 'cashier',
      calls: [live({ state: 'active' })],
    });
    expect(store.quickFillCalls).toEqual([]);
  });
});
