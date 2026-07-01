<template>
  <q-page class="update-page">
    <header class="update-header">
      <button type="button" class="nav-btn" @click="goBack">
        <q-icon name="arrow_back" size="20px" />
        Ortga
      </button>
      <h1 class="title">Ilova yangilanishi</h1>
      <div class="ver">v{{ state.currentVersion || '—' }}</div>
    </header>

    <!-- ============ LOCKED: manager / tech-support gate ============ -->
    <section v-if="!unlocked" class="card gate">
      <div class="gate-hero">
        <div class="gate-hero__icon"><q-icon name="system_update" size="30px" /></div>
        <div class="gate-hero__t">Yangilashni tasdiqlang</div>
        <div class="gate-hero__s">Menejer paroli yoki texnik kod bilan davom eting</div>
      </div>

      <div class="warn">
        <q-icon name="warning" size="28px" />
        <div>
          <strong>Diqqat!</strong>
          Ilovani yangilashni o‘zboshimchalik bilan bajarmang. Yangilashni faqat
          <b>texnik yordam (RetailFlow)</b> yoki <b>menejer</b> nazorati ostida amalga oshiring.
        </div>
      </div>

      <div v-if="state.status === 'available' || state.status === 'downloaded'" class="avail-note">
        Yangi versiya mavjud: <b>v{{ state.version }}</b>
      </div>

      <!-- method toggle -->
      <div class="seg" role="group">
        <button
          type="button"
          class="seg-btn"
          :class="{ active: method === 'manager' }"
          @click="setMethod('manager')"
        >
          <q-icon name="badge" size="18px" /> Menejer paroli
        </button>
        <button
          type="button"
          class="seg-btn"
          :class="{ active: method === 'tech' }"
          @click="setMethod('tech')"
        >
          <q-icon name="support_agent" size="18px" /> Texnik kod
        </button>
      </div>

      <!-- MANAGER: pick a manager + PIN -->
      <div v-if="method === 'manager'" class="method-body">
        <q-select
          v-model="selectedManagerId"
          :options="managerOptions"
          option-label="label"
          option-value="value"
          emit-value
          map-options
          outlined
          dense
          label="Menejer"
          :loading="managersLoading"
          class="mgr-select"
        />

        <div class="pin-dots">
          <span v-for="i in 4" :key="i" class="dot" :class="{ filled: pin.length >= i }" />
        </div>

        <div class="keypad">
          <button
            v-for="n in [1, 2, 3, 4, 5, 6, 7, 8, 9]"
            :key="n"
            type="button"
            class="key"
            @click="pushDigit(String(n))"
          >
            {{ n }}
          </button>
          <button type="button" class="key muted" @click="pin = ''">C</button>
          <button type="button" class="key" @click="pushDigit('0')">0</button>
          <button type="button" class="key muted" @click="pin = pin.slice(0, -1)">
            <q-icon name="backspace" size="20px" />
          </button>
        </div>
      </div>

      <!-- TECH SUPPORT: master code (on-screen keyboard for touch tills) -->
      <div v-else class="method-body">
        <p class="tech-hint">Texnik yordam bergan maxfiy kodni kiriting.</p>
        <div class="code-field" :class="{ empty: !techCode }">
          <span v-if="techCode" class="code-val">{{ techCode }}</span>
          <span v-else class="code-ph">RF-XXXXXX-XXXX</span>
          <button
            v-if="techCode"
            type="button"
            class="code-clear"
            aria-label="Tozalash"
            @click="techCode = ''"
          >
            <q-icon name="close" size="18px" />
          </button>
        </div>
        <VirtualKeyboard
          position="inline"
          numbers
          @input="onCodeInput"
          @backspace="techCode = techCode.slice(0, -1)"
          @enter="verify"
        />
      </div>

      <p v-if="gateError" class="gate-error">{{ gateError }}</p>

      <button
        type="button"
        class="btn primary block"
        :disabled="!canVerify || verifying"
        @click="verify"
      >
        {{ verifying ? 'Tekshirilmoqda…' : 'Davom etish' }}
      </button>
    </section>

    <!-- ============ UNLOCKED: update controls ============ -->
    <section v-else class="card controls">
      <div class="ver-row">
        <div>
          <span class="lbl">Joriy versiya</span>
          <span class="val">v{{ state.currentVersion || '—' }}</span>
        </div>
        <q-icon name="arrow_forward" size="20px" class="ver-arrow" />
        <div>
          <span class="lbl">Yangi versiya</span>
          <span class="val brand">v{{ state.version ?? '—' }}</span>
        </div>
      </div>

      <p v-if="state.releaseNotes" class="notes">{{ state.releaseNotes }}</p>

      <!-- status-driven action -->
      <template v-if="state.status === 'downloading'">
        <q-linear-progress :value="state.percent / 100" rounded size="14px" color="primary" />
        <p class="status-line">Yuklab olinmoqda… {{ state.percent }}%</p>
      </template>

      <template v-else-if="state.status === 'downloaded'">
        <p class="status-line ok">
          <q-icon name="check_circle" size="20px" /> Yuklab olindi. O‘rnatishga tayyor.
        </p>
        <button type="button" class="btn primary block" @click="install">
          <q-icon name="system_update_alt" size="20px" /> O‘rnatish va qayta ishga tushirish
        </button>
      </template>

      <template v-else-if="state.status === 'error'">
        <p class="status-line err"><q-icon name="error" size="20px" /> {{ state.error }}</p>
        <button type="button" class="btn primary block" @click="download">Qayta urinish</button>
      </template>

      <template v-else-if="state.status === 'available'">
        <button type="button" class="btn primary block" @click="download">
          <q-icon name="download" size="20px" /> Yuklab olish
        </button>
      </template>

      <template v-else>
        <p class="status-line">
          {{ state.status === 'checking' ? 'Tekshirilmoqda…' : 'Ilova so‘nggi versiyada.' }}
        </p>
        <button type="button" class="btn secondary block" :disabled="state.status === 'checking'" @click="check">
          Qayta tekshirish
        </button>
      </template>
    </section>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { api } from 'boot/axios';
import { read } from 'src/utils/storage';
import { useAppUpdate } from 'src/composables/useAppUpdate';
import VirtualKeyboard from 'src/components/virtual-keyboard/VirtualKeyboard.vue';

const router = useRouter();
const { state, check, download, install } = useAppUpdate();

/* ---------------- gate ---------------- */
const unlocked = ref(false);
const method = ref<'manager' | 'tech'>('manager');
const gateError = ref('');
const verifying = ref(false);

function setMethod(m: 'manager' | 'tech'): void {
  method.value = m;
  gateError.value = '';
}

// --- manager path ---
interface StaffEntry {
  id: number;
  name: string;
  is_manager?: boolean;
  role?: string;
}
const managers = ref<StaffEntry[]>([]);
const managersLoading = ref(false);
const selectedManagerId = ref<number | null>(null);
const pin = ref('');

const managerOptions = computed(() =>
  managers.value.map((m) => ({ label: m.name || `#${m.id}`, value: m.id })),
);

function pushDigit(d: string): void {
  if (pin.value.length < 4) pin.value += d;
}

async function loadManagers(): Promise<void> {
  managersLoading.value = true;
  try {
    const res = await api.get<{ data: { cashiers: StaffEntry[] } }>('/cashiers');
    const all = res.data?.data?.cashiers ?? [];
    managers.value = all.filter((u) => u.is_manager === true || u.role === 'MANAGER' || u.role === 'ADMIN');
  } catch {
    managers.value = [];
  } finally {
    managersLoading.value = false;
  }
}

// --- tech-support path ---
// Master code: per-deployment override in the kv store, else the vendor default.
// (The manager-PIN path is the backend-verified gate; this is a phone-support
// convenience — change DEFAULT_TECH_CODE / set pos:techSupportCode per install.)
const DEFAULT_TECH_CODE = 'RF-UPDATE-2026';
const techCode = ref('');

// Codes are uppercase (e.g. RF-UPDATE-2026); normalize as the cashier types on
// the on-screen keyboard so case never blocks a correct code.
function onCodeInput(c: string): void {
  techCode.value += c.toUpperCase();
}

const canVerify = computed(() => {
  if (method.value === 'manager') return selectedManagerId.value != null && pin.value.length === 4;
  return techCode.value.trim().length > 0;
});

interface LoginResp {
  data: { token: string; user: { role: string } };
}

async function verify(): Promise<void> {
  if (!canVerify.value || verifying.value) return;
  gateError.value = '';
  verifying.value = true;
  try {
    if (method.value === 'tech') {
      const expected = (read<string>('pos:techSupportCode') || DEFAULT_TECH_CODE).trim();
      if (techCode.value.trim().toUpperCase() === expected.toUpperCase()) {
        unlocked.value = true;
      } else {
        gateError.value = 'Kod noto‘g‘ri';
      }
      return;
    }

    // Manager path: verify the PIN against the backend WITHOUT touching the
    // cashier's session (we never store the returned token). Must be a manager.
    const res = await api.post<LoginResp>('/auth-login', {
      user_id: selectedManagerId.value,
      password: +pin.value,
    });
    const role = res.data?.data?.user?.role;
    if (role === 'MANAGER' || role === 'ADMIN') {
      unlocked.value = true;
    } else {
      gateError.value = 'Bu foydalanuvchi menejer emas';
    }
  } catch {
    gateError.value = 'PIN noto‘g‘ri yoki server bilan aloqa yo‘q';
    pin.value = '';
  } finally {
    verifying.value = false;
  }
}

function goBack(): void {
  void router.push({ name: 'orders' });
}

onMounted(() => {
  void loadManagers();
  // Refresh availability when the page opens (main also auto-checks).
  if (state.status === 'idle') void check();
});
</script>

<style scoped lang="scss">
.update-page {
  min-height: 100vh;
  background: var(--bg-app);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px;
}

.update-header {
  width: 100%;
  max-width: 560px;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  margin-bottom: 16px;
}
.update-header .title {
  font-size: 18px;
  font-weight: 800;
  color: var(--ink);
  text-align: center;
  margin: 0;
}
.update-header .ver {
  justify-self: end;
  font-size: 13px;
  font-weight: 700;
  color: var(--ink-3);
  font-variant-numeric: tabular-nums;
}

.nav-btn {
  justify-self: start;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 40px;
  padding: 0 14px;
  border-radius: var(--r-md);
  border: 1px solid var(--line-strong);
  background: var(--surface);
  color: var(--ink);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  &:active {
    transform: scale(0.97);
  }
}

.card {
  width: 100%;
  max-width: 560px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-sm);
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.warn {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  background: var(--unpaid-bg);
  color: var(--unpaid);
  border: 1px solid color-mix(in srgb, var(--unpaid) 35%, transparent);
  border-radius: var(--r-md);
  padding: 14px;
  font-size: 14px;
  line-height: 1.5;
}

.avail-note {
  font-size: 15px;
  color: var(--ink);
  background: var(--brand-soft);
  border-radius: var(--r-md);
  padding: 10px 14px;
}

.seg {
  display: flex;
  gap: 8px;
  background: var(--surface-2);
  padding: 4px;
  border-radius: var(--r-md);
}
.seg-btn {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 44px;
  border: none;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--ink-2);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}
.seg-btn.active {
  background: var(--surface);
  color: var(--brand);
  box-shadow: var(--shadow-sm);
}

.method-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.mgr-select {
  width: 100%;
}
.tech-hint {
  margin: 0;
  font-size: 13px;
  color: var(--ink-2);
}

/* gate hero */
.gate-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 6px;
}
.gate-hero__icon {
  width: 60px;
  height: 60px;
  border-radius: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--brand-soft);
  color: var(--brand);
  margin-bottom: 4px;
}
.gate-hero__t {
  font-size: 18px;
  font-weight: 800;
  color: var(--ink);
}
.gate-hero__s {
  font-size: 13px;
  color: var(--ink-2);
  max-width: 360px;
  line-height: 1.45;
}

/* tech-code display (filled by the on-screen keyboard) */
.code-field {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 62px;
  padding: 0 14px;
  border-radius: var(--r-md);
  border: 2px solid var(--line-strong);
  background: var(--surface-2);
  font-family: 'JetBrains Mono', 'Courier New', monospace;
  font-size: 26px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--ink);
}
.code-field.empty {
  border-style: dashed;
}
.code-val {
  word-break: break-all;
}
.code-ph {
  color: var(--ink-3);
  font-weight: 500;
  letter-spacing: 0.12em;
}
.code-clear {
  margin-left: auto;
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  border-radius: 9px;
  border: none;
  background: var(--surface-3);
  color: var(--ink-2);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  &:active {
    transform: scale(0.94);
  }
}

.pin-dots {
  display: flex;
  justify-content: center;
  gap: 14px;
}
.dot {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid var(--line-strong);
  background: transparent;
}
.dot.filled {
  background: var(--brand);
  border-color: var(--brand);
}

.keypad {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.key {
  height: 56px;
  border-radius: var(--r-md);
  border: 1px solid var(--line);
  background: var(--surface-2);
  color: var(--ink);
  font-size: 22px;
  font-weight: 700;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  &:active {
    transform: scale(0.96);
    background: var(--surface-3);
  }
}
.key.muted {
  color: var(--ink-2);
  font-size: 16px;
}

.gate-error {
  margin: 0;
  color: var(--cancel);
  font-size: 14px;
  font-weight: 600;
  text-align: center;
}

.btn {
  height: 50px;
  border-radius: var(--r-md);
  border: none;
  font-size: 16px;
  font-weight: 800;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  &:active:not(:disabled) {
    transform: scale(0.98);
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}
.btn.block {
  width: 100%;
}
.btn.primary {
  background: var(--brand);
  color: #fff;
}
.btn.secondary {
  background: var(--surface-2);
  color: var(--ink);
  border: 1px solid var(--line-strong);
}

/* ----- unlocked ----- */
.ver-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.ver-row .lbl {
  display: block;
  font-size: 12px;
  color: var(--ink-3);
}
.ver-row .val {
  font-size: 22px;
  font-weight: 800;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}
.ver-row .val.brand {
  color: var(--brand);
}
.ver-arrow {
  color: var(--ink-3);
}
.notes {
  margin: 0;
  font-size: 13px;
  color: var(--ink-2);
  white-space: pre-wrap;
  background: var(--surface-2);
  border-radius: var(--r-md);
  padding: 12px;
  max-height: 180px;
  overflow-y: auto;
}
.status-line {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--ink);
  display: flex;
  align-items: center;
  gap: 8px;
}
.status-line.ok {
  color: var(--ready);
}
.status-line.err {
  color: var(--cancel);
}
</style>
