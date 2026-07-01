<template>
  <!-- compact trigger (icon only, matches the search box height; a dot shows
       when delivery/customer data has been entered) -->
  <button type="button" class="dd-trigger" :class="{ has: hasData }" title="Mijoz / yetkazib berish" @click="open">
    <q-icon name="person_pin_circle" size="24px" />
    <span v-if="hasData" class="dd-trigger__dot" />
  </button>

  <!-- full-screen customer / delivery panel -->
  <Teleport to="body">
    <Transition name="dd-fade">
      <div v-if="showDetails" class="dd" role="dialog" aria-modal="true">
        <div class="dd__panel">
          <!-- header -->
          <div class="dd__head">
            <div class="dd__title">
              <q-icon name="person_pin_circle" size="24px" />
              Mijoz va yetkazib berish
            </div>
            <button type="button" class="dd__close" aria-label="Yopish" @click="save">
              <q-icon name="close" size="24px" />
            </button>
          </div>

          <!-- fields (left) + keyboard (right) fill the full-width panel -->
          <div class="dd__main">
          <!-- scrollable fields -->
          <div class="dd__body">
            <!-- phone -->
            <button
              type="button"
              class="fld"
              :class="{ active: activeField === 'phone' }"
              @click="activeField = 'phone'"
            >
              <span class="fld__label"><q-icon name="call" size="15px" /> Telefon raqam</span>
              <span class="fld__val">
                <span class="fld__pfx">+998</span>{{ formattedPhone || ' —' }}
                <q-spinner v-if="lookupLoading" size="16px" class="fld__spin" />
              </span>
            </button>

            <!-- client status (only once the number is complete) -->
            <Transition name="dd-slide">
              <div v-if="phoneComplete" class="client">
                <!-- returning customer -->
                <div v-if="clientFound" class="client-card">
                  <div class="client-card__icon"><q-icon name="how_to_reg" size="22px" /></div>
                  <div class="client-card__body">
                    <div class="client-card__name">{{ customerName || 'Ism yo‘q' }}</div>
                    <div v-if="clientMeta" class="client-card__meta">{{ clientMeta }}</div>
                  </div>
                  <div class="client-card__tag">Doimiy</div>
                </div>

                <!-- new customer: name to save -->
                <template v-else>
                  <button
                    type="button"
                    class="fld"
                    :class="{ active: activeField === 'name' }"
                    @click="activeField = 'name'"
                  >
                    <span class="fld__label"><q-icon name="person_add" size="15px" /> Mijoz ismi (yangi — saqlanadi)</span>
                    <span class="fld__val fld__val--text">{{ customerName || '—' }}</span>
                  </button>
                  <div class="new-hint"><q-icon name="info" size="14px" /> Yangi raqam. Ism kiritsangiz, keyingi safar avtomatik chiqadi.</div>
                </template>

                <!-- previous delivery places -->
                <div v-if="previousPlaces.length" class="places">
                  <span class="places__label">Oldingi manzillar</span>
                  <div class="places__list">
                    <button
                      v-for="(p, i) in previousPlaces"
                      :key="i"
                      type="button"
                      class="chip"
                      @click="useAddress(p)"
                    >
                      <q-icon name="history" size="14px" /> {{ p }}
                    </button>
                  </div>
                </div>
              </div>
            </Transition>

            <!-- address -->
            <button
              type="button"
              class="fld fld--area"
              :class="{ active: activeField === 'address' }"
              @click="activeField = 'address'"
            >
              <span class="fld__label"><q-icon name="location_on" size="15px" /> Manzil (yetkazish)</span>
              <span class="fld__val fld__val--text">{{ addressLocal || '—' }}</span>
            </button>

            <!-- note -->
            <button
              type="button"
              class="fld fld--area"
              :class="{ active: activeField === 'izoh' }"
              @click="activeField = 'izoh'"
            >
              <span class="fld__label"><q-icon name="sticky_note_2" size="15px" /> Izoh (qo‘shimcha)</span>
              <span class="fld__val fld__val--text">{{ izohLocal || '—' }}</span>
            </button>

            <!-- quick note templates -->
            <div class="tpls">
              <button
                v-for="t in descriptionTemplates"
                :key="t"
                type="button"
                class="chip chip--tpl"
                @click="applyTemplate(t)"
              >
                <q-icon name="add" size="14px" /> {{ t }}
              </button>
            </div>
          </div>

          <!-- full-width keyboard for the active field -->
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
            <button type="button" class="btn ghost" @click="clearAll">Tozalash</button>
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

const props = withDefaults(
  defineProps<{ phone?: string; description?: string; address?: string; customerName?: string }>(),
  { phone: '', description: '', address: '', customerName: '' },
);

const emit = defineEmits<{
  (e: 'update:description', value: string): void;
  (e: 'update:address', value: string): void;
  (e: 'update:phone', value: string): void;
  (e: 'update:customerName', value: string): void;
}>();

/* STATE */
const showDetails = ref(false);
const activeField = ref<'phone' | 'name' | 'address' | 'izoh'>('phone');
const phoneDigitsLocal = ref('');
const addressLocal = ref(props.address);
const izohLocal = ref(props.description);
const customerName = ref(props.customerName);

/* client lookup */
const lookupLoading = ref(false);
const clientFound = ref(false);
// True while `customerName` holds a name that came from a lookup (not typed by
// the cashier) — so we clear it the moment the phone no longer matches, instead
// of leaving a previous customer's name stuck on screen.
const nameFromLookup = ref(false);
const clientStats = ref<{ count: number; last: string | null } | null>(null);
const previousPlaces = ref<string[]>([]);
let lookupTimer: ReturnType<typeof setTimeout> | null = null;

const hasData = computed(
  () => !!(phoneDigitsLocal.value || addressLocal.value || izohLocal.value || customerName.value),
);

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

function fmtDate(s: string | null): string {
  if (!s) return '';
  try {
    return new Date(s).toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: '2-digit' });
  } catch {
    return '';
  }
}
const clientMeta = computed(() => {
  const st = clientStats.value;
  if (!st) return '';
  const parts: string[] = [];
  if (st.count) parts.push(`${st.count} ta buyurtma`);
  if (st.last) parts.push(`oxirgi: ${fmtDate(st.last)}`);
  return parts.join(' · ');
});

/* CLIENT LOOKUP — GET /clients?phone= */
function queueLookup(): void {
  if (lookupTimer) clearTimeout(lookupTimer);
  lookupTimer = setTimeout(() => void lookupClient(), 200);
}
async function lookupClient(): Promise<void> {
  if (!phoneComplete.value) return;
  lookupLoading.value = true;
  try {
    const res = await api.get('/clients', { params: { phone: fullPhone.value }, validateStatus: () => true });
    const data = res.status === 200 ? res.data?.data : null;
    const client = data?.client ?? null;
    if (client?.id) {
      clientFound.value = true;
      if (client.name) {
        customerName.value = client.name;
        nameFromLookup.value = true;
      }
      const st = data?.stats ?? null;
      clientStats.value = st ? { count: st.order_count ?? 0, last: st.last_order_at ?? null } : null;
      const orders: Array<{ description?: string | null }> = data?.orders ?? [];
      const seen = new Set<string>();
      previousPlaces.value = orders
        .map((o) => (o.description || '').trim())
        .filter((d) => d && !seen.has(d) && (seen.add(d), true))
        .slice(0, 5);
    } else {
      // No match for this number → drop any previously-shown returning customer.
      clearFoundClient();
    }
  } catch (e) {
    console.warn('[delivery] client lookup failed:', e);
  } finally {
    lookupLoading.value = false;
  }
}

// Clear ONLY lookup-sourced client info (never a name the cashier typed).
function clearFoundClient(): void {
  clientFound.value = false;
  clientStats.value = null;
  previousPlaces.value = [];
  if (nameFromLookup.value) {
    customerName.value = '';
    nameFromLookup.value = false;
  }
}

function useAddress(p: string): void {
  addressLocal.value = p;
  activeField.value = 'address';
}

/* Quick note templates (shablon) — tap to append to the note. */
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
function clearAll(): void {
  phoneDigitsLocal.value = '';
  addressLocal.value = '';
  izohLocal.value = '';
  customerName.value = '';
  nameFromLookup.value = false;
  clearFoundClient();
  activeField.value = 'phone';
}
function reset(): void {
  clearAll();
}

/* INPUTS — routed to the active field */
function onTextInput(value: string): void {
  if (activeField.value === 'name') {
    customerName.value += value;
    nameFromLookup.value = false; // cashier is typing a real name now
  } else if (activeField.value === 'address') addressLocal.value += value;
  else if (activeField.value === 'izoh') izohLocal.value += value;
}
function onTextBackspace(): void {
  if (activeField.value === 'name') {
    customerName.value = customerName.value.slice(0, -1);
    nameFromLookup.value = false;
  } else if (activeField.value === 'address') addressLocal.value = addressLocal.value.slice(0, -1);
  else if (activeField.value === 'izoh') izohLocal.value = izohLocal.value.slice(0, -1);
}
function onNumberInput(value: string): void {
  if (phoneDigitsLocal.value.length >= 9) return;
  phoneDigitsLocal.value += value;
  if (phoneDigitsLocal.value.length === 9) queueLookup();
  else clearFoundClient();
}
function onNumberBackspace(): void {
  phoneDigitsLocal.value = phoneDigitsLocal.value.slice(0, -1);
  clearFoundClient();
}
function onNumberClear(): void {
  phoneDigitsLocal.value = '';
  clearFoundClient();
}

/* SAVE — address + note emitted separately (receipt prints Manzil / Izoh). */
function save(): void {
  emit('update:address', addressLocal.value.trim());
  emit('update:description', izohLocal.value.trim());
  emit('update:phone', phoneDigitsLocal.value ? fullPhone.value : '');
  emit('update:customerName', customerName.value.trim());
  close();
}

defineExpose({ reset });
</script>

<style scoped lang="scss">
/* compact icon trigger */
.dd-trigger {
  position: relative;
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--ink-2);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  &:active { transform: scale(0.95); }
  &.has { color: var(--brand); border-color: var(--brand); background: var(--brand-soft); }
}
.dd-trigger__dot {
  position: absolute;
  top: 7px;
  right: 7px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--brand);
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
  max-width: none; /* full screen width */
  margin: auto;
  height: calc(100vh - 24px);
  background: var(--surface-2, var(--bg-app));
  border: 1px solid var(--line);
  border-radius: 18px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.5);
}

/* fields (left) + keyboard (right) share the full width */
.dd__main {
  flex: 1;
  min-height: 0;
  display: flex;
}
.dd__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--line);
  background: var(--surface);
}
.dd__title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 19px;
  font-weight: 800;
  color: var(--ink);
}
.dd__close {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--ink);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  &:active { transform: scale(0.95); }
}

.dd__body {
  flex: 1 1 54%;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* field */
.fld {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 12px 16px;
  border-radius: 14px;
  cursor: pointer;
  text-align: left;
  border: 1px solid var(--line);
  background: var(--surface);
  &.active {
    border-color: var(--brand);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--brand) 22%, transparent);
  }
  &--area .fld__val { min-height: 40px; white-space: pre-wrap; }
}
.fld__label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--ink-2);
}
.fld__val {
  font-size: 22px;
  font-weight: 700;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
  display: flex;
  align-items: center;
  gap: 8px;
}
.fld__val--text { font-size: 17px; font-weight: 600; word-break: break-word; }
.fld__pfx { color: var(--brand); }
.fld__spin { margin-left: auto; }

/* client card (returning) */
.client { display: flex; flex-direction: column; gap: 10px; }
.client-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 14px;
  background: var(--ready-bg, color-mix(in srgb, var(--brand) 12%, transparent));
  border: 1px solid color-mix(in srgb, var(--brand) 30%, transparent);
}
.client-card__icon {
  width: 40px;
  height: 40px;
  border-radius: 11px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--surface);
  color: var(--brand);
  flex-shrink: 0;
}
.client-card__body { flex: 1; min-width: 0; }
.client-card__name { font-size: 17px; font-weight: 800; color: var(--ink); }
.client-card__meta { font-size: 13px; color: var(--ink-2); margin-top: 1px; }
.client-card__tag {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--brand);
  background: var(--surface);
  border-radius: 999px;
  padding: 4px 10px;
}
.new-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--ink-2);
}

/* previous places + templates */
.places { display: flex; flex-direction: column; gap: 6px; }
.places__label { font-size: 12px; font-weight: 600; color: var(--ink-2); }
.places__list, .tpls { display: flex; flex-wrap: wrap; gap: 8px; }
.chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--ink);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  &:active { transform: scale(0.97); }
}
.chip--tpl { border-style: dashed; border-color: var(--brand); color: var(--brand); }

/* full-width keyboard */
.dd__kb {
  flex: 0 0 46%;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 16px;
  background: var(--surface);
  border-left: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  justify-content: center;
}
/* Narrow (tablet portrait): stack — keyboard drops below the fields. */
@media (max-width: 900px) {
  .dd__main { flex-direction: column; }
  .dd__body { flex: 1 1 auto; }
  .dd__kb {
    flex: 0 0 auto;
    border-left: none;
    border-top: 1px solid var(--line);
    justify-content: flex-end;
  }
}

.dd__foot {
  display: flex;
  gap: 12px;
  padding: 12px 20px;
  border-top: 1px solid var(--line);
  background: var(--surface);
}
.btn {
  height: 50px;
  border-radius: 14px;
  border: 1px solid transparent;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  &:active { transform: scale(0.97); }
}
.btn.primary { flex: 1; background: var(--brand); color: #fff; }
.btn.ghost {
  padding: 0 20px;
  background: var(--surface-2);
  color: var(--ink);
  border-color: var(--line);
}

.dd-fade-enter-active, .dd-fade-leave-active { transition: opacity 200ms ease; }
.dd-fade-enter-from, .dd-fade-leave-to { opacity: 0; }
.dd-slide-enter-active, .dd-slide-leave-active { transition: all 180ms ease; }
.dd-slide-enter-from, .dd-slide-leave-to { opacity: 0; transform: translateY(-6px); }
</style>
