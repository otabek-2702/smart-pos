<template>
  <div class="vk">
    <div
      v-for="(row, rowIndex) in KEYBOARD_LAYOUT"
      :key="rowIndex"
      class="vk-row"
    >
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
import { KEYBOARD_LAYOUT } from './keyboardLayout'

const emit = defineEmits<{
  (e: 'input', value: string): void
  (e: 'backspace'): void
}>()

function onKeyPress(key: string): void {
  if (key === 'BACKSPACE') {
    emit('backspace')
    return
  }

  if (key === 'SPACE') {
    emit('input', ' ')
    return
  }

  emit('input', key.toLowerCase())
}

function keyLabel(key: string): string {
  if (key === 'BACKSPACE') return '⌫'
  if (key === 'SPACE') return 'SPACE'
  return key
}
</script>

<style lang="scss">
.vk {
  background: #1a1d23;
  padding: 8px;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  user-select: none;
}

.vk-row {
  display: flex;
  gap: 6px;
}

.vk-key {
  flex: 1;
  height: clamp(44px, 6vh, 56px);
  border-radius: 12px;
  border: none;
  background: #23262d;
  color: #ffffff;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;

  /* tactile, lekin perebarshivay emas */
  &:active {
    background: #2c3038;
    transform: scale(0.98);
  }
}

.vk-key.wide {
  flex: 3;
}
</style>
