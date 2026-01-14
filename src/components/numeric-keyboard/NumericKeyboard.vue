<template>
  <div class="nk" v-if="virtualKeyboardEnabled">
    <!-- 1–9 -->
    <button v-for="key in keys" :key="key" type="button" class="nk-key" @click="onPress(key)">
      {{ key }}
    </button>

    <!-- Dot or Clear button based on prop -->
    <button v-if="props.dot" type="button" class="nk-key" @click="onPress('.')">.</button>
    <button v-else type="button" class="nk-key clear" @click="onClear">C</button>

    <!-- 0 -->
    <button type="button" class="nk-key" @click="onPress('0')">0</button>

    <!-- Backspace -->
    <button type="button" class="nk-key backspace" @click="onBackspace">⌫</button>
  </div>
</template>

<script setup lang="ts">
import { virtualKeyboardEnabled } from 'boot/virtual-keyboard';

const emit = defineEmits<{
  (e: 'input', value: string): void;
  (e: 'backspace'): void;
  (e: 'clear'): void;
}>();

const props = withDefaults(
  defineProps<{
    dot?: boolean;
  }>(),
  {
    dot: false,
  },
);

const keys: ReadonlyArray<string> = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

function onPress(key: string): void {
  emit('input', key);
}

function onBackspace(): void {
  emit('backspace');
}

function onClear(): void {
  emit('clear');
}
</script>

<style scoped lang="scss">
.nk {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  justify-content: end;
}

/* KEY */
.nk-key {
  height: 56px;
  border-radius: 14px;
  border: 1px solid var(--border-color);
  background: var(--key-bg);
  color: var(--text-primary);
  font-size: 20px;
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

/* CLEAR BUTTON */
.nk-key.clear {
  background: #fef3c7;
  border-color: #fcd34d;
  color: #d97706;

  &:active {
    background: #fde68a;
  }
}

/* BACKSPACE BUTTON */
.nk-key.backspace {
  background: #fee2e2;
  border-color: #fca5a5;
  color: #dc2626;

  &:active {
    background: #fecaca;
  }
}
</style>
