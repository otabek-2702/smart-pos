<template>
  <div class="order-card" :class="{ ready: order.status === 'READY' }">
    <!-- HEADER -->
    <div class="order-header">
        <span class="order-id">#{{ order.display_id }}</span>
        <span class="order-type">{{ orderTypeLabel }}</span>

    </div>
    
    <!-- CASHIER -->
    <div class="cashier-row">
      <strong>{{ order.cashier?.name }}</strong>
      <div class="timer" :class="timerClass">⏱ {{ formattedTime }}</div>
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

        <div v-if="item.detail" class="item-description">
          {{ item.detail }}
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
import { useOrderTypes } from 'src/composables/useOrderTypes';

interface OrderItem {
  id: number;
  product__name: string;
  quantity: number;
  // The orders-list serializer sends the item note as `detail`.
  detail?: string | null;
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
  ready_at: string;
  updated_at: string;
  // List serializer sends `cashier`; `user` only exists on the detail endpoint.
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

const { labelFor } = useOrderTypes();
const orderTypeLabel = computed<string>(() => labelFor(props.order.order_type));

/* ================= TIMER ================= */

const currentTime = ref<number>(Date.now());
let timerInterval: number | undefined;

const createdAtTimestamp = computed<number>(() => {
  return new Date(props.order.created_at).getTime();
});

const readyAtTimestamp = computed<number>(() => {
  return new Date(props.order.ready_at).getTime();
});

const elapsedSeconds = computed<number>(() => {
  const created = createdAtTimestamp.value;
  if (!Number.isFinite(created)) return 0;

  // Only use ready_at when it's a valid date — a READY order with a missing/
  // bad ready_at would otherwise make the timer render "NaN:NaN".
  if (props.order.status === 'READY' && Number.isFinite(readyAtTimestamp.value)) {
    return Math.max(0, Math.floor((readyAtTimestamp.value - created) / 1000));
  }

  return Math.max(0, Math.floor((currentTime.value - created) / 1000));
});

const formattedTime = computed<string>(() => {
  const totalSeconds = elapsedSeconds.value;

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

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
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-sm);
  padding-block: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  box-sizing: border-box;
}

.order-card.ready {
  border-color: color-mix(in srgb, var(--brand) 40%, var(--line));
  background: var(--ready-bg);
}

/* HEADER */
.order-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-inline: 10px;
  border-bottom: 1px solid var(--line);
  padding-bottom: 5px;
}


.order-id {
  font-size: 20px;
  font-weight: 700;
  color: var(--kds-text-primary);
}

.order-type {
  font-size: 12px;
  font-weight: 700;
  color: var(--brand);
  background: var(--brand-soft);
  padding: 3px 9px;
  border-radius: var(--r-pill);
  text-transform: uppercase;
  letter-spacing: 0.2px;
}

/* TIMER */
.timer {
  font-size: 13px;
  font-weight: 600;
  color: var(--kds-text-muted);
  font-variant-numeric: tabular-nums;
}

.timer-warn {
  color: var(--unpaid);
}

.timer-late {
  color: var(--cancel);
}

/* CASHIER */
.cashier-row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--kds-text-muted);
  padding-inline: 10px;
}

.cashier-row strong {
  color: var(--kds-text-primary);
}

/* ITEMS */
.items-list {
  display: flex;
  flex-direction: column;
  flex: 1;
  padding-inline: 10px;
}

.item-row {
  position: relative;
  padding: 8px 6px;
  border-bottom: 1px dashed var(--line-strong);
  cursor: pointer;
  user-select: none;
  transition: background-color 0.15s ease;
}

.item-row:last-child {
  border-bottom: none;
}

.item-row:hover {
  background: var(--surface-2);
}

/* DONE STATE — check + strikethrough (no heavy fill) */
.item-row.done .item-name,
.item-row.done .item-qty {
  color: var(--ink-3);
  text-decoration: line-through;
}

.done-check {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 16px;
  font-weight: 700;
  color: var(--ready);
}

.item-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
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

/* ACTIONS — full-bleed footer: the button spans the whole card width and sits
   flush at the bottom edge (rounded bottom corners only), like the image. */
.actions-row {
  margin-top: auto;
  margin-bottom: -10px; /* cancel the card's bottom padding → flush to edge */
  border-top: 1px solid var(--line);
}

.btn {
  width: 100%;
  padding: 0 10px;
  height: 40px;
  border: none;
  border-radius: 0 0 var(--r-lg) var(--r-lg);
  font-size: 13px;
  font-weight: 700;
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
  background: var(--unpaid-bg);
  color: var(--unpaid);
  border: 1px solid color-mix(in srgb, var(--unpaid) 35%, transparent);
}

.btn-back:hover:not(:disabled) {
  background: color-mix(in srgb, var(--unpaid) 16%, var(--surface));
}
</style>
