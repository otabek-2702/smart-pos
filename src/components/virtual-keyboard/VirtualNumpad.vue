<template>
  <div class="numpad" @mousedown.prevent>
    <div class="numpad-grid">
      <button
        v-for="num in [1, 2, 3, 4, 5, 6, 7, 8, 9]"
        :key="num"
        type="button"
        class="numpad-btn"
        @click="onPress(String(num))"
      >
        {{ num }}
      </button>
      <button type="button" class="numpad-btn numpad-clear" @click="onClear">
        C
      </button>
      <button type="button" class="numpad-btn" @click="onPress('0')">
        0
      </button>
      <button type="button" class="numpad-btn numpad-backspace" @click="onBackspace">
        ⌫
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
const emit = defineEmits<{
  (e: 'input', value: string): void;
  (e: 'backspace'): void;
  (e: 'clear'): void;
}>();

function onPress(value: string): void {
  emit('input', value);
}

function onBackspace(): void {
  emit('backspace');
}

function onClear(): void {
  emit('clear');
}
</script>

<style scoped lang="scss">
.numpad {
  background: var(--bg-surface);
  padding: 10px;
  border-radius: 18px;
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-md);
  user-select: none;
  max-width: 320px;
  margin: 0 auto;
}

.numpad-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.numpad-btn {
  height: 56px;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  color: var(--text-primary);
  font-size: 22px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  transition:
    transform 0.1s ease,
    box-shadow 0.1s ease,
    background 0.1s ease;

  &:hover {
    background: var(--bg-surface-2);
  }

  &:active {
    transform: scale(0.95);
    background: var(--accent-primary);
    color: white;
    box-shadow: none;
  }
}

.numpad-clear {
  color: var(--text-muted);
  font-size: 18px;
}

.numpad-backspace {
  color: var(--text-muted);
  font-size: 24px;
}
</style>