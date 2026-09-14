<template>
  <div class="order-card" :class="{ ready: order.status === 'READY' }">
    <!-- HEADER -->
    <div class="order-header">
        <span class="order-id">#{{ order.display_id }}</span>
        <span class="order-type">{{ orderTypeLabel }}</span>

    </div>
    
    <!-- CASHIER -->
    <div class="cashier-row">
      <div class="cashier-label">
        <strong>{{ order.cashier?.name ?? (isTelegramOrder ? 'Telegram buyurtma' : '—') }}</strong>
        <span v-if="isTelegramOrder" class="telegram-badge">
          <q-icon name="send" size="12px" aria-hidden="true" />
          Telegram
        </span>
      </div>
      <div class="timer" :class="timerClass">⏱ {{ formattedTime }}</div>
    </div>

    <div class="preparation-target">
      <span>{{ order.status === 'READY' ? 'Tayyorlanish me’yori' : 'Qolgan taomlar me’yori' }}</span>
      <strong>{{ targetLabel }}</strong>
    </div>

    <!-- ITEMS -->
    <div class="items-list">
      <div
        v-for="item in order.items"
        :key="item.id"
        class="item-row"
        :class="{ done: item.is_ready === true, busy }"
        @dblclick="toggleItem(item.id)"
      >
        <div class="item-main">
          <span class="item-name">{{ item.product__name }}</span>
          <span class="item-qty">×{{ item.quantity }}</span>
          <button
            type="button"
            class="item-ready-btn"
            :aria-pressed="item.is_ready === true"
            :aria-label="`${item.product__name}: ${item.is_ready ? 'jarayonga qaytarish' : 'tayyor deb belgilash'}`"
            :disabled="busy || item.is_ready == null || item.is_instant === true"
            @click.stop="toggleItem(item.id)"
            @dblclick.stop
          >
            <span aria-hidden="true">{{ item.is_ready ? '✓' : '○' }}</span>
          </button>
        </div>

        <div v-if="item.detail" class="item-description">
          {{ item.detail }}
        </div>

      </div>
    </div>

    <p v-if="error" class="action-error" role="alert">{{ error }}</p>

    <!-- ACTIONS -->
    <div class="actions-row">
      <button
        v-if="order.status === 'PREPARING'"
        class="btn btn-primary"
        type="button"
        :disabled="busy"
        @click="emit('ready')"
      >
        {{ busy ? 'YUKLANMOQDA...' : 'TAYYOR' }}
      </button>

      <button v-else type="button" class="btn btn-back" :disabled="busy" @click="emit('reopen')">
        {{ busy ? 'YUKLANMOQDA...' : '← JARAYONDA' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useOrderTypes } from 'src/composables/useOrderTypes';

import type { KdsOrder } from 'src/types/kds';
import { getKdsPreparation, formatPreparationElapsed, formatPreparationTarget } from 'src/utils/kdsPreparation';

const props = defineProps<{
  order: KdsOrder;
  busy: boolean;
  error?: string;
}>();

const emit = defineEmits<{
  itemReady: [itemId: number];
  ready: [];
  reopen: [];
}>();

function toggleItem(itemId: number): void {
  if (props.busy) return;
  const item = props.order.items.find((entry) => entry.id === itemId);
  if (item?.is_ready == null || item.is_instant === true) return;
  emit('itemReady', itemId);
}

/* ================= ORDER TYPE LABEL ================= */

const { labelFor } = useOrderTypes();
const orderTypeLabel = computed<string>(() => labelFor(props.order.order_type));

const isTelegramOrder = computed<boolean>(() => {
  if (props.order.is_telegram === true) return true;
  if (props.order.customer?.telegram_id != null) return true;

  const explicitSource = [
    props.order.source,
    props.order.order_source,
    props.order.channel,
    props.order.origin,
  ].find((value): value is string => typeof value === 'string' && value.length > 0);
  if (explicitSource?.toLowerCase().includes('telegram')) return true;

  // Customer-bot checkout provisions `tg-<chat id>@telegram.local`; when the
  // list endpoint includes `user`, this is the durable legacy signal.
  return /^tg-.+@telegram\.local$/i.test(props.order.user?.email ?? '');
});

/* ================= TIMER ================= */

const currentTime = ref<number>(Date.now());
let timerInterval: number | undefined;

const preparation = computed(() => getKdsPreparation(props.order, currentTime.value));
const formattedTime = computed(() => formatPreparationElapsed(preparation.value.elapsedSeconds));
const targetLabel = computed(() => formatPreparationTarget(preparation.value.target, 'daq'));
const timerClass = computed(() => ({
  'timer-on-time': preparation.value.tone === 'success',
  'timer-warn': preparation.value.tone === 'warning',
  'timer-late': preparation.value.tone === 'error',
}));

function startTimer(): void {
  stopTimer();
  currentTime.value = Date.now();
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

</script>

<style scoped>
.order-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  /* clip the full-bleed footer button to the rounded corners (no overflow:
     visible bleed at the bottom corners). */
  overflow: hidden;
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
  flex-wrap: wrap;
  gap: 6px;
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
  overflow-wrap: anywhere;
  font-size: 12px;
  font-weight: 700;
  color: var(--kds-pill-text);
  background: var(--kds-pill-bg);
  padding: 3px 9px;
  border-radius: var(--r-pill);
  text-transform: uppercase;
  letter-spacing: 0.2px;
}

/* TIMER */
.timer {
  flex: 0 0 auto;
  white-space: nowrap;
  font-size: 17px;
  font-weight: 600;
  color: var(--kds-text-muted);
  font-variant-numeric: tabular-nums;
}

.timer-warn {
  color: var(--kds-warning, var(--unpaid));
}

.timer-on-time {
  color: var(--kds-success, var(--ready));
}

.timer-late {
  color: var(--kds-error, var(--cancel));
}

/* CASHIER */
.cashier-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--kds-text-muted);
  padding-inline: 10px;
}

.cashier-label {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.cashier-row strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--kds-text-primary);
}

.telegram-badge {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  border-radius: var(--r-pill);
  padding: 2px 6px;
  color: #fff;
  background: #229ed9;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1px;
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
  color: var(--kds-text-muted);
  text-decoration: line-through;
}

.item-ready-btn {
  flex: 0 0 36px;
  width: 36px;
  height: 36px;
  border: 1px solid var(--line-strong);
  border-radius: var(--r-sm);
  background: var(--surface);
  color: var(--kds-text-muted);
  font-size: 22px;
  cursor: pointer;
}
.item-ready-btn[aria-pressed='true'] {
  color: var(--kds-success, var(--ready));
  background: var(--ready-bg);
}
.item-ready-btn:disabled { cursor: wait; opacity: 0.6; }
.item-ready-btn:focus-visible { outline-offset: 1px; }
.item-row.busy { cursor: wait; }

.preparation-target {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 4px 8px;
  padding-inline: 10px;
  font-size: 11px;
  color: var(--kds-text-muted);
}
.preparation-target strong { font-variant-numeric: tabular-nums; white-space: nowrap; }
.action-error {
  margin: 0;
  padding: 4px 10px;
  color: var(--kds-error, var(--cancel));
  font-size: 12px;
  overflow-wrap: anywhere;
}

.item-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.item-name {
  min-width: 0;
  flex: 1;
  overflow-wrap: anywhere;
  font-size: 15px;
  font-weight: 500;
  color: var(--kds-text-primary);
}

.item-qty {
  flex: 0 0 auto;
  font-variant-numeric: tabular-nums;
  font-size: 15px;
  font-weight: 600;
  color: var(--kds-text-primary);
}

.item-description {
  overflow-wrap: anywhere;
  padding-right: 44px;
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

/* BACK BUTTON - warning style. No own border: the full-bleed button would
   otherwise stack a 2nd line on actions-row's border-top and draw an inset
   orange rule down the card sides — the bg tint already reads as "back". */
.btn-back {
  background: var(--unpaid-bg);
  color: var(--kds-warning, var(--unpaid));
}

.btn-back:hover:not(:disabled) {
  background: color-mix(in srgb, var(--unpaid) 16%, var(--surface));
}
</style>
