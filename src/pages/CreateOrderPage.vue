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

              <div v-else class="receipt-list">
                <div
                  v-for="(item, index) in receiptItems"
                  :key="item.productId"
                  @click="openDescription(index)"
                  class="receipt-item"
                >
                  <div class="receipt-item-body">
                    <div class="info">
                      <div class="name">{{ item.name }}</div>
                      <div class="price">{{ formatPrice(item.price) }} so'm</div>
                    </div>

                    <div class="quantity">
                      <button type="button" @click.stop="decreaseQty(item)">−</button>
                      <span>{{ item.quantity }}</span>
                      <button type="button" @click.stop="increaseQty(item)">+</button>
                    </div>
                  </div>
                  <div class="receipt-item-detail receipt-empty">
                    {{ item.description }}
                  </div>
                </div>
              </div>
            </div>

            <!-- TOTAL -->
            <div class="receipt-total">
              <div class="line" />

              <div class="total-row">
                <span>Jami</span>
                <strong>{{ formatPrice(totalAmount) }} so'm</strong>
              </div>
            </div>
            <div class="left-footer"></div>
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
            <input
              class="search-input"
              type="text"
              :value="search"
              readonly
              placeholder="Mahsulot qidirish"
            />

            <OrderDetailsDialog v-model:description="description" v-model:phone="phone_number" />
          </div>

          <!-- Category Filter -->
          <div class="category-filter">
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

            <div v-if="products.length" class="products-list">
              <button
                v-for="product in products"
                :key="product.id"
                type="button"
                class="product-item"
                :style="{ backgroundColor: product.category.color[0] }"
                @click="addProduct(product)"
              >
                <div class="product-name">
                  {{ product.name }}
                </div>
                <div class="product-price">{{ formatPrice(product.price) }} so'm</div>
              </button>
            </div>
          </div>

          <!-- Keyboard -->
        </div>
      </div>
      <div class="vk">
        <div v-for="(row, rowIndex) in KEYBOARD_LAYOUT" :key="rowIndex" class="vk-row">
          <button
            v-for="key in row"
            :key="key"
            type="button"
            class="vk-key"
            :class="{ wide: key === 'SPACE' }"
            @click="onKeyPress(key.toLowerCase())"
          >
            {{ key }}
          </button>
        </div>
        <div class="vk-row">
          <button type="button" class="btn secondary" @click="onCancel">Bekor qilish</button>
          <button type="button" class="vk-key wide" @click="onKeyPress('space')">Bo'sh joy</button>
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
    />
    <ReceiptItemDescriptionDialog
      v-model="showDescriptionDialog"
      :description="receiptItems[activeItemIndex]?.description || null"
      @save="saveItemDescription"
    />
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api } from 'boot/axios';
import OrderDetailsDialog from 'src/components/OrderDetailsDialog.vue';
import PaymentConfirmationDialog from 'src/components/PaymentConfirmationDialog.vue';
import { formatPrice } from 'src/utils/formatPrice';
import ReceiptItemDescriptionDialog from 'src/components/ReceiptItemDescriptionDialog.vue';

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
    color: string[];
  };
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
}

interface CreateOrderPayload {
  order_type: OrderType;
  phone_number?: string;
  description?: string;
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

const ORDER_TYPES: ReadonlyArray<{ value: OrderType; label: string }> = [
  { value: 'HALL', label: 'Zal' },
  { value: 'PICKUP', label: 'S soboy' },
  { value: 'DELIVERY', label: 'Dostavka' },
];

const receiptItems = ref<ReceiptItem[]>([]);

const orderType = ref<OrderType>('HALL');
const search = ref<string>('');

const products = ref<ApiProduct[]>([]);
const categories = ref<Category[]>([]);
const selectedCategory = ref<number | null>(null);
const loadingProducts = ref<boolean>(false);
const loadingCategories = ref<boolean>(false);
const submitting = ref<boolean>(false);

const description = ref('');
const phone_number = ref('');

// Payment dialog state
const showPaymentDialog = ref<boolean>(false);
const createdOrderId = ref<number | null>(null);
const createdDisplayId = ref<number | null>(null);

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

// Select category filter
function selectCategory(categoryId: number | null): void {
  selectedCategory.value = categoryId;
  void fetchProducts('');
}

// Add this function to your script setup
async function printReceipt(displayId: number): Promise<void> {
  const authUserStr = localStorage.getItem('auth_user');
  const authUser = authUserStr
    ? (JSON.parse(authUserStr) as { first_name: string; last_name: string })
    : null;
  const cashierName = authUser ? `${authUser.first_name} ${authUser.last_name}` : 'Kassir';

  const logoUrl = new URL('../assets/logo-black.jpg', import.meta.url).href;
  let logoBase64 = '';

  try {
    const response = await fetch(logoUrl);
    const blob = await response.blob();
    logoBase64 = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.error('Failed to load logo:', err);
  }

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
    phoneNumber: phone_number.value || undefined,
    logoBase64,
  };

  try {
    type PrintResult = { success: boolean; error?: string };
    const result = await (
      window as unknown as {
        electron: {
          ipcRenderer: { invoke: (channel: string, data: unknown) => Promise<PrintResult> };
        };
      }
    ).electron.ipcRenderer.invoke('print-receipt', printData);

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

/* API search */
async function fetchProducts(query: string): Promise<void> {
  loadingProducts.value = true;

  try {
    const response = await api.get<ProductsResponse>('/products', {
      params: { search: query, per_page: 100, category_ids: selectedCategory.value },
    });

    products.value = response.data.data.products;
  } finally {
    loadingProducts.value = false;
  }
}

/* Watch search (MAIN LOGIC) */
watch(search, (value) => {
  // Reset category filter when searching
  if (value) {
    selectedCategory.value = null;
  }
  void fetchProducts(value);
});

/* RECEIPT LOGIC */
function addProduct(product: ApiProduct): void {
  const price = Number(product.price);

  const existing = receiptItems.value.find((item) => item.productId === product.id);

  if (existing) {
    existing.quantity += 1;
  } else {
    receiptItems.value.push({
      productId: product.id,
      name: product.name,
      price,
      quantity: 1,
      description: '',
    });
  }

  // UX FIX
  search.value = '';
}

function increaseQty(item: ReceiptItem): void {
  item.quantity += 1;
}

function decreaseQty(item: ReceiptItem): void {
  if (item.quantity > 1) {
    item.quantity -= 1;
  } else {
    receiptItems.value = receiptItems.value.filter((i) => i.productId !== item.productId);
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
  if (description.value.trim()) {
    payload.description = description.value.trim();
  }

  submitting.value = true;

  try {
    const response = await api.post<CreateOrderResponse>('/orders/create', payload);

    // Store created order info
    createdOrderId.value = response.data.data.order_id;
    createdDisplayId.value = response.data.data.display_id;

    // 🖨️ Print receipt here!
    void printReceipt(response.data.data.display_id);

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
  products.value = [];
  description.value = '';
  phone_number.value = '';
  createdOrderId.value = null;
  createdDisplayId.value = null;
  selectedCategory.value = null;
  // Reload products
  void fetchProducts('');
}

function onCancel(): void {
  void router.push({ name: 'orders' });
}

onMounted(async () => {
  // First fetch categories, then products
  await fetchCategories();
  await fetchProducts('');
});
</script>

<style scoped lang="scss">
.page-create {
  background: #f1f3f5;
  height: 100vh;
  overflow: hidden;
}

/* MAIN GRID */
.layout {
  height: 100%;
  display: flex;
  flex-direction: column;

  .container {
    height: 70%;
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
  flex: 1;
  height: 48px;
  border-radius: 12px;
  border: 1px solid #e2e5e9;
  background: #ffffff;
  color: #6b7280;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);

  &:active {
    transform: scale(0.97);
  }

  &.active {
    color: #16a34a;
    border-color: #16a34a;
    background: #e7f5ee;
  }
}

.left-content {
  flex: 1;
  min-height: 0;
  background: #ffffff;
  border-radius: 16px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid #e2e5e9;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.06);
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
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
  color: #9ca3af;
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
  scrollbar-color: #cbd5e1 #f1f3f5;
}

.receipt-list::-webkit-scrollbar {
  width: 8px;
}

.receipt-list::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 6px;
}

.receipt-list::-webkit-scrollbar-track {
  background: #f1f3f5;
}

.receipt-item {
  background: #f8fafc;
  color: #1f2937;
  border-radius: 12px;
  padding: 10px;
  border: 1px solid #e2e5e9;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  cursor: pointer;

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
    color: #6b7280;
  }
}

.quantity {
  display: flex;
  align-items: center;
  gap: 8px;

  button {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    border: 1px solid #e2e5e9;
    background: #ffffff;
    color: #1f2937;
    font-size: 18px;
    font-weight: 600;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);

    &:active {
      transform: scale(0.95);
    }
  }
}

.receipt-total .line {
  height: 1px;
  background: #e2e5e9;
  margin-bottom: 8px;
}

.total-row {
  display: flex;
  justify-content: space-between;
  color: #1f2937;
  font-size: 16px;
  font-weight: 600;
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

.search-input {
  height: 48px;
  border-radius: 12px;
  border: 1px solid #e2e5e9;
  padding: 0 14px;
  background: #ffffff;
  color: #1f2937;
  font-size: 16px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

/* CATEGORY FILTER */
.category-filter {
  display: flex;
  gap: 8px;
  padding: 12px;
  overflow-x: scroll;
  background: #ffffff;
  border-radius: 16px 16px 0 0;
  border: 1px solid #e2e5e9;
  border-bottom: none;
}
.category-filter::-webkit-scrollbar {
  display: none;
}

.category-btn {
  padding: 8px 16px;
  border-radius: 20px;
  border: 2px solid #e2e5e9;
  background: #ffffff;
  color: #6b7280;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;

  &:hover {
    border-color: #d1d5db;
    background: #f9fafb;
  }

  &:active {
    transform: scale(0.97);
  }

  &.active {
    transform: translateY(-3px);
    border-color: #16a34a;
  }

  // Default "Barchasi" button colors
  &:first-child.active {
    color: #16a34a;
    border-color: #16a34a;
    background: #e7f5ee;
  }
}

.products {
  flex: 1;
  position: relative;
  background: #ffffff;
  border-radius: 0 0 16px 16px;
  padding: 0 10px 10px 10px;
  overflow-y: auto;
  border: 1px solid #e2e5e9;
  border-top: none;

  scrollbar-width: thin;
}

.products::-webkit-scrollbar {
  width: 10px;
}

.products::-webkit-scrollbar-thumb {
  background-color: #cbd5e1;
  border-radius: 8px;
}

.products::-webkit-scrollbar-track {
  background: #ffffff;
}

.products-state {
  color: #9ca3af;
}

.products-list {
  display: flex;
  flex-wrap: wrap;
  gap: 2%;
  row-gap: 10px;
}

.product-item {
  width: 32%;
  background: #f8fafc;
  border-radius: 12px;
  padding: 12px;
  border: 1px solid #e2e5e9;
  color: #1f2937;
  font-weight: bold;
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);

  &:active {
    transform: scale(0.98);
  }
}

.product-price {
  color: #6b7280;
  font-size: 14px;
}

/* BUTTONS */
.btn {
  border-radius: 12px;
  border: none;
  font-size: 16px;
  font-weight: 600;
  padding: 0 20px;
}

.secondary {
  background: #f1f3f5;
  color: #374151;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);

  &:active {
    transform: scale(0.97);
  }
}

.primary {
  background: #16a34a;
  color: #ffffff;
  box-shadow: 0 2px 6px rgba(22, 163, 74, 0.3);
  &:active {
    transform: scale(0.97);
  }
}

/* KEYBOARD */
.vk {
  background: #ffffff;
  padding: 10px;
  border-radius: 18px;
  border: 1px solid #e2e5e9;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.06);
  user-select: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.vk-row {
  display: flex;
  gap: 8px;
}

.vk-key {
  flex: 1;
  min-height: 56px;
  border-radius: 14px;
  border: 1px solid #e2e5e9;
  background: #f8fafc;
  color: #1f2937;
  font-size: 18px;
  font-weight: 600;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);

  &:active {
    background: #e5e7eb;
    transform: scale(0.97);
  }
}

.vk-key.wide {
  flex: 3;
}
</style>