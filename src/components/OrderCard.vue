<template>
  <div class="order-card" :class="{ ready: order.status === 'READY' }">
    <!-- HEADER -->
    <div class="order-header">
      <div class="header-left">
        <span class="order-id">#{{ order.display_id }}</span>
        <span class="order-type">{{ orderTypeLabel }}</span>
      </div>

      <div class="timer" :class="timerClass">⏱ {{ formattedTime }}</div>
    </div>

    <!-- CASHIER -->
    <div class="cashier-row">
      Kassir: <strong>{{ order.cashier.name }}</strong>
    </div>

    <!-- ITEMS -->
    <div class="items-list">
      <div
        v-for="item in order.items"
        :key="item.id"
        class="item-row"
        :class="{ done: doneItems.has(item.id) }"
        @dblclick="markItemDone(item.id)"
      >
        <div class="item-main">
          <span class="item-name">{{ item.product__name }}</span>
          <span class="item-qty">×{{ item.quantity }}</span>
        </div>

        <div v-if="item.description" class="item-description">
          {{ item.description }}
        </div>

        <div v-if="doneItems.has(item.id)" class="done-check">✓</div>
      </div>
    </div>

    <!-- ACTIONS -->
    <div class="actions-row">
      <button
        v-if="order.status === 'PREPARING'"
        class="btn btn-primary"
        :disabled="isLoading"
        @click="handleMarkReady"
      >
        {{ isLoading ? 'YUKLANMOQDA...' : 'TAYYOR' }}
      </button>

      <button v-else class="btn btn-back" :disabled="isLoading" @click="handleBackToPreparing">
        ← JARAYONDA
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { api } from 'src/boot/axios';

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
  status: 'PREPARING' | 'READY';
  created_at: string;
  updated_at: string;
  cashier: Cashier;
  items: OrderItem[];
}

const props = defineProps<{
  order: Order;
}>();

const emit = defineEmits<{
  statusChanged: [];
}>();

const isLoading = ref<boolean>(false);

/* ================= ORDER TYPE LABEL ================= */

const orderTypeLabel = computed<string>(() => {
  const labels: Record<string, string> = {
    HALL: 'ZAL',
    PICKUP: 'S soboy',
    DELIVERY: 'Dostavka',
  };
  return labels[props.order.order_type] || props.order.order_type;
});

/* ================= TIMER ================= */

const currentTime = ref<number>(Date.now());
let timerInterval: number | undefined;

const createdAtTimestamp = computed<number>(() => {
  return new Date(props.order.created_at).getTime();
});

const updatedAtTimestamp = computed<number>(() => {
  return new Date(props.order.updated_at).getTime();
});

const elapsedSeconds = computed<number>(() => {
  if (props.order.status === 'READY') {
    const diff = updatedAtTimestamp.value - createdAtTimestamp.value;
    return Math.max(0, Math.floor(diff / 1000));
  }

  const diff = currentTime.value - createdAtTimestamp.value;
  return Math.max(0, Math.floor(diff / 1000));
});

const formattedTime = computed<string>(() => {
  const minutes = Math.floor(elapsedSeconds.value / 60);
  const seconds = elapsedSeconds.value % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
});

const timerClass = computed<string>(() => {
  if (elapsedSeconds.value > 480) return 'timer-late';
  if (elapsedSeconds.value > 300) return 'timer-warn';
  return 'timer-normal';
});

function startTimer(): void {
  stopTimer();
  timerInterval = window.setInterval(() => {
    currentTime.value = Date.now();
  }, 1000);
}

function stopTimer(): void {
  if (timerInterval !== undefined) {
    clearInterval(timerInterval);
    timerInterval = undefined;
  }
}

onMounted(() => {
  if (props.order.status === 'PREPARING') {
    startTimer();
  }
});

onUnmounted(() => {
  stopTimer();
});

watch(
  () => props.order.status,
  (status) => {
    if (status === 'PREPARING') {
      startTimer();
    } else {
      stopTimer();
    }
  },
);

/* ================= DOUBLE-CLICK DONE ================= */

const doneItems = ref<Set<number>>(new Set());

function markItemDone(itemId: number): void {
  if (props.order.status === 'READY') return;

  const newSet = new Set(doneItems.value);
  if (newSet.has(itemId)) {
    newSet.delete(itemId);
  } else {
    newSet.add(itemId);
  }
  doneItems.value = newSet;
}

const allItemsDone = computed<boolean>(() => {
  if (props.order.items.length === 0) return false;
  return props.order.items.every((item) => doneItems.value.has(item.id));
});

watch(allItemsDone, (isDone) => {
  if (isDone && props.order.status === 'PREPARING' && !isLoading.value) {
    void handleMarkReady();
  }
});

/* ================= STATUS ACTIONS ================= */

async function handleMarkReady(): Promise<void> {
  if (isLoading.value) return;

  isLoading.value = true;
  try {
    await api.post(`/orders/${props.order.id}/ready`);
    emit('statusChanged');
  } finally {
    isLoading.value = false;
  }
}

async function handleBackToPreparing(): Promise<void> {
  if (isLoading.value) return;

  isLoading.value = true;
  try {
    await api.patch(`/orders/${props.order.id}/status`, {
      status: 'PREPARING',
    });
    emit('statusChanged');
  } finally {
    isLoading.value = false;
  }
}
</script>

<style scoped>
.order-card {
  background: var(--kds-bg-card);
  border-radius: var(--kds-radius-md);
  box-shadow: var(--kds-shadow-sm);
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  box-sizing: border-box;
}

.order-card.ready {
  background: var(--kds-status-ready-bg);
}

/* HEADER */
.order-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.order-id {
  font-size: 20px;
  font-weight: 700;
  color: var(--kds-text-primary);
}

.order-type {
  font-size: 14px;
  font-weight: 600;
  color: var(--kds-text-muted);
  background: var(--kds-bg-app);
  padding: 3px 7px;
  border-radius: 4px;
  text-transform: uppercase;
}

/* TIMER */
.timer {
  font-size: 13px;
  font-weight: 600;
  color: var(--kds-text-muted);
}

.timer-warn {
  color: #d97706;
}

.timer-late {
  color: #dc2626;
}

/* CASHIER */
.cashier-row {
  font-size: 12px;
  color: var(--kds-text-muted);
}

.cashier-row strong {
  color: var(--kds-text-primary);
}

/* ITEMS */
.items-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
}

.item-row {
  position: relative;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--kds-item-bg);
  cursor: pointer;
  user-select: none;
  transition: background-color 0.15s ease;
}

.item-row:hover {
  background: var(--kds-item-hover);
}

/* DONE STATE - GREEN */
.item-row.done {
  background: var(--kds-item-done-bg);
}

.item-row.done .item-name,
.item-row.done .item-qty {
  color: var(--kds-item-done-text);
}

.done-check {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 16px;
  font-weight: 700;
  color: var(--kds-item-done-text);
}

.item-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-right: 24px;
}

.item-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--kds-text-primary);
}

.item-qty {
  font-size: 13px;
  font-weight: 600;
  color: var(--kds-text-muted);
}

.item-description {
  font-size: 11px;
  color: var(--kds-text-muted);
  margin-top: 2px;
  font-style: italic;
}

/* ACTIONS */
.actions-row {
  margin-top: auto;
  padding-top: 8px;
}

.btn {
  width: 100%;
  padding: 11px 14px;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition:
    transform 0.1s ease,
    opacity 0.15s ease;
}

.btn:active:not(:disabled) {
  transform: scale(0.97);
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-primary {
  background: var(--kds-btn-primary-bg);
  color: var(--kds-btn-primary-text);
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.92;
}

/* BACK BUTTON - warning style */
.btn-back {
  background: #fef3c7;
  color: #b45309;
  border: 1px solid #fcd34d;
}

.btn-back:hover:not(:disabled) {
  background: #fde68a;
}
</style>
