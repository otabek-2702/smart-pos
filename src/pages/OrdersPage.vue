<template>
  <q-page class="page-orders">
    <!-- Header -->
    <div class="header">
      <div class="left-side">
        <div class="title">Buyurtmalar</div>

        <div class="filters">
          <button
            v-for="s in STATUSES"
            :key="s.value"
            type="button"
            class="filter"
            :class="{ active: status === s.value }"
            @click="changeStatus(s.value)"
          >
            {{ s.label }}
          </button>
        </div>
      </div>
      <div class="right-side">
        <button type="button" class="create-button" @click="createOrder">
          + Buyurtma yaratish
        </button>
      </div>
    </div>

    <!-- Status filters -->

    <!-- Loading skeleton -->
    <div v-if="loading" class="orders-list">
      <q-skeleton v-for="n in 7" :key="n" type="rect" class="sk-row" />
    </div>

    <!-- Empty state -->
    <div v-else-if="orders.length === 0" class="empty-state">
      <q-icon name="receipt_long" size="48px" />
      <span>Buyurtmalar topilmadi</span>
    </div>

    <!-- Orders list -->
    <div v-else class="orders-list">
      <!-- sticky column header -->
      <div class="orders-head">
        <span>#</span>
        <span>Tur</span>
        <span>Mahsulot</span>
        <span>Izoh</span>
        <span class="ta-r">Telefon</span>
        <span class="ta-r">Summa</span>
        <span class="ta-r">Vaqt</span>
        <span class="ta-c">Holat</span>
      </div>
      <div
        v-for="order in orders"
        :key="order.id"
        class="order-row clickable"
        :class="{ paid: order.is_paid }"
        @click="onOrderClick(order)"
      >
        <div class="order-id">#{{ order.displayId }}</div>

        <div class="order-type">
          {{ getOrderTypeLabel(order.orderType) }}
        </div>

        <div class="order-meta">{{ order.itemsCount }} ta mahsulot</div>

        <div class="order-meta">{{ order.description }}</div>

        <div class="order-amount">
          {{ order.phone_number?.length > 4 ? formatPhoneNumber(order.phone_number) : '' }}
        </div>

        <div class="order-amount" :class="{ paid: order.is_paid }">
          {{ formatPrice(order.totalAmount) }} so'm
        </div>

        <div class="order-time">{{ order.time }}</div>

        <div class="order-status" :class="getStatusClass(order.status)">
          {{ getStatusLabel(order.status) }}
        </div>
      </div>
    </div>

    <!-- Payment Confirmation Dialog -->
    <PaymentConfirmationDialog
      v-model="showPaymentDialog"
      :order-id="selectedOrder?.id ?? null"
      :display-id="selectedOrder?.displayId ?? null"
      :order-type="selectedOrder?.orderType ?? 'HALL'"
      :total-amount="selectedOrder?.totalAmount ?? 0"
      :items-count="selectedOrder?.itemsCount ?? 0"
      :items="selectedOrderItems"
      :navigate-on-close="false"
      @paid="onOrderPaid"
      @cancel="onPaymentCancel"
      @cancelled="onOrderCancelled"
      :order-description="selectedOrder?.description ?? ''"
    />
    <OrderInfoDialog
      v-model="showInfoDialog"
      :display-id="selectedOrder?.displayId ?? null"
      :order-type="selectedOrder?.orderType ?? 'HALL'"
      :items="selectedOrderItems"
      :order-description="selectedOrder?.description || null"
      :total-amount="selectedOrder?.totalAmount ?? 0"
      :phone-number="selectedOrder?.phone_number ?? null"
    />

    <!-- Footer -->
    <footer class="page-footer">
      <div class="footer-left">
        <!-- Kitchen screen — left corner, same spot as the KDS "Buyurtmalar"
             back button, so toggling Orders↔kitchen is one fixed tap. -->
        <button type="button" class="btn primary" @click="router.push({ name: 'kds' })">
          <q-icon name="soup_kitchen" size="22px" />
          Oshxona
        </button>

        <LogOutButton />
      </div>

      <div class="footer-center">
        <AppClock size="md" />
        <InternetStatusIcon :network="network" />
      </div>

      <div class="footer-right">
        <button
          v-if="canSeeExpenses"
          type="button"
          class="btn secondary"
          @click="router.push({ name: 'expenses' })"
        >
          <q-icon name="payments" size="22px" />

          Xarajatlar
        </button>

        <AdminSettingsButton show-label />
      </div>
    </footer>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from 'boot/axios';
import PaymentConfirmationDialog from 'src/components/PaymentConfirmationDialog.vue';
import { formatPrice } from 'src/utils/formatPrice';
import OrderInfoDialog from 'src/components/OrderInfoDialog.vue';
import { formatPhoneNumber } from 'src/utils';
import LogOutButton from 'src/components/LogOutButton.vue';
import AdminSettingsButton from 'src/components/AdminSettingsButton.vue';
import AppClock from 'src/components/AppClock.vue';
import InternetStatusIcon from 'src/components/InternetStatusIcon.vue';
import { useNetworkStatus } from 'src/composables/useNetworkStatus';
import { useOrderStream } from 'src/composables/useOrderStream';
import { useOrderTypes } from 'src/composables/useOrderTypes';
import { hasPermission } from 'src/composables/usePermissions';

const network = useNetworkStatus();
const { labelFor } = useOrderTypes();

// Expenses are a manager tool — show the entry only to those who can manage them.
const canSeeExpenses = computed<boolean>(() => hasPermission('expenses.manage'));

type OrderType = 'HALL' | 'PICKUP' | 'DELIVERY';

interface ApiOrderItem {
  id: number;
  product: { id: number; category: string; name: string };
  quantity: number;
  price: string;
  description: string;
}

interface ApiOrder {
  id: number;
  display_id: number;
  order_type: OrderType;
  status: string;
  total_amount: string;
  items_count: number;
  created_at: string;
  items?: ApiOrderItem[];
  description: string;
  phone_number: string;
  is_paid: boolean;
}

interface OrdersResponse {
  success: boolean;
  data: {
    orders: ApiOrder[];
  };
}

interface OrderDetailResponse {
  success: boolean;
  data: ApiOrder;
}

interface Order {
  id: number;
  displayId: number;
  orderType: OrderType;
  status: string;
  totalAmount: number;
  itemsCount: number;
  time: string;
  description: string;
  phone_number: string;
  is_paid: boolean;
}

interface ReceiptItem {
  productId: number;
  name: string;
  price: number;
  quantity: number;
}

const router = useRouter();

const STATUSES: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'UNPAID', label: "To'lanmagan" },
  { value: 'PREPARING', label: 'Jarayonda' },
  { value: '', label: 'Hammasi' },
  { value: 'CANCELLED', label: 'Bekor qilingan' },
  // { value: 'PAID', label: "To'langan" },
];

const STATUS_LABELS: Record<string, string> = {
  PREPARING: 'Jarayonda',
  READY: 'Tayyor',
  CANCELLED: 'Bekor qilingan',
};

const status = ref<string>('UNPAID');
const orders = ref<Order[]>([]);
const loading = ref<boolean>(false);

const showInfoDialog = ref(false);

async function onOrderClick(order: Order): Promise<void> {
  const orderDetails = await fetchOrderDetails(order.id);
  if (!orderDetails) return;

  selectedOrder.value = order;
  selectedOrderItems.value = mapOrderItems(orderDetails.items || []);
  if (status.value === 'UNPAID') {
    showPaymentDialog.value = true;
  } else {
    showInfoDialog.value = true;
  }
}

// Payment dialog state
const showPaymentDialog = ref<boolean>(false);
const selectedOrder = ref<Order | null>(null);
const selectedOrderItems = ref<ReceiptItem[]>([]);

function getStatusLabel(orderStatus: string): string {
  return STATUS_LABELS[orderStatus] || orderStatus;
}

function getStatusClass(orderStatus: string): string {
  const statusLower = orderStatus.toLowerCase();
  if (statusLower === 'open') return 'open';
  if (statusLower === 'paid') return 'paid';
  if (statusLower === 'cancelled' || statusLower === 'cancel') return 'cancelled';
  return statusLower;
}

function getOrderTypeLabel(type: string): string {
  return labelFor(type);
}

function mapOrder(order: ApiOrder): Order {
  return {
    id: order.id,
    displayId: order.display_id,
    orderType: order.order_type || 'HALL',
    status: order.status,
    totalAmount: Number(order.total_amount) || 0,
    // The list endpoint sends items[] (no items_count) — derive from it; fall
    // back to items_count for any endpoint that does send it.
    itemsCount: order.items?.length ?? order.items_count ?? 0,
    time: new Date(order.created_at).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }),
    description: order.description,
    phone_number: order.phone_number,
    is_paid: order.is_paid,
  };
}

function mapOrderItems(items: ApiOrderItem[]): ReceiptItem[] {
  return items.map((item) => ({
    productId: item.product.id,
    name: item.product.name,
    price: Number(item.price) || 0,
    quantity: item.quantity,
  }));
}

async function fetchOrders(showSpinner = true): Promise<void> {
  if (showSpinner) loading.value = true;

  let params;
  if (status.value === 'UNPAID') {
    params = { payment_status: status.value };
  } else {
    params = { statuses: status.value };
  }

  try {
    const response = await api.get<OrdersResponse>('/orders', {
      params: { ...params, per_page: 100 },
    });

    const ordersData = response.data.data.orders || [];
    orders.value = ordersData.map(mapOrder);
  } catch (error) {
    console.error('Failed to fetch orders:', error);
    if (showSpinner) orders.value = [];
  } finally {
    if (showSpinner) loading.value = false;
  }
}

async function fetchOrderDetails(orderId: number): Promise<ApiOrder | null> {
  try {
    const response = await api.get<OrderDetailResponse>(`/orders/${orderId}`);
    // Backend wraps the detail as data:{ order:{...} }. Tolerate either shape
    // so the dialog's item list isn't silently empty.
    const data = response.data?.data as { order?: ApiOrder } & Partial<ApiOrder>;
    return (data?.order ?? (data as ApiOrder)) ?? null;
  } catch (error) {
    console.error('Failed to fetch order details:', error);
    return null;
  }
}

function changeStatus(s: string): void {
  status.value = s;
  void fetchOrders();
}

function createOrder(): void {
  void router.push({ name: 'create-order' });
}

function onOrderPaid(): void {
  void fetchOrders();
  resetSelection();
}

function onPaymentCancel(): void {
  resetSelection();
}

function onOrderCancelled(): void {
  void fetchOrders();
  resetSelection();
}

function resetSelection(): void {
  selectedOrder.value = null;
  selectedOrderItems.value = [];
}

/* ============
 * Polling
 * ============
 * Cashiers stare at this page constantly and need new orders / status
 * changes to show up without manual refresh. We poll every 3 seconds.
 * Suspended while a dialog is open so the list doesn't reshuffle under
 * the cashier's finger mid-payment. Background polls don't show a
 * spinner or clear the list on transient failure. */

const POLL_INTERVAL_MS = 3000;
let pollHandle: ReturnType<typeof setInterval> | null = null;

const dialogOpen = computed<boolean>(
  () => showPaymentDialog.value || showInfoDialog.value,
);

function startPolling(): void {
  if (pollHandle) return;
  pollHandle = setInterval(() => {
    if (dialogOpen.value) return;
    void fetchOrders(false);
  }, POLL_INTERVAL_MS);
}

function stopPolling(): void {
  if (pollHandle) {
    clearInterval(pollHandle);
    pollHandle = null;
  }
}

// SSE keeps the cashier list near-instantaneous. The poll remains as a
// fallback (per backend BE-3) and as a guard against missed events; we
// still respect dialog-open suspension so the list doesn't reshuffle
// while the cashier is taking payment.
useOrderStream({
  onEvent: () => {
    if (dialogOpen.value) return;
    void fetchOrders(false);
  },
});

onMounted(() => {
  void fetchOrders();
  startPolling();
});

onUnmounted(() => {
  stopPolling();
});
</script>

<style scoped lang="scss">
.page-orders {
  background: var(--bg-app);
  color: var(--text-primary);
  height: 100vh;
  display: flex;
  flex-direction: column;
}

/* Header */
.header {
  background: var(--bg-app);
  top: 0;
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  .right-side,
  .left-side {
    display: flex;
    align-items: center;
    gap: 15px;
  }
}

.title {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
}

/* Offline-mode badge — sits next to the page title */
.offline-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(245, 158, 11, 0.12);
  border: 1px solid rgba(245, 158, 11, 0.45);
  color: #f59e0b;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.3px;
  cursor: help;
}

.create-button {
  background: var(--accent-primary);
  border: none;
  border-radius: 12px;
  padding: 10px 16px;
  color: #ffffff;
  font-weight: 600;
  cursor: pointer;
  box-shadow: var(--shadow-sm);

  &:active {
    transform: scale(0.97);
  }
}

/* Filters — segmented control */
.filters {
  display: inline-flex;
  gap: 6px;
  background: var(--surface-2);
  padding: 5px;
  border-radius: var(--r-md);
  border: 1px solid var(--line);
}
.filter {
  height: 40px;
  padding: 0 18px;
  border: none;
  background: transparent;
  border-radius: var(--r-sm);
  color: var(--ink-2);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;

  &:hover { color: var(--ink); }

  &.active {
    color: var(--brand);
    background: var(--surface);
    box-shadow: var(--shadow-sm);
  }

  &:active { transform: scale(0.97); }
}

/* Loading & Empty */
.empty-state {
  color: var(--text-muted);
  text-align: center;
  padding: 40px;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
}
.sk-row { height: 56px; border-radius: 12px; }

/* Orders */
.orders-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: scroll;
  padding: 0 16px 10px 16px;
  flex: 1;
}

/* sticky column header */
.orders-head {
  position: sticky;
  top: 0;
  z-index: 2;
  display: grid;
  grid-template-columns: 70px 96px 110px minmax(0, 1fr) 150px 140px 64px 120px;
  column-gap: 14px;
  padding: 6px 16px 8px;
  background: var(--bg-app);
  font-size: 12px;
  font-weight: 700;
  color: var(--ink-3);
  text-transform: uppercase;
  letter-spacing: 0.3px;
  .ta-r { text-align: right; }
  .ta-c { text-align: center; }
}

.order-row {
  display: grid;
  grid-template-columns: 70px 96px 110px minmax(0, 1fr) 150px 140px 64px 120px;
  column-gap: 14px;
  /* neutral white rows; unpaid gets an amber left-stripe (SPEC §4) */
  background: var(--surface);
  border-radius: 12px;
  padding: 14px 16px;
  align-items: center;
  border: 1px solid var(--line);
  border-left: 3px solid var(--unpaid);
  box-shadow: var(--shadow-sm);
  transition: transform 0.1s ease;

  & > * {
    min-width: 0;
  }

  &.clickable {
    cursor: pointer;

    &:active {
      transform: scale(0.99);
    }
  }
  &.paid {
    background: var(--surface);
    border-left: 3px solid var(--line);
  }
}

.order-type,
.order-meta {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.order-id {
  font-weight: 600;
  color: var(--text-primary);
}

.order-type {
  color: var(--text-muted);
  font-size: 14px;
}

.order-meta {
  color: var(--text-muted);
}

.order-amount {
  text-align: right;
  font-weight: 700;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.order-amount.paid {
  color: var(--paid);
}

.order-time {
  text-align: right;
  color: var(--text-muted);
}

.order-description {
  color: var(--text-muted);
  padding-inline: 35px;
}

/* Status — chip pill */
.order-status {
  justify-self: center;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 28px;
  padding: 0 12px;
  border-radius: var(--r-pill);
  font-weight: 700;
  font-size: 12px;
  letter-spacing: 0.2px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.order-status.open {
  color: var(--unpaid);
  background: var(--unpaid-bg);
}

.order-status.paid,
.order-status.ready {
  color: var(--ready);
  background: var(--ready-bg);
}

.order-status.cancelled,
.order-status.cancel {
  color: var(--cancel);
  background: var(--cancel-bg);
}

.order-status.preparing {
  color: var(--prep);
  background: var(--prep-bg);
}

/* Footer */
.page-footer {
  position: relative; /* anchor for .footer-center */
  bottom: 0;
  left: 0;
  width: 100%;
  padding: 12px 16px;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-sm);
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: var(--text-muted);
}

.footer-left,
.footer-right {
  position: relative; /* above watermark */
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 15px;
}

/* Absolutely centered so left/right widths don't push the clock off-axis.
   Both left and right sides can grow without shifting the time. */
.footer-center {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  gap: 12px;
  z-index: 1;
}

.btn {
  height: 42px;
  border-radius: 14px;
  border: none;
  font-size: 15px;
  font-weight: 600;
  box-shadow: var(--shadow-sm);
  padding: 0 20px;

  &:active {
    transform: scale(0.97);
    box-shadow: none;
  }
}

.btn.secondary {
  background: var(--btn-secondary-bg);
  color: var(--btn-secondary-text);
}

.btn.primary {
  background: var(--brand);
  color: #fff;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
</style>
