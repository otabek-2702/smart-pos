<template>
  <div class="vk" v-if="virtualKeyboardEnabled" @mousedown.prevent>
    <div v-for="(row, rowIndex) in layout" :key="rowIndex" class="vk-row">
      <template v-for="key in row" :key="key">
        <!-- Shift button before Z -->
        <button
          v-if="key === 'Z'"
          type="button"
          class="vk-key shift-key"
          :class="shiftStateClass"
          @click="onShiftClick"
        >
          <!-- Custom shift icon using SVG -->
          <svg 
            v-if="shiftState === 'caps'" 
            width="22" 
            height="22" 
            viewBox="0 0 24 24" 
            fill="currentColor"
          >
            <path d="M12 2L4 12h5v8h6v-8h5L12 2z"/>
            <line x1="4" y1="22" x2="20" y2="22" stroke="currentColor" stroke-width="2"/>
          </svg>
          <svg 
            v-else-if="shiftState === 'shift'" 
            width="22" 
            height="22" 
            viewBox="0 0 24 24" 
            fill="currentColor"
          >
            <path d="M12 4L4 14h5v6h6v-6h5L12 4z"/>
          </svg>
          <svg 
            v-else 
            width="22" 
            height="22" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            stroke-width="2"
          >
            <path d="M12 5L5 14h4v5h6v-5h4L12 5z"/>
          </svg>
        </button>

        <!-- Regular key -->
        <button
          type="button"
          class="vk-key"
          :class="{ 
            wide: key === 'SPACE',
            'backspace-key': key === 'BACKSPACE'
          }"
          @click="onKeyPress(key)"
        >
          {{ keyLabel(key) }}
        </button>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { KEYBOARD_LAYOUT, KEYBOARD_LAYOUT_WITH_NUMS } from './keyboardLayout';
import { virtualKeyboardEnabled } from 'src/boot/virtual-keyboard';

const emit = defineEmits<{
  (e: 'input', value: string): void;
  (e: 'backspace'): void;
}>();

const props = defineProps<{
  nums_on?: boolean;
}>();

// Shift states: 'auto' | 'shift' | 'caps'
type ShiftState = 'auto' | 'shift' | 'caps';

const shiftState = ref<ShiftState>('auto');
const isFirstLetter = ref(true);
const lastShiftClickTime = ref(0);

const layout = computed(() => (props.nums_on ? KEYBOARD_LAYOUT_WITH_NUMS : KEYBOARD_LAYOUT));

// Compute if current letter should be uppercase
const shouldUppercase = computed(() => {
  if (shiftState.value === 'caps') return true;
  if (shiftState.value === 'shift') return true;
  if (shiftState.value === 'auto' && isFirstLetter.value) return true;
  return false;
});

// Shift button CSS class
const shiftStateClass = computed(() => ({
  'shift-auto': shiftState.value === 'auto',
  'shift-active': shiftState.value === 'shift',
  'shift-caps': shiftState.value === 'caps',
}));

function onShiftClick(): void {
  const now = Date.now();
  const timeSinceLastClick = now - lastShiftClickTime.value;
  
  // Double tap detection (within 300ms)
  if (timeSinceLastClick < 300 && shiftState.value === 'shift') {
    shiftState.value = 'caps';
  } else if (shiftState.value === 'caps') {
    shiftState.value = 'auto';
  } else {
    shiftState.value = 'shift';
  }
  
  lastShiftClickTime.value = now;
}

function onKeyPress(key: string): void {
  if (key === 'BACKSPACE') {
    emit('backspace');
    return;
  }

  if (key === 'SPACE') {
    emit('input', ' ');
    isFirstLetter.value = false;
    return;
  }

  // Determine case for the letter
  const letter = shouldUppercase.value ? key.toUpperCase() : key.toLowerCase();
  emit('input', letter);

  // After typing a letter
  if (shiftState.value === 'shift') {
    shiftState.value = 'auto';
    isFirstLetter.value = false;
  } else if (shiftState.value === 'auto') {
    isFirstLetter.value = false;
  }
}

function keyLabel(key: string): string {
  if (key === 'BACKSPACE') return '⌫';
  if (key === 'SPACE') return 'Bo\'sh joy';
  
  return shouldUppercase.value ? key.toUpperCase() : key.toLowerCase();
}

// Reset when keyboard becomes visible
watch(virtualKeyboardEnabled, (enabled) => {
  if (enabled) {
    shiftState.value = 'auto';
    isFirstLetter.value = true;
  }
});

function resetShiftState(): void {
  shiftState.value = 'auto';
  isFirstLetter.value = true;
}

defineExpose({ resetShiftState });
</script>

<style scoped lang="scss">
.vk {
  background: var(--bg-surface);
  padding: 12px;
  border-radius: 18px;
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-md);

  display: flex;
  flex-direction: column;
  gap: 8px;

  user-select: none;
  width: 100%;
}

.vk-row {
  display: flex;
  gap: 6px;
  width: 100%;
}

.vk-key {
  flex: 1;
  min-height: 54px;

  border-radius: 12px;
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  color: var(--text-primary);

  font-size: 18px;
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

  &:active {
    background: var(--bg-surface-2);
    transform: scale(0.95);
    box-shadow: none;
  }
}

/* SPACE KEY */
.vk-key.wide {
  flex: 1;
  font-size: 14px;
  color: var(--text-muted);
}

/* BACKSPACE KEY */
.backspace-key {
  flex: 1.5;
  background: var(--bg-surface-2);
  font-size: 22px;
}

/* SHIFT KEY */
.shift-key {
  flex: 1.5;
  background: var(--bg-surface-2);

  &.shift-auto {
    color: var(--text-muted);
  }

  &.shift-active {
    background: var(--accent-primary);
    color: white;
    border-color: var(--accent-primary);
  }

  &.shift-caps {
    background: var(--accent-primary);
    color: white;
    border-color: var(--accent-primary);
    box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.3);
  }
}
</style>