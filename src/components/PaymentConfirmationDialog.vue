<template>
  <q-dialog v-model="isOpen" maximized @hide="onCancel">
    <div class="payment-card">
      <div class="dialog-header">
        <div class="dialog-title">#{{ displayId }} | {{ orderTypeLabel }}</div>
        <q-btn icon="close" flat round dense color="white" @click="onCancel" />
      </div>

      <div class="dialog-body">
        <div class="left-side">
          <!-- Order Description -->
          <div v-if="orderDescription" class="order-description">
            <div class="description-label">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <span>Izoh</span>
            </div>
            <p class="description-text">{{ orderDescription }}</p>
          </div>

          <!-- Order Items List -->
          <div class="section-label">Buyurtma tafsilotlari</div>
          <div v-if="items.length > 0" class="items-section">
            <div class="items-list">
              <div v-for="(item, index) in items" :key="index" class="item-row">
                <div class="item-info">
                  <span class="item-name">{{ item.name }}</span>
                  <span class="item-qty">× {{ item.quantity }}</span>
                </div>
                <span class="item-price">{{ formatPrice(item.price * item.quantity) }} so'm</span>
              </div>
            </div>
          </div>

          <!-- Order Summary -->
          <div class="order-summary">
            <div class="divider" />
            <div class="summary-row total">
              <span>Jami summa</span>
              <span class="value highlight">{{ formatPrice(totalAmount) }} so'm</span>
            </div>
          </div>
        </div>

        <div class="right-side">
          <!-- Cash Calculator Section -->
          <div class="cash-calculator">
            <div class="calc-header">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <rect x="2" y="6" width="20" height="12" rx="2" />
                <circle cx="12" cy="12" r="2" />
                <path d="M6 12h.01M18 12h.01" />
              </svg>
              <span>Qaytim summasini hisoblash</span>
            </div>

            <!-- Given Amount Input -->
            <div class="calc-field">
              <label class="calc-label">Berilgan summa</label>
              <div class="calc-input-wrapper">
                <q-icon
                  class="calc-input-clear"
                  @click="givenAmountInput = ''"
                  name="close"
                  size="25px"
                />
                <input name="calc-input" v-model="givenAmountView" class="calc-input" />
                <div class="after">000</div>
              </div>
            </div>

            <!-- Change Amount Display -->
            <div class="calc-field">
              <label class="calc-label">Qaytim summasi</label>
              <div class="calc-result" :class="{ negative: changeAmount < 0 }">
                <span class="change-value">{{ formatPrice(Math.abs(changeAmount)) }}</span>
                <span class="change-currency">so'm</span>
              </div>
            </div>

            <!-- Quick Amount Buttons -->
            <div class="quick-amounts">
              <button
                v-for="amount in quickAmounts"
                :key="amount"
                type="button"
                class="quick-btn"
                @click="setQuickAmount(amount)"
              >
                {{ formatQuickAmount(amount) }}
              </button>
            </div>

            <!-- Numeric Keypad -->
            <div class="numpad" v-if="virtualKeyboardEnabled">
              <button
                v-for="key in numpadKeys"
                :key="key"
                type="button"
                class="numpad-key"
                @click="onNumpadPress(key)"
              >
                {{ key }}
              </button>
              <button type="button" class="numpad-key" @click="onNumpadPress('0')">0</button>
              <button type="button" class="numpad-key clear" @click="onClear">C</button>
              <button type="button" class="numpad-key backspace" @click="onBackspace">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
                  <line x1="18" y1="9" x2="12" y2="15" />
                  <line x1="12" y1="9" x2="18" y2="15" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="dialog-actions">
        <button type="button" class="btn secondary" :disabled="payLoading" @click="onCancel">
          Keyinroq to'lash
        </button>
        <button
          type="button"
          class="btn primary"
          :disabled="payLoading || !orderId"
          @click="onConfirmPayment"
        >
          <span v-if="payLoading">Yuklanmoqda...</span>
          <span v-else>To'landi</span>
        </button>
      </div>
    </div>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api } from 'boot/axios';
import { formatPrice } from 'src/utils/formatPrice';
import { virtualKeyboardEnabled } from 'src/boot/virtual-keyboard';

type OrderType = 'HALL' | 'PICKUP' | 'DELIVERY';

interface ReceiptItem {
  productId: number;
  name: string;
  price: number;
  quantity: number;
}

interface Props {
  modelValue: boolean;
  orderId: number | null;
  displayId: number | null;
  orderType: OrderType;
  totalAmount: number;
  itemsCount: number;
  items: ReceiptItem[];
  navigateOnClose?: boolean;
  orderDescription: string;
}

const props = withDefaults(defineProps<Props>(), {
  navigateOnClose: true,
});

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  paid: [];
  cancel: [];
}>();

const router = useRouter();
const payLoading = ref(false);

// Cash calculator state
const givenAmountInput = ref<string>('');

const givenAmountView = computed<string>({
  get() {
    return formatPrice(givenAmountInput.value, true);
  },
  set(value: string) {
    // faqat raqamlarni qoldiramiz: "12 000" -> "12000"
    const cleaned = value.replace(/[^\d]/g, '');
    givenAmountInput.value = Number(cleaned) ? cleaned : '';
  },
});

const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
});

// Reset calculator when dialog opens
watch(isOpen, (newValue) => {
  if (newValue) {
    givenAmountInput.value = '';
  }
});

const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  HALL: 'Zal',
  PICKUP: 'S soboy',
  DELIVERY: 'Dostavka',
};

const orderTypeLabel = computed(() => ORDER_TYPE_LABELS[props.orderType] || props.orderType);

// Numpad keys
const numpadKeys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

// Quick amount buttons (in UZS - common denominations)
const quickAmounts = [10000, 20000, 50000, 100000, 200000];

// Given amount in UZS (input * 1000)
const givenAmount = computed<number>(() => {
  const inputValue = parseInt(givenAmountInput.value) || 0;
  return inputValue * 1000; // Convert to full amount (100 input = 100,000 UZS)
});

// Change amount calculation
const changeAmount = computed<number>(() => {
  return givenAmount.value - props.totalAmount;
});

// Format quick amount for button display
function formatQuickAmount(amount: number): string {
  if (amount >= 1000000) {
    return `${amount / 1000000}M`;
  }
  return `${amount / 1000}k`;
}

// Numpad input handler
function onNumpadPress(key: string): void {
  // Limit input length to prevent overflow
  if (givenAmountInput.value.length < 7) {
    givenAmountInput.value += key;
  }
}

// Clear input
function onClear(): void {
  givenAmountInput.value = '';
}

// Backspace
function onBackspace(): void {
  givenAmountInput.value = givenAmountInput.value.slice(0, -1);
}

// Set quick amount (divide by 1000 since we multiply by 1000 in givenAmount)
function setQuickAmount(amount: number): void {
  givenAmountInput.value = String(+givenAmountInput.value + amount / 1000);
}

async function onConfirmPayment(): Promise<void> {
  if (!props.orderId) {
    console.error('No order ID provided');
    return;
  }

  payLoading.value = true;

  try {
    await api.post(`/orders/${props.orderId}/pay`);

    emit('paid');
    isOpen.value = false;

    if (props.navigateOnClose) {
      void router.push({ name: 'orders' });
    }
  } catch (error) {
    console.error('Payment failed:', error);
    alert("To'lov amalga oshmadi");
  } finally {
    payLoading.value = false;
  }
}

function onCancel(): void {
  emit('cancel');
  isOpen.value = false;

  if (props.navigateOnClose) {
    void router.push({ name: 'orders' });
  }
}
</script>

<style scoped lang="scss">
.payment-card {
  background: var(--bg-surface);
  border-radius: 20px !important;
  height: 95vh;
  width: 90%;
  max-width: 900px;
  max-height: 100vh;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-md);
}

/* HEADER */
.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 24px;
  border-bottom: 1px solid var(--border-color);
}

.dialog-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

/* BODY */
.dialog-body {
  flex: 1;
  padding: 16px 24px;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  gap: 16px;
  .left-side {
    flex: 1;
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .right-side {
    flex: 1;
  }
}

/* ORDER DESCRIPTION */
.order-description {
  padding: 14px 16px;
  background: var(--bg-surface-2);
  border: 1px solid var(--border-color);
  border-radius: 12px;
}

.description-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  margin-bottom: 8px;

  svg {
    opacity: 0.6;
  }
}

.description-text {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-word;
}

/* ITEMS */
.items-section {
  flex: 1;
  overflow-y: scroll;
}

.section-label {
  font-size: 13px;
  color: var(--text-muted);
  margin-bottom: 10px;
  font-weight: 600;
}

.items-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  padding-right: 6px;
  scrollbar-width: thin;
  scrollbar-color: #cbd5e1 transparent;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 6px;
  }
}

.item-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--bg-surface-2);
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
}

.item-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.item-name {
  color: var(--text-primary);
  font-weight: 500;
  font-size: 14px;
}

.item-qty {
  color: var(--text-muted);
  font-size: 13px;
}

.item-price {
  color: var(--text-primary);
  font-weight: 500;
  font-size: 14px;
}

/* SUMMARY */

.summary-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: var(--text-muted);
  font-size: 15px;

  .value {
    color: var(--text-primary);
    font-weight: 500;
  }

  &.total {
    font-size: 18px;
    font-weight: 600;
    color: var(--text-primary);

    .highlight {
      color: var(--accent-primary);
      font-size: 22px;
    }
  }
}

.divider {
  height: 1px;
  background: var(--border-color);
  margin: 4px 0;
}

/* CASH CALCULATOR */
.cash-calculator {
  background: var(--bg-surface-2);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 16px;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.calc-header {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);

  svg {
    color: var(--accent-primary);
  }
}

.calc-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  position: relative;
}

.calc-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.calc-input-wrapper {
  width: 100%;
  position: relative;
}

.calc-input-clear {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
  cursor: pointer;
  padding: 5px;
  border-radius: 50%;

  &:active {
    transform: translateY(-50%) scale(0.96);
    color: var(--text-primary);
    background: var(--bg-surface-2);
  }
}

.calc-input-wrapper > .after {
  position: absolute;
  right: 16px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.calc-input {
  width: 100%;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 12px 60px 12px 16px;
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.calc-result {
  background: linear-gradient(135deg, #e7f5ee 0%, #d1fae5 100%);
  border: 1px solid #86efac;
  border-radius: 12px;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;

  &.negative {
    background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%);
    border-color: #fca5a5;

    .change-value {
      color: #dc2626;
    }
  }
}

.change-value {
  font-size: 22px;
  font-weight: 700;
  color: #16a34a;
  font-variant-numeric: tabular-nums;
}

.change-currency {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-muted);
}

/* QUICK AMOUNTS */
.quick-amounts {
  display: flex;
  gap: 8px;
}

.quick-btn {
  flex: 1;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: var(--bg-surface-2);
    border-color: var(--accent-primary);
  }

  &:active {
    transform: scale(0.97);
  }
}

/* NUMPAD */
.numpad {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  flex: 1;
}

.numpad-key {
  height: 56px;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  color: var(--text-primary);
  font-size: 20px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.1s ease;

  &:hover {
    background: var(--bg-surface-2);
  }

  &:active {
    transform: scale(0.97);
    background: var(--bg-surface-2);
  }

  &.clear {
    background: #fef3c7;
    border-color: #fcd34d;
    color: #d97706;

    &:hover {
      background: #fde68a;
    }
  }

  &.backspace {
    background: #fee2e2;
    border-color: #fca5a5;
    color: #dc2626;

    &:hover {
      background: #fecaca;
    }
  }
}

/* ACTIONS */
.dialog-actions {
  display: flex;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid var(--border-color);
}

.btn {
  flex: 1;
  height: 42px;
  border-radius: 12px;
  border: none;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: var(--shadow-sm);
  transition:
    transform 0.1s ease,
    box-shadow 0.1s ease,
    opacity 0.2s;

  &:active {
    transform: scale(0.97);
    box-shadow: none;
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    box-shadow: none;
  }
}

.btn.secondary {
  background: var(--btn-secondary-bg);
  color: var(--btn-secondary-text);
}

.btn.primary {
  background: var(--accent-primary);
  color: #ffffff;
}
</style>
