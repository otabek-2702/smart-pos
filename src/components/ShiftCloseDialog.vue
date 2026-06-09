<template>
  <!-- Teleport to body so the overlay isn't trapped in the footer's stacking
       context (the Orders sticky header / footer bled through otherwise). -->
  <Teleport to="body">
    <Transition name="sc-fade">
      <div v-if="modelValue" class="sc" role="dialog" aria-modal="true">
      <div class="sc__panel">
        <!-- header -->
        <div class="sc__head">
          <div class="sc__title">Smenani yakunlash</div>
          <button type="button" class="sc__x" aria-label="Yopish" @click="close">
            <q-icon name="close" size="24px" />
          </button>
        </div>

        <!-- real shift summary (from /shifts/current) -->
        <div class="sc__summary">
          <div class="sc__sum">
            <span class="sc__sum-label">Buyurtmalar</span>
            <span class="sc__sum-val">{{ loadingShift ? '…' : (shift?.total_orders ?? 0) }}</span>
          </div>
          <div class="sc__sum">
            <span class="sc__sum-label">Tushum</span>
            <span class="sc__sum-val">{{ loadingShift ? '…' : formatPrice(shift?.total_revenue ?? 0) }} <small>so'm</small></span>
          </div>
        </div>

        <div class="sc__body">
          <!-- LEFT: payment types, tap to select -->
          <div class="sc__types">
            <div class="sc__hint">Har bir tur bo'yicha sanalgan pulni kiriting</div>
            <button
              v-for="m in methods"
              :key="m.value"
              type="button"
              class="sc__type"
              :class="{ active: activeMethod === m.value }"
              @click="activeMethod = m.value"
            >
              <span class="sc__type-label">{{ m.label }}</span>
              <span class="sc__type-amount">{{ formatPrice(counted[m.value] || 0) }} <span>so'm</span></span>
            </button>
          </div>

          <!-- RIGHT: big display + numpad for the selected type -->
          <div class="sc__calc">
            <div class="sc__display">
              <span class="sc__display-for">{{ activeLabel }}</span>
              <span class="sc__display-val">{{ formatPrice(counted[activeMethod] || 0) }} <span>so'm</span></span>
            </div>
            <div class="sc__pad">
              <button v-for="k in numKeys" :key="k" type="button" class="sc__key" @click="press(k)">{{ k }}</button>
              <button type="button" class="sc__key muted" @click="clearActive">C</button>
              <button type="button" class="sc__key" @click="press('0')">0</button>
              <button type="button" class="sc__key muted" @click="backspace">⌫</button>
            </div>
          </div>
        </div>

        <!-- footer -->
        <div class="sc__foot">
          <button type="button" class="btn secondary" @click="close">Bekor</button>
          <button type="button" class="btn primary" :disabled="saving" @click="confirm">
            <span v-if="saving">Yakunlanmoqda…</span>
            <span v-else>Smenani yakunlash</span>
          </button>
        </div>
      </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue';
import { toast } from 'vue3-toastify';
import { formatPrice } from 'src/utils/formatPrice';
import { closeShift, getCurrentShift, type ShiftCurrent } from 'src/composables/useShift';

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [v: boolean]; closed: [] }>();

const methods = [
  { value: 'CASH', label: 'Naqd' },
  { value: 'UZCARD', label: 'Uzcard' },
  { value: 'HUMO', label: 'Humo' },
  { value: 'PAYME', label: 'Payme' },
];
const numKeys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

const counted = reactive<Record<string, string>>({ CASH: '', UZCARD: '', HUMO: '', PAYME: '' });
const activeMethod = ref<string>('CASH');
const saving = ref(false);

// Live shift (orders + money) from GET /shifts/current — the real shift data.
const shift = ref<ShiftCurrent | null>(null);
const loadingShift = ref(false);

const activeLabel = computed(() => methods.find((m) => m.value === activeMethod.value)?.label ?? '');

watch(
  () => props.modelValue,
  async (open) => {
    if (!open) return;
    for (const k of Object.keys(counted)) counted[k] = '';
    activeMethod.value = 'CASH';
    shift.value = null;
    loadingShift.value = true;
    try {
      shift.value = await getCurrentShift();
    } finally {
      loadingShift.value = false;
    }
  },
);

function press(k: string): void {
  const cur = counted[activeMethod.value] || '';
  if (cur.length >= 12) return;
  counted[activeMethod.value] = cur === '' && k === '0' ? '' : cur + k;
}
function backspace(): void {
  counted[activeMethod.value] = (counted[activeMethod.value] || '').slice(0, -1);
}
function clearActive(): void {
  counted[activeMethod.value] = '';
}

function close(): void {
  emit('update:modelValue', false);
}

async function confirm(): Promise<void> {
  if (saving.value) return;
  saving.value = true;
  try {
    const countedByMethod: Record<string, number> = {};
    for (const m of methods) countedByMethod[m.value] = parseInt(counted[m.value] || '0', 10) || 0;
    const id = shift.value?.id;
    if (!id) {
      toast.warning("Ochiq smena topilmadi");
    } else {
      const ok = await closeShift(id, countedByMethod, '');
      if (ok) toast.success('Smena yakunlandi');
      else toast.warning('Smena yopilmadi — server javob bermadi');
    }
    emit('update:modelValue', false);
    emit('closed');
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped lang="scss">
.sc {
  position: fixed; inset: 0; z-index: 3100;
  background: rgba(10, 12, 16, 0.6); backdrop-filter: blur(6px);
  display: flex; padding: 14px;
}
.sc__panel {
  width: 100%; max-width: 920px; margin: auto;
  height: calc(100vh - 28px);
  background: var(--bg-app); border: 1px solid var(--border-color);
  border-radius: 16px; display: flex; flex-direction: column; overflow: hidden;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.5);
}

.sc__head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 18px; border-bottom: 1px solid var(--border-color); background: var(--bg-surface);
}
.sc__title { font-size: 20px; font-weight: 800; color: var(--text-primary); }
.sc__x {
  width: 44px; height: 44px; border-radius: 12px; cursor: pointer;
  border: 1px solid var(--border-color); background: var(--bg-surface-2); color: var(--text-primary);
  display: inline-flex; align-items: center; justify-content: center;
  &:active { transform: scale(0.95); }
}

/* real shift summary strip */
.sc__summary {
  display: flex; gap: 12px; padding: 12px 18px;
  border-bottom: 1px solid var(--border-color); background: var(--bg-surface);
}
.sc__sum {
  flex: 1; padding: 10px 14px; border-radius: 12px;
  background: var(--bg-surface-2); border: 1px solid var(--border-color);
}
.sc__sum-label { display: block; font-size: 12px; color: var(--text-muted); }
.sc__sum-val {
  font-size: 20px; font-weight: 800; color: var(--text-primary); font-variant-numeric: tabular-nums;
  small { font-size: 12px; color: var(--text-muted); font-weight: 600; }
}

.sc__body { flex: 1; display: grid; grid-template-columns: 1fr 1.05fr; min-height: 0; }

/* left: payment types */
.sc__types {
  display: flex; flex-direction: column; gap: 10px;
  padding: 16px 18px; border-right: 1px solid var(--border-color); overflow-y: auto;
}
.sc__hint { font-size: 13px; color: var(--text-muted); margin-bottom: 2px; }
.sc__type {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 16px; height: 72px; border-radius: 14px; cursor: pointer;
  border: 1px solid var(--border-color); background: var(--bg-surface); color: var(--text-primary);
  &.active { border-color: var(--accent-primary, #ff7a00); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent-primary, #ff7a00) 22%, transparent); }
  &:active { transform: scale(0.99); }
}
.sc__type-label { font-size: 17px; font-weight: 700; }
.sc__type-amount {
  font-size: 20px; font-weight: 800; font-variant-numeric: tabular-nums;
  span { font-size: 12px; color: var(--text-muted); font-weight: 600; }
}

/* right: display + numpad */
.sc__calc { display: flex; flex-direction: column; padding: 16px 18px; gap: 14px; min-height: 0; }
.sc__display {
  display: flex; flex-direction: column; gap: 4px; align-items: flex-end;
  padding: 14px 18px; border-radius: 14px;
  background: var(--bg-surface); border: 1px solid var(--border-color);
}
.sc__display-for { font-size: 13px; color: var(--text-muted); }
.sc__display-val {
  font-size: 34px; font-weight: 800; color: var(--text-primary); font-variant-numeric: tabular-nums;
  span { font-size: 14px; color: var(--text-muted); font-weight: 600; }
}
.sc__pad {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;
  max-width: 320px; width: 100%; align-self: center;
}
.sc__key {
  height: 52px;
  border-radius: 12px; border: 1px solid var(--border-color);
  background: var(--bg-surface); color: var(--text-primary);
  font-size: 20px; font-weight: 700; cursor: pointer;
  &:active { transform: scale(0.97); }
}
.sc__key.muted { color: var(--text-muted); }

.sc__foot {
  display: flex; align-items: center; justify-content: flex-end; gap: 12px;
  padding: 12px 18px; border-top: 1px solid var(--border-color); background: var(--bg-surface);
}
.btn {
  height: 50px; padding: 0 24px; border-radius: 12px; border: 1px solid transparent;
  font-size: 16px; font-weight: 700; cursor: pointer; min-width: 130px;
  &:disabled { opacity: 0.5; cursor: not-allowed; }
  &:active:not(:disabled) { transform: scale(0.98); }
}
.btn.primary { background: var(--accent-primary, #ff7a00); color: #fff; }
.btn.secondary { background: var(--bg-surface-2); color: var(--text-primary); border-color: var(--border-color); }

/* stack on short/narrow screens */
@media (max-width: 720px) {
  .sc__body { grid-template-columns: 1fr; overflow-y: auto; }
  .sc__types { border-right: none; border-bottom: 1px solid var(--border-color); }
}

.sc-fade-enter-active, .sc-fade-leave-active { transition: opacity 200ms ease; }
.sc-fade-enter-from, .sc-fade-leave-to { opacity: 0; }
</style>
