<template>
  <Teleport to="body">
    <div v-if="visible" class="icd" @click.self="store.dismissPopup()">
      <div class="icd__box">
        <div class="icd__head">
          <div class="icd__who">
            <div class="icd__title">{{ store.popup?.customer?.name || 'Yangi mijoz' }}</div>
            <div class="icd__phone">{{ displayPhone }}</div>
          </div>
          <button type="button" class="icd__x" aria-label="Yopish" @click="store.dismissPopup()">
            <q-icon name="close" size="22px" />
          </button>
        </div>

        <div class="icd__dir">
          <q-icon
            :name="store.activeCall?.direction === 'out' ? 'call_made' : 'call_received'"
            size="16px"
          />
          {{ store.activeCall?.direction === 'out' ? 'Chiquvchi' : 'Kiruvchi' }} qo'ng'iroq
        </div>

        <div v-if="orders.length" class="icd__orders">
          <div class="icd__orders-label">Ochiq buyurtmalar</div>
          <button
            v-for="o in orders"
            :key="o.id"
            type="button"
            class="icd__order"
            @click="store.goToOrder()"
          >
            <span class="icd__order-id">#{{ o.displayId }}</span>
            <span class="icd__order-status">{{ statusLabel(o.status) }}</span>
            <span class="icd__order-total">{{ formatPrice(o.total) }} so'm</span>
          </button>
        </div>
        <div v-else class="icd__empty">Ochiq buyurtmalar yo'q</div>

        <div class="icd__foot">
          <button type="button" class="btn secondary" @click="store.dismissPopup()">Yopish</button>
          <button
            type="button"
            class="btn primary"
            @click="store.createOrder(store.popup?.phone || '')"
          >
            + Yangi buyurtma
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useOperatorStore } from 'src/stores/operator';
import { formatPrice } from 'src/utils/formatPrice';
import { formatPhoneNumber } from 'src/utils';

const store = useOperatorStore();

// Visible whenever there's a popup — including on the create-order page. The
// caller's number is NEVER auto-filled; it reaches the order only via the
// "+ Yangi buyurtma" button below.
const visible = computed(() => !!store.popup);

const orders = computed(() => store.popup?.openOrders ?? []);
const displayPhone = computed(() =>
  store.popup?.phone ? formatPhoneNumber(store.popup.phone) : '',
);

const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Ochiq',
  PREPARING: 'Jarayonda',
  READY: 'Tayyor',
  PAID: "To'langan",
  CANCELLED: 'Bekor qilingan',
};
function statusLabel(s: string): string {
  return STATUS_LABELS[s] || s;
}
</script>

<style scoped lang="scss">
.icd {
  position: fixed;
  inset: 0;
  z-index: 4200;
  background: var(--overlay);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.icd__box {
  width: 100%;
  max-width: 440px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-xl);
  box-shadow: var(--shadow-lg);
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.icd__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.icd__title {
  font-size: 20px;
  font-weight: 800;
  color: var(--text);
}
.icd__phone {
  margin-top: 2px;
  font-size: 15px;
  color: var(--text-secondary);
  font-family: var(--font-mono);
}
.icd__x {
  width: 40px;
  height: 40px;
  border-radius: var(--r-md);
  border: 1px solid var(--border-color);
  background: var(--surface-2);
  color: var(--text);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  &:active {
    transform: scale(0.95);
  }
}
.icd__dir {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  padding: 4px 10px;
  border-radius: var(--r-pill);
  background: var(--primary-weak);
  color: var(--primary);
  font-size: 13px;
  font-weight: 700;
}
.icd__orders {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.icd__orders-label {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: var(--tracking-label);
  text-transform: uppercase;
  color: var(--text-tertiary);
}
.icd__order {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: var(--r-md);
  border: 1px solid var(--border);
  background: var(--surface-2);
  cursor: pointer;
  &:hover {
    border-color: var(--border-strong);
  }
  &:active {
    transform: scale(0.99);
  }
}
.icd__order-id {
  font-weight: 800;
  color: var(--text);
  font-family: var(--font-mono);
}
.icd__order-status {
  font-size: 13px;
  color: var(--text-secondary);
}
.icd__order-total {
  font-weight: 700;
  color: var(--text);
  font-family: var(--font-mono);
}
.icd__empty {
  padding: 8px 0;
  color: var(--text-tertiary);
  font-size: 14px;
}
.icd__foot {
  display: flex;
  gap: 10px;
  margin-top: 4px;
}
.btn {
  flex: 1;
  height: 48px;
  border-radius: var(--r-md);
  border: 1px solid transparent;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  &:active {
    transform: scale(0.98);
  }
}
.btn.secondary {
  background: var(--surface-2);
  color: var(--text);
  border-color: var(--border-strong);
}
.btn.primary {
  background: var(--primary);
  color: var(--on-primary);
}
</style>
