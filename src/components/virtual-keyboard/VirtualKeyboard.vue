<template>
  <Transition name="vk-slide">
    <div
      v-if="virtualKeyboardEnabled"
      :class="['vk', position === 'fixed' ? 'vk--fixed' : 'vk--inline']"
      @mousedown.prevent
    >
      <!-- Inner wrapper holds the visual surface (background, border, shadow,
           rounded top corners). The outer .vk--fixed only spans the viewport
           for safe-area handling — its sides are transparent so the page
           shows through. -->
      <div class="vk__inner">
      <!-- Optional digit row -->
      <div v-if="numbers && mode === 'letters'" class="vk__row">
        <button
          v-for="key in NUMBER_ROW"
          :key="`num-${(key as CharKey).label}`"
          type="button"
          class="vk__key"
          :style="{ flex: 1 }"
          :class="{ 'vk__key--pressed': pressed === (key as CharKey).label }"
          @click="onCharPress((key as CharKey))"
        >
          {{ (key as CharKey).label }}
        </button>
      </div>

      <!-- Letter / symbols rows -->
      <div
        v-for="(row, rowIndex) in activeLayout"
        :key="`row-${mode}-${rowIndex}`"
        class="vk__row"
      >
        <template v-for="(key, keyIndex) in row">
          <!-- Char key -->
          <button
            v-if="key.type === 'char'"
            :key="`k-${rowIndex}-${keyIndex}-${key.label}`"
            type="button"
            class="vk__key"
            :style="{ flex: key.flex ?? 1 }"
            :class="{ 'vk__key--pressed': pressed === key.label }"
            @click="onCharPress(key)"
          >
            {{ displayLabel(key) }}
          </button>

          <!-- Special keys -->
          <button
            v-else-if="key.action === 'shift'"
            :key="`shift-${rowIndex}-${keyIndex}`"
            type="button"
            class="vk__key vk__key--special vk__key--shift"
            :style="{ flex: key.flex ?? 1.6 }"
            :class="{
              'vk__key--shift-on': shiftState === 'shift',
              'vk__key--shift-caps': shiftState === 'caps',
              'vk__key--pressed': pressed === '__shift',
            }"
            @click="onShiftPress"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path
                v-if="shiftState !== 'caps'"
                d="M12 5L5 14h4v5h6v-5h4L12 5z"
              />
              <g v-else>
                <path d="M12 5L5 14h4v5h6v-5h4L12 5z" fill="currentColor" />
                <line x1="6" y1="22" x2="18" y2="22" />
              </g>
            </svg>
          </button>

          <button
            v-else-if="key.action === 'backspace'"
            :key="`bksp-${rowIndex}-${keyIndex}`"
            type="button"
            class="vk__key vk__key--special vk__key--backspace"
            :style="{ flex: key.flex ?? 1.6 }"
            :class="{ 'vk__key--pressed': pressed === '__backspace' }"
            @click="onBackspace"
          >
            <q-icon name="backspace" size="22px" />
          </button>

          <button
            v-else-if="key.action === 'space'"
            :key="`space-${rowIndex}-${keyIndex}`"
            type="button"
            class="vk__key vk__key--space"
            :style="{ flex: key.flex ?? 4 }"
            :class="{ 'vk__key--pressed': pressed === '__space' }"
            @click="onSpace"
          >
            {{ activeLayoutLabel.full }}
          </button>

          <button
            v-else-if="key.action === 'symbols' || key.action === 'letters'"
            :key="`mode-${rowIndex}-${keyIndex}-${key.action}`"
            type="button"
            class="vk__key vk__key--special"
            :style="{ flex: key.flex ?? 1.4 }"
            :class="{ 'vk__key--pressed': pressed === '__mode' }"
            @click="onModeToggle(key.action)"
          >
            {{ key.label ?? (key.action === 'symbols' ? '123' : 'ABC') }}
          </button>

          <button
            v-else-if="key.action === 'lang'"
            :key="`lang-${rowIndex}-${keyIndex}`"
            type="button"
            class="vk__key vk__key--special vk__key--lang"
            :style="{ flex: key.flex ?? 1 }"
            :class="{ 'vk__key--pressed': pressed === '__lang' }"
            :title="activeLayoutLabel.full"
            @click="onLangCycle"
          >
            <q-icon name="language" size="20px" />
            <span class="vk__lang-tag">{{ activeLayoutLabel.short }}</span>
          </button>

          <button
            v-else-if="key.action === 'at'"
            :key="`at-${rowIndex}-${keyIndex}`"
            type="button"
            class="vk__key vk__key--special"
            :style="{ flex: key.flex ?? 1 }"
            :class="{ 'vk__key--pressed': pressed === '@' }"
            @click="emitChar('@')"
          >
            @
          </button>

          <button
            v-else-if="key.action === 'period'"
            :key="`period-${rowIndex}-${keyIndex}`"
            type="button"
            class="vk__key vk__key--special"
            :style="{ flex: key.flex ?? 1 }"
            :class="{ 'vk__key--pressed': pressed === '.' }"
            @click="emitChar('.')"
          >
            .
          </button>

          <button
            v-else-if="key.action === 'enter'"
            :key="`enter-${rowIndex}-${keyIndex}`"
            type="button"
            class="vk__key vk__key--special vk__key--enter"
            :style="{ flex: key.flex ?? 1.6 }"
            :class="{ 'vk__key--pressed': pressed === '__enter' }"
            @click="onEnter"
          >
            <q-icon name="keyboard_return" size="22px" />
          </button>

          <button
            v-else-if="key.action === 'comma'"
            :key="`comma-${rowIndex}-${keyIndex}`"
            type="button"
            class="vk__key vk__key--special"
            :style="{ flex: key.flex ?? 1 }"
            @click="emitChar(',')"
          >
            ,
          </button>

          <button
            v-else-if="key.action === 'hide'"
            :key="`hide-${rowIndex}-${keyIndex}`"
            type="button"
            class="vk__key vk__key--special"
            :style="{ flex: key.flex ?? 1 }"
            @click="emit('hide')"
          >
            <q-icon name="keyboard_hide" size="22px" />
          </button>
        </template>
      </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { virtualKeyboardEnabled } from 'src/boot/virtual-keyboard';
import { read, write } from 'src/utils/storage';
import {
  LAYOUTS,
  LAYOUT_LABELS,
  LAYOUT_ORDER,
  NUMBER_ROW,
  SYMBOLS_LAYOUT,
  type LayoutId,
  type CharKey,
  type SpecialAction,
} from './layouts';

/* ============ PROPS / EMITS ============ */

interface Props {
  /** Override the default layout. If omitted, reads from kv-store / falls back to 'en'. */
  layout?: LayoutId;
  /** Show the optional top row of digits 1-0. */
  numbers?: boolean;
  /** Where the keyboard sits. Default 'fixed' = bottom of viewport, full width. */
  position?: 'fixed' | 'inline';
  /**
   * Email-mode: disable auto-capitalization of the first character.
   * Emails are always lowercase, so the keyboard should never show
   * capitals unless the user explicitly taps shift.
   */
  email?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  numbers: false,
  position: 'fixed',
  email: false,
});

const emit = defineEmits<{
  (e: 'input', value: string): void;
  (e: 'backspace'): void;
  (e: 'enter'): void;
  (e: 'hide'): void;
}>();

/* ============ STATE ============ */

type ShiftState = 'auto' | 'shift' | 'caps';
type Mode = 'letters' | 'symbols';

const LAYOUT_KEY = 'pos:vkLayout';

const activeLayoutId = ref<LayoutId>(
  props.layout ?? read<LayoutId>(LAYOUT_KEY) ?? 'en',
);

watch(
  () => props.layout,
  (v) => {
    if (v) activeLayoutId.value = v;
  },
);

const mode = ref<Mode>('letters');
const shiftState = ref<ShiftState>('auto');
const isFirstChar = ref<boolean>(true);
const lastShiftClick = ref<number>(0);

/** Last key pressed — drives the press animation. Cleared after ~120ms. */
const pressed = ref<string | null>(null);
let pressTimer: ReturnType<typeof setTimeout> | null = null;

const activeLayout = computed(() =>
  mode.value === 'letters' ? LAYOUTS[activeLayoutId.value] : SYMBOLS_LAYOUT,
);

const activeLayoutLabel = computed(() => LAYOUT_LABELS[activeLayoutId.value]);

const isUppercase = computed<boolean>(() => {
  if (shiftState.value === 'caps') return true;
  if (shiftState.value === 'shift') return true;
  // auto: capitalize the first letter typed — UNLESS we're in email mode
  // where the input is always lowercase by convention.
  if (props.email) return false;
  return shiftState.value === 'auto' && isFirstChar.value;
});

/* ============ HELPERS ============ */

function flashPress(token: string): void {
  pressed.value = token;
  if (pressTimer) clearTimeout(pressTimer);
  pressTimer = setTimeout(() => {
    pressed.value = null;
  }, 120);
}

function displayLabel(key: CharKey): string {
  if (mode.value === 'symbols') return key.label;
  return isUppercase.value ? key.upper ?? key.label.toUpperCase() : key.label.toLowerCase();
}

function emitChar(c: string): void {
  emit('input', c);
  flashPress(c);
  isFirstChar.value = false;
  // After typing one character in temporary shift mode, drop back to auto.
  if (shiftState.value === 'shift') shiftState.value = 'auto';
}

/* ============ HANDLERS ============ */

function onCharPress(key: CharKey): void {
  if (mode.value === 'symbols') {
    emitChar(key.label);
    return;
  }
  const out = isUppercase.value ? key.upper ?? key.label.toUpperCase() : key.label.toLowerCase();
  emitChar(out);
}

function onShiftPress(): void {
  flashPress('__shift');
  const now = Date.now();
  const delta = now - lastShiftClick.value;

  if (shiftState.value === 'caps') {
    shiftState.value = 'auto';
  } else if (delta < 300 && shiftState.value === 'shift') {
    shiftState.value = 'caps';
  } else if (shiftState.value === 'shift') {
    shiftState.value = 'auto';
  } else {
    shiftState.value = 'shift';
  }
  lastShiftClick.value = now;
}

function onBackspace(): void {
  flashPress('__backspace');
  emit('backspace');
  // No reliable way to know if we're back at empty; conservatively leave
  // isFirstChar untouched. The auto-uppercase on next char is fine UX.
}

function onSpace(): void {
  flashPress('__space');
  emit('input', ' ');
  isFirstChar.value = false;
  if (shiftState.value === 'shift') shiftState.value = 'auto';
}

function onEnter(): void {
  flashPress('__enter');
  emit('enter');
}

function onModeToggle(action: SpecialAction): void {
  flashPress('__mode');
  mode.value = action === 'symbols' ? 'symbols' : 'letters';
  // Reset shift cycle on mode switch — feels right.
  if (mode.value === 'letters') shiftState.value = 'auto';
}

async function onLangCycle(): Promise<void> {
  flashPress('__lang');
  const i = LAYOUT_ORDER.indexOf(activeLayoutId.value);
  const next = LAYOUT_ORDER[(i + 1) % LAYOUT_ORDER.length] ?? 'en';
  activeLayoutId.value = next;
  // Persist as the new default for next session.
  await write(LAYOUT_KEY, next);
}

/* ============ LIFECYCLE ============ */

onMounted(() => {
  // Reset shift cycle when keyboard reveals.
  // Email mode: skip the "first letter capital" priming entirely.
  shiftState.value = 'auto';
  isFirstChar.value = !props.email;
  mode.value = 'letters';
});

onUnmounted(() => {
  if (pressTimer) clearTimeout(pressTimer);
});

defineExpose({
  setLayout: (id: LayoutId) => {
    activeLayoutId.value = id;
    void write(LAYOUT_KEY, id);
  },
  resetState: () => {
    shiftState.value = 'auto';
    isFirstChar.value = true;
    mode.value = 'letters';
  },
});
</script>

<style scoped lang="scss">
/* ========= CONTAINER =========
   Outer .vk in INLINE mode owns the visual surface (used inside dialogs).
   Outer .vk in FIXED mode is transparent — the surface lives on .vk__inner
   so the sides outside the centered keyboard show the page through. */
.vk {
  user-select: none;
  width: 100%;
}

.vk__inner {
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.08);
  padding: 8px 12px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;

  // safe-area for tablets / notched displays
  padding-bottom: max(10px, env(safe-area-inset-bottom));
}

/* INLINE: container looks like one rounded panel sitting in a card */
.vk--inline .vk__inner {
  border-radius: 16px;
}

/* FIXED-BOTTOM: span full viewport but only the centered inner has a
   background. Sides are transparent so the page (or blurred overlay
   behind it) shows through. Top corners are rounded so the surface
   reads as a "tray" rising from the bottom. */
.vk--fixed {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 3000;
  background: transparent;

  display: flex;
  justify-content: center;

  .vk__inner {
    width: 100%;
    max-width: var(--vk-max-w, 1100px);
    border-radius: 16px 16px 0 0;
    border-bottom: none;
  }
}

.vk__row {
  display: flex;
  gap: 6px;
  width: 100%;
}

/* ========= KEY ========= */
.vk__key {
  flex: 1;
  min-width: 0;
  height: 56px;
  padding: 0 4px;

  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;

  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  color: var(--text-primary);

  font-size: 19px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;

  cursor: pointer;
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.08), 0 2px 4px rgba(0, 0, 0, 0.04);

  transition:
    transform 80ms cubic-bezier(0.2, 0.8, 0.2, 1),
    background-color 90ms ease,
    box-shadow 90ms ease,
    color 90ms ease;

  &:active,
  &.vk__key--pressed {
    transform: translateY(1px) scale(0.94);
    background: var(--bg-surface-2);
    box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.12);
  }
}

/* ========= SPECIAL KEYS ========= */
.vk__key--special {
  background: var(--bg-surface-2);
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.vk__key--space {
  background: var(--bg-surface-2);
  font-size: 13px;
  color: var(--text-muted);
  letter-spacing: 0.3px;
}

.vk__key--shift svg {
  color: var(--text-primary);
}
.vk__key--shift-on {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
  color: white;
  svg { color: white; }
}
.vk__key--shift-caps {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
  color: white;
  svg { color: white; }
  // small inset bar to telegraph "locked" — like a caps-lock LED
  box-shadow: inset 0 -3px 0 rgba(255, 255, 255, 0.55);
}

.vk__key--lang {
  flex-direction: row;
  font-size: 12px;
}
.vk__lang-tag {
  font-size: 11px;
  font-weight: 700;
  opacity: 0.85;
  letter-spacing: 0.5px;
}

.vk__key--enter {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
  color: white;
}

/* ========= ENTRANCE ANIMATION ========= */
.vk-slide-enter-active,
.vk-slide-leave-active {
  transition:
    transform 220ms cubic-bezier(0.2, 0.9, 0.2, 1),
    opacity 220ms ease;
}
.vk-slide-enter-from,
.vk-slide-leave-to {
  transform: translateY(20px);
  opacity: 0;
}

/* ========= RESPONSIVE TUNING =========
   Key height + max content width adapt to the viewport so the keyboard
   feels right on both 15" POS monoblocks (~1366px) and 1920+ desktops. */

/* 15" POS monoblock and similar (≤1366) — slightly tighter keys */
@media (max-width: 1366px) {
  .vk--fixed .vk__inner { max-width: 1000px; }
  .vk__key { height: 52px; font-size: 18px; }
}

/* Wide desktop (1920+) — cap inner keyboard width so keys stay finger-sized
   instead of stretching into half-screen-wide buttons */
@media (min-width: 1600px) {
  .vk--fixed .vk__inner { max-width: 1200px; }
  .vk__key { height: 60px; font-size: 20px; }
}

/* Narrow tablets / portrait — smaller keys but still tappable */
@media (max-width: 720px) {
  .vk__inner { padding: 6px 6px 8px; }
  .vk__key { height: 46px; font-size: 15px; }
  .vk--fixed .vk__inner { border-radius: 12px 12px 0 0; }
}
</style>
