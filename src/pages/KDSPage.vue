<template>
  <div class="kds-page">

    <!-- ORDERS -->
    <div
      v-if="orders.length > 0"
      class="orders-masonry"
      :style="colsPerRow ? { columnCount: colsPerRow } : undefined"
    >
      <div v-for="order in orders" :key="order.id" class="order-wrapper">
        <OrderCard :order="order" @status-changed="handleStatusChanged" />
      </div>
    </div>

    <!-- EMPTY -->
    <div v-else class="empty-state">
      <span class="empty-text">
        {{ currentMode === 'PREPARING' ? "Buyurtmalar yo'q" : "Tayyor buyurtmalar yo'q" }}
      </span>
    </div>

    <!-- FOOTER -->
    <footer class="page-footer">
      <div class="footer-left">
        <!-- Back to Orders — left corner, same spot as the Orders→kitchen
             button, so toggling between the two screens is one fixed tap. -->
        <button type="button" class="nav-btn" @click="router.push({ name: 'orders' })">
          <q-icon name="arrow_back" size="20px" />
          Ortga
        </button>

        <div class="kds-tabs">
          <button
            class="tab-btn"
            :class="{ active: currentMode === 'PREPARING' }"
            @click="switchMode('PREPARING')"
          >
            JARAYONDA
            <span v-if="currentMode === 'PREPARING' && orders.length > 0" class="tab-count">
              {{ orders.length }}
            </span>
          </button>

          <button
            class="tab-btn"
            :class="{ active: currentMode === 'READY' }"
            @click="switchMode('READY')"
          >
            TAYYOR
            <span v-if="currentMode === 'READY' && orders.length > 0" class="tab-count">
              {{ orders.length }}
            </span>
          </button>
        </div>
      </div>

      <div class="footer-center">
        <AppClock size="md" />
        <InternetStatusIcon :network="network" />
      </div>

      <div class="footer-right">
        <!-- Columns per row (chef picks; Avto = responsive) -->
        <div class="cols-ctl" role="group" aria-label="Ustunlar soni">
          <q-icon name="view_column" size="16px" />
          <button
            v-for="n in COL_OPTIONS"
            :key="n"
            type="button"
            class="cols-btn"
            :class="{ active: colsPerRow === n }"
            @click="setCols(n)"
          >
            {{ n }}
          </button>
          <button type="button" class="cols-btn" :class="{ active: colsPerRow === null }" @click="setCols(null)">
            Avto
          </button>
        </div>

        <!-- Mute the new-order beep -->
        <button
          type="button"
          class="mute-btn"
          :class="{ muted }"
          :aria-label="muted ? 'Ovozni yoqish' : 'Ovozni o\'chirish'"
          @click="toggleMute"
        >
          <q-icon :name="muted ? 'volume_off' : 'volume_up'" size="22px" />
        </button>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { api } from 'src/boot/axios';
import { useRouter } from 'vue-router';
import OrderCard from 'src/components/OrderCard.vue';
import AppClock from 'src/components/AppClock.vue';
import InternetStatusIcon from 'src/components/InternetStatusIcon.vue';
import { useNetworkStatus } from 'src/composables/useNetworkStatus';
import { useOrderStream } from 'src/composables/useOrderStream';
import { read, write } from 'src/utils/storage';

const network = useNetworkStatus();

/* Chef-chosen columns per row (overrides the responsive default). Persisted
   per-PC; null = automatic (responsive media queries). */
const KDS_COLS_KEY = 'pos:kdsCols';
const COL_OPTIONS = [2, 3, 4, 5, 6];
const colsPerRow = ref<number | null>(read<number>(KDS_COLS_KEY) ?? null);
function setCols(n: number | null): void {
  colsPerRow.value = n;
  void write(KDS_COLS_KEY, n);
}

/* Mute the new-order beep (persisted per-PC). */
const KDS_MUTED_KEY = 'pos:kdsMuted';
const muted = ref<boolean>(read<boolean>(KDS_MUTED_KEY) === true);
function toggleMute(): void {
  muted.value = !muted.value;
  void write(KDS_MUTED_KEY, muted.value);
}

/* ================= TYPES ================= */

type OrderStatus = 'PREPARING' | 'READY';

interface OrderItem {
  id: number;
  product__name: string;
  quantity: number;
  // Orders-list serializer sends the item note as `detail`.
  detail?: string | null;
}

interface Cashier {
  name: string;
}

interface Order {
  id: number;
  display_id: number;
  order_type: 'HALL' | 'PICKUP' | 'DELIVERY';
  status: OrderStatus;
  created_at: string;
  ready_at: string;
  updated_at: string;
  cashier: Cashier;
  items: OrderItem[];
}

interface OrdersResponse {
  data: {
    orders: Order[];
  };
}

/* ================= STATE ================= */

const router = useRouter();

const currentMode = ref<OrderStatus>('PREPARING');
const orders = ref<Order[]>([]);

/* new-order detection */
const previousOrderIds = ref<Set<number>>(new Set());
const isInitialLoad = ref(true);

/* polling */
let pollingInterval: number | undefined;

/* ================= SOUND (NEW ORDERS ONLY) ================= */

let audioContext: AudioContext | null = null;

function initAudioContext(): void {
  if (audioContext === null) {
    audioContext = new AudioContext();
  }
}

function playBeep(): void {
  if (muted.value) return;
  if (audioContext === null) return;
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.frequency.value = 880;
  oscillator.type = 'sine';

  gainNode.gain.setValueAtTime(0.4, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.25);

  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.25);
}

// function playDoubleBeep(): void {
//   playBeep()
//   setTimeout(() => {
//     playBeep()
//   }, 300)
// }

function checkForNewOrders(newOrders: Order[]): void {
  const newIds = new Set(newOrders.map((o) => o.id));
  if (!isInitialLoad.value) {
    for (const id of newIds) {
      if (!previousOrderIds.value.has(id)) {
        playBeep();
        break;
      }
    }
  }

  previousOrderIds.value = newIds;
  isInitialLoad.value = false;
}

/* ================= API ================= */

async function fetchOrders(): Promise<void> {
  // Called from a 3s poll AND on every SSE event — must never throw, or it
  // floods the kitchen display with unhandled rejections. On a transient
  // failure keep the current list rather than wiping the board.
  try {
    const response = await api.get<OrdersResponse>('/orders', {
      params: {
        statuses: currentMode.value,
        per_page: 100000
      },
    });

    const newOrders = response.data?.data?.orders ?? [];

    if (currentMode.value === 'PREPARING') {
      checkForNewOrders(newOrders);
    }

    orders.value = newOrders;
  } catch (e) {
    console.error('[KDS] fetchOrders failed:', e);
  }
}

function switchMode(newMode: OrderStatus): void {
  if (currentMode.value === newMode) return;

  currentMode.value = newMode;
  isInitialLoad.value = true;
  previousOrderIds.value = new Set();
  void fetchOrders();
}

function handleStatusChanged(): void {
  void fetchOrders();
}

/* ================= POLLING ================= */

// 3s to match the cashier OrdersPage cadence and the product spec — the
// kitchen needs new tickets to appear about as fast as the cashier sees them.
const POLL_INTERVAL_MS = 3000;

function startPolling(): void {
  pollingInterval = window.setInterval(() => {
    void fetchOrders();
  }, POLL_INTERVAL_MS);
}

function stopPolling(): void {
  if (pollingInterval !== undefined) {
    clearInterval(pollingInterval);
    pollingInterval = undefined;
  }
}

/* ================= LIFECYCLE ================= */

function handleUserInteraction(): void {
  initAudioContext();
  document.removeEventListener('click', handleUserInteraction);
}

// SSE makes new tickets appear immediately for the kitchen. Polling stays
// on as fallback (backend BE-3 spec) — either path triggers fetchOrders().
useOrderStream({
  onEvent: () => {
    void fetchOrders();
  },
});

onMounted(() => {
  initAudioContext();
  document.addEventListener('click', handleUserInteraction);
  void fetchOrders();
  startPolling();
});

onUnmounted(() => {
  stopPolling();
  document.removeEventListener('click', handleUserInteraction);

  if (audioContext !== null) {
    void audioContext.close();
  }
});
</script>

<style scoped lang="scss">
.kds-page {
  height: 100vh;
  background: var(--kds-bg-app);
  display: flex;
  flex-direction: column;
}

/* TABS */
.kds-tabs {
  display: flex;
  gap: 6px;
  background: var(--kds-bg-app);
  padding: 4px;
  border-radius: var(--kds-radius-md);
  box-shadow: var(--kds-shadow-sm);
}

.tab-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 44px;
  padding: 8px 18px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--kds-text-muted);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.tab-btn.active {
  background: var(--kds-btn-primary-bg);
  color: var(--kds-btn-primary-text);
}

.tab-count {
  background: rgba(255, 255, 255, 0.25);
  padding: 2px 7px;
  border-radius: 10px;
  font-size: 11px;
}

/* MASONRY */
.orders-masonry {
  flex: 1;
  overflow-y: auto;
  column-count: 6;
  column-gap: 12px;
  padding: 16px;
}


/* Large desktop */
@media (max-width: 1600px) {
  .orders-masonry {
    column-count: 5;
  }
}

/* Laptop — fewer columns as the screen narrows (was 6, a typo that put MORE
   columns at a smaller width than the 1600px rule). */
@media (max-width: 1400px) {
  .orders-masonry {
    column-count: 4;
  }
}

/* Tablet landscape */
@media (max-width: 1100px) {
  .orders-masonry {
    column-count: 3;
  }
}

/* Tablet / small screens */
@media (max-width: 800px) {
  .orders-masonry {
    column-count: 2;
  }
}

/* Mobile */
@media (max-width: 500px) {
  .orders-masonry {
    column-count: 1;
  }
}

.order-wrapper {
  break-inside: avoid;
  margin-bottom: 12px;
}

/* EMPTY */
.empty-state {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center ;
  padding: 80px 20px;
  color: var(--kds-text-muted);
}

/* FOOTER */
.page-footer {
  padding: 12px 16px;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);

  // Equal 1fr side columns + auto center: the left tabs and right buttons
  // each own half the width, so the clock stays dead-center and the footer
  // never shifts when the tab-count badge appears/disappears or you switch
  // pages.
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  font-size: 12px;
  color: var(--text-muted);
}

.footer-left {
  justify-self: start;
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.kds-tabs {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* back-to-orders / nav button (left corner) */
.nav-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 44px;
  padding: 0 16px;
  border-radius: var(--r-md);
  border: 1px solid var(--line-strong);
  background: var(--surface);
  color: var(--ink);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  &:active { transform: scale(0.97); }
}

.mute-btn {
  width: 44px;
  height: 44px;
  border-radius: var(--r-md);
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--ink-2);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  &.muted { color: var(--cancel); border-color: color-mix(in srgb, var(--cancel) 35%, var(--line)); }
  &:active { transform: scale(0.94); }
}

.footer-center {
  justify-self: center;
  display: flex;
  align-items: center;
  gap: 12px;
}

.footer-right {
  justify-self: end;
  display: flex;
  align-items: center;
  gap: 12px;
}

/* columns-per-row selector */
.cols-ctl {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface-2);
  color: var(--ink-3);
}
.cols-btn {
  min-width: 30px;
  height: 30px;
  padding: 0 8px;
  border: none;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--ink-2);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.cols-btn:hover { background: var(--surface-3); color: var(--ink); }
.cols-btn.active { background: var(--brand); color: #fff; }

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
