import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';

const mocks = vi.hoisted(() => ({ get: vi.fn(), read: vi.fn(), qr: vi.fn() }));
vi.mock('src/boot/axios', () => ({ api: { get: mocks.get } }));
vi.mock('src/utils/storage', () => ({ read: mocks.read }));
vi.mock('qrcode', () => ({ default: { toDataURL: mocks.qr } }));

import { useOperatorStore } from 'src/stores/operator';

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
  };
  vi.stubGlobal('window', { operator: native });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'users', component: {} },
      { path: '/pin', name: 'pin', component: {} },
      { path: '/orders', name: 'orders', component: {} },
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
  mocks.get.mockResolvedValue({ data: { data: { orders: [] } } });
});
afterEach(() => vi.unstubAllGlobals());

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
    await store.onCallEvent({ type: 'call_start', phone: '+998901234567', direction: 'in' });
    expect(mocks.get).not.toHaveBeenCalled();
    mocks.read.mockReturnValue('new-login-token');
    await router.push('/orders');
    expect(store.operatorMode).toBe(true);
    expect(native.stop).not.toHaveBeenCalled();
    expect(native.start).not.toHaveBeenCalled();
  });

  it('sends the resolved customer name to the phone on call start, before any final record', async () => {
    const { store, native } = await setup();
    mocks.get.mockResolvedValue({
      data: {
        data: {
          orders: [
            {
              id: 1,
              display_id: 1,
              status: 'READY',
              is_paid: true,
              total_amount: 20000,
              phone_number: '+998901234567',
              customer: { name: 'Aziza' },
            },
          ],
        },
      },
    });
    await store.onCallEvent({ type: 'call_start', phone: '+998901234567', direction: 'in' });
    expect(native.customerName).toHaveBeenCalledWith('+998901234567', 'Aziza');
    expect(store.popup?.customer?.name).toBe('Aziza');
  });
});
