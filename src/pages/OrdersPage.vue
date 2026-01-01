<template>
  <q-page class="page-orders">
    <!-- Header -->
    <div class="header">
      <div class="title">Orders</div>

      <button
        type="button"
        class="create-button"
        @click="createOrder"
      >
        + Buyurtma yaratish
      </button>
    </div>

    <!-- Status filters -->
    <div class="filters">
      <button
        v-for="s in STATUSES"
        :key="s"
        type="button"
        class="filter"
        :class="{ active: status === s }"
        @click="changeStatus(s)"
      >
        {{ s }}
      </button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="loading">
      Yuklanmoqda…
    </div>

    <!-- Orders list -->
    <div v-else class="orders-list">
      <div
        v-for="order in orders"
        :key="order.id"
        class="order-row"
      >
        <div class="order-id">#{{ order.displayId }}</div>

        <div class="order-meta">
          {{ order.itemsCount }} items
        </div>

        <div class="order-amount">
          {{ order.totalAmount }}
        </div>

        <div class="order-time">
          {{ order.time }}
        </div>

        <div class="order-status">
          {{ order.status }}
        </div>
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from 'boot/axios'

type OrderStatus = 'OPEN' | 'PAID' | 'CANCEL'

interface ApiOrder {
  id: number
  display_id: number
  status: OrderStatus
  total_amount: string
  items_count: number
  created_at: string
}

interface OrdersResponse {
  success: boolean
  data: {
    orders: ApiOrder[]
  }
}

interface Order {
  id: number
  displayId: number
  status: OrderStatus
  totalAmount: string
  itemsCount: number
  time: string
}

const router = useRouter()

const STATUSES: ReadonlyArray<OrderStatus> = ['OPEN', 'PAID', ]

const status = ref<OrderStatus>('OPEN')
const orders = ref<Order[]>([])
const loading = ref<boolean>(false)

function mapOrder(order: ApiOrder): Order {
  return {
    id: order.id,
    displayId: order.display_id,
    status: order.status,
    totalAmount: order.total_amount,
    itemsCount: order.items_count,
    time: new Date(order.created_at).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    })
  }
}

async function fetchOrders(): Promise<void> {
  loading.value = true

  try {
    const response = await api.get<OrdersResponse>('/orders', {
      params: { status: status.value }
    })

    orders.value = response.data.data.orders.map(mapOrder)
  } finally {
    loading.value = false
  }
}

function changeStatus(s: OrderStatus): void {
  status.value = s
  void fetchOrders()
}

function createOrder(): void {
  void router.push({ name: 'create-order' })
}

onMounted(() => {
  void fetchOrders()
})
</script>


<style lang="scss">
.page-orders {
  background: #0f1115;
  padding: 16px;
  color: #ffffff;
}

/* Header */
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.title {
  font-size: 20px;
  font-weight: 600;
}

.create-button {
  background: #ff7a00;
  border: none;
  border-radius: 12px;
  padding: 10px 16px;
  color: #ffffff;
  font-weight: 600;
  cursor: pointer;
}

/* Filters */
.filters {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.filter {
  background: #1a1d23;
  border: none;
  border-radius: 10px;
  padding: 8px 14px;
  color: #b0b0b0;
  cursor: pointer;

  &.active {
    color: #ff7a00;
  }
}

/* Orders */
.loading {
  color: #b0b0b0;
}

.orders-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.order-row {
  display: grid;
  grid-template-columns: 80px 1fr 120px 80px 80px;
  background: #1a1d23;
  border-radius: 12px;
  padding: 12px;
  align-items: center;
}

.order-id {
  font-weight: 600;
}

.order-meta,
.order-time {
  color: #b0b0b0;
}

.order-amount {
  text-align: right;
}

.order-status {
  text-align: right;
  color: #ff7a00;
}
</style>
