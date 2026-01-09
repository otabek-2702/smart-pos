<template>
  <button class="back-btn" @click="goBack">
    <q-icon name="chevron_left" size="28px" class="back-icon" />
    Orqaga
  </button>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();

function goBack(): void {
  router.back();
}
</script>

<style scoped lang="scss">
.back-btn {
  display: inline-flex;
  align-items: center;

  background: transparent;
  border: none;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: 8px;

  transition:
    background-color 0.15s ease,
    color 0.15s ease,
    transform 0.1s ease;

  &:hover {
    color: var(--text-primary);
    background: var(--bg-surface-2);
  }

  &:active {
    transform: scale(0.97);
    transform: translateX(-2px);
  }
}
</style>
