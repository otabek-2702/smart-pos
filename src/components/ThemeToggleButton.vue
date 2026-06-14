<template>
  <button
    type="button"
    class="theme-toggle"
    :aria-label="label"
    :title="label"
    @click="toggleTheme"
  >
    <q-icon :name="theme === 'dark' ? 'light_mode' : 'dark_mode'" size="22px" />
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useTheme } from 'src/composables/useTheme';

const { theme, toggleTheme } = useTheme();
const label = computed(() => (theme.value === 'dark' ? "Yorug' rejim" : "Qorong'i rejim"));
</script>

<style scoped>
.theme-toggle {
  width: 44px;
  height: 44px;
  border-radius: var(--r-md);
  border: 1px solid var(--border-strong);
  background: var(--surface);
  color: var(--text-secondary);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-xs);
}
.theme-toggle:active {
  transform: scale(0.94);
}
</style>
