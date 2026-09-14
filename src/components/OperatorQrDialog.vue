<template>
  <Teleport to="body">
    <div
      v-if="store.qrVisible"
      class="oq"
      @click.self="store.hidePairing()"
      @keydown.esc="store.hidePairing()"
    >
      <div class="oq__box" role="dialog" aria-modal="true" aria-labelledby="operator-pairing-title">
        <div id="operator-pairing-title" class="oq__title">Telefonni ulash</div>
        <div class="oq__name">{{ store.deviceName }}</div>
        <img v-if="store.qrDataUrl" :src="store.qrDataUrl" alt="QR" class="oq__qr" />
        <div v-else-if="store.busy" class="oq__hint">QR kod yuklanmoqda…</div>
        <div class="oq__hint">
          Operator telefonida bir marta skanerlang. Ulanish shu kompyuter uchun saqlanadi.
        </div>
        <div v-if="!store.operatorMode" class="oq__hint">
          Qo‘ng‘iroqlarni olish uchun Operator rejimini yoqing.
        </div>
        <div v-if="store.error" class="oq__error" role="alert">{{ store.error }}</div>
        <button type="button" class="btn secondary" autofocus @click="store.hidePairing()">
          Yopish
        </button>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { useOperatorStore } from 'src/stores/operator';

const store = useOperatorStore();
</script>

<style scoped lang="scss">
.oq {
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
.oq__box {
  max-width: 400px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-xl);
  box-shadow: var(--shadow-lg);
  padding: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}
.oq__title {
  font-size: 18px;
  font-weight: 800;
  color: var(--text);
}
.oq__qr {
  width: 280px;
  height: 280px;
  border-radius: var(--r-md);
  background: #fff;
}
.oq__hint {
  font-size: 14px;
  color: var(--text-secondary);
  text-align: center;
}
.oq__name {
  color: var(--text);
  font-weight: 600;
}
.oq__error {
  color: var(--danger, #ef6b6b);
  font-size: 14px;
  overflow-wrap: anywhere;
}
.btn.secondary {
  height: 44px;
  min-width: 140px;
  border-radius: var(--r-md);
  border: 1px solid var(--border-strong);
  background: var(--surface-2);
  color: var(--text);
  font-weight: 700;
  cursor: pointer;
  &:active {
    transform: scale(0.98);
  }
}
</style>
