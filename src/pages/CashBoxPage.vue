<template>
  <q-page class="kassa-page">
    <!-- Header -->
    <div class="page-header">
      <go-back-btn />
      <div class="header-actions">
        <button type="button" class="btn secondary" @click="refreshData">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M23 4v6h-6M1 20v-6h6" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          Yangilash
        </button>
      </div>
    </div>

    <div class="kassa-layout">
      <!-- LEFT SIDE: Balance & Stats -->
      <div class="left-section">
        <!-- Current Balance Card -->
        <div class="balance-card">
          <div class="balance-header">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="M12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
              <path d="M2 10h2M20 10h2M2 14h2M20 14h2" />
            </svg>
            <span>Joriy balans</span>
          </div>
          <div class="balance-amount">
            {{ formatPrice(balance) }} <span class="currency">so'm</span>
          </div>
          <div class="balance-updated">
            Oxirgi yangilanish: {{ formatDateTime(balanceUpdated) }}
          </div>
        </div>

        <!-- Stats Summary -->
        <div class="stats-card">
          <div class="stats-header">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M18 20V10M12 20V4M6 20v-6" />
            </svg>
            <span>Davr statistikasi</span>
          </div>

          <div class="stats-period" v-if="stats">
            {{ formatDate(stats.period_start) }} — {{ formatDate(stats.current_time) }}
          </div>

          <div class="stats-grid" v-if="stats">
            <div class="stat-item">
              <div class="stat-value">{{ stats.summary.total_orders }}</div>
              <div class="stat-label">Jami buyurtmalar</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">{{ stats.summary.ready_orders }}</div>
              <div class="stat-label">Tayyor</div>
            </div>
            <div class="stat-item highlight">
              <div class="stat-value">{{ formatPrice(stats.summary.total_revenue) }}</div>
              <div class="stat-label">Jami daromad</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">
                {{ formatPrice(Math.round(parseFloat(stats.summary.average_order_value))) }}
              </div>
              <div class="stat-label">O'rtacha chek</div>
            </div>
          </div>

          <!-- Cashier Performance -->
          <div class="section-title" v-if="stats?.cashier_performance?.length">Kassirlar</div>
          <div class="cashier-list" v-if="stats?.cashier_performance?.length">
            <div
              v-for="cashier in stats.cashier_performance"
              :key="cashier.cashier_id"
              class="cashier-item"
            >
              <div class="cashier-info">
                <div class="cashier-name">{{ cashier.cashier_name }}</div>
                <div class="cashier-orders">{{ cashier.order_count }} ta buyurtma</div>
              </div>
              <div class="cashier-revenue">{{ formatPrice(cashier.total_revenue) }}</div>
            </div>
          </div>

          <!-- Top Products -->
          <div class="section-title" v-if="stats?.top_products?.length">Top mahsulotlar</div>
          <div class="products-list" v-if="stats?.top_products?.length">
            <div
              v-for="(product, index) in stats.top_products.slice(0, 5)"
              :key="product.product_id"
              class="product-item"
            >
              <div class="product-rank">{{ index + 1 }}</div>
              <div class="product-info">
                <div class="product-name">{{ product.product_name }}</div>
                <div class="product-qty">{{ product.quantity_sold }} ta sotilgan</div>
              </div>
              <div class="product-revenue">{{ formatPrice(product.revenue) }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- RIGHT SIDE: Perform Inkassa -->
      <div class="right-section">
        <div class="inkassa-card">
          <div class="inkassa-header">
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
              <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
              <path d="M18 12a2 2 0 0 0 0 4h4v-4h-4z" />
            </svg>
            <span>Inkassa qilish</span>
          </div>

          <!-- Payment Methods Input -->
          <div class="payment-methods">
            <!-- Cash -->
            <div class="payment-field" :class="{ active: activeField === 'cash' }">
              <div class="field-header">
                <div class="field-icon cash">
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
                </div>
                <span class="field-label">Naqd pul</span>
              </div>
              <div class="field-input" @click="setActiveField('cash')">
                <span class="input-value">{{ formatPrice(paymentAmounts.cash) }}</span>
                <span class="input-currency">so'm</span>
              </div>
            </div>

            <!-- UzCard -->
            <div class="payment-field" :class="{ active: activeField === 'uzcard' }">
              <div class="field-header">
                <div class="field-icon uzcard">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="M2 10h20" />
                  </svg>
                </div>
                <span class="field-label">UzCard</span>
              </div>
              <div class="field-input" @click="setActiveField('uzcard')">
                <span class="input-value">{{ formatPrice(paymentAmounts.uzcard) }}</span>
                <span class="input-currency">so'm</span>
              </div>
            </div>

            <!-- Humo -->
            <div class="payment-field" :class="{ active: activeField === 'humo' }">
              <div class="field-header">
                <div class="field-icon humo">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="M2 10h20" />
                  </svg>
                </div>
                <span class="field-label">Humo</span>
              </div>
              <div class="field-input" @click="setActiveField('humo')">
                <span class="input-value">{{ formatPrice(paymentAmounts.humo) }}</span>
                <span class="input-currency">so'm</span>
              </div>
            </div>

            <!-- Payme -->
            <div class="payment-field" :class="{ active: activeField === 'payme' }">
              <div class="field-header">
                <div class="field-icon payme">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                  </svg>
                </div>
                <span class="field-label">Payme</span>
              </div>
              <div class="field-input" @click="setActiveField('payme')">
                <span class="input-value">{{ formatPrice(paymentAmounts.payme) }}</span>
                <span class="input-currency">so'm</span>
              </div>
            </div>
          </div>

          <!-- Total -->
          <div class="inkassa-total">
            <div class="total-row">
              <span>Jami inkassa:</span>
              <span class="total-value">{{ formatPrice(totalInkassa) }} so'm</span>
            </div>
            <div class="total-row remaining" :class="{ warning: remainingBalance < 0 }">
              <span>Qoldiq:</span>
              <span class="remaining-value">{{ formatPrice(remainingBalance) }} so'm</span>
            </div>
          </div>

          <!-- Numpad -->
          <div class="numpad">
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

          <!-- Action Buttons -->
          <div class="inkassa-actions">
            <button type="button" class="btn secondary" @click="resetPayments">Tozalash</button>
            <button
              type="button"
              class="btn primary"
              :disabled="performingInkassa || totalInkassa === 0"
              @click="performInkassa"
            >
              <span v-if="performingInkassa">Yuklanmoqda...</span>
              <span v-else>Inkassa qilish</span>
            </button>
          </div>
        </div>

        <!-- History Button -->
        <button type="button" class="history-btn" @click="showHistory = true">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          Inkassa tarixi
        </button>
      </div>
    </div>

    <!-- History Dialog -->
    <q-dialog v-model="showHistory" maximized>
      <div class="history-dialog">
        <div class="dialog-header">
          <h2>Inkassa tarixi</h2>
          <q-btn icon="close" flat round dense @click="showHistory = false" />
        </div>

        <div class="history-list">
          <div v-if="historyLoading" class="history-loading">Yuklanmoqda...</div>

          <div v-else-if="history.length === 0" class="history-empty">
            Inkassa tarixi mavjud emas
          </div>

          <div
            v-else
            v-for="item in history"
            :key="item.id"
            class="history-item"
            @click="showInkassaDetail(item.id)"
          >
            <div class="history-item-header">
              <div class="history-id">#{{ item.id }}</div>
              <div class="history-date">{{ formatDateTime(item.created_at) }}</div>
            </div>

            <div class="history-item-body">
              <div class="history-cashier">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                {{ item.cashier.name }}
              </div>
              <div class="history-amount">{{ formatPrice(item.amount) }} so'm</div>
            </div>

            <div class="history-item-footer">
              <div class="history-period">
                {{ formatDate(item.period.start) }} — {{ formatDate(item.period.end) }}
              </div>
              <div class="history-stats">{{ item.statistics.total_orders }} ta buyurtma</div>
            </div>
          </div>
        </div>

        <!-- Pagination -->
        <div
          v-if="historyPagination && historyPagination.total_pages > 1"
          class="history-pagination"
        >
          <button
            type="button"
            class="pagination-btn"
            :disabled="!historyPagination.has_previous"
            @click="loadHistory(historyPagination.current_page - 1)"
          >
            ← Oldingi
          </button>
          <span class="pagination-info">
            {{ historyPagination.current_page }} / {{ historyPagination.total_pages }}
          </span>
          <button
            type="button"
            class="pagination-btn"
            :disabled="!historyPagination.has_next"
            @click="loadHistory(historyPagination.current_page + 1)"
          >
            Keyingi →
          </button>
        </div>
      </div>
    </q-dialog>

    <!-- Inkassa Detail Dialog -->
    <q-dialog v-model="showDetail">
      <div class="detail-dialog">
        <div class="dialog-header">
          <h2>Inkassa #{{ selectedInkassa?.id }}</h2>
          <q-btn icon="close" flat round dense @click="showDetail = false" />
        </div>

        <div v-if="selectedInkassa" class="detail-content">
          <div class="detail-row">
            <span class="detail-label">Kassir:</span>
            <span class="detail-value">{{ selectedInkassa.cashier.name }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Summa:</span>
            <span class="detail-value highlight"
              >{{ formatPrice(selectedInkassa.amount) }} so'm</span
            >
          </div>
          <div class="detail-row">
            <span class="detail-label">Oldingi balans:</span>
            <span class="detail-value">{{ formatPrice(selectedInkassa.balance_before) }} so'm</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Keyingi balans:</span>
            <span class="detail-value">{{ formatPrice(selectedInkassa.balance_after) }} so'm</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Davr:</span>
            <span class="detail-value">
              {{ formatDateTime(selectedInkassa.period.start) }} —
              {{ formatDateTime(selectedInkassa.period.end) }}
            </span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Buyurtmalar:</span>
            <span class="detail-value">{{ selectedInkassa.statistics.total_orders }} ta</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Daromad:</span>
            <span class="detail-value"
              >{{ formatPrice(selectedInkassa.statistics.total_revenue) }} so'm</span
            >
          </div>
          <div v-if="selectedInkassa.notes" class="detail-row">
            <span class="detail-label">Izoh:</span>
            <span class="detail-value">{{ selectedInkassa.notes }}</span>
          </div>
        </div>
      </div>
    </q-dialog>

    <!-- Success Dialog -->
    <q-dialog v-model="showSuccess">
      <div class="success-dialog">
        <div class="success-icon">
          <svg
            width="64"
            height="64"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        </div>
        <h2>Inkassa muvaffaqiyatli!</h2>
        <p v-if="lastInkassaResult">
          {{ formatPrice(lastInkassaResult.amount_removed) }} so'm yechib olindi
        </p>
        <button type="button" class="btn primary" @click="showSuccess = false">Yopish</button>
      </div>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from 'boot/axios';
import { formatPrice } from 'src/utils/formatPrice';

// Types
interface CashierPerformance {
  cashier_id: number;
  cashier_name: string;
  order_count: number;
  total_revenue: string;
}

interface TopProduct {
  product_id: number;
  product_name: string;
  quantity_sold: number;
  revenue: string;
}

interface Stats {
  period_start: string;
  current_time: string;
  cash_register: {
    current_balance: string;
    last_updated: string;
  };
  summary: {
    total_orders: number;
    paid_orders: number;
    ready_orders: number;
    total_revenue: string;
    average_order_value: string;
  };
  cashier_performance: CashierPerformance[];
  top_products: TopProduct[];
}

interface InkassaHistoryItem {
  id: number;
  cashier: { id: number; name: string };
  amount: string;
  balance_before: string;
  balance_after: string;
  period: { start: string; end: string };
  statistics: { total_orders: number; total_revenue: string };
  notes: string | null;
  created_at: string;
}

interface Pagination {
  current_page: number;
  total_pages: number;
  total_inkassas: number;
  per_page: number;
  has_next: boolean;
  has_previous: boolean;
}

interface InkassaResult {
  id: number;
  cashier: string;
  amount_removed: string;
  balance_before: string;
  balance_after: string;
}

type PaymentField = 'cash' | 'uzcard' | 'humo' | 'payme';

// State
const balance = ref<number>(0);
const balanceUpdated = ref<string>('');
const stats = ref<Stats | null>(null);

const activeField = ref<PaymentField>('cash');
const paymentInputs = ref<Record<PaymentField, string>>({
  cash: '',
  uzcard: '',
  humo: '',
  payme: '',
});

const performingInkassa = ref(false);
const showHistory = ref(false);
const showDetail = ref(false);
const showSuccess = ref(false);

const history = ref<InkassaHistoryItem[]>([]);
const historyLoading = ref(false);
const historyPagination = ref<Pagination | null>(null);

const selectedInkassa = ref<InkassaHistoryItem | null>(null);
const lastInkassaResult = ref<InkassaResult | null>(null);

// Numpad keys
const numpadKeys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

// Computed
const paymentAmounts = computed(() => ({
  cash: (parseInt(paymentInputs.value.cash) || 0) * 1000,
  uzcard: (parseInt(paymentInputs.value.uzcard) || 0) * 1000,
  humo: (parseInt(paymentInputs.value.humo) || 0) * 1000,
  payme: (parseInt(paymentInputs.value.payme) || 0) * 1000,
}));

const totalInkassa = computed(() => {
  return (
    paymentAmounts.value.cash +
    paymentAmounts.value.uzcard +
    paymentAmounts.value.humo +
    paymentAmounts.value.payme
  );
});

const remainingBalance = computed(() => {
  return balance.value - totalInkassa.value;
});

// Format helpers
function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('uz-UZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatDateTime(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleString('uz-UZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Numpad handlers
function setActiveField(field: PaymentField): void {
  activeField.value = field;
}

function onNumpadPress(key: string): void {
  const current = paymentInputs.value[activeField.value];
  if (current.length < 7) {
    paymentInputs.value[activeField.value] = current + key;
  }
}

function onClear(): void {
  paymentInputs.value[activeField.value] = '';
}

function onBackspace(): void {
  paymentInputs.value[activeField.value] = paymentInputs.value[activeField.value].slice(0, -1);
}

function resetPayments(): void {
  paymentInputs.value = {
    cash: '',
    uzcard: '',
    humo: '',
    payme: '',
  };
  activeField.value = 'cash';
}

// API calls
async function loadBalance(): Promise<void> {
  try {
    const response = await api.get('/inkassa/balance');
    balance.value = parseFloat(response.data.data.balance) || 0;
    balanceUpdated.value = response.data.data.last_updated;
  } catch (error) {
    console.error('Failed to load balance:', error);
  }
}

async function loadStats(): Promise<void> {
  try {
    const response = await api.get('/inkassa/stats');
    stats.value = response.data.data;
  } catch (error) {
    console.error('Failed to load stats:', error);
  }
}

async function loadHistory(page = 1): Promise<void> {
  historyLoading.value = true;
  try {
    const response = await api.get('/inkassa/history', { params: { page } });
    history.value = response.data.data.inkassas;
    historyPagination.value = response.data.data.pagination;
  } catch (error) {
    console.error('Failed to load history:', error);
  } finally {
    historyLoading.value = false;
  }
}

async function showInkassaDetail(id: number): Promise<void> {
  try {
    const response = await api.get(`/inkassa/${id}`);
    selectedInkassa.value = response.data.data;
    showDetail.value = true;
  } catch (error) {
    console.error('Failed to load inkassa detail:', error);
  }
}

async function performInkassa(): Promise<void> {
  if (totalInkassa.value === 0) return;

  performingInkassa.value = true;
  try {
    const payload: Record<string, number> = {};

    if (paymentAmounts.value.cash > 0) {
      payload.cash = paymentAmounts.value.cash;
    }
    if (paymentAmounts.value.uzcard > 0) {
      payload.uzcard = paymentAmounts.value.uzcard;
    }
    if (paymentAmounts.value.humo > 0) {
      payload.humo = paymentAmounts.value.humo;
    }
    if (paymentAmounts.value.payme > 0) {
      payload.payme = paymentAmounts.value.payme;
    }

    const response = await api.post('/inkassa/perform', payload);
    lastInkassaResult.value = response.data.data;

    // Reset and refresh
    resetPayments();
    await refreshData();

    showSuccess.value = true;
  } catch (error) {
    console.error('Failed to perform inkassa:', error);
    alert('Inkassa amalga oshmadi');
  } finally {
    performingInkassa.value = false;
  }
}

async function refreshData(): Promise<void> {
  await Promise.all([loadBalance(), loadStats()]);
}

// Watch history dialog
import { watch } from 'vue';
import GoBackBtn from 'src/components/go-back/GoBackBtn.vue';
watch(showHistory, (isOpen) => {
  if (isOpen) {
    void loadHistory();
  }
});

// Lifecycle
onMounted(() => {
  void refreshData();
});
</script>

<style scoped lang="scss">
.kassa-page {
  background: var(--bg-app);
  min-height: 100vh;
  padding: 10px;
}

/* Header */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.header-actions {
  display: flex;
  gap: 12px;
}

/* Layout */
.kassa-layout {
  display: grid;
  grid-template-columns: 1fr 400px;
  gap: 20px;
}

/* Left Section */
.left-section {

  display:none !important;

  display: flex;
  flex-direction: column;
  gap: 20px;
  overflow-y: auto;
}

/* Balance Card */
.balance-card {
  background: linear-gradient(135deg, #16a34a 0%, #15803d 100%);
  border-radius: 16px;
  padding: 24px;
  color: white;
}

.balance-header {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  font-weight: 500;
  opacity: 0.9;
  margin-bottom: 12px;
}

.balance-amount {
  font-size: 36px;
  font-weight: 800;
  margin-bottom: 8px;

  .currency {
    font-size: 20px;
    font-weight: 500;
    opacity: 0.8;
  }
}

.balance-updated {
  font-size: 12px;
  opacity: 0.7;
}

/* Stats Card */
.stats-card {
  background: var(--bg-surface);
  border-radius: 16px;
  padding: 20px;
  border: 1px solid var(--border-color);
  flex: 1;
  overflow-y: auto;
}

.stats-header {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;

  svg {
    color: var(--accent-primary);
  }
}

.stats-period {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 16px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-bottom: 20px;
}

.stat-item {
  background: var(--bg-surface-2);
  border-radius: 12px;
  padding: 14px;
  border: 1px solid var(--border-color);

  &.highlight {
    background: var(--accent-soft);
    border-color: var(--accent-primary);

    .stat-value {
      color: var(--accent-primary);
    }
  }
}

.stat-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.stat-label {
  font-size: 12px;
  color: var(--text-muted);
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 16px 0 12px;
}

/* Cashier List */
.cashier-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cashier-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--bg-surface-2);
  border-radius: 10px;
  padding: 12px;
  border: 1px solid var(--border-color);
}

.cashier-name {
  font-weight: 500;
  color: var(--text-primary);
}

.cashier-orders {
  font-size: 12px;
  color: var(--text-muted);
}

.cashier-revenue {
  font-weight: 600;
  color: var(--accent-primary);
}

/* Products List */
.products-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.product-item {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--bg-surface-2);
  border-radius: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
}

.product-rank {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: var(--accent-soft);
  color: var(--accent-primary);
  font-weight: 700;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.product-info {
  flex: 1;
}

.product-name {
  font-weight: 500;
  color: var(--text-primary);
  font-size: 13px;
}

.product-qty {
  font-size: 11px;
  color: var(--text-muted);
}

.product-revenue {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 13px;
}

/* Right Section - Inkassa */
.right-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.inkassa-card {
  background: var(--bg-surface);
  border-radius: 16px;
  padding: 20px;
  border: 1px solid var(--border-color);
  flex: 1;
  display: flex;
  flex-direction: column;
}

.inkassa-header {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 16px;

  svg {
    color: var(--accent-primary);
  }
}

/* Payment Methods */
.payment-methods {
  display: flex;
  flex-wrap: wrap;
  gap: 2%;
  row-gap: 12px;
  margin-bottom: 16px;
}

.payment-field {
  background: var(--bg-surface-2);
  border-radius: 12px;
  padding: 12px;
  border: 2px solid var(--border-color);
  cursor: pointer;
  transition: all 0.2s ease;
  width: 49%;

  &:hover {
    border-color: #d1d5db;
  }

  &.active {
    border-color: var(--accent-primary);
    background: var(--accent-soft);
  }
}

.field-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.field-icon {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;

  &.cash {
    background: #dcfce7;
    color: #16a34a;
  }

  &.uzcard {
    background: #dbeafe;
    color: #2563eb;
  }

  &.humo {
    background: #fef3c7;
    color: #d97706;
  }

  &.payme {
    background: #ede9fe;
    color: #7c3aed;
  }
}

.field-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted);
}

.field-input {
  display: flex;
  align-items: baseline;
  justify-content: flex-end;
  gap: 6px;
}

.input-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
}

.input-currency {
  font-size: 12px;
  color: var(--text-muted);
}

/* Inkassa Total */
.inkassa-total {
  background: var(--bg-surface-2);
  border-radius: 12px;
  padding: 14px;
  margin-bottom: 16px;
  border: 1px solid var(--border-color);
}

.total-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  color: var(--text-muted);

  &:first-child {
    margin-bottom: 8px;
  }

  &.remaining {
    padding-top: 8px;
    border-top: 1px solid var(--border-color);
  }

  &.warning .remaining-value {
    color: #dc2626;
  }
}

.total-value {
  font-size: 18px;
  font-weight: 700;
  color: var(--accent-primary);
}

.remaining-value {
  font-weight: 600;
  color: var(--text-primary);
}

/* Numpad */
.numpad {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 16px;
}

.numpad-key {
  height: 52px;
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
  }

  &.clear {
    background: #fef3c7;
    border-color: #fcd34d;
    color: #d97706;
  }

  &.backspace {
    background: #fee2e2;
    border-color: #fca5a5;
    color: #dc2626;
  }
}

/* Inkassa Actions */
.inkassa-actions {
  display: flex;
  gap: 12px;
}

/* History Button */
.history-btn {

  display: none !important;

  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 14px;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: var(--bg-surface-2);
    border-color: var(--accent-primary);
    color: var(--accent-primary);
  }

  svg {
    color: var(--text-muted);
  }

  &:hover svg {
    color: var(--accent-primary);
  }
}

/* Buttons */
.btn {
  flex: 1;
  height: 42px;
  border-radius: 12px;
  border: none;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.15s ease;

  &:active {
    transform: scale(0.97);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  &.secondary {
    background: var(--btn-secondary-bg);
    color: var(--btn-secondary-text);
  }

  &.primary {
    background: var(--accent-primary);
    color: white;
  }
}

/* History Dialog */
.history-dialog {
  background: var(--bg-surface);
  width: 100%;
  max-width: 600px;
  height: 90vh;
  border-radius: 20px;
  display: flex;
  flex-direction: column;
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-color);

  h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--text-primary);
  }
}

.history-list {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.history-loading,
.history-empty {
  text-align: center;
  color: var(--text-muted);
  padding: 40px;
}

.history-item {
  background: var(--bg-surface-2);
  border-radius: 12px;
  padding: 14px;
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    border-color: var(--accent-primary);
  }
}

.history-item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.history-id {
  font-weight: 700;
  color: var(--accent-primary);
}

.history-date {
  font-size: 12px;
  color: var(--text-muted);
}

.history-item-body {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.history-cashier {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-muted);
}

.history-amount {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
}

.history-item-footer {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-muted);
}

/* History Pagination */
.history-pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
  padding: 16px;
  border-top: 1px solid var(--border-color);
}

.pagination-btn {
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.pagination-info {
  font-size: 13px;
  color: var(--text-muted);
}

/* Detail Dialog */
.detail-dialog {
  background: var(--bg-surface);
  width: 100%;
  max-width: 450px;
  border-radius: 16px;
}

.detail-content {
  padding: 20px 24px;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid var(--border-color);

  &:last-child {
    border-bottom: none;
  }
}

.detail-label {
  color: var(--text-muted);
  font-size: 14px;
}

.detail-value {
  color: var(--text-primary);
  font-weight: 500;
  font-size: 14px;
  text-align: right;

  &.highlight {
    color: var(--accent-primary);
    font-size: 16px;
    font-weight: 700;
  }
}

/* Success Dialog */
.success-dialog {
  background: var(--bg-surface);
  padding: 40px;
  border-radius: 20px;
  text-align: center;
  max-width: 350px;
}

.success-icon {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: var(--accent-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 20px;

  svg {
    color: var(--accent-primary);
  }
}

.success-dialog h2 {
  margin: 0 0 12px;
  font-size: 20px;
  color: var(--text-primary);
}

.success-dialog p {
  margin: 0 0 24px;
  color: var(--text-muted);
  font-size: 15px;
}

.success-dialog .btn {
  width: 100%;
}

// /* Responsive */
// @media (max-width: 1024px) {
//   .kassa-layout {
//     grid-template-columns: 1fr;
//     height: auto;
//   }

//   .left-section {
//     order: 2;
//   }

//   .right-section {
//     order: 1;
//   }
// }
</style>
