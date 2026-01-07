<template>
  <div class="kds-page">

    <!-- ORDERS -->
    <div v-if="orders.length > 0" class="orders-masonry">
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

      <div class="footer-right">
        <button type="button" class="btn secondary" @click="router.push({ name: 'orders' })">
          Buyurtmalar
        </button>

        <LogOutButton />
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { api } from 'src/boot/axios';
import { useRouter } from 'vue-router';
import OrderCard from 'src/components/OrderCard.vue';
import LogOutButton from 'src/components/LogOutButton.vue';

/* ================= TYPES ================= */

type OrderStatus = 'PREPARING' | 'READY';

interface OrderItem {
  id: number;
  product__name: string;
  quantity: number;
  description?: string | null;
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
  if (audioContext === null) return;
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.frequency.value = 880;
  oscillator.type = 'sine';

  gainNode.gain.setValueAtTime(0.4, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.25);
  console.log('audio');

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
        console.log('check');
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
  const response = await api.get<OrdersResponse>('/orders', {
    params: {
      status: currentMode.value,
    },
  });

  const newOrders = response.data.data.orders;

  if (currentMode.value === 'PREPARING') {
    checkForNewOrders(newOrders);
  }

  orders.value = newOrders;
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

function startPolling(): void {
  pollingInterval = window.setInterval(() => {
    void fetchOrders();
  }, 5000);
}

function stopPolling(): void {
  if (pollingInterval !== undefined) {
    clearInterval(pollingInterval);
    pollingInterval = undefined;
  }
}

/* ================= LIFECYCLE ================= */

onMounted(() => {
  initAudioContext();
});

function handleUserInteraction(): void {
  initAudioContext();
  document.removeEventListener('click', handleUserInteraction);
}

onMounted(() => {
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

<style scoped>
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
  gap: 6px;
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--kds-text-muted);
  font-size: 12px;
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
  overflow-y: scroll;
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

/* Laptop */
@media (max-width: 1400px) {
  .orders-masonry {
    column-count: 6;
  }
}

/* Tablet landscape */
@media (max-width: 1100px) {
  .orders-masonry {
    column-count: 5;
  }
}

/* Tablet / small screens */
@media (max-width: 800px) {
  .orders-masonry {
    column-count: 3;
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

  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: var(--text-muted);
}

.footer-right {
  display: flex;
  gap: 12px;
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
