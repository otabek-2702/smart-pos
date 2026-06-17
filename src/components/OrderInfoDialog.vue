<template>
  <Transition name="modal">
    <div v-if="modelValue" class="overlay" @click="close">
      <div class="dialog" @click.stop>
        <!-- HEADER -->
        <div class="header">
          <div class="header-content">
            <div class="title-section">
              <div class="meta">
                <span class="order-id">#{{ displayId }}</span>
                <!-- tap to change the order type (HALL/DELIVERY/PICKUP) -->
                <button
                  type="button"
                  :class="['order-type', 'order-type--btn', orderTypeLocal.toLowerCase()]"
                  :disabled="typeSaving || !orderId"
                  @click="showTypePicker = !showTypePicker"
                >
                  <span class="type-dot"></span>
                  {{ orderTypeLabel }}
                </button>
                <div v-if="showTypePicker" class="type-pop">
                  <button
                    v-for="t in orderTypeOptions"
                    :key="t.value"
                    type="button"
                    class="type-opt"
                    :class="{ active: t.value === orderTypeLocal }"
                    @click="changeOrderType(t.value)"
                  >
                    {{ t.label }}
                  </button>
                </div>
              </div>
            </div>
            <button class="close-btn" @click="close" aria-label="Yopish">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- ORDER DESCRIPTION -->
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
        </div>

        <!-- ITEMS -->
        <div class="items-container">
          <div class="items">
            <div v-for="(item, index) in items" :key="item.productId" class="item">
              <div class="item-index">{{ index + 1 }}</div>
              <div class="item-content">
                <div class="item-header">
                  <span class="name">{{ item.name }}</span>
                  <span class="qty">×{{ item.quantity }}</span>
                </div>

                <div v-if="item.description" class="item-description">
                  {{ item.description }}
                </div>
              </div>
            </div>

            <div v-if="!items.length" class="empty">
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
              >
                <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
              <span>Mahsulotlar yo'q</span>
            </div>
          </div>
          <!-- Order Summary -->
          <div class="order-summary">
            <div class="summary-row total">
              <span>Jami summa</span>
              <span class="value highlight">{{ formatPrice(totalAmount) }} so'm</span>
            </div>
          </div>
        </div>

        <!-- FOOTER -->
        <div class="footer">
          <button class="btn secondary" @click="close">Yopish</button>
          <button class="btn primary" :disabled="printing || !items.length" @click="printCheck">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"
              />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            {{ printing ? 'Chop etilmoqda...' : 'Chek chop etish' }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { api } from 'boot/axios';
import { formatPrice } from 'src/utils/formatPrice';
import { useOrderTypes } from 'src/composables/useOrderTypes';
import { read } from 'src/utils/storage';

interface ReceiptItem {
  productId: number;
  name: string;
  quantity: number;
  price?: number;
  description?: string | null;
}

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    orderId?: number | null;
    displayId: number | null;
    orderType: string;
    orderDescription?: string | null;
    items: ReceiptItem[];
    totalAmount: number;
    phoneNumber?: string | null;
    // Name of who CREATED the order — printed as the receipt's cashier.
    cashierName?: string | null;
  }>(),
  {
    modelValue: false,
    orderId: null,
    displayId: null,
    orderType: 'HALL',
    orderDescription: null,
    items: () => [],
    phoneNumber: null,
    cashierName: null,
  },
);

const printing = ref(false);

// Print the receipt — same payload/handler used when an order is created
// (CreateOrderPage.printReceipt → window.electron.printer.printReceipt).
async function printCheck(): Promise<void> {
  if (printing.value || !props.items.length) return;
  printing.value = true;
  try {
    // Prefer the order's creator (passed in); fall back to the logged-in user.
    const authUser = read<{ first_name: string; last_name: string }>('auth_user');
    const cashierName =
      props.cashierName ||
      (authUser ? `${authUser.first_name} ${authUser.last_name}` : 'Kassir');
    const printData = {
      displayId: props.displayId ?? 0,
      orderType: orderTypeLocal.value,
      cashierName,
      items: props.items.map((i) => ({ name: i.name, quantity: i.quantity, price: i.price ?? 0 })),
      total: props.totalAmount,
      description: props.orderDescription || undefined,
      phoneNumber: props.phoneNumber || undefined,
    };
    const result = await window.electron?.printer.printReceipt(printData);
    if (result && !result.success) console.error('Print failed:', result.error);
  } catch (e) {
    console.error('Print error:', e);
  } finally {
    printing.value = false;
  }
}

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'type-changed'): void;
}>();

function close(): void {
  emit('update:modelValue', false);
}

// computed (not a one-shot const): the dialog is reused across orders, so the
// label must track prop changes — otherwise it shows the previous order's type.
const { labelFor } = useOrderTypes();
// Local copy so a change shows immediately; re-synced when the prop changes.
const orderTypeLocal = ref<string>(props.orderType);
watch(
  () => props.orderType,
  (t) => {
    orderTypeLocal.value = t;
  },
);
watch(
  () => props.modelValue,
  (open) => {
    if (!open) showTypePicker.value = false;
  },
);
const orderTypeLabel = computed(() => labelFor(orderTypeLocal.value));
const orderTypeOptions = computed(() =>
  ['HALL', 'DELIVERY', 'PICKUP'].map((v) => ({ value: v, label: labelFor(v) })),
);
const showTypePicker = ref(false);
const typeSaving = ref(false);

// Change the order type (PATCH /orders/{id}/type) — exists on the backend.
async function changeOrderType(t: string): Promise<void> {
  showTypePicker.value = false;
  if (!props.orderId || typeSaving.value || t === orderTypeLocal.value) return;
  typeSaving.value = true;
  try {
    await api.patch(`/orders/${props.orderId}/type`, { order_type: t });
    orderTypeLocal.value = t;
    emit('type-changed');
  } catch (e) {
    console.error('Order type change failed:', e);
  } finally {
    typeSaving.value = false;
  }
}
</script>

<style scoped lang="scss">
/* TRANSITIONS */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;

  .dialog {
    transition:
      transform 0.2s ease,
      opacity 0.2s ease;
  }
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;

  .dialog {
    transform: scale(0.96);
    opacity: 0;
  }
}

/* OVERLAY */
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  padding: 24px;
}

/* DIALOG */
.dialog {
  width: 100%;
  max-width: 560px;
  height: calc(100vh - 48px);
  max-height: 800px;
  background: var(--bg-surface);
  border-radius: 24px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-md);
}

/* HEADER */
.header {
  padding: 24px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-surface);
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.title {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.meta {
  position: relative;
  margin-top: 10px;
  display: flex;
  align-items: center;
  gap: 14px;
  font-size: 14px;
}

.order-id {
  font-weight: 600;
  color: var(--accent-primary);
  background: var(--accent-soft);
  padding: 6px 12px;
  border-radius: 8px;
}

.order-type {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-muted);
  font-weight: 500;

  .type-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--text-muted);
  }

  &.delivery .type-dot {
    background: var(--accent-primary);
  }

  &.pickup .type-dot {
    background: var(--info);
  }

  &.hall .type-dot {
    background: var(--warning);
  }
}

/* tappable type chip + picker */
.order-type--btn {
  padding: 6px 12px;
  border-radius: var(--r-pill);
  border: 1px solid var(--border-color);
  background: var(--bg-surface-2);
  cursor: pointer;
  &:disabled {
    opacity: 0.6;
    cursor: default;
  }
  &:active:not(:disabled) {
    transform: scale(0.97);
  }
}
.type-pop {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 6px;
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px;
  min-width: 160px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  box-shadow: var(--shadow-lg);
}
.type-opt {
  text-align: left;
  padding: 10px 12px;
  border: none;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--text);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  &:hover {
    background: var(--surface-2);
  }
  &.active {
    background: var(--primary-weak);
    color: var(--primary);
  }
}

.close-btn {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-sm);

  &:active {
    transform: scale(0.95);
    box-shadow: none;
  }
}

/* ORDER DESCRIPTION */
.order-description {
  margin-top: 16px;
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
  color: var(--text-muted);
  margin-bottom: 8px;
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
.items-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.items-header {
  padding: 16px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.items-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted);
}

.items-count {
  font-size: 13px;
  color: var(--text-muted);
  background: var(--bg-surface-2);
  padding: 4px 10px;
  border-radius: 6px;
}

.items {
  flex: 1;
  margin-top: 15px;
  padding: 0 24px 24px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* ITEM */
.item {
  display: flex;
  gap: 14px;
  background: var(--bg-surface-2);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 8px 14px;
  box-shadow: var(--shadow-sm);
}

.item-index {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: var(--accent-soft);
  color: var(--accent-primary);
  font-size: 13px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
}

.item-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.qty {
  font-size: 15px;
  font-weight: 700;
  color: var(--accent-primary);
}

/* ITEM DESCRIPTION */
.item-description {
  margin-top: 8px;
  padding: 10px 12px;
  background: var(--bg-surface);
  border-radius: 10px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-muted);
  border-left: 3px solid var(--accent-primary);
}

/* EMPTY */
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 48px 24px;
  color: var(--text-muted);
}

/* SUMMARY */
.order-summary {
  padding: 12px 24px;
}

.summary-row.total {
  display: flex;
  justify-content: space-between;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);

  .highlight {
    color: var(--accent-primary);
    font-size: 22px;
  }
}

/* FOOTER */
.footer {
  padding: 20px 24px;
  border-top: 1px solid var(--border-color);
  display: flex;
  gap: 12px;
}

.btn {
  flex: 1;
  height: 42px;
  border-radius: 14px;
  border: none;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: var(--shadow-sm);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;

  &:active:not(:disabled) {
    transform: scale(0.97);
    box-shadow: none;
  }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
}

.btn.secondary {
  background: var(--btn-secondary-bg);
  color: var(--btn-secondary-text);
}

.btn.primary {
  background: var(--accent-primary);
  color: var(--on-primary);
}
</style>
