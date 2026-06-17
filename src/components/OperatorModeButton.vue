<template>
  <button
    type="button"
    class="op-btn"
    :class="{ on: store.operatorMode }"
    @click="store.toggle()"
  >
    <q-icon name="headset_mic" size="20px" />
    {{ store.operatorMode ? 'Operator ON' : 'Operator rejimi' }}
  </button>
</template>

<script setup lang="ts">
import { useOperatorStore } from 'src/stores/operator';

const store = useOperatorStore();
</script>

<style scoped>
.op-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 44px;
  padding: 0 16px;
  border-radius: 14px;
  border: 1px solid var(--border-color);
  background: var(--btn-secondary-bg);
  color: var(--btn-secondary-text);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: var(--shadow-sm);
  white-space: nowrap;
}
.op-btn:active {
  transform: scale(0.97);
}
.op-btn.on {
  background: var(--success);
  color: #fff;
  border-color: var(--success);
}
</style>
