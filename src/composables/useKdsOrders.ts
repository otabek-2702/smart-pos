import { computed, ref } from 'vue';
import { api } from 'src/boot/axios';
import type { KdsMode, KdsOrder, KdsOrderItem } from 'src/types/kds';

export interface KdsApiClient {
  get(url: string, config?: { params: Record<string, string | number> }): Promise<{ data: unknown }>;
  post(url: string): Promise<{ data: unknown }>;
  patch(url: string, data: { status: KdsMode }): Promise<{ data: unknown }>;
}

interface Options {
  client?: KdsApiClient;
  onLoaded?: (orders: KdsOrder[], mode: KdsMode) => void;
}

class KdsActionError extends Error {}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function payload(response: { data: unknown }): Record<string, unknown> {
  const envelope = record(response.data);
  if (envelope.success === false) throw new Error('Unsuccessful response');
  return record(envelope.data);
}

function normalizeItem(item: KdsOrderItem): KdsOrderItem {
  const ready = item.ready_at === null
    ? false
    : typeof item.ready_at === 'string' && item.ready_at.length > 0
      ? true
      : typeof item.is_ready === 'boolean' ? item.is_ready : undefined;
  return {
    ...item,
    product__name: item.product__name ?? item.product?.name ?? '',
    is_ready: ready,
  };
}

function errorMessage(cause: unknown, fallback: string): string {
  const body = record(record(record(cause).response).data);
  const message = typeof body.message === 'string' ? body.message : body.detail;
  // Only plain server feedback, never request headers, error objects, or HTML.
  return typeof message === 'string' && message.trim() && !/[<>]/.test(message)
    ? `${fallback} ${message.trim().slice(0, 240)}`
    : fallback;
}

/** Owns the authoritative KDS board. Polling and SSE both call refresh(). */
export function useKdsOrders(options: Options = {}) {
  const client = options.client ?? api;
  const orders = ref<KdsOrder[]>([]);
  const mode = ref<KdsMode>('PREPARING');
  const loading = ref(false);
  const loaded = ref(false);
  const loadError = ref('');
  const orderErrors = ref<Record<number, string>>({});
  const error = computed(() => loadError.value || Object.values(orderErrors.value)[0] || '');
  const busyOrderIds = ref(new Set<number>());
  const pending = new Set<number>();
  const completed = new Set<number>();
  const instantByProduct = new Map<number, boolean>();
  const productRequests = new Map<number, Promise<boolean>>();
  let disposed = false;
  let sequence = 0;
  let view = 0;
  let activeRequest: { sequence: number; promise: Promise<void> } | undefined;

  const isBusy = (orderId: number): boolean => busyOrderIds.value.has(orderId);
  const errorFor = (orderId: number): string => orderErrors.value[orderId] ?? '';

  function refresh(): Promise<void> {
    if (disposed || pending.size > 0) return Promise.resolve();
    // Polls/SSE share the active request. Invalidating it on every 3s tick
    // would starve the board whenever the server takes longer than 3s.
    if (activeRequest?.sequence === sequence) return activeRequest.promise;
    const request = ++sequence;
    const promise = fetchOrders(request);
    activeRequest = { sequence: request, promise };
    return promise;
  }

  async function fetchOrders(request: number): Promise<void> {
    const requestedMode = mode.value;
    loading.value = true;
    try {
      const next: KdsOrder[] = [];
      let page = 1;
      while (true) {
        const data = payload(await client.get('/orders', {
          params: { statuses: requestedMode, per_page: 100, page },
        }));
        if (disposed || sequence !== request) return;
        if (!Array.isArray(data.orders)) throw new Error('Missing orders');
        next.push(...(data.orders as KdsOrder[]).map((order) => {
          if (!Array.isArray(order.items)) throw new Error('Missing order items');
          return { ...order, items: order.items.map((item) => {
            const productId = item.product__id ?? item.product?.id;
            const instant = productId === undefined ? undefined : instantByProduct.get(productId);
            return normalizeItem({ ...item, ...(instant === undefined ? {} : { is_instant: instant }) });
          }) };
        }));
        const pagination = record(data.pagination);
        const hasNext = typeof pagination.has_next === 'boolean'
          ? pagination.has_next
          : typeof pagination.total_pages === 'number' && page < pagination.total_pages;
        if (!hasNext) break;
        if (data.orders.length === 0) throw new Error('Empty paginated response');
        ++page;
      }
      orders.value = next.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
      loaded.value = true;
      loadError.value = '';
      options.onLoaded?.(orders.value, requestedMode);
    } catch (cause) {
      if (disposed || sequence !== request) return;
      loadError.value = errorMessage(cause, "Buyurtmalarni yangilab bo'lmadi. Qayta urinib ko'ring.");
    } finally {
      if (activeRequest?.sequence === request) activeRequest = undefined;
      if (!disposed && sequence === request) {
        loading.value = false;
        // Keep completed tickets locked until the reconciliation request ends.
        // A new mutation invalidates this request and releases them on its refresh.
        for (const id of completed) busyOrderIds.value.delete(id);
        completed.clear();
      }
    }
  }

  async function switchMode(next: KdsMode): Promise<void> {
    if (disposed || mode.value === next) return;
    ++sequence;
    ++view;
    mode.value = next;
    orders.value = [];
    loaded.value = false;
    loading.value = false;
    loadError.value = '';
    await refresh();
  }

  function retryRefresh(): Promise<void> {
    orderErrors.value = {};
    loadError.value = '';
    return refresh();
  }

  async function isInstant(item: KdsOrderItem): Promise<boolean> {
    const explicit = item.is_instant ?? item.product?.is_instant;
    if (typeof explicit === 'boolean') return explicit;
    const productId = item.product__id ?? item.product?.id;
    if (typeof productId !== 'number' || !Number.isFinite(productId)) {
      throw new KdsActionError("Taom ma'lumotlari yetarli emas. Buyurtmalarni yangilang.");
    }
    const cached = instantByProduct.get(productId);
    if (cached !== undefined) return cached;
    const active = productRequests.get(productId);
    if (active) return active;
    const lookup = (async () => {
      try {
        const product = record(payload(await client.get(`/products/${productId}`)).product);
        if (typeof product.is_instant !== 'boolean') {
          throw new KdsActionError("Taom ma'lumotlari yetarli emas. Buyurtmalarni yangilang.");
        }
        instantByProduct.set(productId, product.is_instant);
        if (!disposed) {
          orders.value = orders.value.map((order) => ({
            ...order,
            items: order.items.map((current) =>
              (current.product__id ?? current.product?.id) === productId
                ? { ...current, is_instant: product.is_instant as boolean }
                : current),
          }));
        }
        return product.is_instant;
      } finally {
        productRequests.delete(productId);
      }
    })();
    productRequests.set(productId, lookup);
    return lookup;
  }

  function apply(orderId: number, startedView: number, data: Record<string, unknown>, bulk = false): void {
    if (disposed || view !== startedView) return;
    orders.value = orders.value.map((current) => {
      if (current.id !== orderId) return current;
      const order = record(data.order);
      const status = order.status ?? data.order_status ?? data.status;
      const readyAt = order.ready_at ?? data.ready_at;
      const statuses = Array.isArray(data.items_status)
        ? data.items_status as Partial<KdsOrderItem>[]
        : [];
      const item = record(data.item);
      return {
        ...current,
        ...(status === 'READY' || status === 'PREPARING' ? { status } : {}),
        ...(typeof readyAt === 'string' ? { ready_at: readyAt } : {}),
        ...(order.ready_at === null || status === 'PREPARING' ? { ready_at: null } : {}),
        items: current.items.map((currentItem) => {
          // Bulk ready confirms that every previously unready line was stamped
          // at this server timestamp. Keep already-completed line timestamps.
          if (bulk && status === 'READY' && typeof readyAt === 'string' && currentItem.is_ready !== true) {
            return { ...currentItem, ready_at: readyAt, is_ready: true };
          }
          const returned = statuses.find((entry) => entry.id === currentItem.id);
          if (returned) return normalizeItem({ ...currentItem, ...returned });
          if (data.item_id === currentItem.id) {
            return { ...currentItem, ready_at: null, is_ready: false };
          }
          if (item.id === currentItem.id && typeof item.ready_at === 'string') {
            return normalizeItem({ ...currentItem, ready_at: item.ready_at });
          }
          return currentItem;
        }),
      };
    });
  }

  async function mutate(orderId: number, action: (startedView: number) => Promise<void>): Promise<void> {
    if (disposed || isBusy(orderId)) return;
    const startedView = view;
    busyOrderIds.value.add(orderId);
    pending.add(orderId);
    ++sequence;
    loading.value = false;
    delete orderErrors.value[orderId];
    try {
      await action(startedView);
    } catch (cause) {
      if (!disposed) {
        orderErrors.value[orderId] = cause instanceof KdsActionError
          ? cause.message
          : errorMessage(cause, "Buyurtmani saqlab bo'lmadi. Qayta urinib ko'ring.");
      }
    } finally {
      pending.delete(orderId);
      if (!disposed) {
        ++sequence;
        completed.add(orderId);
        if (pending.size === 0) await refresh();
      }
    }
  }

  async function markItem(orderId: number, itemId: number): Promise<void> {
    const order = orders.value.find((entry) => entry.id === orderId);
    const item = order?.items.find((entry) => entry.id === itemId);
    if (!order || !item || disposed || isBusy(orderId)) return;
    if (item.is_ready === undefined) {
      orderErrors.value[orderId] = "Taomning tayyorlik holati noma'lum. Buyurtmalarni yangilang.";
      await refresh();
      return;
    }
    const endpoint = item.is_ready ? 'unready' : 'ready';
    await mutate(orderId, async (startedView) => {
      if ((item.is_ready && await isInstant(item)) || item.is_instant === true) {
        throw new KdsActionError('Bu mahsulot tayyorlashni talab qilmaydi.');
      }
      if (disposed) return;
      const data = payload(await client.post(`/orders/${orderId}/items/${itemId}/${endpoint}`));
      apply(orderId, startedView, data);
    });
  }

  async function markReady(orderId: number): Promise<void> {
    const order = orders.value.find((entry) => entry.id === orderId);
    if (!order || order.status !== 'PREPARING') return;
    await mutate(orderId, async (startedView) => {
      const data = payload(await client.post(`/orders/${orderId}/ready`));
      apply(orderId, startedView, data, true);
    });
  }

  async function reopen(orderId: number): Promise<void> {
    const order = orders.value.find((entry) => entry.id === orderId);
    if (!order) return;
    if (order.items.some((item) => item.is_ready === undefined)) {
      orderErrors.value[orderId] = "Taomning tayyorlik holati noma'lum. Buyurtmalarni yangilang.";
      await refresh();
      return;
    }
    const readyItems = order.items.filter((item) => item.is_ready === true);
    await mutate(orderId, async (startedView) => {
      // Resolve every target before the first write. Drinks and other instant
      // products must retain the readiness the backend assigned automatically.
      const instantFlags = await Promise.all(readyItems.map(isInstant));
      const kitchenItems = readyItems.filter((_item, index) => !instantFlags[index]);
      // PATCH status alone leaves item readiness intact. Undo every confirmed
      // ready line sequentially, retaining completed work if a later POST fails.
      for (const item of kitchenItems) {
        if (disposed) return;
        const data = payload(await client.post(`/orders/${orderId}/items/${item.id}/unready`));
        apply(orderId, startedView, data);
      }
      if (!disposed && readyItems.length === 0 && order.status === 'READY') {
        const data = payload(await client.patch(`/orders/${orderId}/status`, { status: 'PREPARING' }));
        apply(orderId, startedView, data);
      }
    });
  }

  function dispose(): void {
    disposed = true;
    ++sequence;
    ++view;
    loading.value = false;
    busyOrderIds.value.clear();
    completed.clear();
  }

  return {
    orders, mode, loading, loaded, error, busyOrderIds,
    isBusy, errorFor, refresh, retryRefresh, switchMode, markItem, markReady, reopen, dispose,
  };
}
