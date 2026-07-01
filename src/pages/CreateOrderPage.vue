<template>
  <q-page class="page-create">
    <div class="layout">
      <!-- LEFT: Receipt / Control -->
      <div class="container">
        <div class="left">
          <div class="left-content">
            <div class="left-body">
              <div class="section-title">Chek</div>

              <div v-if="receiptItems.length === 0" class="receipt-empty">Mahsulotlar yo'q</div>

              <TransitionGroup v-else name="list" tag="div" class="receipt-list">
                <div
                  v-for="(item, index) in receiptItems"
                  :key="item.productId"
                  @click="openDescription(index)"
                  class="receipt-item"
                  :class="{ 'flash-highlight': item.isFlashing }"
                >
                  <div class="receipt-item-body">
                    <div class="info">
                      <div class="name">{{ item.name }}</div>
                      <div class="price">{{ formatPrice(item.price) }} so'm</div>
                    </div>

                    <div class="quantity">
                      <button type="button" @click.stop="decreaseQty(item)">−</button>
                      <div class="qty-wrapper" :class="{ 'qty-flash': item.qtyFlashing }">
                        <Transition name="qty" mode="out-in">
                          <span :key="item.quantity" class="qty-value">{{ item.quantity }}</span>
                        </Transition>
                      </div>
                      <button type="button" @click.stop="increaseQty(item)">+</button>
                    </div>
                  </div>
                  <div v-if="item.description" class="receipt-item-detail">
                    {{ item.description }}
                  </div>
                </div>
              </TransitionGroup>
            </div>

            <!-- TOTAL -->
            <div class="receipt-total">
              <div class="line" />

              <div class="total-row">
                <span>Jami</span>
                <div class="total-wrapper" :class="{ 'total-flash': totalFlashing }">
                  <Transition name="total" mode="out-in">
                    <strong :key="totalAmount">{{ formatPrice(totalAmount) }} so'm</strong>
                  </Transition>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- RIGHT: Search + Results  -->
        <div class="right">
          <!-- Header -->
          <div class="right-header">
            <!-- Order types -->
            <button
              v-for="t in ORDER_TYPES"
              :key="t.value"
              type="button"
              class="order-type"
              :class="{ active: orderType === t.value }"
              @click="setOrderType(t.value)"
            >
              {{ t.label }}
            </button>
            <div class="search-wrap">
              <input
                class="search-input"
                type="text"
                v-model="search"
                placeholder="Mahsulot qidirish"
                @focus="keyboardOpen = true"
              />

              <!-- v-if="search" -->
              <q-icon
                class="search-clear"
                @click="((search = ''), (keyboardOpen = true))"
                name="close"
                size="25px"
              />
            </div>

            <OrderDetailsDialog
              ref="detailsDialogRef"
              v-model:description="description"
              v-model:address="address"
              v-model:phone="phone_number"
              v-model:customer-name="customerName"
            />
          </div>

          <!-- Category Filter -->
          <div class="category-filter" :class="{ wrap: categoryLayout === 'wrap' }">
            <button
              type="button"
              class="category-btn"
              :class="{ active: selectedCategory === null }"
              @click="selectCategory(null)"
            >
              Barchasi
            </button>
            <button
              v-for="category in categories"
              :key="category.id"
              type="button"
              class="category-btn"
              :class="{ active: selectedCategory === category.id }"
              :style="{
                backgroundColor: category.colors[0],
              }"
              @click="selectCategory(category.id)"
            >
              {{ category.name }}
            </button>
          </div>

          <!-- Results -->
          <div class="products">
            <div v-if="products.length === 0 && search" class="products-state">
              Mahsulot topilmadi
            </div>

            <TransitionGroup v-if="products.length" name="product" tag="div" class="products-list">
              <button
                v-for="product in products"
                :key="product.id"
                type="button"
                class="product-item"
                :style="{
                  backgroundColor: 'var(--surface-2)',
                  borderBottomColor: product.colors?.[0] || 'var(--line)',
                  borderBottomWidth: product.colors?.[0] ? '4px' : '1px',
                }"
                @click="addProduct(product)"
              >
                <div class="product-name">
                  {{ product.name }}
                </div>
                <div class="product-price">{{ formatPrice(product.price) }} so'm</div>
              </button>
            </TransitionGroup>
          </div>

          <!-- Keyboard -->
        </div>
      </div>
      <!-- Bottom panel. Letter keys toggle (only when the keyboard is open).
           The action row (Orqaga | Bo'sh joy | Saqlash) is ALWAYS visible; the
           space key shows only while the keyboard is open. -->
      <div class="vk">
        <template v-if="virtualKeyboardEnabled && keyboardOpen">
          <div v-for="(row, rowIndex) in KEYBOARD_LAYOUT" :key="rowIndex" class="vk-row">
            <button
              v-for="key in row"
              :key="key"
              type="button"
              class="vk-key"
              @click="onKeyPress(key.toLowerCase())"
            >
              {{ key }}
            </button>
          </div>
        </template>

        <div class="vk-row vk-actions">
          <button type="button" class="btn secondary" @click="onCancel">
            <q-icon name="chevron_left" size="28px" class="back-icon" /> Orqaga
          </button>
          <button
            v-if="virtualKeyboardEnabled && keyboardOpen"
            type="button"
            class="vk-key space-key"
            @click="onKeyPress(' ')"
          >
            Bo'sh joy
          </button>
          <button
            type="button"
            class="btn primary"
            :disabled="!receiptItems.length || submitting"
            @click="createOrderAndOpenPayment"
          >
            <span v-if="submitting">Yuklanmoqda...</span>
            <span v-else>Saqlash</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Payment Confirmation Dialog (Full Screen) -->
    <PaymentConfirmationDialog
      v-model="showPaymentDialog"
      :order-id="createdOrderId"
      :display-id="createdDisplayId"
      :order-type="orderType"
      :total-amount="totalAmount"
      :items-count="totalItemsCount"
      :items="receiptItems"
      @paid="onOrderPaid"
      @cancel="onPaymentCancel"
      :order-description="description"
      :creator-id="currentUserId"
      :creator-name="currentUserName"
      :phone-number="phone_number"
    />
    <ReceiptItemDescriptionDialog
      v-model="showDescriptionDialog"
      :description="receiptItems[activeItemIndex]?.description || null"
      @save="saveItemDescription"
    />
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { api } from 'boot/axios';
import { useOperatorStore } from 'src/stores/operator';
import { useInstantProducts } from 'src/composables/useInstantProducts';
import { shouldPrintBefore } from 'src/composables/usePrintPolicy';
import OrderDetailsDialog from 'src/components/OrderDetailsDialog.vue';
import PaymentConfirmationDialog from 'src/components/PaymentConfirmationDialog.vue';
import { formatPrice } from 'src/utils/formatPrice';
import ReceiptItemDescriptionDialog from 'src/components/ReceiptItemDescriptionDialog.vue';
import { virtualKeyboardEnabled } from 'src/boot/virtual-keyboard';
import { read } from 'src/utils/storage';
import { useCategoryLayout } from 'src/composables/useCategoryLayout';
import { suppressInternetWarningOnPage } from 'src/composables/useInternetWarningSuppress';
import { useOrderTypes } from 'src/composables/useOrderTypes';

// While the cashier is mid-order, an internet-down modal would steal
// focus and risk losing the receipt being built. Suppress for the whole
// page lifetime — the dialog defers (doesn't drop) the notification, so
// it pops the moment the cashier navigates back to OrdersPage.
suppressInternetWarningOnPage();

type OrderType = 'HALL' | 'PICKUP' | 'DELIVERY';

interface Category {
  id: number;
  name: string;
  sort_order: number;
  colors: string[];
  status: string;
  slug: string;
  description: string;
  created_at: string;
  updated_at: string;
}

interface CategoriesResponse {
  success: boolean;
  data: {
    categories: Category[];
  };
}

interface ApiProduct {
  id: number;
  name: string;
  price: string;
  category: {
    id: string;
    name: string;
    slug: string;
  };
  // Backend sends `colors` (array). (The nested category carries no color.)
  colors: string[];
}

interface ProductsResponse {
  success: boolean;
  data: {
    products: ApiProduct[];
  };
}

interface ReceiptItem {
  productId: number;
  name: string;
  price: number;
  quantity: number;
  description: string;
  isFlashing: boolean;
  qtyFlashing: boolean;
}

interface CreateOrderPayload {
  order_type: OrderType;
  phone_number?: string;
  description?: string;
  // {name, phone} so the backend resolves/creates the unified Customer (saves a
  // new customer's name; converges a returning one by phone).
  customer?: { name?: string; phone?: string };
  items: Array<{
    product_id: number;
    quantity: number;
  }>;
}

interface CreateOrderResponse {
  success: boolean;
  data: {
    order_id: number;
    display_id: number;
  };
}

const KEYBOARD_LAYOUT: ReadonlyArray<ReadonlyArray<string>> = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M', '⌫'],
];

function onKeyPress(key: string): void {
  if (key === '⌫') {
    search.value = search.value.slice(0, -1);
    return;
  } else if (key === 'SPACE') {
    search.value += ' ';
  }

  search.value += key.toLowerCase();
}

const router = useRouter();

// Category-filter layout (Settings → Display): 'scroll' single row, 'wrap' multi-row.
const { layout: categoryLayout } = useCategoryLayout();

// Labels come from the shared source so a Settings edit updates them here too.
const { labels: orderLabels } = useOrderTypes();
const ORDER_TYPES = computed<ReadonlyArray<{ value: OrderType; label: string }>>(() => [
  { value: 'HALL', label: orderLabels.value.HALL },
  { value: 'PICKUP', label: orderLabels.value.PICKUP },
  { value: 'DELIVERY', label: orderLabels.value.DELIVERY },
]);

// Current cashier = the creator of orders made here. Passed to the payment
// dialog so the printed receipt shows them and the cross-cashier warning knows
// who built the order.
const me = read<{ id?: number; first_name?: string; last_name?: string }>('auth_user');
const currentUserId = me?.id ?? null;
const currentUserName = me ? `${me.first_name ?? ''} ${me.last_name ?? ''}`.trim() : null;

const receiptItems = ref<ReceiptItem[]>([]);

const orderType = ref<OrderType>('HALL');
const search = ref<string>('');

const allProducts = ref<ApiProduct[]>([]); // full catalog, fetched once on open
const categories = ref<Category[]>([]);
const selectedCategory = ref<number | null>(null);
// On-screen keyboard visibility (only the keys; the action row stays put).
// Picking a category hides it (browse mode); searching / adding reopens it.
const keyboardOpen = ref<boolean>(true);
const loadingProducts = ref<boolean>(false);
const loadingCategories = ref<boolean>(false);
const submitting = ref<boolean>(false);

// Client-side filtered view — instant, no per-keystroke server call. While
// searching, match the name across ALL products (category ignored); otherwise
// show the selected category (or everything).
const products = computed<ApiProduct[]>(() => {
  const q = search.value.trim().toLowerCase();
  if (q) return allProducts.value.filter((p) => p.name.toLowerCase().includes(q));
  if (selectedCategory.value != null) {
    return allProducts.value.filter(
      (p) => String(p.category?.id) === String(selectedCategory.value),
    );
  }
  return allProducts.value;
});

const description = ref('');
const address = ref('');
const phone_number = ref('');
const customerName = ref('');
const detailsDialogRef = ref<{ reset: () => void } | null>(null);

/* ---- operator-mode phone prefill ----
   Fill the phone field from (priority) the route ?phone query, else the live
   operator call. Works both when navigating in from the incoming-call dialog
   AND when a call lands while the operator is already on this page (watch). */
const route = useRoute();
const operator = useOperatorStore();
const { isAllInstant } = useInstantProducts();

function toFullPhone(raw: string): string {
  const digits = (raw || '').replace(/\D/g, '');
  const last9 = digits.slice(-9);
  return last9.length === 9 ? `+998${last9}` : raw;
}
function prefillPhone(raw: string | undefined | null): void {
  if (raw) phone_number.value = toFullPhone(String(raw));
}
watch(
  () => operator.activeCall,
  (c) => {
    if (c?.phone) prefillPhone(c.phone);
  },
  { deep: true },
);

// Payment dialog state
const showPaymentDialog = ref<boolean>(false);
const createdOrderId = ref<number | null>(null);
const createdDisplayId = ref<number | null>(null);

// Flash state for total
const totalFlashing = ref<boolean>(false);

// Helper function to trigger flash on an item
function triggerItemFlash(item: ReceiptItem): void {
  item.isFlashing = true;
  setTimeout(() => {
    item.isFlashing = false;
  }, 400);
}

// Helper function to trigger quantity flash
function triggerQtyFlash(item: ReceiptItem): void {
  item.qtyFlashing = true;
  setTimeout(() => {
    item.qtyFlashing = false;
  }, 300);
}

// Helper function to trigger total flash
function triggerTotalFlash(): void {
  totalFlashing.value = true;
  setTimeout(() => {
    totalFlashing.value = false;
  }, 400);
}

const totalAmount = computed<number>(() => {
  return receiptItems.value.reduce((sum, item) => {
    return sum + item.price * item.quantity;
  }, 0);
});

const totalItemsCount = computed<number>(() => {
  return receiptItems.value.reduce((sum, item) => sum + item.quantity, 0);
});

// Fetch categories from API
async function fetchCategories(): Promise<void> {
  loadingCategories.value = true;
  try {
    const response = await api.get<CategoriesResponse>('/categories', {
      params: { status: 'ACTIVE', per_page: 100 },
    });
    categories.value = response.data.data.categories;
  } catch (error) {
    console.error('Failed to fetch categories:', error);
  } finally {
    loadingCategories.value = false;
  }
}

// Select category filter — close the keyboard so the product grid gets the room
// (the cashier is now browsing the category, not typing).
function selectCategory(categoryId: number | null): void {
  selectedCategory.value = categoryId;
  keyboardOpen.value = false;
}

// Add this function to your script setup
async function printReceipt(displayId: number, isPaid = false): Promise<void> {
  const authUser = read<{ first_name: string; last_name: string }>('auth_user');
  const cashierName = authUser ? `${authUser.first_name} ${authUser.last_name}` : 'Kassir';

  // const logoUrl = new URL('../assets/logo-black.jpg', import.meta.url).href;
  // let logoBase64 = '';

  // try {
  //   const response = await fetch(logoUrl);
  //   const blob = await response.blob();
  //   logoBase64 = await new Promise<string>((resolve) => {
  //     const reader = new FileReader();
  //     reader.onloadend = () => resolve(reader.result as string);
  //     reader.readAsDataURL(blob);
  //   });D
  // } catch (err) {
  //   console.error('Failed to load logo:', err);
  // }

  const printData = {
    displayId,
    orderType: orderType.value,
    cashierName,
    items: receiptItems.value.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      price: item.price,
    })),
    total: totalAmount.value,
    description: description.value || undefined,
    address: address.value || undefined,
    phoneNumber: phone_number.value || undefined,
    isPaid,
    // logoBase64,
  };

  try {
    const result = await window.electron.printer.printReceipt(printData);

    if (!result.success) {
      console.error('Print failed:', result.error);
    }
  } catch (err) {
    console.error('Print error:', err);
  }
}

/* Order type */
function setOrderType(value: OrderType): void {
  orderType.value = value;
}

/* Load the WHOLE catalog once (paginated; /products caps at 100/page) so search
   + category filtering happen instantly on the client — no slow per-keystroke
   round-trip. */
async function loadAllProducts(): Promise<void> {
  loadingProducts.value = true;
  try {
    const perPage = 100;
    const all: ApiProduct[] = [];
    for (let page = 1; page <= 50; page++) {
      const response = await api.get<ProductsResponse>('/products', {
        params: { per_page: perPage, page },
      });
      const batch = response.data.data.products ?? [];
      all.push(...batch);
      if (batch.length < perPage) break; // last page
    }
    allProducts.value = all;
  } finally {
    loadingProducts.value = false;
  }
}

/* Searching across all products shows the "Barchasi" (no category) view. */
watch(search, (value) => {
  if (value) selectedCategory.value = null;
});

/* RECEIPT LOGIC */
function addProduct(product: ApiProduct): void {
  const price = Number(product.price);

  const existing = receiptItems.value.find((item) => item.productId === product.id);

  if (existing) {
    existing.quantity += 1;
    triggerQtyFlash(existing);
    triggerItemFlash(existing);
  } else {
    const newItem: ReceiptItem = {
      productId: product.id,
      name: product.name,
      price,
      quantity: 1,
      description: '',
      isFlashing: true,
      qtyFlashing: false,
    };
    receiptItems.value.push(newItem);

    // Remove flash after animation
    setTimeout(() => {
      newItem.isFlashing = false;
    }, 400);
  }

  // Flash the total
  triggerTotalFlash();

  // After adding: clear search, reset the category back to "Barchasi", and
  // reopen the keyboard so the cashier can immediately search the next item.
  search.value = '';
  selectedCategory.value = null;
  keyboardOpen.value = true;
}

function increaseQty(item: ReceiptItem): void {
  item.quantity += 1;
  triggerQtyFlash(item);
  triggerTotalFlash();
}

function decreaseQty(item: ReceiptItem): void {
  if (item.quantity > 1) {
    item.quantity -= 1;
    triggerQtyFlash(item);
    triggerTotalFlash();
  } else {
    receiptItems.value = receiptItems.value.filter((i) => i.productId !== item.productId);
    triggerTotalFlash();
  }
}

const showDescriptionDialog = ref(false);
const activeItemIndex = ref<number>(0);

function openDescription(index: number): void {
  activeItemIndex.value = index;
  showDescriptionDialog.value = true;
}

function saveItemDescription(value: string): void {
  if (activeItemIndex.value === null) return;

  receiptItems.value = receiptItems.value.map((item, i) => {
    if (i == activeItemIndex.value) {
      return { ...item, description: value };
    }
    return item;
  });
}

/* Create order first, then open payment dialog */
async function createOrderAndOpenPayment(): Promise<void> {
  if (receiptItems.value.length === 0) {
    return;
  }

  const payload: CreateOrderPayload = {
    order_type: orderType.value,
    phone_number: phone_number.value,
    description: description.value,
    items: receiptItems.value.map((item) => ({
      product_id: item.productId,
      quantity: item.quantity,
      detail: item.description,
    })),
  };

  // Add optional fields if provided
  if (phone_number.value.trim()) {
    payload.phone_number = phone_number.value.trim();
  }
  // Backend has a single `description` (no structured address field yet), so
  // fold Manzil (address) + Izoh (note) into it — nothing entered is lost. When
  // the backend gains an `address` key, send address.value there instead.
  const composedDesc = [address.value.trim(), description.value.trim()]
    .filter(Boolean)
    .join(' — ');
  if (composedDesc) {
    payload.description = composedDesc;
  }
  // Attach the customer so the backend saves a new name / converges a returning
  // one by phone (Customer.resolve). Only when we have a phone and/or a name.
  const custName = customerName.value.trim();
  const custPhone = phone_number.value.trim();
  if (custName || custPhone) {
    const customer: { name?: string; phone?: string } = {};
    if (custName) customer.name = custName;
    if (custPhone) customer.phone = custPhone;
    payload.customer = customer;
  }

  submitting.value = true;

  try {
    const response = await api.post<CreateOrderResponse>('/orders/create', payload);

    // Store created order info
    createdOrderId.value = response.data.data.order_id;
    createdDisplayId.value = response.data.data.display_id;

    // Print-before-payment per the order type's policy (Settings → Buyurtma
    // turlari). All-instant orders (drinks/packaged only) are NEVER auto-printed
    // — the cashier can still print manually.
    const allInstant = isAllInstant(receiptItems.value.map((i) => i.productId));
    if (!allInstant && shouldPrintBefore(orderType.value)) {
      void printReceipt(response.data.data.display_id, false);
    }

    // Open payment confirmation dialog
    showPaymentDialog.value = true;
  } catch (error) {
    console.error('Failed to create order:', error);
    alert('Buyurtma yaratishda xatolik yuz berdi');
  } finally {
    submitting.value = false;
  }
}

/* Called when order is paid */
function onOrderPaid(): void {
  resetForm();
}

/* Called when payment is cancelled (order stays unpaid) */
function onPaymentCancel(): void {
  resetForm();
}

function resetForm(): void {
  receiptItems.value = [];
  search.value = '';
  description.value = '';
  address.value = '';
  phone_number.value = '';
  customerName.value = '';
  detailsDialogRef.value?.reset();
  createdOrderId.value = null;
  createdDisplayId.value = null;
  selectedCategory.value = null;
  keyboardOpen.value = true;
  // Catalog stays cached (allProducts); the computed list resets via the cleared
  // search/category above.
}

function onCancel(): void {
  void router.push({ name: 'orders' });
}

onMounted(async () => {
  // Any lingering call popup shouldn't hang around behind the create-order page.
  operator.dismissPopup();
  // Operator prefill: ?phone query (from the call dialog button) wins, else the
  // last caller's number (pendingPhone — survives call end, set even if the
  // popup button wasn't clicked), else a live call in progress.
  prefillPhone(
    (route.query.phone as string | undefined) || operator.pendingPhone || operator.activeCall?.phone,
  );

  // Categories for the filter chips + the whole catalog (filtered client-side).
  await fetchCategories();
  await loadAllProducts();
});

onUnmounted(() => {
  // Create-order closed → reset the caller-phone prefill + any popup so the next
  // order starts clean (a stale caller number must not carry over).
  operator.clearPending();
  operator.dismissPopup();
});
</script>

<style scoped lang="scss">
.page-create {
  background: var(--surface-2);
  height: 100vh;
  overflow: hidden;
}

/* MAIN GRID */
.layout {
  height: 100%;
  display: flex;
  flex-direction: column;

  .container {
    flex: 1;
    display: grid;
    grid-template-columns: 360px 1fr;
    gap: 12px;
    padding: 12px;
    overflow: hidden;
  }
}

/* LEFT */
.left {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.order-type {
  flex: 0.8;
  height: 48px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--ink-2);
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);

  &:active {
    transform: scale(0.97);
  }

  &.active {
    color: var(--brand);
    border-color: var(--brand);
    background: var(--brand-soft);
  }
}

.left-content {
  flex: 1;
  min-height: 0;
  background: var(--surface);
  border-radius: 16px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--line);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.06);
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--ink);
}

.left-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.receipt-empty {
  margin-top: 16px;
  color: var(--ink-3);
}

.receipt-list {
  flex: 1;
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  padding-right: 4px;

  scrollbar-width: auto;
  scrollbar-color: var(--line-strong) var(--surface-2);
}

.receipt-list::-webkit-scrollbar {
  width: 8px;
}

.receipt-list::-webkit-scrollbar-thumb {
  background: var(--line-strong);
  border-radius: 6px;
}

.receipt-list::-webkit-scrollbar-track {
  background: var(--surface-2);
}

.receipt-item {
  background: var(--surface-2);
  color: var(--ink);
  border-radius: 12px;
  padding: 10px;
  border: 1px solid var(--line);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  cursor: pointer;
  transition:
    background-color 0.3s ease,
    border-color 0.3s ease,
    box-shadow 0.3s ease;

  &:active {
    transform: scale(0.98);
  }

  .receipt-item-body {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .receipt-item-detail {
    margin-top: 6px;
    font-size: 13px;
    color: var(--ink-2);
  }
}

/* Flash highlight for receipt item */
.receipt-item.flash-highlight {
  animation: item-flash 0.4s ease;
}

@keyframes item-flash {
  0% {
    background-color: var(--brand-soft);
    border-color: var(--brand);
    box-shadow: 0 0 12px color-mix(in srgb, var(--brand) 40%, transparent);
  }
  100% {
    background-color: var(--surface-2);
    border-color: var(--line);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  }
}

.quantity {
  display: flex;
  align-items: center;
  gap: 8px;

  button {
    width: 40px;
    height: 40px;
    border-radius: 10px;
    border: 1px solid var(--line);
    background: var(--surface);
    color: var(--ink);
    font-size: 18px;
    font-weight: 600;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    transition: all 0.15s ease;

    &:active {
      transform: scale(0.9);
      background: var(--brand-soft);
      border-color: var(--brand);
    }
  }
}

/* Quantity wrapper for flash effect */
.qty-wrapper {
  min-width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  transition:
    background-color 0.2s ease,
    box-shadow 0.2s ease;
}

.qty-wrapper.qty-flash {
  animation: qty-flash-effect 0.3s ease;
}

@keyframes qty-flash-effect {
  0% {
    background-color: var(--brand-soft);
    box-shadow: 0 0 8px color-mix(in srgb, var(--brand) 50%, transparent);
    transform: scale(1.1);
  }
  50% {
    background-color: var(--ready-bg);
    transform: scale(1.05);
  }
  100% {
    background-color: transparent;
    box-shadow: none;
    transform: scale(1);
  }
}

/* Quantity value styles */
.qty-value {
  min-width: 24px;
  text-align: center;
  display: inline-block;
  font-weight: 600;
}

.receipt-total .line {
  height: 1px;
  background: var(--line);
  margin-bottom: 8px;
}

.total-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: var(--ink);
  font-size: 16px;
  font-weight: 600;

  strong {
    display: inline-block;
  }
}

/* Total wrapper for flash effect */
.total-wrapper {
  padding: 4px 10px;
  border-radius: 8px;
  transition:
    background-color 0.3s ease,
    box-shadow 0.3s ease;
}

.total-wrapper.total-flash {
  animation: total-flash-effect 0.4s ease;
}

@keyframes total-flash-effect {
  0% {
    background-color: var(--brand-soft);
    box-shadow: 0 0 12px color-mix(in srgb, var(--brand) 50%, transparent);
    transform: scale(1.05);
  }
  50% {
    background-color: var(--ready-bg);
    transform: scale(1.02);
  }
  100% {
    background-color: transparent;
    box-shadow: none;
    transform: scale(1);
  }
}

/* RIGHT */
.right {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.right-header {
  display: flex;
  gap: 10px;
  margin-bottom: 10px;
}

.search-wrap {
  position: relative;
  flex: 1;
  display: flex;
}

.search-clear {
  position: absolute;
  right: 10px;
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

.search-input {
  flex: 1;
  // padding-right: 54px;
  height: 48px;
  border-radius: 12px;
  border: 1px solid var(--line);
  padding: 0 14px;
  background: var(--surface);
  color: var(--ink);
  font-size: 16px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

/* CATEGORY FILTER */
.category-filter {
  display: flex;
  gap: 8px;
  padding: 12px;
  overflow-x: scroll;
  background: var(--surface);
  border-radius: 16px 16px 0 0;
  border: 1px solid var(--line);
  border-bottom: none;
}
.category-filter::-webkit-scrollbar {
  display: none;
}
/* multi-line layout (Settings → Display): wrap to rows, no horizontal scroll */
.category-filter.wrap {
  flex-wrap: wrap;
  overflow-x: visible;
}
.category-filter.wrap .category-btn {
  flex: 0 0 auto;
}

.category-btn {
  padding: 8px 16px;
  border-radius: 20px;
  border: 2px solid var(--line);
  background: var(--surface);
  color: var(--ink-2);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;

  &:hover {
    border-color: var(--line-strong);
    background: var(--surface-2);
  }

  &:active {
    transform: scale(0.97);
  }

  &.active {
    transform: translateY(-3px);
    border-color: var(--brand);
  }

  // Default "Barchasi" button colors
  &:first-child.active {
    color: var(--brand);
    border-color: var(--brand);
    background: var(--brand-soft);
  }
}

.products {
  flex: 1;
  position: relative;
  background: var(--surface);
  border-radius: 0 0 16px 16px;
  padding: 0 10px 10px 10px;
  overflow-y: auto;
  border: 1px solid var(--line);
  border-top: none;

  scrollbar-width: thin;
}

.products::-webkit-scrollbar {
  width: 10px;
}

.products::-webkit-scrollbar-thumb {
  background-color: var(--line-strong);
  border-radius: 8px;
}

.products::-webkit-scrollbar-track {
  background: var(--surface);
}

.products-state {
  color: var(--ink-3);
}

.products-list {
  display: flex;
  flex-wrap: wrap;
  gap: 2%;
  row-gap: 10px;
}

.product-item {
  width: 32%;
  background: var(--surface-2);
  border-radius: 12px;
  padding: 12px;
  border: 1px solid var(--line);
  // border-bottom: 4px solid transparent;
  color: var(--ink);
  font-weight: bold;
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  transition:
    transform 0.15s ease,
    box-shadow 0.15s ease;

  &:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  &:active {
    transform: scale(0.96);
  }
}

.product-price {
  color: var(--ink-2);
  font-size: 14px;
}

/* BUTTONS */
.btn {
  height: 48px;
  border-radius: 12px;
  border: none;
  font-size: 16px;
  font-weight: 600;
  padding: 0 20px;
  cursor: pointer;
}

.secondary {
  background: var(--surface-2);
  color: var(--ink);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  padding-left: 0;
  display: flex;
  align-items: center;

  &:active {
    transform: scale(0.97);
  }
}

.primary {
  background: var(--brand);
  color: var(--surface);
  box-shadow: 0 2px 6px color-mix(in srgb, var(--brand) 30%, transparent);
  &:active {
    transform: scale(0.97);
  }
}

/* KEYBOARD */
.vk {
  background: var(--surface);
  padding: 10px;
  border-radius: 18px;
  border: 1px solid var(--line);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.06);
  user-select: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.vk-row {
  display: flex;
  gap: 8px;
  align-items: stretch;
}
/* In the action row, the Bekor/Saqlash buttons must match the space key:
   same height (56px), flex:1, centered text — so all three sit on one level. */
.vk-row .btn {
  flex: 1;
  min-height: 56px;
  height: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.vk-key {
  flex: 1;
  min-height: 56px;
  border-radius: 14px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  color: var(--ink);
  font-size: 18px;
  font-weight: 600;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);

  &:active {
    background: var(--surface-3);
    transform: scale(0.97);
  }
}

.vk-key.wide {
  flex: 3;
}

/* Action row: Orqaga | Bo'sh joy | Saqlash on one level. Back + Save keep their
   content width at the edges; the space key fills the middle (only present when
   the keyboard is open). When the space key is absent, space-between keeps Back
   left / Save right. */
.vk-actions {
  justify-content: space-between;
}
.vk-actions .btn {
  flex: 0 0 auto;
  min-height: 56px;
  height: auto;
  padding: 0 28px;
}
.vk-actions .space-key {
  flex: 1;
}

/* ==================== */
/* ANIMATIONS           */
/* ==================== */

/* Quantity number animation */
.qty-enter-active,
.qty-leave-active {
  transition: all 0.15s ease;
}

.qty-enter-from {
  opacity: 0;
  transform: scale(0.5) translateY(10px);
}

.qty-leave-to {
  opacity: 0;
  transform: scale(1.5) translateY(-10px);
}

/* Total amount animation */
.total-enter-active,
.total-leave-active {
  transition: all 0.2s ease;
}

.total-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.total-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

/* Receipt list item animation */
.list-enter-active,
.list-leave-active {
  transition: all 0.3s ease;
}

.list-enter-from {
  opacity: 0;
  transform: translateX(-30px) scale(0.95);
}

.list-leave-to {
  opacity: 0;
  transform: translateX(30px) scale(0.95);
}

.list-move {
  transition: transform 0.3s ease;
}

/* Product grid animation */
// .product-enter-active,
// .product-leave-active {
//   transition: all 0.25s ease;
// }

.product-enter-active {
  transition: all 0.25s ease;
}

.product-enter-from {
  opacity: 0;
  transform: scale(0.8);
}

// .product-leave-to {
//   opacity: 0;
//   transform: scale(0.8);
// }

.product-move {
  transition: transform 0.25s ease;
}
</style>
