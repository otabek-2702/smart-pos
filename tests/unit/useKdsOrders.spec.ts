import { describe, expect, it, vi } from 'vitest';

vi.mock('src/boot/axios', () => ({ api: {} }));

import { useKdsOrders, type KdsApiClient } from 'src/composables/useKdsOrders';
import type { KdsOrder } from 'src/types/kds';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const readyAt = '2026-09-15T07:05:00Z';
function order(overrides: Partial<KdsOrder> = {}): KdsOrder {
  return {
    id: 10, display_id: 5, status: 'PREPARING', order_type: 'HALL',
    created_at: '2026-09-15T07:00:00Z', updated_at: '2026-09-15T07:00:00Z', ready_at: null,
    cashier: { name: 'Chef' },
    items: [
      { id: 1, product__name: 'Chicken', product__id: 100, is_instant: false, quantity: 1, ready_at: null, detail: 'No sauce' },
      { id: 2, product__name: 'Fries', product__id: 101, is_instant: false, quantity: 2, ready_at: null },
    ],
    ...overrides,
  };
}

const response = (data: unknown) => ({ data: { success: true, data } });
const list = (...orders: KdsOrder[]) => response({ orders });

function setup() {
  const client = {
    get: vi.fn<KdsApiClient['get']>(),
    post: vi.fn<KdsApiClient['post']>(),
    patch: vi.fn<KdsApiClient['patch']>(),
  };
  const onLoaded = vi.fn();
  const state = useKdsOrders({ client, onLoaded });
  return { state, client, onLoaded };
}

describe('useKdsOrders', () => {
  it('loads authoritative item readiness without inventing missing state and retains ticket metadata', async () => {
    const { state, client, onLoaded } = setup();
    client.get.mockResolvedValue(list(order({
      source: 'telegram',
      items: [
        { id: 1, product__name: 'Chicken', quantity: 1, ready_at: readyAt, is_ready: false },
        { id: 2, product__name: 'Fries', quantity: 1, ready_at: null, is_ready: true },
        { id: 3, product__name: 'Soup', quantity: 1 },
      ],
    })));
    await state.refresh();
    expect(client.get).toHaveBeenCalledWith('/orders', { params: { statuses: 'PREPARING', per_page: 100, page: 1 } });
    expect(state.orders.value[0]?.items.map((item) => item.is_ready)).toEqual([true, false, undefined]);
    expect(state.orders.value[0]?.cashier?.name).toBe('Chef');
    expect(state.orders.value[0]?.source).toBe('telegram');
    expect(state.loaded.value).toBe(true);
    expect(state.loading.value).toBe(false);
    expect(onLoaded).toHaveBeenCalledWith(state.orders.value, 'PREPARING');
  });

  it('keeps the successful board on network and malformed refresh errors', async () => {
    const { state, client } = setup();
    client.get.mockResolvedValueOnce(list(order())).mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(response({ unexpected: [] }));
    await state.refresh();
    await state.refresh();
    expect(state.orders.value).toHaveLength(1);
    expect(state.error.value).toContain('yangilab');
    await state.refresh();
    expect(state.orders.value).toHaveLength(1);
    expect(state.loaded.value).toBe(true);
    expect(state.error.value).toContain('yangilab');
  });

  it('loads every orders page before publishing a complete board', async () => {
    const { state, client, onLoaded } = setup();
    const second = deferred<{ data: unknown }>();
    client.get.mockResolvedValueOnce(response({ orders: [order()], pagination: { has_next: true, total_pages: 2 } }))
      .mockReturnValueOnce(second.promise);
    const refreshing = state.refresh();
    await vi.waitFor(() => expect(client.get).toHaveBeenCalledTimes(2));
    expect(client.get).toHaveBeenLastCalledWith('/orders', { params: { statuses: 'PREPARING', per_page: 100, page: 2 } });
    expect(state.orders.value).toEqual([]);
    expect(onLoaded).not.toHaveBeenCalled();
    second.resolve(response({ orders: [order({ id: 20 })], pagination: { has_next: false, total_pages: 2 } }));
    await refreshing;
    expect(state.orders.value.map((entry) => entry.id)).toEqual([10, 20]);
    expect(onLoaded).toHaveBeenCalledTimes(1);
  });

  it('keeps the last complete board when a later page fails', async () => {
    const { state, client } = setup();
    client.get.mockResolvedValueOnce(list(order({ id: 50 })))
      .mockResolvedValueOnce(response({ orders: [order()], pagination: { total_pages: 2 } }))
      .mockRejectedValueOnce(new Error('second page offline'));
    await state.refresh();
    await state.refresh();
    expect(state.orders.value.map((entry) => entry.id)).toEqual([50]);
    expect(state.error.value).toContain('yangilab');
  });

  it('coalesces polls and SSE while a slow request is pending so the board still loads', async () => {
    const { state, client, onLoaded } = setup();
    const old = deferred<{ data: unknown }>();
    client.get.mockReturnValueOnce(old.promise);
    const first = state.refresh();
    const second = state.refresh();
    const third = state.refresh();
    expect(first).toBe(second);
    expect(second).toBe(third);
    expect(client.get).toHaveBeenCalledTimes(1);
    old.resolve(list(order({ id: 20 })));
    await Promise.all([first, second, third]);
    expect(state.orders.value[0]?.id).toBe(20);
    expect(state.error.value).toBe('');
    expect(onLoaded).toHaveBeenCalledTimes(1);
  });

  it('clears the old tab immediately and ignores the old tab response', async () => {
    const { state, client } = setup();
    const old = deferred<{ data: unknown }>();
    const ready = deferred<{ data: unknown }>();
    client.get.mockResolvedValueOnce(list(order())).mockReturnValueOnce(old.promise).mockReturnValueOnce(ready.promise);
    await state.refresh();
    const stale = state.refresh();
    const switching = state.switchMode('READY');
    expect(state.orders.value).toEqual([]);
    expect(state.loaded.value).toBe(false);
    old.resolve(list(order()));
    await stale;
    expect(state.orders.value).toEqual([]);
    ready.resolve(list(order({ id: 20, status: 'READY', ready_at: readyAt })));
    await switching;
    expect(state.orders.value[0]?.id).toBe(20);
  });

  it('uses item-ready endpoint, server timestamps, and locks item/bulk actions through reconciliation', async () => {
    const { state, client } = setup();
    const save = deferred<{ data: unknown }>();
    const reload = deferred<{ data: unknown }>();
    client.get.mockResolvedValueOnce(list(order())).mockReturnValueOnce(reload.promise);
    client.post.mockReturnValueOnce(save.promise);
    await state.refresh();
    const mutation = state.markItem(10, 1);
    await state.markItem(10, 1);
    await state.markReady(10);
    await state.refresh();
    expect(client.post).toHaveBeenCalledTimes(1);
    expect(client.post).toHaveBeenCalledWith('/orders/10/items/1/ready');
    expect(client.get).toHaveBeenCalledTimes(1);
    expect(state.orders.value[0]?.items[0]?.is_ready).toBe(false);
    save.resolve(response({
      item: { id: 1, ready_at: readyAt },
      order: { id: 10, status: 'PREPARING', ready_at: null },
      items_status: [{ id: 1, ready_at: readyAt, is_ready: true }, { id: 2, ready_at: null, is_ready: false }],
    }));
    await vi.waitFor(() => expect(client.get).toHaveBeenCalledTimes(2));
    expect(state.isBusy(10)).toBe(true);
    expect(state.orders.value[0]?.items[0]).toMatchObject({ ready_at: readyAt, is_ready: true, detail: 'No sauce', product__id: 100 });
    await state.markReady(10);
    expect(client.post).toHaveBeenCalledTimes(1);
    reload.resolve(list(order({ items: order().items.map((item) => item.id === 1 ? { ...item, ready_at: readyAt } : item) })));
    await mutation;
    expect(state.isBusy(10)).toBe(false);
  });

  it('invalidates a poll started before a mutation so stale readiness cannot overwrite the save', async () => {
    const { state, client } = setup();
    const old = deferred<{ data: unknown }>();
    const save = deferred<{ data: unknown }>();
    client.get.mockResolvedValueOnce(list(order())).mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce(list(order({ items: [{ id: 1, product__name: 'Chicken', quantity: 1, ready_at: readyAt }] })));
    client.post.mockReturnValueOnce(save.promise);
    await state.refresh();
    const stale = state.refresh();
    const mutation = state.markItem(10, 1);
    save.resolve(response({ item: { id: 1, ready_at: readyAt }, order: { status: 'PREPARING' } }));
    await mutation;
    old.resolve(list(order()));
    await stale;
    expect(state.orders.value[0]?.items[0]?.ready_at).toBe(readyAt);
  });

  it('toggles a ready item through unready and trusts the returned order status', async () => {
    const { state, client } = setup();
    const original = order({ items: [{ id: 1, product__name: 'Chicken', is_instant: false, quantity: 1, ready_at: readyAt }] });
    client.get.mockResolvedValueOnce(list(original)).mockResolvedValueOnce(list(order()));
    client.post.mockResolvedValue(response({ item_id: 1, order_status: 'PREPARING' }));
    await state.refresh();
    await state.markItem(10, 1);
    expect(client.post).toHaveBeenCalledWith('/orders/10/items/1/unready');
    expect(state.orders.value[0]?.items[0]?.is_ready).toBe(false);
  });

  it('blocks an item with unknown readiness and requests current server state', async () => {
    const { state, client } = setup();
    client.get.mockResolvedValue(list(order({ items: [{ id: 1, product__name: 'Chicken', quantity: 1 }] })));
    await state.refresh();
    await state.markItem(10, 1);
    expect(client.post).not.toHaveBeenCalled();
    expect(client.get).toHaveBeenCalledTimes(2);
    expect(state.errorFor(10)).toContain("noma'lum");
  });

  it('surfaces server save feedback and refetches without inventing a successful item state', async () => {
    const { state, client } = setup();
    client.get.mockResolvedValue(list(order()));
    client.post.mockRejectedValue({ response: { data: { message: 'Item is already marked as ready' } } });
    await state.refresh();
    await state.markItem(10, 1);
    expect(state.errorFor(10)).toContain('Item is already marked as ready');
    expect(state.error.value).toBe(state.errorFor(10));
    expect(state.orders.value[0]?.items[0]?.is_ready).toBe(false);
    expect(state.isBusy(10)).toBe(false);
    expect(client.get).toHaveBeenCalledTimes(2);
    await state.retryRefresh();
    expect(state.errorFor(10)).toBe('');
    expect(state.error.value).toBe('');
  });

  it('does not display server HTML or serialize error objects', async () => {
    const { state, client } = setup();
    client.get.mockRejectedValue({ response: { data: { detail: '<html>secret error</html>' } } });
    await state.refresh();
    expect(state.error.value).not.toContain('html');
    expect(state.error.value).not.toContain('secret');
  });

  it('uses bulk ready and refreshes after the server completes every item', async () => {
    const { state, client } = setup();
    client.get.mockResolvedValueOnce(list(order())).mockResolvedValueOnce(list());
    client.post.mockResolvedValue(response({ status: 'READY', ready_at: readyAt }));
    await state.refresh();
    await state.markReady(10);
    expect(client.post).toHaveBeenCalledWith('/orders/10/ready');
    expect(client.post).toHaveBeenCalledTimes(1);
    expect(client.patch).not.toHaveBeenCalled();
    expect(client.get).toHaveBeenCalledTimes(2);
    expect(state.orders.value).toEqual([]);
  });

  it('retains confirmed bulk item timestamps if the reconciliation GET fails', async () => {
    const { state, client } = setup();
    const earlierReady = '2026-09-15T07:02:00Z';
    client.get.mockResolvedValueOnce(list(order({ items: order().items.map((item) => item.id === 1 ? { ...item, ready_at: earlierReady } : item) })))
      .mockRejectedValueOnce(new Error('offline'));
    client.post.mockResolvedValue(response({ status: 'READY', ready_at: readyAt }));
    await state.refresh();
    await state.markReady(10);
    expect(state.orders.value[0]?.status).toBe('READY');
    expect(state.orders.value[0]?.items.map((item) => item.is_ready)).toEqual([true, true]);
    expect(state.orders.value[0]?.items.map((item) => item.ready_at)).toEqual([earlierReady, readyAt]);
    expect(state.error.value).toContain('yangilab');
  });

  it('reopens every ready item sequentially instead of patching only the order status', async () => {
    const { state, client } = setup();
    const first = deferred<{ data: unknown }>();
    const second = deferred<{ data: unknown }>();
    client.get.mockResolvedValueOnce(list(order({ status: 'READY', ready_at: readyAt, items: order().items.map((item) => ({ ...item, ready_at: readyAt })) })))
      .mockResolvedValueOnce(list());
    client.post.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    await state.switchMode('READY');
    const mutation = state.reopen(10);
    await vi.waitFor(() => expect(client.post).toHaveBeenCalledTimes(1));
    expect(client.post).toHaveBeenCalledTimes(1);
    expect(client.post).toHaveBeenNthCalledWith(1, '/orders/10/items/1/unready');
    first.resolve(response({ item_id: 1, order_status: 'PREPARING' }));
    await vi.waitFor(() => expect(client.post).toHaveBeenCalledTimes(2));
    expect(client.post).toHaveBeenNthCalledWith(2, '/orders/10/items/2/unready');
    expect(state.orders.value[0]?.items[0]?.ready_at).toBeNull();
    expect(state.orders.value[0]?.items[1]?.ready_at).toBe(readyAt);
    expect(state.isBusy(10)).toBe(true);
    second.resolve(response({ item_id: 2, order_status: 'PREPARING' }));
    await mutation;
    expect(client.patch).not.toHaveBeenCalled();
    expect(state.orders.value).toEqual([]);
    expect(state.isBusy(10)).toBe(false);
  });

  it('keeps confirmed partial reopen progress and reports a later failure', async () => {
    const { state, client } = setup();
    client.get.mockResolvedValueOnce(list(order({ status: 'READY', ready_at: readyAt, items: order().items.map((item) => ({ ...item, ready_at: readyAt })) })))
      .mockRejectedValueOnce(new Error('refresh offline'));
    client.post.mockResolvedValueOnce(response({ item_id: 1, order_status: 'PREPARING' }))
      .mockRejectedValueOnce({ response: { data: { message: 'Connection lost' } } });
    await state.switchMode('READY');
    await state.reopen(10);
    expect(state.orders.value[0]?.status).toBe('PREPARING');
    expect(state.orders.value[0]?.items.map((item) => item.is_ready)).toEqual([false, true]);
    expect(state.orders.value[0]?.ready_at).toBeNull();
    expect(state.errorFor(10)).toContain('Connection lost');
    expect(state.isBusy(10)).toBe(false);
  });

  it('falls back to status PATCH for a legacy READY ticket with no ready item timestamps', async () => {
    const { state, client } = setup();
    client.get.mockResolvedValueOnce(list(order({ status: 'READY', ready_at: readyAt }))).mockResolvedValueOnce(list());
    client.patch.mockResolvedValue(response({ status: 'PREPARING' }));
    await state.switchMode('READY');
    await state.reopen(10);
    expect(client.post).not.toHaveBeenCalled();
    expect(client.patch).toHaveBeenCalledWith('/orders/10/status', { status: 'PREPARING' });
  });

  it('does not treat unknown readiness as a legacy READY ticket that can be reopened by status alone', async () => {
    const { state, client } = setup();
    client.get.mockResolvedValue(list(order({ status: 'READY', items: [{ id: 1, product__name: 'Chicken', quantity: 1 }] })));
    await state.switchMode('READY');
    await state.reopen(10);
    expect(client.patch).not.toHaveBeenCalled();
    expect(client.post).not.toHaveBeenCalled();
    expect(state.errorFor(10)).toContain("noma'lum");
  });

  it('resolves every product before reopening and leaves instant drinks ready', async () => {
    const { state, client } = setup();
    const chicken = deferred<{ data: unknown }>();
    const drink = deferred<{ data: unknown }>();
    const original = order({ status: 'READY', ready_at: readyAt, items: [
      { id: 1, product__id: 100, product__name: 'Chicken', quantity: 1, ready_at: readyAt },
      { id: 2, product__id: 101, product__name: 'Tea', quantity: 1, ready_at: readyAt },
    ] });
    client.get.mockResolvedValueOnce(list(original)).mockReturnValueOnce(chicken.promise)
      .mockReturnValueOnce(drink.promise).mockResolvedValueOnce(list());
    client.post.mockResolvedValue(response({ item_id: 1, order_status: 'PREPARING' }));
    await state.switchMode('READY');
    const mutation = state.reopen(10);
    expect(client.get).toHaveBeenNthCalledWith(2, '/products/100');
    expect(client.get).toHaveBeenNthCalledWith(3, '/products/101');
    chicken.resolve(response({ product: { id: 100, is_instant: false } }));
    await vi.waitFor(() => expect(state.orders.value[0]?.items[0]?.is_instant).toBe(false));
    expect(client.post).not.toHaveBeenCalled();
    drink.resolve(response({ product: { id: 101, is_instant: true } }));
    await mutation;
    expect(client.post).toHaveBeenCalledTimes(1);
    expect(client.post).toHaveBeenCalledWith('/orders/10/items/1/unready');
    expect(client.patch).not.toHaveBeenCalled();
  });

  it('does not partially reopen when any product preflight fails', async () => {
    const { state, client } = setup();
    const original = order({ status: 'READY', items: [
      { id: 1, product__id: 100, product__name: 'Chicken', quantity: 1, ready_at: readyAt },
      { id: 2, product__id: 101, product__name: 'Tea', quantity: 1, ready_at: readyAt },
    ] });
    client.get.mockResolvedValueOnce(list(original))
      .mockResolvedValueOnce(response({ product: { is_instant: false } }))
      .mockRejectedValueOnce(new Error('product lookup offline'))
      .mockResolvedValueOnce(list(original));
    await state.switchMode('READY');
    await state.reopen(10);
    expect(client.post).not.toHaveBeenCalled();
    expect(client.patch).not.toHaveBeenCalled();
    expect(state.orders.value[0]?.items.every((item) => item.is_ready)).toBe(true);
    expect(state.errorFor(10)).toContain('saqlab');
  });

  it('rejects an undo without product identity instead of assuming it needs kitchen preparation', async () => {
    const { state, client } = setup();
    client.get.mockResolvedValue(list(order({ items: [
      { id: 1, product__name: 'Chicken', quantity: 1, ready_at: readyAt },
    ] })));
    await state.refresh();
    await state.markItem(10, 1);
    expect(client.post).not.toHaveBeenCalled();
    expect(state.errorFor(10)).toContain("ma'lumotlari yetarli emas");
  });

  it('blocks item undo for instant products and reuses the verified product metadata', async () => {
    const { state, client } = setup();
    const original = order({ items: [{ id: 1, product__id: 100, product__name: 'Tea', quantity: 1, ready_at: readyAt }] });
    client.get.mockResolvedValueOnce(list(original)).mockResolvedValueOnce(response({ product: { is_instant: true } }))
      .mockResolvedValue(list(original));
    await state.refresh();
    await state.markItem(10, 1);
    expect(client.post).not.toHaveBeenCalled();
    expect(state.orders.value[0]?.items[0]?.is_instant).toBe(true);
    expect(state.orders.value[0]?.items[0]?.ready_at).toBe(readyAt);
    expect(state.errorFor(10)).toContain('tayyorlashni talab qilmaydi');
    await state.markItem(10, 1);
    expect(client.get.mock.calls.filter(([url]) => url.startsWith('/products/'))).toHaveLength(1);
  });

  it('reconciles concurrent ticket mutations once both finish and holds each ticket lock', async () => {
    const { state, client } = setup();
    const first = deferred<{ data: unknown }>();
    const second = deferred<{ data: unknown }>();
    client.get.mockResolvedValueOnce(list(order(), order({ id: 20 }))).mockResolvedValueOnce(list());
    client.post.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    await state.refresh();
    const one = state.markReady(10);
    const two = state.markReady(20);
    first.resolve(response({ status: 'READY', ready_at: readyAt }));
    await one;
    expect(client.get).toHaveBeenCalledTimes(1);
    expect(state.isBusy(10)).toBe(true);
    expect(state.isBusy(20)).toBe(true);
    second.resolve(response({ status: 'READY', ready_at: readyAt }));
    await two;
    expect(client.get).toHaveBeenCalledTimes(2);
    expect(state.isBusy(10)).toBe(false);
    expect(state.isBusy(20)).toBe(false);
  });

  it('does not apply a mutation to the new tab and refreshes the selected mode afterward', async () => {
    const { state, client } = setup();
    const save = deferred<{ data: unknown }>();
    const ready = order({ status: 'READY', ready_at: readyAt });
    client.get.mockResolvedValueOnce(list(order())).mockResolvedValueOnce(list(ready));
    client.post.mockReturnValueOnce(save.promise);
    await state.refresh();
    const mutation = state.markReady(10);
    await state.switchMode('READY');
    expect(state.orders.value).toEqual([]);
    expect(client.get).toHaveBeenCalledTimes(1);
    save.resolve(response({ status: 'READY', ready_at: readyAt }));
    await mutation;
    expect(client.get).toHaveBeenLastCalledWith('/orders', { params: { statuses: 'READY', per_page: 100, page: 1 } });
    expect(state.orders.value[0]?.status).toBe('READY');
  });

  it('ignores late requests and stops further reopen requests after disposal', async () => {
    const { state, client, onLoaded } = setup();
    const first = deferred<{ data: unknown }>();
    client.get.mockResolvedValue(list(order({ status: 'READY', items: order().items.map((item) => ({ ...item, ready_at: readyAt })) })));
    client.post.mockReturnValue(first.promise);
    await state.switchMode('READY');
    const mutation = state.reopen(10);
    await vi.waitFor(() => expect(client.post).toHaveBeenCalledTimes(1));
    state.dispose();
    first.resolve(response({ item_id: 1, order_status: 'PREPARING' }));
    await mutation;
    await state.refresh();
    expect(client.post).toHaveBeenCalledTimes(1);
    expect(client.get).toHaveBeenCalledTimes(1);
    expect(onLoaded).toHaveBeenCalledTimes(1);
    expect(state.orders.value[0]?.items[0]?.is_ready).toBe(true);
    expect(state.loading.value).toBe(false);
  });
});
