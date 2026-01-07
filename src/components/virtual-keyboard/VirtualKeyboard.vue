<template>
  <div class="vk">
    <div v-for="(row, rowIndex) in layout" :key="rowIndex" class="vk-row">
      <button
        v-for="key in row"
        :key="key"
        type="button"
        class="vk-key"
        :class="{ wide: key === 'SPACE' }"
        @click="onKeyPress(key)"
      >
        {{ keyLabel(key) }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { KEYBOARD_LAYOUT, KEYBOARD_LAYOUT_WITH_NUMS } from './keyboardLayout';

const emit = defineEmits<{
  (e: 'input', value: string): void;
  (e: 'backspace'): void;
}>();

const { nums_on = false } = defineProps<{
  nums_on?: boolean;
}>();

const layout = computed(() => (nums_on ? KEYBOARD_LAYOUT_WITH_NUMS : KEYBOARD_LAYOUT));

function onKeyPress(key: string): void {
  if (key === 'BACKSPACE') {
    emit('backspace');
    return;
  }

  if (key === 'SPACE') {
    emit('input', ' ');
    return;
  }

  emit('input', key.toLowerCase());
}

function keyLabel(key: string): string {
  if (key === 'BACKSPACE') return '⌫';
  if (key === 'SPACE') return 'SPACE';
  return key;
}
</script>

<style scoped lang="scss">
.vk {
  background: var(--bg-surface);
  padding: 10px;
  border-radius: 18px;
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-md);

  display: flex;
  flex-direction: column;
  gap: 8px;

  user-select: none;
}

.vk-row {
  display: flex;
  gap: 8px;
  flex: 1;
}

.vk-key {
  flex: 1;
  min-height: 56px;

  border-radius: 14px;
  border: 1px solid var(--border-color);
  background: var(--key-bg);
  color: var(--text-primary);

  font-size: 18px;
  font-weight: 600;

  cursor: pointer;

  display: flex;
  align-items: center;
  justify-content: center;

  box-shadow: var(--shadow-sm);
  transition:
    transform 0.1s ease,
    box-shadow 0.1s ease,
    background 0.1s ease;

  &:active {
    background: var(--key-bg-active);
    transform: scale(0.97);
    box-shadow: none;
  }
}

/* SPACE KEY */
.vk-key.wide {
  flex: 3;
}
</style>
