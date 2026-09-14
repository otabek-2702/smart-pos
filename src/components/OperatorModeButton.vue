<template>
  <button
    type="button"
    class="op-btn"
    :class="{
      on: store.operatorMode,
      warning: store.operatorMode && (!store.running || store.error),
    }"
    :title="title"
    :aria-label="title"
    :aria-pressed="store.operatorMode"
    :disabled="store.busy"
    @pointerdown="beginPointer"
    @pointerup="cancelHold"
    @pointerleave="cancelHold"
    @pointercancel="cancelHold"
    @click="click"
    @keydown="keyDown"
    @keyup="keyUp"
    @blur="cancelHold"
    @contextmenu.prevent="openPairing"
  >
    <q-icon name="headset_mic" size="22px" />
  </button>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount } from 'vue';
import { useOperatorStore } from 'src/stores/operator';

const store = useOperatorStore();
const title = computed(() =>
  [
    store.operatorMode ? 'Operator ON' : 'Operator OFF',
    'Bosish: yoqish/o‘chirish. Bosib turish: telefonni ulash (QR).',
    store.error,
  ]
    .filter(Boolean)
    .join(' · '),
);
let hold: ReturnType<typeof setTimeout> | null = null;
let held = false;

function cancelHold(): void {
  if (hold) clearTimeout(hold);
  hold = null;
}

function openPairing(): void {
  cancelHold();
  held = true;
  void store.showPairing();
}

function beginHold(): void {
  cancelHold();
  held = false;
  if (!store.busy) hold = setTimeout(openPairing, 650);
}

function beginPointer(event: PointerEvent): void {
  if (event.button === 0) beginHold();
}

function click(): void {
  cancelHold();
  if (!held) void store.toggle();
}

function keyDown(event: KeyboardEvent): void {
  if (event.key !== ' ' && event.key !== 'Enter') return;
  event.preventDefault();
  if (!event.repeat) beginHold();
}

function keyUp(event: KeyboardEvent): void {
  if (event.key !== ' ' && event.key !== 'Enter') return;
  event.preventDefault();
  click();
}

onBeforeUnmount(cancelHold);
</script>

<style scoped>
.op-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 44px;
  width: 44px;
  padding: 0;
  border-radius: 14px;
  border: 1px solid var(--border-color);
  background: var(--btn-secondary-bg);
  color: var(--btn-secondary-text);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: var(--shadow-sm);
  white-space: nowrap;
  touch-action: manipulation;
  user-select: none;
}
.op-btn:disabled {
  opacity: 0.65;
  cursor: wait;
}
.op-btn:active {
  transform: scale(0.97);
}
.op-btn.on {
  background: var(--success);
  color: #fff;
  border-color: var(--success);
}
.op-btn.warning {
  border-color: var(--warning, #d89f32);
  box-shadow: 0 0 0 2px var(--warning, #d89f32);
}
</style>
