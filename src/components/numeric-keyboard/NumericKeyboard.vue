<template>
  <div class="nk">
    <!-- 1–9 -->
    <button v-for="key in keys" :key="key" type="button" class="nk-key" @click="onPress(key)">
      {{ key }}
    </button>
    <button type="button" class="nk-key" @click="onClear()">C</button>
    <button type="button" class="nk-key" @click="onPress('0')">0</button>
    <button type="button" class="nk-key" @click="onBackspace">⌫</button>

    <!-- 0 centered -->
    <!-- <div class="nk-zero">
    </div> -->

    <!-- backspace -->
  </div>
</template>

<script setup lang="ts">
const emit = defineEmits<{
  (e: 'input', value: string): void;
  (e: 'backspace'): void;
  (e: 'clear'): void;
}>();



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

/* BACKSPACE (VISUAL ONLY, STRUCTURE UNCHANGED) */
.nk-key.back {
  font-size: 22px;
}

/* ZERO ROW (KEPT FOR FUTURE, NO LAYOUT CHANGE) */
.nk-zero {
  grid-column: 1 / -1;
  display: flex;
  justify-content: end;

  button {
    width: 33%;
  }
}

/* DOT HIDDEN */
.hidden-btn {
  opacity: 0;
  pointer-events: none;
}
</style>
