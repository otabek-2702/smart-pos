<template>
  <Teleport to="body">
    <div v-if="visible" class="oq" @click.self="hidden = true">
      <div class="oq__box">
        <div class="oq__title">Operator rejimi</div>
        <img v-if="store.qrDataUrl" :src="store.qrDataUrl" alt="QR" class="oq__qr" />
        <div class="oq__hint">Operator telefoni bilan skanerlang</div>
        <button type="button" class="btn secondary" @click="hidden = true">Yopish</button>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useOperatorStore } from 'src/stores/operator';

const store = useOperatorStore();

// Visible while operatorMode && qrDataUrl. A local "hide" lets the operator
// dismiss the QR after pairing without turning operator mode off; it re-shows
// if operator mode is toggled again (a fresh QR).
const hidden = ref(false);
watch(
  () => store.qrDataUrl,
  (url) => {
    if (url) hidden.value = false;
  },
);
const visible = computed(() => store.operatorMode && !!store.qrDataUrl && !hidden.value);
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
