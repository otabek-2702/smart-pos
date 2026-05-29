<template>
  <q-page class="page-orders">
    <!-- Header -->
    <div class="header">
      <div class="left-side">
        <div class="title">Buyurtmalar</div>

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
      <div class="right-side">
        <button type="button" class="create-button" @click="createOrder">
          + Buyurtma yaratish
        </button>
      </div>
    </div>

    <!-- Status filters -->

    <!-- Loading -->
    <div v-if="loading" class="loading">Yuklanmoqda…</div>

    <!-- Empty state -->
    <div v-else-if="orders.length === 0" class="empty-state">Buyurtmalar topilmadi</div>

    <!-- Orders list -->
    <div v-else class="orders-list">
      <div
        v-for="order in orders"
        :key="order.id"
        class="order-row"
        :class="{ clickable: order.status === 'UNPAID', paid: order.is_paid }"
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
      :order-description="selectedOrder?.description ?? ''"
    />
    <OrderInfoDialog
      v-model="showInfoDialog"
      :display-id="selectedOrder?.displayId ?? null"
      :order-type="selectedOrder?.orderType ?? 'HALL'"
      :items="selectedOrderItems"
      :order-description="selectedOrder?.description || null"
      :total-amount="selectedOrder?.totalAmount ?? 0"
    />

    <!-- Footer -->
    <footer class="page-footer">
      <div class="footer-left">
        <AdminSettingsButton show-label />
      </div>

      <!-- Center: clock + internet icon. Empty space here was wasted before;
           a live clock is the kind of glance-info cashiers want during a
           shift, and the internet icon sits next to it without stealing
           focus (only renders when offline). -->
      <div class="footer-center">
        <AppClock size="md" />
        <InternetStatusIcon :network="network" />
      </div>

      <div class="footer-right">
        <button type="button" class="btn secondary" @click="router.push({ name: 'kds' })">
          <q-icon name="monitor" size="22px" />

          Monitor
        </button>

        <LogOutButton />
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

const network = useNetworkStatus();

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
  // { value: 'PAID', label: "To'langan" },
  // { value: 'CANCELLED', label: 'Bekor qilingan' },
];

const STATUS_LABELS: Record<string, string> = {
  PREPARING: 'Jarayonda',
  READY: 'Tayyor',
};

const ORDER_TYPE_LABELS: Record<string, string> = {
  HALL: 'Zal',
  PICKUP: 'S soboy',
  DELIVERY: 'Dostavka',
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
  return ORDER_TYPE_LABELS[type] || type;
}

function mapOrder(order: ApiOrder): Order {
  return {
    id: order.id,
    displayId: order.display_id,
    orderType: order.order_type || 'HALL',
    status: order.status,
    totalAmount: Number(order.total_amount) || 0,
    itemsCount: order.items_count || 0,
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

    return response.data.data;
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
  font-size: 20px;
  font-weight: 600;
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

/* Filters */
.filter {
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 10px 16px;
  color: var(--text-muted);
  font-weight: 500;
  cursor: pointer;
  box-shadow: var(--shadow-sm);

  &.active {
    color: var(--accent-primary);
    background: var(--accent-soft);
    border-color: var(--accent-primary);
  }

  &:active {
    transform: scale(0.97);
  }
}

/* Loading & Empty */
.loading,
.empty-state {
  color: var(--text-muted);
  text-align: center;
  padding: 40px;
  flex: 1;
}

/* Orders */
.orders-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: scroll;
  padding: 0 16px 10px 16px;
  flex: 1;
}

.order-row {
  display: grid;
  grid-template-columns: 80px 100px 100px 1fr 140px 140px 80px 100px;
  background-color: var(--danger-bg);
  border-radius: 12px;
  padding: 14px 16px;
  align-items: center;
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-sm);
  transition: transform 0.1s ease;

  &.clickable {
    cursor: pointer;

    &:active {
      transform: scale(0.99);
    }
  }
  &.paid {
    background: var(--bg-surface);
  }
  // & > :nth-child(8) {
  //   grid-column: 1 / -1;
  // }
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
  font-weight: 600;
  color: var(--danger-text);
}

.order-amount.paid {
  color: var(--success-text);
}

.order-time {
  text-align: right;
  color: var(--text-muted);
}

.order-description {
  color: var(--text-muted);
  padding-inline: 35px;
}

/* Status */
.order-status {
  text-align: center;
  font-weight: 500;
  padding: 4px 5px;
  border-radius: 6px;
  font-size: 13px;
  margin: 0 10px;
}

.order-status.open {
  color: var(--accent-primary);
  background: var(--accent-soft);
}

.order-status.paid,
.order-status.ready {
  color: var(--success-text);
  background: #e6f4ea;
}

.order-status.cancelled,
.order-status.cancel {
  color: #c62828;
  background: #fdecea;
}

.order-status.preparing {
  color: #1565c0;
  background: #e3f2fd;
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
</style>
