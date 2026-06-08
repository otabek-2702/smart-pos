<template>
  <!-- Fullscreen payment screen. Split the check across methods (multiple
       lines, repeatable), with a manual percent discount AND/OR a promo code.
       Sends payments[] + discount_percent to the backend (BACKEND_TODO §2/§3);
       legacy payment_method kept for back-compat. Promo codes go through the
       existing /apply-discount endpoint. -->
  <Transition name="pay-fade">
    <div v-if="isOpen" class="pay" role="dialog" aria-modal="true">
      <div class="pay__panel">
        <!-- HEADER -->
        <div class="pay__head">
          <div class="pay__title">
            <span class="pay__hash">#{{ displayId ?? '—' }}</span>
            <span class="pay__type">{{ orderTypeLabel }}</span>
          </div>
          <button type="button" class="pay__close" aria-label="Yopish" @click="onCancel">
            <q-icon name="close" size="22px" />
          </button>
        </div>

        <div class="pay__body">
          <!-- LEFT: order summary + discount + total -->
          <section class="pay__summary">
            <div class="sum__items">
              <div v-for="(it, i) in items" :key="i" class="sum__row">
                <span class="sum__name">{{ it.name }}</span>
                <span class="sum__qty">×{{ it.quantity }}</span>
                <span class="sum__price">{{ formatPrice(it.price * it.quantity) }}</span>
              </div>
            </div>

            <!-- discount: manual percent + promo code, gated by policy -->
            <div class="sum__discount">
              <!-- cashier not allowed to discount at all -->
              <div v-if="discountMode === 'blocked'" class="disc-blocked">
                <q-icon name="lock" size="16px" /> Promokod uchun menejer ruxsati kerak
              </div>

              <!-- cashier allowed but must enter the PIN first -->
              <button
                v-else-if="discountMode === 'pin'"
                type="button"
                class="disc-unlock"
                @click="openPinPad"
              >
                <q-icon name="lock_open" size="18px" /> Promokod berish (PIN)
              </button>

              <!-- manager or unlocked -->
              <template v-else>
                <div class="disc-field">
                  <label class="disc-label">Promokod (%)</label>
                  <div class="disc-row">
                    <div class="disc-input-wrap">
                      <input
                        v-model="discountInput"
                        class="disc-input"
                        :class="{ 'has-clear': discountPercent > 0, active: activeDiscField === 'percent' }"
                        inputmode="numeric"
                        placeholder="0"
                        readonly
                        @click="activeDiscField = 'percent'"
                      />
                      <button
                        v-if="discountPercent > 0"
                        type="button"
                        class="disc-inclear"
                        aria-label="Tozalash"
                        @click="clearDiscount"
                      >
                        <q-icon name="close" size="15px" />
                      </button>
                    </div>
                    <button type="button" class="disc-quick" @click="set10Percent">10%</button>
                  </div>
                </div>

                <div class="disc-field">
                  <label class="disc-label">Promokod</label>
                  <div class="disc-row">
                    <input
                      v-model="promoInput"
                      class="disc-input disc-input--mono"
                      :class="{ active: activeDiscField === 'promo' }"
                      placeholder="PROMO2026"
                      readonly
                      :disabled="promoLoading || !!appliedPromo"
                      @click="appliedPromo ? null : (activeDiscField = 'promo')"
                    />
                    <button
                      v-if="!appliedPromo"
                      type="button"
                      class="disc-apply"
                      :disabled="promoLoading || !promoInput.trim()"
                      @click="applyPromo"
                    >
                      <q-spinner v-if="promoLoading" size="16px" />
                      <span v-else>Qo'llash</span>
                    </button>
                    <button v-else type="button" class="disc-clear" title="Olib tashlash" @click="removePromo">
                      <q-icon name="close" size="16px" />
                    </button>
                  </div>
                  <div v-if="appliedPromo" class="disc-applied">
                    <q-icon name="check_circle" size="14px" /> {{ appliedPromo }}
                  </div>
                  <div v-else-if="promoError" class="disc-error">{{ promoError }}</div>
                </div>
              </template>
            </div>

            <div class="sum__totals">
              <div v-if="discountPercent > 0 || baseTotal !== props.totalAmount" class="sum__orig">
                {{ formatPrice(props.totalAmount) }} so'm
                <span v-if="discountPercent > 0" class="sum__off">−{{ discountPercent }}%</span>
              </div>
              <div class="sum__total">{{ formatPrice(effectiveTotal) }} so'm</div>
            </div>
          </section>

          <!-- RIGHT: calculator -->
          <section class="pay__calc">
            <div class="calc__display">
              <span class="calc__display-val">{{ formatPrice(amountValue) }}</span>
              <span class="calc__display-cur">so'm</span>
            </div>
            
            <!-- payments list — grows to fill, so it rarely needs scrolling -->
            <div class="calc__list">
              <div v-if="payments.length === 0" class="pl__empty">
                Summani kiriting va to'lov turini tanlang
              </div>
              <div v-for="(p, i) in payments" :key="i" class="pl__row">
                <span class="pl__method" :style="{ color: methodColor(p.method) }">
                  {{ methodLabel(p.method) }}
                </span>
                <span class="pl__amount">{{ formatPrice(p.amount) }}</span>
                <button type="button" class="pl__remove" @click="removePayment(i)">
                  <q-icon name="close" size="16px" />
                </button>
              </div>
            </div>
            
            <div class="calc__methods" :class="{ 'calc__methods--vertical': paymentPrefs.methodsLayout === 'vertical' }">
              <button
                v-for="m in methods"
                :key="m.code"
                type="button"
                class="pm-btn"
                :style="{ '--pm': m.color }"
                @click="addPayment(m.code)"
              >
                <span class="pm-btn__icon" v-html="m.icon"></span>
                <span class="pm-btn__label">{{ m.label }}</span>
              </button>
            </div>


            <div class="calc__status">
              <template v-if="remaining > 0">
                <span class="calc__status-label">Qoldi</span>
                <span class="calc__status-val is-due">{{ formatPrice(remaining) }} so'm</span>
              </template>
              <template v-else-if="changeDue > 0">
                <span class="calc__status-label">Qaytim</span>
                <span class="calc__status-val is-change">{{ formatPrice(changeDue) }} so'm</span>
              </template>
              <template v-else-if="effectiveTotal > 0 || payments.length > 0">
                <span class="calc__status-val is-ok"><q-icon name="check_circle" size="18px" /> To'liq to'landi</span>
              </template>
            </div>

            <div class="calc__pad">
              <button v-for="k in numpadKeys" :key="k" type="button" class="pad-key" @click="onNumpadPress(k)">
                {{ k }}
              </button>
              <button type="button" class="pad-key pad-key--muted" @click="onClear">C</button>
              <button type="button" class="pad-key" @click="onNumpadPress('0')">0</button>
              <button type="button" class="pad-key pad-key--muted" @click="onBackspace">⌫</button>
            </div>

            <div class="calc__quick">
              <button v-for="q in quickAmounts" :key="q" type="button" class="quick-btn" @click="addQuick(q)">
                +{{ formatQuickAmount(q) }}
              </button>
              <button type="button" class="quick-btn quick-btn--max" @click="onMax">MAX</button>
              <button
                type="button"
                class="quick-btn quick-btn--reset"
                :disabled="payments.length === 0 && amountValue === 0"
                @click="resetPayments"
              >
                <q-icon name="restart_alt" size="16px" /> Tozalash
              </button>
            </div>
          </section>
        </div>

        <!-- FOOTER (slim) -->
        <div class="pay__foot">
          <button
            type="button"
            class="btn danger"
            :disabled="payLoading || cancelLoading || !orderId"
            @click="onCancelOrder"
          >
            <span v-if="cancelLoading">Bekor qilinmoqda...</span>
            <span v-else>Bekor qilish</span>
          </button>
          <div class="foot-right">
            <button type="button" class="btn secondary" :disabled="payLoading || cancelLoading" @click="onCancel">
              Keyinroq
            </button>
            <button
              type="button"
              class="btn primary"
              :disabled="!canPay || payLoading || cancelLoading || !orderId"
              @click="onConfirmPayment"
            >
              <span v-if="payLoading">Yuklanmoqda...</span>
              <span v-else>To'landi</span>
            </button>
          </div>
        </div>

        <!-- PIN pad — authorize a cashier discount -->
        <div v-if="showPinPad" class="pinpad" @click.self="showPinPad = false">
          <div class="pinpad__box">
            <div class="pinpad__title">Promokod uchun PIN</div>
            <div class="pinpad__dots">
              <span v-for="i in 4" :key="i" class="pinpad__dot" :class="{ filled: pinEntry.length >= i }" />
            </div>
            <div v-if="pinError" class="pinpad__err">PIN noto'g'ri</div>
            <div class="pinpad__grid">
              <button v-for="k in numpadKeys" :key="k" type="button" class="pinpad__key" @click="onPinKey(k)">{{ k }}</button>
              <button type="button" class="pinpad__key pinpad__key--muted" @click="showPinPad = false">×</button>
              <button type="button" class="pinpad__key" @click="onPinKey('0')">0</button>
              <button type="button" class="pinpad__key pinpad__key--muted" @click="pinBackspace">⌫</button>
            </div>
          </div>
        </div>

        <!-- Discount keyboard — bottom sheet (over the panel), so it isn't
             cramped into the left column next to the calculator. -->
        <div v-if="activeDiscField" class="disc-sheet-backdrop" @click="activeDiscField = null" />
        <Transition name="disc-sheet-slide">
          <div v-if="activeDiscField" class="disc-sheet">
            <div class="disc-sheet__head">
              <span class="disc-sheet__title">
                {{ activeDiscField === 'percent' ? 'Promokod (%)' : 'Promokod kodi' }}
                <strong>{{ activeDiscField === 'percent' ? (discountInput || '0') + '%' : (promoInput || '—') }}</strong>
              </span>
              <button type="button" class="disc-sheet__done" @click="activeDiscField = null">
                <q-icon name="check" size="18px" /> Tayyor
              </button>
            </div>
            <div class="disc-sheet__kb">
              <VirtualNumpad
                v-if="activeDiscField === 'percent'"
                @input="onDiscNum"
                @backspace="onDiscNumBack"
                @clear="onDiscNumClear"
              />
              <VirtualKeyboard
                v-else
                position="inline"
                @input="onPromoKey"
                @backspace="onPromoBack"
                @enter="activeDiscField = null"
              />
            </div>
          </div>
        </Transition>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, ref, toRef, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api } from 'boot/axios';
import { formatPrice } from 'src/utils/formatPrice';
import { suppressInternetWarningWhile } from 'src/composables/useInternetWarningSuppress';
import { useOrderTypes } from 'src/composables/useOrderTypes';
import { usePaymentMethods } from 'src/composables/usePaymentMethods';
import { useDiscountPolicy } from 'src/composables/useDiscountPolicy';
import { getAuthUser } from 'src/composables/usePermissions';
import VirtualNumpad from 'src/components/virtual-keyboard/VirtualNumpad.vue';
import VirtualKeyboard from 'src/components/virtual-keyboard/VirtualKeyboard.vue';
import { usePaymentPrefs } from 'src/composables/usePaymentPrefs';

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

const props = withDefaults(defineProps<Props>(), { navigateOnClose: true });

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  paid: [];
  cancel: [];
  cancelled: [];
}>();

const router = useRouter();
const payLoading = ref(false);
const cancelLoading = ref(false);

const { labelFor } = useOrderTypes();
const orderTypeLabel = computed(() => labelFor(props.orderType));
const { methods } = usePaymentMethods();

const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
});

suppressInternetWarningWhile(toRef(props, 'modelValue'));

/* ============ state ============ */

interface PaymentLine {
  method: string;
  amount: number;
}

const amountInput = ref<string>('');
const discountInput = ref<string>('');
const payments = ref<PaymentLine[]>([]);

// Promo code (server-side discount via /apply-discount). baseTotal is the order
// total AFTER any applied promo; the manual percent applies on top of it.
const baseTotal = ref<number>(props.totalAmount);
const promoInput = ref<string>('');
const appliedPromo = ref<string | null>(null);
const promoLoading = ref(false);
const promoError = ref<string | null>(null);

const numpadKeys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
// Payment-screen prefs (Settings → Display): methods layout + quick-amount templates.
const { prefs: paymentPrefs } = usePaymentPrefs();
const quickAmounts = computed<number[]>(() => paymentPrefs.value.quickAmounts);

/* ---- discount authorization ---- */
const { policy } = useDiscountPolicy();
const isManager = computed<boolean>(() => {
  const r = getAuthUser()?.role;
  return r === 'MANAGER' || r === 'ADMIN';
});
const discountUnlocked = ref(false);
// 'open' = may discount freely; 'pin' = cashier must enter the PIN first;
// 'blocked' = cashiers aren't allowed to discount at all.
const discountMode = computed<'open' | 'pin' | 'blocked'>(() => {
  if (isManager.value || discountUnlocked.value) return 'open';
  return policy.value.cashierAllowed ? 'pin' : 'blocked';
});

const showPinPad = ref(false);
const pinEntry = ref('');
const pinError = ref(false);

function openPinPad(): void {
  if (discountMode.value !== 'pin') return;
  pinEntry.value = '';
  pinError.value = false;
  showPinPad.value = true;
}
function onPinKey(k: string): void {
  if (pinEntry.value.length >= 4) return;
  pinEntry.value += k;
  pinError.value = false;
  if (pinEntry.value.length === 4) submitPin();
}
function pinBackspace(): void { pinEntry.value = pinEntry.value.slice(0, -1); }
function submitPin(): void {
  if (/^\d{4}$/.test(policy.value.pin) && pinEntry.value === policy.value.pin) {
    discountUnlocked.value = true;
    showPinPad.value = false;
  } else {
    pinError.value = true;
    pinEntry.value = '';
  }
}
function set10Percent(): void {
  if (discountMode.value !== 'open') return;
  discountInput.value = '10';
  activeDiscField.value = 'percent';
}

/* ---- on-screen keyboards for the discount inputs ---- */
// Which discount field the keyboard types into: percent → numpad, promo → text.
const activeDiscField = ref<'percent' | 'promo' | null>(null);

function onDiscNum(v: string): void {
  if (discountMode.value !== 'open') return;
  const cur = discountInput.value === '0' ? '' : discountInput.value;
  const n = Math.min(100, parseInt(cur + v, 10) || 0);
  discountInput.value = n === 0 ? '' : String(n);
}
function onDiscNumBack(): void { discountInput.value = discountInput.value.slice(0, -1); }
function onDiscNumClear(): void { discountInput.value = ''; }
function onPromoKey(c: string): void {
  if (appliedPromo.value) return;
  promoInput.value += c;
}
function onPromoBack(): void { promoInput.value = promoInput.value.slice(0, -1); }

// Hard guard: if the policy ever leaves 'open' (settings disabled, lock reset),
// wipe any entered percent so a disabled cashier can never carry a discount.
watch(discountMode, (m) => {
  if (m !== 'open') {
    discountInput.value = '';
    activeDiscField.value = null;
  }
});

const amountValue = computed<number>(() => parseInt(amountInput.value, 10) || 0);

const discountPercent = computed<number>(() => {
  const n = parseInt(discountInput.value, 10) || 0;
  return Math.min(100, Math.max(0, n));
});

const effectiveTotal = computed<number>(() =>
  Math.round(baseTotal.value * (1 - discountPercent.value / 100)),
);

const paidSoFar = computed<number>(() => payments.value.reduce((s, p) => s + p.amount, 0));
const remaining = computed<number>(() => Math.max(0, effectiveTotal.value - paidSoFar.value));
const changeDue = computed<number>(() => Math.max(0, paidSoFar.value - effectiveTotal.value));
const canPay = computed<boolean>(() =>
  effectiveTotal.value === 0 ? true : paidSoFar.value >= effectiveTotal.value,
);

const dominantMethod = computed<string>(() => {
  if (payments.value.length === 0) return 'CASH';
  const totals = new Map<string, number>();
  for (const p of payments.value) totals.set(p.method, (totals.get(p.method) ?? 0) + p.amount);
  let best = 'CASH';
  let max = -1;
  for (const [m, t] of totals) if (t > max) { max = t; best = m; }
  return best;
});

/* ============ helpers ============ */

function methodLabel(code: string): string {
  return methods.value.find((m) => m.code === code)?.label ?? code;
}
function methodColor(code: string): string {
  return methods.value.find((m) => m.code === code)?.color ?? 'var(--text-primary)';
}
function formatQuickAmount(amount: number): string {
  if (amount >= 1_000_000) return `${amount / 1_000_000}M`;
  if (amount >= 1000) return `${amount / 1000}k`;
  return `${amount}`;
}

/* ============ input ============ */

function onNumpadPress(key: string): void {
  activeDiscField.value = null; // switching to amount entry → close discount sheet
  if (amountInput.value.length >= 9) return;
  amountInput.value = amountInput.value === '' && key === '0' ? '' : amountInput.value + key;
}
function onClear(): void { amountInput.value = ''; }
function onBackspace(): void { amountInput.value = amountInput.value.slice(0, -1); }
function addQuick(amount: number): void { amountInput.value = String(amountValue.value + amount); }
function onMax(): void { amountInput.value = String(remaining.value); }

function clearDiscount(): void { discountInput.value = ''; }

/* ============ promo ============ */

async function applyPromo(): Promise<void> {
  const code = promoInput.value.trim();
  if (!props.orderId || !code || promoLoading.value || appliedPromo.value) return;
  promoLoading.value = true;
  promoError.value = null;
  try {
    const res = await api.post(
      `/orders/${props.orderId}/apply-discount`,
      { code },
      { validateStatus: () => true },
    );
    if (res.status === 200 && res.data?.success !== false) {
      appliedPromo.value = code;
      // Re-read the order so the discounted total drives the check. Detail is
      // wrapped as data:{order:{...}} — tolerate either shape.
      const od = await api.get(`/orders/${props.orderId}`, { validateStatus: () => true });
      const detail = od.data?.data?.order ?? od.data?.data;
      const t = Number(detail?.total_amount);
      if (Number.isFinite(t)) baseTotal.value = t;
    } else {
      promoError.value = res.data?.message || "Promokod qo'llab bo'lmadi";
    }
  } catch (e) {
    console.error('apply promo failed:', e);
    promoError.value = "Server bilan aloqa yo'q";
  } finally {
    promoLoading.value = false;
  }
}

async function removePromo(): Promise<void> {
  if (!props.orderId || promoLoading.value) return;
  promoLoading.value = true;
  try {
    await api.post(`/orders/${props.orderId}/remove-discount`, {}, { validateStatus: () => true });
  } catch (e) {
    console.warn('remove promo failed:', e);
  } finally {
    appliedPromo.value = null;
    promoInput.value = '';
    promoError.value = null;
    baseTotal.value = props.totalAmount;
    promoLoading.value = false;
  }
}

/* ============ payments list ============ */

function addPayment(method: string): void {
  activeDiscField.value = null; // close discount sheet when choosing a method
  let amount = amountValue.value > 0 ? amountValue.value : remaining.value;
  if (amount <= 0) return;
  if (method !== 'CASH') amount = Math.min(amount, remaining.value);
  if (amount <= 0) return;
  payments.value.push({ method, amount });
  amountInput.value = '';
}
function removePayment(index: number): void { payments.value.splice(index, 1); }
function resetPayments(): void { payments.value = []; amountInput.value = ''; }

/* ============ reset on open ============ */

watch(isOpen, (open) => {
  if (open) {
    payments.value = [];
    amountInput.value = '';
    discountInput.value = '';
    promoInput.value = '';
    appliedPromo.value = null;
    promoError.value = null;
    baseTotal.value = props.totalAmount;
    discountUnlocked.value = false;
    showPinPad.value = false;
    pinEntry.value = '';
    pinError.value = false;
    activeDiscField.value = null;
  }
});

/* ============ submit ============ */

async function onConfirmPayment(): Promise<void> {
  if (!props.orderId || !canPay.value || payLoading.value) return;
  payLoading.value = true;
  try {
    await api.post(`/orders/${props.orderId}/pay`, {
      payments: payments.value.map((p) => ({ method: p.method, amount: p.amount })),
      discount_percent: discountPercent.value,
      payment_method: dominantMethod.value,
    });
    emit('paid');
    isOpen.value = false;
    if (props.navigateOnClose) void router.push({ name: 'orders' });
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
  if (props.navigateOnClose) void router.push({ name: 'orders' });
}

async function onCancelOrder(): Promise<void> {
  if (!props.orderId || cancelLoading.value || payLoading.value) return;
  const ok = window.confirm(`#${props.displayId ?? ''} buyurtmasini bekor qilishni tasdiqlaysizmi?`);
  if (!ok) return;
  cancelLoading.value = true;
  try {
    await api.post(`/orders/${props.orderId}/cancel`);
    emit('cancelled');
    isOpen.value = false;
    if (props.navigateOnClose) void router.push({ name: 'orders' });
  } catch (error) {
    console.error('Order cancel failed:', error);
    alert('Buyurtmani bekor qilishda xatolik');
  } finally {
    cancelLoading.value = false;
  }
}
</script>

<style scoped lang="scss">
.pay {
  position: fixed;
  inset: 0;
  z-index: 4000;
  background: rgba(10, 12, 16, 0.6);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  display: flex;
  padding: 12px;
}

.pay__panel {
  position: relative;
  width: 100%;
  max-width: 1280px;
  margin: auto;
  height: calc(100vh - 24px);
  background: var(--bg-app);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.5);
}

/* header (slim) */
.pay__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-surface);
}
.pay__title { display: flex; align-items: baseline; gap: 10px; }
.pay__hash { font-size: 20px; font-weight: 800; color: var(--text-primary); }
.pay__type { font-size: 14px; color: var(--text-muted); }
.pay__close {
  width: 40px; height: 40px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: var(--bg-surface-2);
  color: var(--text-primary);
  cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
  &:active { transform: scale(0.95); }
}

/* body */
.pay__body {
  flex: 1;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
  min-height: 0;
}

/* LEFT summary */
.pay__summary {
  display: flex;
  flex-direction: column;
  padding: 14px 16px;
  border-right: 1px solid var(--border-color);
  min-height: 0;
}
.sum__items {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}
.sum__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 10px;
  align-items: center;
  font-size: 15px;
  color: var(--text-primary);
}
.sum__name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sum__qty { color: var(--text-muted); font-variant-numeric: tabular-nums; }
.sum__price { font-weight: 600; font-variant-numeric: tabular-nums; }

.sum__discount {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed var(--border-color);
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.disc-field { display: flex; flex-direction: column; gap: 6px; }
.disc-label { font-size: 12px; font-weight: 600; color: var(--text-muted); }
.disc-row { display: flex; gap: 6px; align-items: center; }
/* % field: input wrapper so the clear (×) sits INSIDE the input */
.disc-input-wrap { position: relative; flex: 1; min-width: 0; }
.disc-input-wrap .disc-input { width: 100%; flex: none; }
.disc-input.has-clear { padding-right: 36px; }
.disc-inclear {
  position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
  width: 28px; height: 28px; border-radius: 8px;
  border: none; background: transparent; color: var(--text-muted);
  cursor: pointer; display: inline-flex; align-items: center; justify-content: center;
  &:active { transform: translateY(-50%) scale(0.9); }
}
.disc-input {
  flex: 1;
  min-width: 0;
  height: 44px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: var(--bg-surface-2);
  color: var(--text-primary);
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  &:focus, &.active { outline: none; border-color: var(--accent-primary, #ff7a00); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent-primary, #ff7a00) 22%, transparent); }
  &:disabled { opacity: 0.7; }
}
/* discount keyboard bottom sheet */
.disc-sheet {
  position: absolute; left: 0; right: 0; bottom: 0; z-index: 6;
  background: var(--bg-surface); border-top: 1px solid var(--border-color);
  border-radius: 18px 18px 0 0;
  padding: 12px 16px 18px;
  box-shadow: 0 -16px 50px rgba(0, 0, 0, 0.4);
}
.disc-sheet__head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.disc-sheet__title {
  font-size: 13px; color: var(--text-muted);
  strong { margin-left: 8px; font-size: 18px; color: var(--text-primary); font-variant-numeric: tabular-nums; }
}
.disc-sheet__done {
  height: 42px; padding: 0 18px; border-radius: 10px; border: none; cursor: pointer;
  background: var(--accent-primary, #ff7a00); color: #fff; font-weight: 700; font-size: 14px;
  display: inline-flex; align-items: center; gap: 6px;
  &:active { transform: scale(0.97); }
}
.disc-sheet__kb { max-width: 860px; margin: 0 auto; }
.disc-sheet-slide-enter-active, .disc-sheet-slide-leave-active { transition: transform 220ms ease, opacity 220ms ease; }
.disc-sheet-slide-enter-from, .disc-sheet-slide-leave-to { transform: translateY(100%); opacity: 0; }

/* click anywhere outside the sheet closes it */
.disc-sheet-backdrop {
  position: absolute;
  inset: 0;
  z-index: 5;
  background: transparent;
}

.disc-input--mono { font-family: ui-monospace, Menlo, monospace; font-weight: 600; letter-spacing: 0.5px; }
.disc-apply {
  height: 44px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid var(--accent-primary, #ff7a00);
  background: var(--accent-primary, #ff7a00);
  color: #fff;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
  &:disabled { opacity: 0.5; cursor: not-allowed; }
}
.disc-clear {
  width: 44px; height: 44px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: var(--bg-surface-2);
  color: var(--text-muted);
  cursor: pointer;
  flex-shrink: 0;
}
.disc-applied { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 700; color: #16a34a; }
.disc-error { font-size: 12px; color: #ef4444; }
.disc-quick {
  height: 44px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid var(--accent-primary, #ff7a00);
  background: color-mix(in srgb, var(--accent-primary, #ff7a00) 12%, transparent);
  color: var(--accent-primary, #ff7a00);
  font-weight: 800;
  font-size: 14px;
  cursor: pointer;
  flex-shrink: 0;
  &:active { transform: scale(0.95); }
}
.disc-blocked {
  grid-column: 1 / -1;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-muted);
  padding: 10px 12px;
  background: var(--bg-surface-2);
  border: 1px solid var(--border-color);
  border-radius: 10px;
}
.disc-unlock {
  grid-column: 1 / -1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 48px;
  border-radius: 10px;
  border: 1px dashed var(--accent-primary, #ff7a00);
  background: transparent;
  color: var(--accent-primary, #ff7a00);
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
  &:active { transform: scale(0.98); }
}

/* PIN pad overlay */
.pinpad {
  position: absolute;
  inset: 0;
  z-index: 5;
  background: rgba(10, 12, 16, 0.55);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
}
.pinpad__box {
  width: 300px;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}
.pinpad__title { font-size: 16px; font-weight: 700; color: var(--text-primary); }
.pinpad__dots { display: flex; gap: 12px; }
.pinpad__dot {
  width: 14px; height: 14px; border-radius: 50%;
  background: var(--bg-surface-2); border: 1px solid var(--border-color);
  &.filled { background: var(--accent-primary, #ff7a00); border-color: var(--accent-primary, #ff7a00); }
}
.pinpad__err { font-size: 12px; color: #ef4444; }
.pinpad__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; width: 100%; }
.pinpad__key {
  height: 52px; border-radius: 12px;
  border: 1px solid var(--border-color);
  background: var(--bg-surface-2);
  color: var(--text-primary);
  font-size: 20px; font-weight: 700; cursor: pointer;
  &:active { transform: scale(0.95); }
}
.pinpad__key--muted { color: var(--text-muted); }

.sum__totals { margin-top: 12px; text-align: right; }
.sum__orig { font-size: 14px; color: var(--text-muted); text-decoration: line-through; }
.sum__off { margin-left: 6px; color: #ef4444; font-weight: 700; text-decoration: none; }
.sum__total { font-size: 30px; font-weight: 800; color: var(--text-primary); font-variant-numeric: tabular-nums; }

/* RIGHT calculator */
.pay__calc {
  display: flex;
  flex-direction: column;
  padding: 14px 16px;
  gap: 10px;
  min-height: 0;
}
.calc__display {
  height: 56px;
  border-radius: 12px;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  display: flex; align-items: baseline; justify-content: flex-end; gap: 8px;
  padding: 0 16px;
  flex-shrink: 0;
}
.calc__display-val { font-size: 28px; font-weight: 800; color: var(--text-primary); font-variant-numeric: tabular-nums; }
.calc__display-cur { font-size: 14px; color: var(--text-muted); }

.calc__methods { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; flex-shrink: 0; }
/* vertical layout (Settings → Display): stack the payment types in one column */
.calc__methods--vertical { grid-template-columns: 1fr; }
.pm-btn {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px;
  height: 60px;
  border-radius: 12px;
  border: 1px solid var(--pm, var(--border-color));
  background: color-mix(in srgb, var(--pm) 10%, transparent);
  color: var(--pm, var(--text-primary));
  cursor: pointer;
  &:active { transform: scale(0.96); }
}
.pm-btn__icon { width: 22px; height: 22px; display: inline-flex; :deep(svg) { width: 22px; height: 22px; } }
.pm-btn__label { font-size: 12px; font-weight: 700; }

/* list grows to fill remaining space → minimal scrolling */
.calc__list {
  flex: 1;
  min-height: 60px;
  overflow-y: auto;
  border-radius: 12px;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  padding: 8px;
  display: flex; flex-direction: column; gap: 6px;
}
.pl__empty { margin: auto; font-size: 13px; color: var(--text-muted); }
.pl__row {
  display: grid; grid-template-columns: 1fr auto auto; gap: 10px; align-items: center;
  padding: 8px 10px; border-radius: 8px; background: var(--bg-surface-2);
}
.pl__method { font-weight: 700; font-size: 15px; }
.pl__amount { font-weight: 600; font-variant-numeric: tabular-nums; color: var(--text-primary); }
.pl__remove {
  width: 28px; height: 28px; border-radius: 8px; border: none; background: transparent;
  color: var(--text-muted); cursor: pointer; &:active { transform: scale(0.9); }
}

.calc__status { display: flex; align-items: center; justify-content: space-between; min-height: 24px; flex-shrink: 0; }
.calc__status-label { font-size: 14px; color: var(--text-muted); }
.calc__status-val { font-size: 20px; font-weight: 800; font-variant-numeric: tabular-nums; }
.calc__status-val.is-due { color: #f59e0b; }
.calc__status-val.is-change { color: #2563eb; }
.calc__status-val.is-ok { color: #16a34a; display: inline-flex; align-items: center; gap: 6px; }

.calc__pad { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; flex-shrink: 0; }
.pad-key {
  height: 48px;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  color: var(--text-primary);
  font-size: 20px; font-weight: 700; cursor: pointer;
  &:active { transform: scale(0.96); }
}
.pad-key--muted { color: var(--text-muted); }

.calc__quick { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; flex-shrink: 0; }
.quick-btn {
  height: 42px; border-radius: 10px;
  border: 1px solid var(--border-color);
  background: var(--bg-surface-2);
  color: var(--text-primary);
  font-size: 13px; font-weight: 700; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center; gap: 4px;
  &:active:not(:disabled) { transform: scale(0.95); }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
}
.quick-btn--max { background: var(--accent-primary, #ff7a00); border-color: var(--accent-primary, #ff7a00); color: #fff; }
.quick-btn--reset { color: #ef4444; }

/* footer (slim) */
.pay__foot {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 10px 16px;
  border-top: 1px solid var(--border-color);
  background: var(--bg-surface);
  flex-shrink: 0;
}
.foot-right { display: flex; gap: 10px; }
.btn {
  height: 46px; padding: 0 22px; border-radius: 12px; border: 1px solid transparent;
  font-size: 15px; font-weight: 700; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
  &:disabled { opacity: 0.5; cursor: not-allowed; }
  &:active:not(:disabled) { transform: scale(0.98); }
}
.btn.primary { background: var(--accent-primary, #ff7a00); color: #fff; min-width: 160px; }
.btn.secondary { background: var(--bg-surface-2); color: var(--text-primary); border-color: var(--border-color); }
.btn.danger { background: rgba(239, 68, 68, 0.12); color: #ef4444; border-color: rgba(239, 68, 68, 0.4); }

@media (max-width: 860px) {
  .pay__body { grid-template-columns: 1fr; overflow-y: auto; }
  .pay__summary { border-right: none; border-bottom: 1px solid var(--border-color); }
}

.pay-fade-enter-active, .pay-fade-leave-active { transition: opacity 200ms ease; }
.pay-fade-enter-from, .pay-fade-leave-to { opacity: 0; }
</style>
