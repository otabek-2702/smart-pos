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
          <div class="exp-row__main">
            <span class="exp-row__category">{{ e.category || 'Kategoriyasiz' }}</span>
            <span class="exp-row__comment">{{ e.comment || 'Izohsiz' }}</span>
          </div>
          <span class="exp-row__who">
            <q-icon :name="e.recipient_supplier ? 'local_shipping' : 'person_outline'" size="17px" />
            {{ e.recipient_user || e.recipient_supplier || 'Qabul qiluvchi ko‘rsatilmagan' }}
          </span>
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

            <!-- Category is required so cashbox reports never receive a new
                 anonymous expense. -->
            <div class="add__field" :class="{ active: field === 'category' }" @click="openCategory">
              <span class="add__label">Xarajat kategoriyasi</span>
              <span class="add__value add__value--text">
                {{ categorySel?.name || '— kategoriyani tanlang —' }}
              </span>
            </div>

            <div v-if="field === 'category'" class="categories">
              <div v-if="categoriesLoading" class="picker-state">
                <q-spinner size="22px" /> Kategoriyalar yuklanmoqda…
              </div>
              <div v-else-if="categoryError" class="picker-state picker-state--error">
                <q-icon name="error_outline" size="20px" /> {{ categoryError }}
              </div>
              <template v-else>
                <button
                  v-for="category in categories"
                  :key="category.id"
                  type="button"
                  class="category-option"
                  :class="{ sel: categorySel?.id === category.id }"
                  @click="selectCategory(category)"
                >
                  <q-icon :name="categorySel?.id === category.id ? 'check_circle' : 'category'" size="19px" />
                  {{ category.name }}
                </button>
              </template>

              <div class="category-create">
                <button
                  v-if="!creatingCategoryOpen"
                  type="button"
                  class="category-create__toggle"
                  @click="openCategoryCreate"
                >
                  <q-icon name="add" size="18px" /> Yangi kategoriya
                </button>
                <div v-else class="category-create__form">
                  <input
                    ref="newCategoryInput"
                    v-model="newCategoryName"
                    class="category-create__input"
                    maxlength="100"
                    placeholder="Kategoriya nomi"
                    @keyup.enter="createCategory"
                  >
                  <button
                    type="button"
                    class="btn primary category-create__save"
                    :disabled="!newCategoryName.trim() || creatingCategory"
                    @click="createCategory"
                  >
                    <q-spinner v-if="creatingCategory" size="18px" />
                    <span v-else>Qo‘shish</span>
                  </button>
                  <button
                    type="button"
                    class="icon-btn category-create__close"
                    :disabled="creatingCategory"
                    aria-label="Kategoriya yaratishni yopish"
                    @click="closeCategoryCreate()"
                  >
                    <q-icon name="close" size="19px" />
                  </button>
                  <div v-if="categoryCreateError" class="category-create__error">
                    {{ categoryCreateError }}
                  </div>
                </div>
              </div>
            </div>

            <!-- Recipient — who this cash is paid to (staff or supplier). -->
            <div class="add__field" :class="{ active: field === 'recipient' }" @click="openRecipient">
              <span class="add__label">Kimga (qabul qiluvchi)</span>
              <span class="add__value add__value--text">
                {{ recipientSel?.name || recipientQuery || '— qabul qiluvchini tanlang —' }}
              </span>
            </div>

            <!-- Recipient search results (only while picking). -->
            <div v-if="field === 'recipient'" class="rcp">
              <div v-if="recipientsLoading" class="picker-state">
                <q-spinner size="20px" /> Qidirilmoqda…
              </div>
              <div v-else-if="recipientError" class="picker-state picker-state--error">
                <q-icon name="error_outline" size="20px" /> {{ recipientError }}
              </div>
              <button v-if="recipientSel" type="button" class="rcp__clear" @click="clearRecipient">
                <q-icon name="close" size="16px" /> Tanlovni tozalash
              </button>
              <template v-if="!recipientError && recipientResults.users.length">
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
              <template v-if="!recipientError && recipientResults.suppliers.length">
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
                v-if="!recipientsLoading && !recipientError && !recipientResults.users.length && !recipientResults.suppliers.length"
                class="rcp__empty"
              >
                {{ recipientQuery ? 'Topilmadi' : 'Ism yozing…' }}
              </div>
            </div>

            <div class="add__field" :class="{ active: field === 'comment' }" @click="field = 'comment'">
              <span class="add__label">Izoh</span>
              <span class="add__value add__value--text">{{ comment || '—' }}</span>
            </div>

            <div class="add__requirements">
              <span :class="{ done: amountValue > 0 }"><q-icon name="payments" /> Summa</span>
              <span :class="{ done: categorySel }"><q-icon name="category" /> Kategoriya</span>
              <span :class="{ done: recipientSel }"><q-icon name="person" /> Qabul qiluvchi</span>
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
              v-else-if="field !== 'category' || creatingCategoryOpen"
              position="inline"
              @input="onKeyInput"
              @backspace="onKeyBackspace"
              @enter="onKeyEnter"
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
import { ref, computed, nextTick, onMounted } from 'vue';
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
const field = ref<'amount' | 'category' | 'comment' | 'recipient'>('amount');
const amountInput = ref('');
const comment = ref('');
const amountValue = computed(() => parseInt(amountInput.value, 10) || 0);

interface ExpenseCategory { id: number; name: string; sort_order?: number }
const categories = ref<ExpenseCategory[]>([]);
const categorySel = ref<ExpenseCategory | null>(null);
const categoriesLoading = ref(false);
const categoryError = ref('');
const creatingCategoryOpen = ref(false);
const creatingCategory = ref(false);
const newCategoryName = ref('');
const categoryCreateError = ref('');
const newCategoryInput = ref<HTMLInputElement | null>(null);

const canAdd = computed(() =>
  amountValue.value > 0 && categorySel.value !== null && recipientSel.value !== null,
);

async function loadCategories(): Promise<void> {
  categoriesLoading.value = true;
  categoryError.value = '';
  try {
    const res = await api.get(`${CASHBOX}/categories/`, { validateStatus: () => true });
    if (res.status === 200) {
      categories.value = (res.data?.data ?? []).slice().sort(
        (a: ExpenseCategory, b: ExpenseCategory) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
      );
      if (!categories.value.length) categoryError.value = 'Faol xarajat kategoriyalari topilmadi.';
    } else if (res.status === 401 || res.status === 403) {
      categoryError.value = 'Kategoriyalarni ko‘rish uchun server ruxsat bermadi.';
    } else {
      categoryError.value = `Kategoriyalar yuklanmadi (HTTP ${res.status}).`;
    }
  } catch (e) {
    console.error('expense categories failed:', e);
    categoryError.value = 'Kategoriyalarni serverdan olib bo‘lmadi.';
  } finally {
    categoriesLoading.value = false;
  }
}

function openCategory(): void {
  field.value = 'category';
  if (!categories.value.length && !categoriesLoading.value) void loadCategories();
}

function selectCategory(category: ExpenseCategory): void {
  categorySel.value = category;
  openRecipient();
}

function openCategoryCreate(): void {
  categoryCreateError.value = '';
  newCategoryName.value = '';
  creatingCategoryOpen.value = true;
  void nextTick(() => newCategoryInput.value?.focus());
}

function closeCategoryCreate(force = false): void {
  if (creatingCategory.value && !force) return;
  creatingCategoryOpen.value = false;
  categoryCreateError.value = '';
  newCategoryName.value = '';
}

async function createCategory(): Promise<void> {
  const name = newCategoryName.value.trim();
  if (!name || creatingCategory.value) return;

  creatingCategory.value = true;
  categoryCreateError.value = '';
  try {
    const res = await api.post(`${CASHBOX}/categories/`, {
      name,
      sort_order: categories.value.length,
    }, { validateStatus: () => true });
    if (res.status === 200 || res.status === 201) {
      const saved = res.data?.data ?? res.data;
      const category: ExpenseCategory = {
        id: Number(saved?.id),
        name: String(saved?.name ?? name),
        sort_order: Number(saved?.sort_order ?? categories.value.length),
      };
      if (!Number.isInteger(category.id) || category.id <= 0) {
        categoryCreateError.value = 'Kategoriya yaratildi, lekin uni qayta yuklab bo‘lmadi.';
        await loadCategories();
        return;
      }
      categories.value = [...categories.value, category].sort(
        (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
      );
      categorySel.value = category;
      closeCategoryCreate(true);
      openRecipient();
    } else if (res.status === 401 || res.status === 403) {
      categoryCreateError.value = 'Kategoriya qo‘shish uchun menejer yoki admin ruxsati kerak.';
    } else {
      categoryCreateError.value = res.data?.message || `Kategoriya qo‘shilmadi (HTTP ${res.status}).`;
    }
  } catch (e) {
    console.error('expense category creation failed:', e);
    categoryCreateError.value = 'Kategoriya yaratishda server bilan aloqa bo‘lmadi.';
  } finally {
    creatingCategory.value = false;
  }
}

/* recipient (who the cash is paid to) — staff user or supplier */
interface RecipientUser { id: number; name: string; role: string }
interface RecipientSupplier { id: number; name: string; balance: string }
const recipientQuery = ref('');
const recipientResults = ref<{ users: RecipientUser[]; suppliers: RecipientSupplier[] }>({
  users: [],
  suppliers: [],
});
const recipientSel = ref<{ type: 'user' | 'supplier'; id: number; name: string } | null>(null);
const recipientsLoading = ref(false);
const recipientError = ref('');
let recipientTimer: ReturnType<typeof setTimeout> | null = null;
let recipientSearchVersion = 0;

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
  const requestVersion = ++recipientSearchVersion;
  const query = recipientQuery.value.trim();
  recipientsLoading.value = true;
  recipientError.value = '';
  try {
    const res = await api.get(`${CASHBOX}/recipients/search/`, {
      params: { q: query },
      validateStatus: () => true,
    });
    if (requestVersion !== recipientSearchVersion || query !== recipientQuery.value.trim()) return;
    if (res.status === 200) {
      recipientResults.value = {
        users: res.data?.data?.users ?? [],
        suppliers: res.data?.data?.suppliers ?? [],
      };
    } else {
      recipientError.value = `Qabul qiluvchilar yuklanmadi (HTTP ${res.status}).`;
    }
  } catch (e) {
    if (requestVersion === recipientSearchVersion) {
      console.error('recipient search failed:', e);
      recipientError.value = 'Qabul qiluvchilarni serverdan olib bo‘lmadi.';
    }
  } finally {
    if (requestVersion === recipientSearchVersion) recipientsLoading.value = false;
  }
}
function queueRecipientSearch(): void {
  if (recipientTimer) clearTimeout(recipientTimer);
  recipientTimer = setTimeout(() => void searchRecipients(), 250);
}
function selectRecipient(type: 'user' | 'supplier', id: number, name: string): void {
  recipientSearchVersion += 1;
  recipientsLoading.value = false;
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
  if (creatingCategoryOpen.value) { newCategoryName.value += c; }
  else if (field.value === 'recipient') { recipientQuery.value += c; queueRecipientSearch(); }
  else { comment.value += c; }
}
function onKeyBackspace(): void {
  if (creatingCategoryOpen.value) { newCategoryName.value = newCategoryName.value.slice(0, -1); }
  else if (field.value === 'recipient') {
    recipientQuery.value = recipientQuery.value.slice(0, -1);
    queueRecipientSearch();
  } else { comment.value = comment.value.slice(0, -1); }
}
function onKeyEnter(): void {
  if (creatingCategoryOpen.value) {
    void createCategory();
    return;
  }
  field.value = 'amount';
}

function openAdd(): void {
  amountInput.value = '';
  comment.value = '';
  recipientQuery.value = '';
  recipientSel.value = null;
  recipientResults.value = { users: [], suppliers: [] };
  recipientError.value = '';
  recipientSearchVersion += 1;
  recipientsLoading.value = false;
  categorySel.value = null;
  closeCategoryCreate();
  field.value = 'amount';
  addError.value = null;
  showAdd.value = true;
  if (!categories.value.length) void loadCategories();
}
async function saveExpense(): Promise<void> {
  if (!canAdd.value || saving.value || !shiftId.value) return;
  saving.value = true;
  addError.value = null;
  try {
    const body: Record<string, unknown> = {
      amount: amountValue.value,
      comment: comment.value.trim(),
      category_id: categorySel.value?.id,
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
.exp-row__main {
  display: flex; min-width: 0; align-items: center; gap: 10px;
  font-weight: 600; color: var(--text-primary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.exp-row__category {
  flex-shrink: 0; padding: 4px 9px; border-radius: 999px;
  background: var(--brand-soft); color: var(--brand);
  font-size: 12px; font-weight: 700;
}
.exp-row__comment { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.exp-row__who {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 13px; color: var(--text-muted);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.exp-row__date { font-size: 13px; color: var(--text-muted); }
.exp-row__amount { font-weight: 800; text-align: right; color: var(--error); font-variant-numeric: tabular-nums; }

.btn {
  height: 44px; padding: 0 18px; border-radius: 12px; border: 1px solid transparent;
  font-size: 14px; font-weight: 700; cursor: pointer;
  display: inline-flex; align-items: center; gap: 6px;
  &:disabled { opacity: 0.5; cursor: not-allowed; }
  &:active:not(:disabled) { transform: scale(0.97); }
}
.btn.primary { background: var(--brand); color: var(--on-primary); }
.btn.secondary { background: var(--bg-surface-2); color: var(--text-primary); border-color: var(--border-color); }

/* full-screen add */
.add { position: fixed; inset: 0; z-index: 3000; background: rgba(10,12,16,0.6); backdrop-filter: blur(6px); display: flex; padding: 12px; }
.add__panel {
  width: 100%; max-width: none; margin: auto; height: calc(100vh - 24px);
  background: var(--bg-app); border: 1px solid var(--border-color); border-radius: 16px;
  display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 30px 80px rgba(0,0,0,0.5);
}
.add__head { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid var(--border-color); background: var(--bg-surface); }
.add__title { font-size: 19px; font-weight: 800; color: var(--text-primary); }
.add__body { padding: 16px 18px; display: flex; flex-direction: column; gap: 12px; overflow-y: auto; }
.add__field {
  display: flex; flex-direction: column; gap: 4px;
  padding: 12px 16px; border-radius: 12px; cursor: pointer;
  border: 1px solid var(--border-color); background: var(--bg-surface);
  &.active { border-color: var(--brand); box-shadow: 0 0 0 2px color-mix(in srgb, var(--brand) 22%, transparent); }
}
.add__label { font-size: 12px; color: var(--text-muted); }
.add__value { font-size: 26px; font-weight: 800; color: var(--text-primary); font-variant-numeric: tabular-nums; }
.add__value--text { font-size: 18px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.add__err { font-size: 13px; color: var(--error); }
.add__requirements {
  display: flex; flex-wrap: wrap; gap: 8px;
  span {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 5px 9px; border-radius: 999px;
    background: var(--bg-surface-2); color: var(--text-muted);
    font-size: 12px; font-weight: 700;
  }
  span.done { background: var(--brand-soft); color: var(--brand); }
}

.categories {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 8px;
  padding: 8px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-surface);
}
.category-option {
  min-height: 48px;
  display: inline-flex; align-items: center; gap: 8px;
  padding: 10px 13px; border: 1px solid var(--border-color); border-radius: 10px;
  background: var(--bg-surface-2); color: var(--text-primary);
  font-size: 14px; font-weight: 700; cursor: pointer; text-align: left;
  &.sel { border-color: var(--brand); background: var(--brand-soft); color: var(--brand); }
  &:active { transform: scale(0.98); }
}
.picker-state {
  grid-column: 1 / -1;
  min-height: 48px;
  display: flex; align-items: center; justify-content: center; gap: 8px;
  color: var(--text-muted); font-size: 13px;
}
.picker-state--error { color: var(--error); }
.category-create {
  grid-column: 1 / -1;
  padding-top: 4px;
}
.category-create__toggle {
  width: 100%; min-height: 44px;
  display: inline-flex; align-items: center; justify-content: center; gap: 7px;
  border: 1px dashed var(--border-color); border-radius: 10px;
  background: transparent; color: var(--brand); cursor: pointer;
  font-size: 13px; font-weight: 800;
}
.category-create__form {
  display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 8px;
  align-items: center;
}
.category-create__input {
  min-width: 0; width: 100%; height: 44px; padding: 0 12px;
  border: 1px solid var(--border-color); border-radius: 10px;
  background: var(--bg-surface-2); color: var(--text-primary); font: inherit;
}
.category-create__input:focus { outline: none; border-color: var(--brand); box-shadow: 0 0 0 2px color-mix(in srgb, var(--brand) 22%, transparent); }
.category-create__save { min-width: 92px; }
.category-create__close { width: 44px; height: 44px; }
.category-create__error { grid-column: 1 / -1; color: var(--error); font-size: 12px; line-height: 1.35; }

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
