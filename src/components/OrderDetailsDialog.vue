<template>
  <!-- trigger -->
  <button type="button" class="btn primary trigger" @click="open">
    <q-icon name="local_shipping" size="20px" />
    Yetkazib berish ma'lumotlari
  </button>

  <!-- full-screen delivery data panel -->
  <Teleport to="body">
    <Transition name="dd-fade">
      <div v-if="showDetails" class="dd" role="dialog" aria-modal="true">
        <div class="dd__panel">
          <!-- header -->
          <div class="dd__head">
            <div class="dd__title">
              <q-icon name="local_shipping" size="24px" />
              Yetkazib berish ma'lumotlari
            </div>
            <button type="button" class="dd__close" @click="save" aria-label="Yopish">
              <q-icon name="close" size="24px" />
            </button>
          </div>

          <div class="dd__body">
            <!-- LEFT: fields -->
            <div class="dd__fields">
              <!-- phone -->
              <button
                type="button"
                class="dd__field"
                :class="{ active: activeField === 'phone' }"
                @click="activeField = 'phone'"
              >
                <span class="dd__label">Telefon raqam</span>
                <span class="dd__value">
                  <span class="dd__pfx">+998</span>{{ formattedPhone || ' —' }}
                  <q-spinner v-if="lookupLoading" size="16px" class="dd__spin" />
                </span>
              </button>

              <!-- client status: returning (name shown) or new (name input) -->
              <div v-if="phoneComplete" class="dd__client">
                <template v-if="clientFound">
                  <div class="dd__client-found">
                    <q-icon name="how_to_reg" size="18px" />
                    Doimiy mijoz: <strong>{{ customerName || 'Ism yo‘q' }}</strong>
                  </div>
                </template>
                <button
                  v-else
                  type="button"
                  class="dd__field dd__field--name"
                  :class="{ active: activeField === 'name' }"
                  @click="activeField = 'name'"
                >
                  <span class="dd__label">Mijoz ismi (yangi — saqlanadi)</span>
                  <span class="dd__value dd__value--text">{{ customerName || '—' }}</span>
                </button>

                <!-- previous places (from this client's past orders) -->
                <div v-if="previousPlaces.length" class="dd__places">
                  <span class="dd__places-label">Oldingi manzillar:</span>
                  <button
                    v-for="(p, i) in previousPlaces"
                    :key="i"
                    type="button"
                    class="dd__place"
                    @click="useAddress(p)"
                  >
                    <q-icon name="history" size="14px" /> {{ p }}
                  </button>
                </div>
              </div>

              <!-- address (Manzil) -->
              <button
                type="button"
                class="dd__field dd__field--area"
                :class="{ active: activeField === 'address' }"
                @click="activeField = 'address'"
              >
                <span class="dd__label">Manzil (yetkazish)</span>
                <span class="dd__value dd__value--text">{{ addressLocal || '—' }}</span>
              </button>

              <!-- description (Izoh) -->
              <button
                type="button"
                class="dd__field dd__field--area"
                :class="{ active: activeField === 'izoh' }"
                @click="activeField = 'izoh'"
              >
                <span class="dd__label">Izoh (qo‘shimcha)</span>
                <span class="dd__value dd__value--text">{{ izohLocal || '—' }}</span>
              </button>

              <!-- quick note templates (tap to add to the note) -->
              <div class="dd__templates">
                <button
                  v-for="t in descriptionTemplates"
                  :key="t"
                  type="button"
                  class="dd__tpl"
                  @click="applyTemplate(t)"
                >
                  <q-icon name="add" size="14px" /> {{ t }}
                </button>
              </div>
            </div>

            <!-- RIGHT: keyboard for the active field -->
            <div class="dd__kb">
              <NumericKeyboard
                v-if="activeField === 'phone'"
                @input="onNumberInput"
                @backspace="onNumberBackspace"
                @clear="onNumberClear"
              />
              <VirtualKeyboard
                v-else
                position="inline"
                numbers
                @input="onTextInput"
                @backspace="onTextBackspace"
              />
            </div>
          </div>

          <div class="dd__foot">
            <button type="button" class="btn secondary" @click="close">Bekor</button>
            <button type="button" class="btn primary" @click="save">Saqlash</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { api } from 'boot/axios';
import VirtualKeyboard from 'components/virtual-keyboard/VirtualKeyboard.vue';
import NumericKeyboard from 'components/numeric-keyboard/NumericKeyboard.vue';

/* PROPS — phone/description/customerName are v-model bound. The parent reads
   them back to build the order create payload (customer {name, phone}). */
const props = withDefaults(
  defineProps<{ phone?: string; description?: string; customerName?: string }>(),
  { phone: '', description: '', customerName: '' },
);

const emit = defineEmits<{
  (e: 'update:description', value: string): void;
  (e: 'update:phone', value: string): void;
  (e: 'update:customerName', value: string): void;
}>();

/* STATE */
const showDetails = ref(false);
const activeField = ref<'phone' | 'name' | 'address' | 'izoh'>('phone');
const phoneDigitsLocal = ref('');
const addressLocal = ref('');
const izohLocal = ref('');
const customerName = ref(props.customerName);

/* client lookup */
const lookupLoading = ref(false);
const clientFound = ref(false);
const previousPlaces = ref<string[]>([]);
let lookupTimer: ReturnType<typeof setTimeout> | null = null;

// Seed editable digits from a prefilled phone (operator-mode caller prefill).
watch(
  () => props.phone,
  (p) => {
    const d = (p || '').replace(/\D/g, '').slice(-9);
    if (d) {
      phoneDigitsLocal.value = d;
      if (d.length === 9) queueLookup();
    }
  },
  { immediate: true },
);

const formattedPhone = computed(() => {
  const d = phoneDigitsLocal.value;
  if (!d) return '';
  let r = ` ${d.slice(0, 2)}`;
  if (d.length > 2) r += `-${d.slice(2, 5)}`;
  if (d.length > 5) r += `-${d.slice(5, 7)}`;
  if (d.length > 7) r += `-${d.slice(7, 9)}`;
  return r;
});
const fullPhone = computed(() => `+998${phoneDigitsLocal.value}`);
const phoneComplete = computed(() => phoneDigitsLocal.value.length === 9);

// The backend order still carries a single `description`; until it gains a
// structured address field (BACKEND_TODO_DELIVERY §5), fold Manzil + Izoh into
// description so it shows on the order/receipt today.
const composedDescription = computed(() =>
  [addressLocal.value.trim(), izohLocal.value.trim()].filter(Boolean).join(' — '),
);

/* CLIENT LOOKUP — GET /clients?phone= → returning customer name + past places */
function queueLookup(): void {
  if (lookupTimer) clearTimeout(lookupTimer);
  lookupTimer = setTimeout(() => void lookupClient(), 200);
}
async function lookupClient(): Promise<void> {
  if (!phoneComplete.value) return;
  lookupLoading.value = true;
  try {
    const res = await api.get('/clients', {
      params: { phone: fullPhone.value },
      validateStatus: () => true,
    });
    const data = res.status === 200 ? res.data?.data : null;
    const client = data?.client ?? null;
    if (client?.id) {
      clientFound.value = true;
      if (client.name) customerName.value = client.name;
      // Interim "previous places": distinct non-empty past order descriptions.
      const orders: Array<{ description?: string | null }> = data?.orders ?? [];
      const seen = new Set<string>();
      previousPlaces.value = orders
        .map((o) => (o.description || '').trim())
        .filter((d) => d && !seen.has(d) && (seen.add(d), true))
        .slice(0, 5);
    } else {
      clientFound.value = false;
      previousPlaces.value = [];
    }
  } catch (e) {
    console.warn('[delivery] client lookup failed:', e);
  } finally {
    lookupLoading.value = false;
  }
}

function useAddress(p: string): void {
  addressLocal.value = p;
  activeField.value = 'address';
}

/* Quick note templates (shablon) — tap to append to the note. "O'zi olib ketish"
   (self-pickup) is the first; extend this list as more are needed. */
const descriptionTemplates = ["O'zi olib ketish"];
function applyTemplate(t: string): void {
  const cur = izohLocal.value.trim();
  izohLocal.value = cur ? `${cur} — ${t}` : t;
  activeField.value = 'izoh';
}

/* OPEN / CLOSE / RESET */
function open(): void {
  showDetails.value = true;
  activeField.value = 'phone';
}
function close(): void {
  showDetails.value = false;
}
function reset(): void {
  phoneDigitsLocal.value = '';
  addressLocal.value = '';
  izohLocal.value = '';
  customerName.value = '';
  clientFound.value = false;
  previousPlaces.value = [];
}

/* INPUTS — routed to the active field */
function onTextInput(value: string): void {
  if (activeField.value === 'name') customerName.value += value;
  else if (activeField.value === 'address') addressLocal.value += value;
  else if (activeField.value === 'izoh') izohLocal.value += value;
}
function onTextBackspace(): void {
  if (activeField.value === 'name') customerName.value = customerName.value.slice(0, -1);
  else if (activeField.value === 'address') addressLocal.value = addressLocal.value.slice(0, -1);
  else if (activeField.value === 'izoh') izohLocal.value = izohLocal.value.slice(0, -1);
}
function onNumberInput(value: string): void {
  if (phoneDigitsLocal.value.length >= 9) return;
  phoneDigitsLocal.value += value;
  if (phoneDigitsLocal.value.length === 9) queueLookup();
}
function onNumberBackspace(): void {
  phoneDigitsLocal.value = phoneDigitsLocal.value.slice(0, -1);
  clientFound.value = false;
  previousPlaces.value = [];
}
function onNumberClear(): void {
  phoneDigitsLocal.value = '';
  clientFound.value = false;
  previousPlaces.value = [];
}

/* SAVE */
function save(): void {
  emit('update:description', composedDescription.value);
  emit('update:phone', phoneDigitsLocal.value ? fullPhone.value : '');
  emit('update:customerName', customerName.value.trim());
  close();
}

defineExpose({ reset });
</script>

<style scoped lang="scss">
.trigger {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

/* full-screen panel */
.dd {
  position: fixed;
  inset: 0;
  z-index: 3000;
  background: rgba(10, 12, 16, 0.6);
  backdrop-filter: blur(6px);
  display: flex;
  padding: 12px;
}
.dd__panel {
  width: 100%;
  max-width: 1100px;
  margin: auto;
  height: calc(100vh - 24px);
  background: var(--bg-app);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.5);
}
.dd__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-surface);
}
.dd__title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 20px;
  font-weight: 800;
  color: var(--text-primary);
}
.dd__close {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  background: var(--bg-surface-2);
  color: var(--text-primary);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  &:active { transform: scale(0.95); }
}

.dd__body {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  padding: 16px 20px;
  overflow: hidden;
}
.dd__fields {
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  padding-right: 4px;
}

.dd__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 16px;
  border-radius: 12px;
  cursor: pointer;
  text-align: left;
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  &.active {
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent-primary) 22%, transparent);
  }
  &--area .dd__value { min-height: 44px; white-space: pre-wrap; }
}
.dd__label { font-size: 12px; font-weight: 600; color: var(--text-muted); }
.dd__value {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
  display: flex;
  align-items: center;
  gap: 8px;
}
.dd__value--text { font-size: 17px; font-weight: 600; word-break: break-word; }
.dd__pfx { color: var(--accent-primary); }
.dd__spin { margin-left: auto; }

.dd__client { display: flex; flex-direction: column; gap: 10px; }
.dd__client-found {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--success-weak, color-mix(in srgb, var(--success) 14%, transparent));
  color: var(--success);
  font-size: 15px;
  font-weight: 600;
  strong { color: var(--text-primary); }
}
.dd__places { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.dd__places-label { font-size: 12px; font-weight: 600; color: var(--text-muted); }
.dd__place {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 8px 12px;
  border-radius: var(--r-pill, 999px);
  border: 1px solid var(--border-color);
  background: var(--bg-surface-2);
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  &:active { transform: scale(0.97); }
}

.dd__templates {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.dd__tpl {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 8px 12px;
  border-radius: var(--r-pill, 999px);
  border: 1px dashed var(--accent-primary);
  background: transparent;
  color: var(--accent-primary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  &:active { transform: scale(0.97); }
}

.dd__kb {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  min-height: 0;
}

.dd__foot {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  padding: 14px 20px;
  border-top: 1px solid var(--border-color);
  background: var(--bg-surface);
}

.btn {
  height: 48px;
  border-radius: 12px;
  border: 1px solid transparent;
  font-size: 16px;
  font-weight: 700;
  padding: 0 22px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  &:active { transform: scale(0.97); }
}
.btn.primary { background: var(--accent-primary); color: var(--on-primary); }
.btn.secondary {
  background: var(--bg-surface-2);
  color: var(--text-primary);
  border-color: var(--border-color);
}

.dd-fade-enter-active, .dd-fade-leave-active { transition: opacity 200ms ease; }
.dd-fade-enter-from, .dd-fade-leave-to { opacity: 0; }
</style>
