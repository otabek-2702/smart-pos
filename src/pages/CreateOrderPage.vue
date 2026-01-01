<template>
  <q-page class="page-create">
    <div class="layout">
      <!-- LEFT: Receipt / Control -->
      <div class="left">
        <!-- Order types -->
        <div class="order-types">
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
        </div>

        <div class="left-content">
          <div class="left-body">
            <div class="section-title">Chek</div>

            <div v-if="receiptItems.length === 0" class="receipt-empty">Mahsulotlar yo‘q</div>

            <div v-else class="receipt-list">
              <div v-for="item in receiptItems" :key="item.productId" class="receipt-item">
                <div class="info">
                  <div class="name">{{ item.name }}</div>
                  <div class="price">{{ item.price }} so‘m</div>
                </div>

                <div class="quantity">
                  <button type="button" @click="decreaseQty(item)">−</button>
                  <span>{{ item.quantity }}</span>
                  <button type="button" @click="increaseQty(item)">+</button>
                </div>
              </div>
            </div>
          </div>

          <div class="left-footer">
            <button type="button" class="btn secondary" @click="onCancel">Bekor qilish</button>

            <button
              type="button"
              class="btn primary"
              :disabled="!receiptItems.length"
              @click="submitOrder"
            >
              Saqlash
            </button>
          </div>
        </div>
      </div>

      <!-- RIGHT: Search + Results + Keyboard -->
      <div class="right">
        <!-- Header -->
        <div class="right-header">
          <input
            class="search-input"
            type="text"
            :value="search"
            readonly
            placeholder="Mahsulot qidirish"
          />

          <OrderDetailsDialog v-model:description="description" v-model:phone="phone_number" />
        </div>

        <!-- Results -->
        <div class="products">
          <!-- <div v-if="loadingProducts" class="products-state">
            Yuklanmoqda…
          </div> -->

          <div v-if="products.length === 0 && search" class="products-state">
            Mahsulot topilmadi
          </div>

          <!-- <div
            v-else-if="!search"
            class="products-state"
          >
            Qidirishni boshlang
          </div> -->

          <div v-if="products.length" class="products-list">
            <button
              v-for="product in products"
              :key="product.id"
              type="button"
              class="product-item"
              @click="addProduct(product)"
            >
              <div class="product-name">
                {{ product.name }}
              </div>
              <div class="product-price">{{ product.price }} so‘m</div>
            </button>
          </div>
        </div>

        <!-- Keyboard -->
        <VirtualKeyboard @input="onInput" @backspace="onBackspace" />
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api } from 'boot/axios';
import VirtualKeyboard from 'components/virtual-keyboard/VirtualKeyboard.vue';
import OrderDetailsDialog from 'src/components/OrderDetailsDialog.vue';

type OrderType = 'HALL' | 'PICKUP' | 'DELIVERY';

interface ApiProduct {
  id: number;
  name: string;
  price: string;
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
}
interface CreateOrderPayload {
  order_type: OrderType;
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

const router = useRouter();

const ORDER_TYPES: ReadonlyArray<{ value: OrderType; label: string }> = [
  { value: 'HALL', label: 'Zal' },
  { value: 'PICKUP', label: 'Olib ketish' },
  { value: 'DELIVERY', label: 'Yetkazib berish' },
];

const receiptItems = ref<ReceiptItem[]>([]);

const orderType = ref<OrderType>('HALL');
const search = ref<string>('');

const products = ref<ApiProduct[]>([]);
const loadingProducts = ref<boolean>(false);
const submitting = ref<boolean>(false);

const description = ref('');
const phone_number = ref('');

/* Order type */
function setOrderType(value: OrderType): void {
  orderType.value = value;
}

/* Keyboard input */
function onInput(value: string): void {
  search.value += value;
}

function onBackspace(): void {
  search.value = search.value.slice(0, -1);
}

/* API search */
async function fetchProducts(query: string): Promise<void> {
  //   if (!query.trim()) {
  //     products.value = []
  //     return
  //   }

  loadingProducts.value = true;

  try {
    const response = await api.get<ProductsResponse>('/products', {
      params: { search: query },
    });

    products.value = [
      ...response.data.data.products,
      ...response.data.data.products,
      ...response.data.data.products,
    ];
  } finally {
    loadingProducts.value = false;
  }
}

/* Watch search (MAIN LOGIC) */
watch(search, (value) => {
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

async function submitOrder(): Promise<void> {
  if (receiptItems.value.length === 0) {
    return;
  }

  const payload: CreateOrderPayload = {
    order_type: orderType.value,
    items: receiptItems.value.map((item) => ({
      product_id: item.productId,
      quantity: item.quantity,
    })),
  };

  submitting.value = true;

  try {
    const response = await api.post<CreateOrderResponse>('/orders/create', payload);

    // ✅ POS behavior:
    // order created → go to orders list
    console.log('Order created', response.data.data);

    receiptItems.value = [];
    search.value = '';
    products.value = [];

    void router.push({ name: 'orders' });
  } finally {
    submitting.value = false;
  }
}

function onCancel(): void {
  void router.push({ name: 'orders' });
}

onMounted(() => {
  void fetchProducts('');
});
</script>

<style lang="scss">
.page-create {
  background: #0f1115;
  height: 100vh;
}

/* MAIN GRID */
.layout {
  height: 100%;
  display: grid;
  grid-template-columns: 360px 1fr;
  gap: 12px;
  padding: 12px;
}

/* LEFT */
.left {
  display: flex;
  flex-direction: column;
}

.order-types {
  display: flex;
  gap: 8px;
  padding-bottom: 12px;
}

.order-type {
  flex: 1;
  height: 48px;
  border-radius: 12px;
  border: none;
  background: #1a1d23;
  color: #b0b0b0;
  font-weight: 600;
  cursor: pointer;

  &.active {
    color: #ff7a00;
  }
}

.left-content {
  flex: 1;
  background: #1a1d23;
  border-radius: 16px;
  padding: 12px;
  display: flex;
  flex-direction: column;
}

.left-body {
  flex: 1;
}
.section-title {
  font-size: 14px;
  font-weight: 600;
  color: #ffffff;
}

.left-body {
  flex: 1;
  overflow: hidden;
}

.receipt-empty {
  margin-top: 16px;
  color: #b0b0b0;
}

.receipt-list {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
}

.receipt-list::-webkit-scrollbar {
  width: 8px;
}

.receipt-list::-webkit-scrollbar-thumb {
  background: #ff7a00;
  border-radius: 6px;
}

.receipt-item {
  background: #23262d;
  color: #ffffff;
  border-radius: 12px;
  padding: 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.quantity {
  display: flex;
  align-items: center;
  gap: 8px;

  button {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    border: none;
    background: #1a1d23;
    color: #ffffff;
    font-size: 18px;
    font-weight: 600;

    &:active {
      transform: scale(0.95);
    }
  }
}

.left-footer {
  display: flex;
  gap: 8px;
}

/* RIGHT */
.right {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0; /* 🔑 NO SCROLL */
}

.right-header {
  display: flex;
  gap: 10px;
}
.right-header > * {
  flex: 1;
}

.search-input {
  height: 48px;
  border-radius: 12px;
  border: none;
  padding: 0 14px;
  background: #1a1d23;
  color: #ffffff;
  font-size: 16px;
}

.products {
  flex: 1;
  min-height: 0;
  background: #1a1d23;
  border-radius: 16px;
  padding: 12px 6px 12px 12px;
  overflow-y: auto;

  /* Firefox */
  scrollbar-width: auto; /* вместо thin */
  scrollbar-color: #ff7a00 #1a1d23;
}

/* Chrome / Edge / Electron */
.products::-webkit-scrollbar {
  width: 10px; /* ← было 6px */
}

.products::-webkit-scrollbar-track {
  background: #1a1d23;
  border-radius: 8px;
}

.products::-webkit-scrollbar-thumb {
  background-color: #ff7a00;
  border-radius: 8px;
}

.products-state {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #b0b0b0;
}

.products-list {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  width: 100%;
  gap: 1.5%;
  row-gap: 10px;
}

.product-item {
  width: 32%;
  background: #23262d;
  border-radius: 12px;
  padding: 12px;
  border: none;
  color: #ffffff;
  text-align: left;
  cursor: pointer;

  &:active {
    transform: scale(0.98);
  }
}

.product-name {
  font-weight: 600;
}

.product-price {
  color: #b0b0b0;
  font-size: 14px;
}

/* BUTTONS */
.btn {
  flex: 1;
  height: 48px;
  border-radius: 12px;
  border: none;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
}

.btn.secondary {
  background: #23262d;
  color: #b0b0b0;
}

.btn.primary {
  background: #ff7a00;
  color: #ffffff;
}
</style>
