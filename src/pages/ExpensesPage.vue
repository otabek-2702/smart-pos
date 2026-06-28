<template>
  <q-page class="exp">
    <!-- HEADER -->
    <header class="exp__head">
      <button type="button" class="icon-btn" @click="router.back()">
        <q-icon name="arrow_back" size="22px" />
      </button>
      <div class="exp__title">Xarajatlar <span class="exp__sub">(kassadan)</span></div>
      <div class="exp__stats">
        <div class="stat">
          <div class="stat__label">Smena xarajati</div>
          <div class="stat__val">{{ formatPrice(totalSpent) }} so'm</div>
        </div>
      </div>
      <button type="button" class="btn primary" :disabled="!shiftId" @click="openAdd">
        <q-icon name="add" size="18px" /> Yangi xarajat
      </button>
    </header>

    <div v-if="!apiAvailable" class="exp__banner">
      <q-icon name="info" size="20px" />
      <span>{{ banner }}</span>
    </div>

    <template v-else>
      <div class="exp__list">
        <div v-if="loading" class="exp__empty">Yuklanmoqda…</div>
        <div v-else-if="rows.length === 0" class="exp__empty">Xarajatlar yo'q</div>
        <div v-for="e in rows" :key="e.id" class="exp-row">
          <div class="exp-row__main">{{ e.comment || e.category || 'Xarajat' }}</div>
          <span class="exp-row__who">{{ e.recipient_user || e.recipient_supplier || '' }}</span>
          <span class="exp-row__date">{{ formatDate(e.created_at) }}</span>
          <div class="exp-row__amount">−{{ formatPrice(e.amount) }} so'm</div>
        </div>
      </div>
    </template>

    <!-- ADD — full-screen, cash from the cashbox drawer -->
    <Transition name="add-fade">
      <div v-if="showAdd" class="add" role="dialog" aria-modal="true">
        <div class="add__panel">
          <div class="add__head">
            <div class="add__title">Yangi xarajat (naqd)</div>
            <button type="button" class="icon-btn" @click="showAdd = false"><q-icon name="close" size="22px" /></button>
          </div>

          <div class="add__body">
            <div class="add__field" :class="{ active: field === 'amount' }" @click="field = 'amount'">
              <span class="add__label">Summa (so'm)</span>
              <span class="add__value">{{ formatPrice(amountValue) }}</span>
            </div>
            <div class="add__field" :class="{ active: field === 'comment' }" @click="field = 'comment'">
              <span class="add__label">Izoh</span>
              <span class="add__value add__value--text">{{ comment || '—' }}</span>
            </div>

            <!-- Recipient — who this cash is paid to (staff or supplier). -->
            <div class="add__field" :class="{ active: field === 'recipient' }" @click="openRecipient">
              <span class="add__label">Kimga (qabul qiluvchi)</span>
              <span class="add__value add__value--text">
                {{ field === 'recipient'
                  ? (recipientQuery || '— ism yozing —')
                  : (recipientSel?.name || '—') }}
              </span>
            </div>

            <!-- Recipient search results (only while picking). -->
            <div v-if="field === 'recipient'" class="rcp">
              <button v-if="recipientSel" type="button" class="rcp__clear" @click="clearRecipient">
                <q-icon name="close" size="16px" /> Tanlovni tozalash
              </button>
              <template v-if="recipientResults.users.length">
                <div class="rcp__group">Xodimlar</div>
                <button
                  v-for="u in recipientResults.users"
                  :key="'u' + u.id"
                  type="button"
                  class="rcp__item"
                  :class="{ sel: recipientSel?.type === 'user' && recipientSel?.id === u.id }"
                  @click="selectRecipient('user', u.id, u.name)"
                >
                  <span>{{ u.name }}</span><span class="rcp__meta">{{ roleLabel(u.role) }}</span>
                </button>
              </template>
              <template v-if="recipientResults.suppliers.length">
                <div class="rcp__group">Yetkazib beruvchilar</div>
                <button
                  v-for="s in recipientResults.suppliers"
                  :key="'s' + s.id"
                  type="button"
                  class="rcp__item"
                  :class="{ sel: recipientSel?.type === 'supplier' && recipientSel?.id === s.id }"
                  @click="selectRecipient('supplier', s.id, s.name)"
                >
                  <span>{{ s.name }}</span>
                  <span class="rcp__meta">{{ formatPrice(Number(s.balance) || 0) }} so'm</span>
                </button>
              </template>
              <div
                v-if="!recipientResults.users.length && !recipientResults.suppliers.length"
                class="rcp__empty"
              >
                {{ recipientQuery ? 'Topilmadi' : 'Ism yozing…' }}
              </div>
            </div>

            <div v-if="addError" class="add__err">{{ addError }}</div>
          </div>

          <div class="add__kb">
            <VirtualNumpad
              v-if="field === 'amount'"
              @input="onNumInput"
              @backspace="onNumBackspace"
              @clear="onNumClear"
            />
            <VirtualKeyboard
              v-else
              position="inline"
              @input="onKeyInput"
              @backspace="onKeyBackspace"
              @enter="field = 'amount'"
            />
          </div>

          <div class="add__foot">
            <button type="button" class="btn secondary" @click="showAdd = false">Bekor</button>
            <button type="button" class="btn primary" :disabled="!canAdd || saving" @click="saveExpense">
              <span v-if="saving">Saqlanmoqda…</span><span v-else>Saqlash</span>
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { api } from 'boot/axios';
import { formatPrice } from 'src/utils/formatPrice';
import { toast } from 'vue3-toastify';
import type { AxiosError } from 'axios';
import VirtualNumpad from 'src/components/virtual-keyboard/VirtualNumpad.vue';
import VirtualKeyboard from 'src/components/virtual-keyboard/VirtualKeyboard.vue';
import { getCurrentShift } from 'src/composables/useShift';

const router = useRouter();
// Local edition mounts the cashbox (drawer) under /api/cashbox (pos-staff auth),
// NOT the server edition's /api/admins/cashbox.
const CASHBOX = '/api/cashbox';

interface CashboxExpense {
  id: number;
  amount: string;
  comment: string | null;
  category: string | null;
  recipient_user: string | null;
  recipient_supplier: string | null;
  created_at: string;
}

const apiAvailable = ref(true);
const banner = ref('');
const loading = ref(false);
const rows = ref<CashboxExpense[]>([]);
const shiftId = ref<number | null>(null);

const totalSpent = computed(() =>
  rows.value.reduce((s, e) => s + (Number(e.amount) || 0), 0),
);

function formatDate(d: string): string {
  try { return new Date(d).toLocaleString('uz-UZ', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  catch { return d; }
}
function fail(b: string): void { apiAvailable.value = false; banner.value = b; }

async function init(): Promise<void> {
  loading.value = true;
  try {
    const shift = await getCurrentShift();
    if (!shift?.id) { fail("Ochiq smena yo'q — avval smenani boshlang."); return; }
    shiftId.value = shift.id;
    await loadList();
    apiAvailable.value = true;
  } catch (e) {
    handleError(e);
  } finally {
    loading.value = false;
  }
}
function handleError(e: unknown): void {
  const status = (e as AxiosError)?.response?.status;
  if (status === 401 || status === 403) fail("Ruxsat yo'q (faqat xodim).");
  else if (status === 404) fail("Xarajatlar serverda mavjud emas.");
  else console.error('Cashbox error:', e);
}
async function loadList(): Promise<void> {
  if (!shiftId.value) return;
  const res = await api.get(`${CASHBOX}/shifts/${shiftId.value}/expenses/`);
  rows.value = res.data?.data ?? [];
}

/* add */
const showAdd = ref(false);
const saving = ref(false);
const addError = ref<string | null>(null);
const field = ref<'amount' | 'comment' | 'recipient'>('amount');
const amountInput = ref('');
const comment = ref('');
const amountValue = computed(() => parseInt(amountInput.value, 10) || 0);
const canAdd = computed(() => amountValue.value > 0);

/* recipient (who the cash is paid to) — staff user or supplier */
interface RecipientUser { id: number; name: string; role: string }
interface RecipientSupplier { id: number; name: string; balance: string }
const recipientQuery = ref('');
const recipientResults = ref<{ users: RecipientUser[]; suppliers: RecipientSupplier[] }>({
  users: [],
  suppliers: [],
});
const recipientSel = ref<{ type: 'user' | 'supplier'; id: number; name: string } | null>(null);
let recipientTimer: ReturnType<typeof setTimeout> | null = null;

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Admin', MANAGER: 'Menejer', CASHIER: 'Kassir', CHEF: 'Oshpaz', WAITER: 'Ofitsiant',
};
function roleLabel(r: string): string { return ROLE_LABELS[r] || r; }

function openRecipient(): void {
  field.value = 'recipient';
  // Seed the list (top staff + suppliers) the first time it's opened.
  if (!recipientResults.value.users.length && !recipientResults.value.suppliers.length) {
    void searchRecipients();
  }
}
async function searchRecipients(): Promise<void> {
  try {
    const res = await api.get(`${CASHBOX}/recipients/search`, {
      params: { q: recipientQuery.value.trim() },
      validateStatus: () => true,
    });
    if (res.status === 200) {
      recipientResults.value = {
        users: res.data?.data?.users ?? [],
        suppliers: res.data?.data?.suppliers ?? [],
      };
    }
  } catch (e) {
    console.error('recipient search failed:', e);
  }
}
function queueRecipientSearch(): void {
  if (recipientTimer) clearTimeout(recipientTimer);
  recipientTimer = setTimeout(() => void searchRecipients(), 250);
}
function selectRecipient(type: 'user' | 'supplier', id: number, name: string): void {
  recipientSel.value = { type, id, name };
  field.value = 'comment';
}
function clearRecipient(): void {
  recipientSel.value = null;
  recipientQuery.value = '';
  void searchRecipients();
}

function onNumInput(v: string): void {
  if (amountInput.value.length >= 12) return;
  amountInput.value = amountInput.value === '' && v === '0' ? '' : amountInput.value + v;
}
function onNumBackspace(): void { amountInput.value = amountInput.value.slice(0, -1); }
function onNumClear(): void { amountInput.value = ''; }
function onKeyInput(c: string): void {
  if (field.value === 'recipient') { recipientQuery.value += c; queueRecipientSearch(); }
  else { comment.value += c; }
}
function onKeyBackspace(): void {
  if (field.value === 'recipient') {
    recipientQuery.value = recipientQuery.value.slice(0, -1);
    queueRecipientSearch();
  } else { comment.value = comment.value.slice(0, -1); }
}

function openAdd(): void {
  amountInput.value = '';
  comment.value = '';
  recipientQuery.value = '';
  recipientSel.value = null;
  recipientResults.value = { users: [], suppliers: [] };
  field.value = 'amount';
  addError.value = null;
  showAdd.value = true;
}
async function saveExpense(): Promise<void> {
  if (!canAdd.value || saving.value || !shiftId.value) return;
  saving.value = true;
  addError.value = null;
  try {
    const body: Record<string, unknown> = {
      amount: amountValue.value,
      comment: comment.value.trim(),
    };
    if (recipientSel.value?.type === 'user') body.recipient_user_id = recipientSel.value.id;
    else if (recipientSel.value?.type === 'supplier') body.recipient_supplier_id = recipientSel.value.id;
    const res = await api.post(
      `${CASHBOX}/shifts/${shiftId.value}/expenses/`,
      body,
      { validateStatus: () => true },
    );
    if (res.status === 200 || res.status === 201) {
      toast.success("Xarajat qo'shildi");
      showAdd.value = false;
      await loadList();
    } else if (res.status === 403 || res.status === 401) {
      fail("Ruxsat yo'q (faqat xodim).");
      showAdd.value = false;
    } else {
      addError.value = res.data?.message || res.data?.errors?.amount || `Xatolik (HTTP ${res.status})`;
    }
  } catch (e) {
    handleError(e);
    addError.value = "Server bilan aloqa yo'q";
  } finally {
    saving.value = false;
  }
}

onMounted(() => void init());
</script>

<style scoped lang="scss">
.exp { background: var(--bg-app); min-height: 100vh; padding: 16px; }

.exp__head { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
.icon-btn {
  width: 44px; height: 44px; border-radius: 12px;
  border: 1px solid var(--border-color); background: var(--bg-surface);
  color: var(--text-primary); cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
  &:active { transform: scale(0.95); }
}
.exp__title { font-size: 22px; font-weight: 800; color: var(--text-primary); }
.exp__sub { font-size: 14px; font-weight: 600; color: var(--text-muted); }
.exp__stats { margin-left: auto; }
.stat { text-align: right; }
.stat__label { font-size: 12px; color: var(--text-muted); }
.stat__val { font-size: 18px; font-weight: 800; color: var(--text-primary); font-variant-numeric: tabular-nums; }

.exp__banner {
  display: flex; align-items: center; gap: 10px;
  padding: 14px 16px; border-radius: 12px;
  background: var(--bg-surface-2); border: 1px solid var(--border-color);
  color: var(--text-muted); font-size: 14px;
}

.exp__list { display: flex; flex-direction: column; gap: 8px; }
.exp__empty { padding: 40px; text-align: center; color: var(--text-muted); }
.exp-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 150px 130px 140px;
  gap: 14px; align-items: center;
  padding: 14px 16px; border-radius: 12px;
  background: var(--bg-surface); border: 1px solid var(--border-color);
}
.exp-row__main { font-weight: 600; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.exp-row__who { font-size: 13px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.exp-row__date { font-size: 13px; color: var(--text-muted); }
.exp-row__amount { font-weight: 800; text-align: right; color: var(--error); font-variant-numeric: tabular-nums; }

.btn {
  height: 44px; padding: 0 18px; border-radius: 12px; border: 1px solid transparent;
  font-size: 14px; font-weight: 700; cursor: pointer;
  display: inline-flex; align-items: center; gap: 6px;
  &:disabled { opacity: 0.5; cursor: not-allowed; }
  &:active:not(:disabled) { transform: scale(0.97); }
}
.btn.primary { background: var(--accent-primary, #ff7a00); color: var(--on-primary); }
.btn.secondary { background: var(--bg-surface-2); color: var(--text-primary); border-color: var(--border-color); }

/* full-screen add */
.add { position: fixed; inset: 0; z-index: 3000; background: rgba(10,12,16,0.6); backdrop-filter: blur(6px); display: flex; padding: 12px; }
.add__panel {
  width: 100%; max-width: 720px; margin: auto; height: calc(100vh - 24px);
  background: var(--bg-app); border: 1px solid var(--border-color); border-radius: 16px;
  display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 30px 80px rgba(0,0,0,0.5);
}
.add__head { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid var(--border-color); background: var(--bg-surface); }
.add__title { font-size: 19px; font-weight: 800; color: var(--text-primary); }
.add__body { padding: 16px 18px; display: flex; flex-direction: column; gap: 12px; }
.add__field {
  display: flex; flex-direction: column; gap: 4px;
  padding: 12px 16px; border-radius: 12px; cursor: pointer;
  border: 1px solid var(--border-color); background: var(--bg-surface);
  &.active { border-color: var(--accent-primary, #ff7a00); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent-primary, #ff7a00) 22%, transparent); }
}
.add__label { font-size: 12px; color: var(--text-muted); }
.add__value { font-size: 26px; font-weight: 800; color: var(--text-primary); font-variant-numeric: tabular-nums; }
.add__value--text { font-size: 18px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.add__err { font-size: 13px; color: var(--error); }

/* recipient search results */
.rcp {
  display: flex; flex-direction: column; gap: 4px;
  max-height: 32vh; overflow-y: auto;
  padding: 8px; border-radius: 12px;
  border: 1px solid var(--border-color); background: var(--bg-surface);
}
.rcp__clear {
  align-self: flex-start;
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 10px; margin-bottom: 4px;
  border-radius: 8px; border: 1px solid var(--border-color);
  background: var(--bg-surface-2); color: var(--text-muted);
  font-size: 13px; font-weight: 600; cursor: pointer;
}
.rcp__group {
  font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px;
  color: var(--text-muted); padding: 6px 8px 2px;
}
.rcp__item {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 12px 14px; border-radius: 10px; border: none;
  background: var(--bg-surface-2); color: var(--text-primary);
  font-size: 15px; font-weight: 600; cursor: pointer; text-align: left;
  &:active { transform: scale(0.99); }
  &.sel { background: var(--accent-soft, color-mix(in srgb, var(--accent-primary) 16%, transparent)); color: var(--accent-primary); }
}
.rcp__meta { font-size: 13px; font-weight: 500; color: var(--text-muted); flex-shrink: 0; }
.rcp__empty { padding: 16px; text-align: center; font-size: 13px; color: var(--text-muted); }
.add__kb { margin-top: auto; }
.add__foot { display: flex; gap: 12px; justify-content: flex-end; padding: 12px 18px; border-top: 1px solid var(--border-color); background: var(--bg-surface); }

.add-fade-enter-active, .add-fade-leave-active { transition: opacity 200ms ease; }
.add-fade-enter-from, .add-fade-leave-to { opacity: 0; }
</style>
