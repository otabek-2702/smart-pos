import type {
  OrderReportRecord,
  ReportCashier,
  ReportEntityId,
  ReportOrderItem,
  ReportPaymentLine,
} from './report-types';

interface BackendPerson {
  id?: ReportEntityId | null;
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}

interface BackendOrderItem {
  id?: ReportEntityId | null;
  product?: {
    id?: ReportEntityId | null;
    name?: string | null;
    category?: string | { id?: ReportEntityId; name?: string } | null;
  } | null;
  product__id?: ReportEntityId | null;
  product__name?: string | null;
  product__category__id?: ReportEntityId | null;
  product__category__name?: string | null;
  quantity?: number | string | null;
  price?: number | string | null;
  unit_price?: number | string | null;
  line_total?: number | string | null;
  total_amount?: number | string | null;
  subtotal?: number | string | null;
}

interface BackendPayment {
  method?: string | null;
  payment_method?: string | null;
  amount?: number | string | null;
}

export interface BackendOrderSnapshot {
  id?: ReportEntityId | null;
  display_id?: ReportEntityId | null;
  order_number?: ReportEntityId | null;
  created_at?: string | null;
  updated_at?: string | null;
  paid_at?: string | null;
  status?: string | null;
  is_paid?: boolean | null;
  total_amount?: number | string | null;
  cashier?: BackendPerson | null;
  payment_cashier?: BackendPerson | null;
  user?: BackendPerson | null;
  creator?: BackendPerson | null;
  created_by?: BackendPerson | null;
  order_type?: string | null;
  items_count?: number | string | null;
  items?: BackendOrderItem[] | null;
  payment_method?: string | null;
  payments?: BackendPayment[] | null;
}

function requiredId(value: ReportEntityId | null | undefined, field: string): ReportEntityId {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  if (typeof value === 'string' && value.trim()) return value.trim();
  throw new Error(`${field} is missing`);
}

function optionalId(value: ReportEntityId | null | undefined): ReportEntityId | null {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

export function moneyToInteger(value: number | string | null | undefined, field: string): number {
  if (typeof value === 'number') {
    if (Number.isSafeInteger(value) && value >= 0) return value;
    throw new Error(`${field} must be an integer UZS amount`);
  }
  const clean = String(value ?? '').trim();
  if (!/^\d+(?:\.0+)?$/.test(clean)) {
    throw new Error(`${field} must be an integer UZS amount`);
  }
  const amount = Number(clean);
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new Error(`${field} is outside the safe UZS range`);
  }
  return amount;
}

function nonNegativeInteger(value: number | string | null | undefined, fallback = 0): number {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function timestamp(value: string | null | undefined, field: string): string {
  const parsed = new Date(value ?? '');
  if (!Number.isFinite(parsed.getTime())) throw new Error(`${field} is missing or invalid`);
  return parsed.toISOString();
}

function optionalTimestamp(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function person(value: BackendPerson | null | undefined): ReportCashier {
  const source = value ?? null;
  const fullName = [source?.first_name, source?.last_name].filter(Boolean).join(' ').trim();
  return {
    id: optionalId(source?.id),
    name: source?.name?.trim() || fullName || 'Noma’lum',
  };
}

function categoryName(category: unknown): string | null {
  if (typeof category === 'string') return category.trim() || null;
  if (category && typeof category === 'object' && 'name' in category) {
    const name = (category as { name?: unknown }).name;
    return typeof name === 'string' && name.trim() ? name.trim() : null;
  }
  return null;
}

function mapItem(item: BackendOrderItem, index: number): ReportOrderItem {
  const quantity = nonNegativeInteger(item.quantity);
  const unitPriceMinor = moneyToInteger(item.price ?? item.unit_price ?? 0, `items[${index}].price`);
  const explicitLine = item.line_total ?? item.total_amount ?? item.subtotal;
  const productId = item.product?.id ?? item.product__id;
  const productName = item.product?.name ?? item.product__name;
  const productCategory = item.product?.category ?? item.product__category__name;
  return {
    itemId: optionalId(item.id),
    productId: optionalId(productId),
    name: productName?.trim() || `Mahsulot ${index + 1}`,
    categoryName: categoryName(productCategory),
    quantity,
    unitPriceMinor,
    lineTotalMinor:
      explicitLine == null
        ? unitPriceMinor * quantity
        : moneyToInteger(explicitLine, `items[${index}].line_total`),
  };
}

function mapPayments(
  order: BackendOrderSnapshot,
  totalMinor: number,
): ReportPaymentLine[] {
  const payments = (order.payments ?? [])
    .map((payment, index): ReportPaymentLine | null => {
      const method = (payment.method ?? payment.payment_method ?? '').trim().toUpperCase();
      if (!method) return null;
      return {
        method,
        amountMinor: moneyToInteger(payment.amount ?? 0, `payments[${index}].amount`),
      };
    })
    .filter((payment): payment is ReportPaymentLine => payment !== null);

  if (payments.length === 0 && order.is_paid && order.payment_method?.trim()) {
    payments.push({
      method: order.payment_method.trim().toUpperCase(),
      amountMinor: totalMinor,
    });
  }
  return payments;
}

export function mapBackendOrder(
  order: BackendOrderSnapshot,
  existing?: OrderReportRecord | null,
): OrderReportRecord {
  const items =
    order.items == null
      ? existing?.items.map((item) => ({ ...item })) ?? []
      : order.items.map(mapItem);
  const totalMinor = moneyToInteger(
    order.total_amount ?? existing?.totalMinor,
    'total_amount',
  );
  const creatorSource = order.user ?? order.creator ?? order.created_by;
  const cashierSource = order.cashier ?? order.payment_cashier;
  const payments =
    order.payments == null && !order.payment_method
      ? existing?.payments.map((payment) => ({ ...payment })) ?? []
      : mapPayments(order, totalMinor);
  const createdAt =
    order.created_at == null && existing
      ? existing.createdAt
      : timestamp(order.created_at, 'created_at');

  return {
    orderId: requiredId(order.id ?? existing?.orderId, 'id'),
    displayId: requiredId(
      order.display_id ?? existing?.displayId ?? order.id,
      'display_id',
    ),
    orderNumber: optionalId(order.order_number) ?? existing?.orderNumber ?? null,
    createdAt,
    updatedAt:
      optionalTimestamp(order.updated_at) || existing?.updatedAt || createdAt,
    paidAt:
      order.paid_at === undefined
        ? existing?.paidAt ?? null
        : optionalTimestamp(order.paid_at),
    status: (order.status ?? existing?.status ?? 'UNKNOWN').trim().toUpperCase(),
    isPaid: order.is_paid ?? existing?.isPaid ?? false,
    totalMinor,
    creator:
      creatorSource == null && existing
        ? { ...existing.creator }
        : person(creatorSource),
    cashier:
      cashierSource == null && existing
        ? { ...existing.cashier }
        : person(cashierSource),
    orderType: (order.order_type ?? existing?.orderType ?? 'UNKNOWN')
      .trim()
      .toUpperCase(),
    itemCount:
      order.items == null
        ? nonNegativeInteger(order.items_count, existing?.itemCount ?? 0)
        : items.reduce((sum, item) => sum + item.quantity, 0),
    items,
    payments,
  };
}

export function unwrapBackendOrder(payload: unknown): BackendOrderSnapshot {
  if (!payload || typeof payload !== 'object') throw new Error('Backend returned no order');
  const envelope = payload as {
    data?: BackendOrderSnapshot | { order?: BackendOrderSnapshot };
    order?: BackendOrderSnapshot;
  };
  const data = envelope.data;
  const order =
    (data && typeof data === 'object' && 'order' in data ? data.order : data) ??
    envelope.order ??
    payload;
  if (!order || typeof order !== 'object') throw new Error('Backend returned no order');
  return order as BackendOrderSnapshot;
}

export function unwrapBackendOrders(payload: unknown): {
  orders: BackendOrderSnapshot[];
  hasNext: boolean | null;
} {
  if (!payload || typeof payload !== 'object') return { orders: [], hasNext: null };
  const data = (payload as { data?: unknown }).data;
  const container =
    data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const orders = Array.isArray(container.orders)
    ? (container.orders as BackendOrderSnapshot[])
    : [];
  const pagination =
    container.pagination && typeof container.pagination === 'object'
      ? (container.pagination as Record<string, unknown>)
      : null;
  const hasNext =
    typeof pagination?.has_next === 'boolean'
      ? pagination.has_next
      : typeof pagination?.current_page === 'number' &&
          typeof pagination?.total_pages === 'number'
        ? pagination.current_page < pagination.total_pages
        : null;
  return { orders, hasNext };
}
