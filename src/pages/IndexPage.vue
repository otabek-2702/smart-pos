<script setup lang="ts">
import { onMounted, ref, computed, nextTick, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api } from 'boot/axios';
import NumericKeyboard from 'src/components/numeric-keyboard/NumericKeyboard.vue';
import NetworkDiagnostics from 'src/components/NetworkDiagnostics.vue';
import { virtualKeyboardEnabled, setVirtualKeyboardEnabled } from 'boot/virtual-keyboard';
import { read, write, remove } from 'src/utils/storage';
import { useNetworkStatus } from 'src/composables/useNetworkStatus';
import { usePinHandoffStore } from 'src/stores/pin-handoff';

// Reactive network state — populated by polling the configured baseURL.
// Used on the manual login page to show the user whether the server is
// even reachable before they bother typing credentials.
const network = useNetworkStatus();

// Currently-configured server IP — shown in the diagnostics panel so the
// user can verify they're pointing at the right main computer.
const configuredServerIp = computed<string>(() => {
  const stored = read<string>(BASE_URL_KEY);
  if (stored) return stored;
  // Fallback: strip "http://" and ":8000" off the axios baseURL
  const base = api.defaults.baseURL ?? '';
  return base.replace(/^https?:\/\//, '').replace(/:\d+$/, '');
});

// Support contact phone — shown verbatim in the diagnostics panel so a
// kitchen worker can dial from their personal phone. Configurable via
// kv-store so each integrator/installation can set their own. Defaults
// to a clearly fake placeholder so it's obvious if no one set it.
const SUPPORT_PHONE_KEY = 'pos:supportPhone';
const supportPhone = computed<string>(
  () => read<string>(SUPPORT_PHONE_KEY) ?? '+998 90 000 00 00',
);

// Open the OS WiFi flyout (right-side Windows panel). Falls back gracefully
// when not running in Electron (browser dev).
async function openWifiPanel(): Promise<void> {
  try {
    await window.electron?.system.openWifi();
  } catch (e) {
    console.warn('openWifi failed:', e);
  }
}

// IP changes from the diagnostic now happen INLINE inside the diag itself
// (no second modal opens / closes). This handler persists the new IP and
// triggers the same reload UX every other "save-and-restart" path uses
// (isReloading=true → "Yangilanmoqda..." overlay covers everything → reload).
async function onSaveIpFromDiag(ip: string): Promise<void> {
  if (isReloading.value) return;
  // Show the reload overlay BEFORE awaiting the write so the user sees a
  // single, calm transition: diag → reload spinner → fresh boot. No
  // settings modal pop-in/pop-out flicker.
  isReloading.value = true;

  await write(BASE_URL_KEY, ip);
  api.defaults.baseURL = `http://${ip}:8000`;

  window.location.reload();
}

const diagDismissed = ref(false);

// Silent localhost recovery — the kitchen "main computer" running Django
// is sometimes the SAME physical box as the POS terminal. Before showing
// the diagnostic to the user, try 127.0.0.1 silently; if it answers, save
// it as the IP and reload. The user only ever sees the reload overlay,
// never the diagnostic, in this case.
//
// One attempt per session — if 127.0.0.1 also fails, we don't keep
// thrashing on it. autoRecoveryAttempted is reset on a successful reload
// (it's module state that resets with the page).
const autoRecoveryAttempted = ref(false);
const autoRecovering = ref(false);

const showDiagnostics = computed<boolean>(() => {
  // Hide diag while we're silently trying to recover — avoids a brief
  // flash of the panel before the reload overlay takes over.
  if (autoRecovering.value) return false;
  const r = network.failureReason.value;
  // Only CONNECTIVITY failures merit the full-screen recovery panel.
  // A 5xx ('server-error') means the server is reachable but threw an
  // internal bug — that's a per-request issue, not something the cashier
  // can fix by editing the IP. Let inline toasts handle 5xx.
  if (r !== 'no-network' && r !== 'server-unreachable') return false;
  return !diagDismissed.value;
});

// Auto-reset dismiss when failure clears, so a future disconnect re-shows
// the panel without the user having to do anything.
watch(
  () => network.failureReason.value,
  async (r) => {
    if (r === 'ok') {
      diagDismissed.value = false;
      return;
    }
    // Only trigger silent localhost recovery for actual connectivity
    // failures. 5xx and unknown shouldn't kick off a reload dance.
    if (r !== 'no-network' && r !== 'server-unreachable') return;
    // Failure detected — try silent localhost recovery exactly once.
    if (autoRecoveryAttempted.value) return;
    if (configuredServerIp.value === '127.0.0.1') return; // already on it
    if (!window.electron?.system) return; // browser dev — skip
    autoRecoveryAttempted.value = true;
    autoRecovering.value = true;
    try {
      const probe = await window.electron.system.probeTcp('127.0.0.1', 8000, 1500);
      if (probe.ok) {
        // Reuse the same save-and-reload path as the manual flow so the
        // reload overlay appears immediately and the diag never renders.
        await onSaveIpFromDiag('127.0.0.1');
        return; // window is reloading
      }
    } catch (e) {
      console.warn('Silent localhost recovery failed:', e);
    }
    // No luck — let the diag appear.
    autoRecovering.value = false;
  },
);

/* ============
 * Constants
 * ============ */

// Built-in placeholder; the real logo (if set in Settings → Display) overrides
// it on mount. Replace the asset later when a default logo is provided.
const placeholderLogo = new URL('../assets/logo.png', import.meta.url).href;
const logoUrl = ref<string>(placeholderLogo);

async function loadLogo(): Promise<void> {
  try {
    const display = (await window.electron?.settings.getDisplay()) as
      | { logoBase64?: string | null }
      | undefined;
    logoUrl.value = display?.logoBase64 || placeholderLogo;
  } catch {
    logoUrl.value = placeholderLogo;
  }
}

const BASE_URL_KEY = 'pos:IpAdress';
// Local cache of the picker grid. Filled from the public staff endpoint;
// kept so the grid renders instantly on next boot (and survives a brief
// backend blip) before the live fetch returns.
const CACHED_USERS_KEY = 'pos:cachedUsers';

// Public pre-login picker endpoint. Returns POS staff = cashiers + MANAGERs
// (managers are the on-POS settings tier; admins are NOT here — they use the
// backend's own /admin panel). Response still keyed `cashiers`.
const STAFF_PICKER_ENDPOINT = '/cashiers';

/* ============
 * Types
 * ============ */

type UserRole = 'ADMIN' | 'CASHIER' | 'MANAGER';

// Public GET /cashiers payload — only the picker-safe fields (never a hash).
interface ApiCashier {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  role: UserRole;
  is_manager: boolean;
  permissions: string[];
  on_shift: boolean;
}

interface CashiersApiResponse {
  success: boolean;
  data: {
    cashiers: ApiCashier[];
    total: number;
  };
}

interface User {
  id: number;
  firstName: string;
  lastName: string;
  role: UserRole;
  email: string;
  onShift: boolean;
}

const vk = computed({
  get: () => virtualKeyboardEnabled.value,
  set: (v: boolean) => setVirtualKeyboardEnabled(v),
});

/* ============
 * State
 * ============ */

const router = useRouter();
const pinHandoff = usePinHandoffStore();

const users = ref<User[]>([]);
const isLoading = ref(false);

/* Settings */
const showSettings = ref(false);
const serverIpAdress = ref('');

// Auto-open mirror of display settings clientDisplayEnabled. Hydrated from
// the main process when the settings dialog opens; saved back via IPC the
// moment the toggle flips so the main process closes/opens the window
// immediately (no need to press a separate "Save" button — see
// applyClientDisplayChange below).
const clientDisplayEnabled = ref(true);
const clientDisplayBusy = ref(false);

/* Reloading state — blocks every button while window.location.reload() runs
   so users can't fire it twice (also closes settings dialog visually). */
const isReloading = ref(false);

/* ============
 * Methods
 * ============ */

function loadCachedUsers(): User[] {
  const cached = read<User[]>(CACHED_USERS_KEY);
  return Array.isArray(cached) ? cached : [];
}

async function fetchUsers(): Promise<void> {
  isLoading.value = true;

  // Show whatever we cached locally immediately so the grid isn't empty
  // while we wait for the network. If the API works, it overwrites this.
  users.value = loadCachedUsers();

  try {
    // Public pre-login picker endpoint (no auth): lists active cashiers for
    // the monoblock login screen. The operator taps a face → PinPage. Admins
    // aren't in this list — they use the "Administrator sifatida" link.
    const response = await api.get<CashiersApiResponse>(STAFF_PICKER_ENDPOINT);

    users.value = response.data.data.cashiers.map((u) => ({
      id: u.id,
      firstName: u.first_name,
      lastName: u.last_name,
      role: u.role,
      email: u.email,
      onShift: u.on_shift,
    }));

    void write(CACHED_USERS_KEY, users.value);
  } catch (e) {
    // Backend unreachable / not yet activated → fall back to the cached grid.
    // Empty cache → the "first setup" empty state is shown by the template.
    console.warn('[/cashiers] not available, using cached users:', e);
  } finally {
    isLoading.value = false;
  }
}

// Full page reload (not just refetch). Re-runs the axios boot so a
// changed server IP is re-resolved into baseURL, and re-runs the kv-store
// migration check. A simple refetch wouldn't catch IP/store changes.
function reloadUsers(): void {
  if (isReloading.value) return;
  isReloading.value = true;
  window.location.reload();
}

function goToPin(user: User): void {
  pinHandoff.set(user.id, user.email ?? '', `${user.firstName} ${user.lastName}`);
  void router.push({ name: 'pin' });
}

const ipInputRef = ref<HTMLInputElement | null>(null);

// Autofocus the IP field when the home-page settings modal opens (admin
// taps the gear icon). The diag's IP-edit flow is independent of this
// modal — they no longer interact, so no re-arm logic is needed here.
watch(showSettings, async (open) => {
  if (!open) return;
  await nextTick();
  setTimeout(() => ipInputRef.value?.focus(), 50);
});

/* SETTINGS */

interface DisplaySettingsLite {
  companyName: string;
  titleFontSize: 'small' | 'medium' | 'large' | 'xlarge';
  brandColor: string;
  readyColor: string;
  headerTextColor: string;
  clientDisplayEnabled: boolean;
}

async function openSettings(): Promise<void> {
  serverIpAdress.value = read<string>(BASE_URL_KEY) ?? api.defaults.baseURL ?? '';

  // Hydrate the client-display toggle from the main-process settings file.
  // Default to true if Electron isn't available (browser dev) or IPC fails.
  try {
    const display = (await window.electron?.settings.getDisplay()) as
      | DisplaySettingsLite
      | undefined;
    clientDisplayEnabled.value = display?.clientDisplayEnabled ?? true;
  } catch {
    clientDisplayEnabled.value = true;
  }

  showSettings.value = true;
}

// Toggle handler — fires immediately when the user flips the switch. We
// fetch the current display settings, swap the one field, save back. Main
// process will close the open client window or open a new one as needed.
async function applyClientDisplayChange(value: boolean): Promise<void> {
  if (clientDisplayBusy.value) return;
  clientDisplayBusy.value = true;
  try {
    const current = (await window.electron?.settings.getDisplay()) as
      | DisplaySettingsLite
      | undefined;

    if (!current) {
      // No Electron — toggle is local-only in browser dev.
      clientDisplayEnabled.value = value;
      return;
    }

    await window.electron.settings.saveDisplay({
      ...current,
      clientDisplayEnabled: value,
    });
    clientDisplayEnabled.value = value;
  } catch (e) {
    console.error('Failed to update clientDisplayEnabled:', e);
    // Roll back the optimistic value
    clientDisplayEnabled.value = !value;
  } finally {
    clientDisplayBusy.value = false;
  }
}

function closeSettings(): void {
  showSettings.value = false;
}

/* VIRTUAL KEYBOARD HANDLERS */

function onKeyboardInput(value: string): void {
  serverIpAdress.value += value;
}

function onKeyboardBackspace(): void {
  serverIpAdress.value = serverIpAdress.value.slice(0, -1);
}

function onKeyboardClear(): void {
  serverIpAdress.value = '';
}

async function saveSettings(): Promise<void> {
  if (!serverIpAdress.value.trim() || isReloading.value) return;

  // Lock UI BEFORE the async write so the user can't double-press while we
  // wait on the IPC. Await the write so the IP is on disk before reload —
  // otherwise the reload could race the persistence and read the old value.
  isReloading.value = true;
  showSettings.value = false;

  await write(BASE_URL_KEY, serverIpAdress.value);
  // Match the shape used by axios.ts boot so the in-memory baseURL is
  // consistent with what the next boot will resolve.
  api.defaults.baseURL = `http://${serverIpAdress.value}:8000`;

  window.location.reload();
}

/* ============
 * Lifecycle
 * ============ */

onMounted(() => {
  // The picker IS the logged-out state. Clear any leftover session so a stale
  // token from a previous run can't keep other windows (e.g. the customer
  // display) showing live orders before anyone has actually logged in. The
  // kv-store change broadcasts to all windows → the client display drops to
  // its standby screen. A real login then re-populates the token live.
  void remove('auth_token');
  void remove('auth_user');
  void fetchUsers();
  void loadLogo();
});
</script>
<template>
  <q-page class="page-users flex flex-center">
    <!-- TOP LEFT ACTIONS -->
    <div class="top-actions">
      <button
        class="icon-btn"
        :class="{ 'is-loading': isReloading }"
        :disabled="isReloading"
        @click="reloadUsers"
      >
        <q-spinner v-if="isReloading" size="22px" />
        <q-icon v-else name="refresh" size="22px" />
      </button>

      <button class="icon-btn" :disabled="isReloading" @click="openSettings">
        <q-icon name="settings" size="22px" />
      </button>
    </div>

    <div class="users-wrapper">
      <div class="logo">
        <img :src="logoUrl" alt="Restaurant logo" />
      </div>

      <div class="title">Foydalanuvchini tanlang</div>

      <div v-if="isLoading && users.length === 0" class="loading">Yuklanmoqda…</div>

      <template v-else>
        <!-- USER PICKER — primary login UX. Cashiers tap their own face,
             enter PIN on the next screen. No email entry. -->
        <div v-if="users.length > 0" class="users-grid">
          <button
            v-for="user in users"
            :key="user.id"
            type="button"
            class="user-card"
            @click="goToPin(user)"
          >
            <div class="avatar">
              <q-icon name="person" size="28px" />
              <span v-if="user.onShift" class="avatar__shift" title="Smenada"></span>
            </div>

            <div class="name">{{ user.firstName }} {{ user.lastName }}</div>
            <div class="role">{{ user.onShift ? 'Smenada' : user.role }}</div>
          </button>
        </div>

        <!-- EMPTY STATE: backend is reachable AND licensed (otherwise the
             license gate / network diagnostics overlay would be on top),
             there are just no cashier accounts. They're created from the
             backend's own admin app — there is no on-POS setup flow. -->
        <div v-else class="empty-users">
          <q-icon name="group_off" size="56px" class="empty-icon" />
          <div class="empty-title">Foydalanuvchilar topilmadi</div>
          <div class="empty-hint">
            Kassir hisoblari hali yaratilmagan. Hisoblarni serverdagi
            Alpha POS boshqaruv ilovasidan qo'shing.
          </div>
        </div>
      </template>
    </div>

    <!-- SETTINGS DIALOG -->
    <div v-if="showSettings" class="modal-backdrop" @click.self="closeSettings">
      <div class="modal modal--wide">
        <div class="modal-title">Sozlamalar</div>

        <div class="settings-grid">
          <!-- LEFT: server IP -->
          <section class="settings-col settings-col--ip">
            <div class="col-header">
              <q-icon name="dns" size="20px" />
              <span>Server IP manzil</span>
            </div>

            <input
              ref="ipInputRef"
              class="input-display"
              v-model="serverIpAdress"
              placeholder="0.0.0.0"
            />

            <NumericKeyboard
              dot
              class="keyboard-numeric"
              @input="onKeyboardInput"
              @backspace="onKeyboardBackspace"
              @clear="onKeyboardClear"
            />
          </section>

          <!-- RIGHT: device toggles -->
          <section class="settings-col settings-col--toggles">
            <div class="col-header">
              <q-icon name="tune" size="20px" />
              <span>Qurilma sozlamalari</span>
            </div>

            <!-- Client display auto-open -->
            <div class="toggle-card">
              <div class="toggle-card__head">
                <q-icon name="desktop_windows" size="22px" class="toggle-card__icon" />
                <div class="toggle-card__text">
                  <div class="toggle-card__title">Mijozlar displeyi</div>
                  <div class="toggle-card__hint">
                    {{
                      clientDisplayEnabled
                        ? "Ikkinchi monitor ulansa avtomatik ochiladi"
                        : "Ochilmaydi va ochiq oyna yopiladi"
                    }}
                  </div>
                </div>
                <q-toggle
                  :model-value="clientDisplayEnabled"
                  color="green"
                  size="lg"
                  :disable="clientDisplayBusy"
                  @update:model-value="applyClientDisplayChange"
                />
              </div>
            </div>

            <!-- Virtual keyboard -->
            <div class="toggle-card">
              <div class="toggle-card__head">
                <q-icon name="keyboard" size="22px" class="toggle-card__icon" />
                <div class="toggle-card__text">
                  <div class="toggle-card__title">Virtual klaviatura</div>
                  <div class="toggle-card__hint">
                    {{
                      vk
                        ? "Ekranda klaviatura ko'rsatiladi"
                        : "Faqat fizik klaviatura ishlatiladi"
                    }}
                  </div>
                </div>
                <q-toggle v-model="vk" color="green" size="lg" />
              </div>
            </div>
          </section>
        </div>

        <div class="actions">
          <button class="btn secondary" :disabled="isReloading" @click="closeSettings">
            Bekor qilish
          </button>
          <button class="btn primary" :disabled="isReloading" @click="saveSettings">
            <q-spinner v-if="isReloading" size="18px" />
            <span v-else>Saqlash</span>
          </button>
        </div>
      </div>
    </div>

    <!-- NETWORK DIAGNOSTICS — fullscreen blurred takeover.
         Auto-shown the moment a worker logs into the morning shift and
         the system detects the main computer / LAN / IP is wrong. Stays
         in front of EVERYTHING (user picker, manual login, settings) so
         it's the first thing they see. -->
    <NetworkDiagnostics
      v-if="showDiagnostics"
      :network="network"
      :configured-server-ip="configuredServerIp"
      :support-phone="supportPhone"
      :allow-dismiss="users.length > 0"
      @close="diagDismissed = true"
      @save-ip="onSaveIpFromDiag"
      @open-wifi="openWifiPanel"
    />

    <!-- RELOAD OVERLAY -->
    <div v-if="isReloading" class="reload-overlay">
      <q-spinner size="48px" color="orange" />
      <div class="reload-text">Yangilanmoqda…</div>
    </div>
  </q-page>
</template>

<style scoped lang="scss">
.page-users {
  background: var(--bg-app);
  position: relative;
  --accent-primary: #ff7a00;
}

/* TOP LEFT */
.top-actions {
  position: absolute;
  top: 16px;
  left: 16px;
  display: flex;
  gap: 8px;
}

.icon-btn {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  color: var(--text-primary);
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  &:active {
    transform: scale(0.95);
    box-shadow: none;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.55;

    &:active {
      transform: none;
      box-shadow: var(--shadow-sm);
    }
  }
}

/* USERS */
.users-wrapper {
  width: 100%;
  max-width: 1100px;
  margin: 0 auto;
  padding: 32px 24px;
  text-align: center;
}

.logo img {
  height: 164px;
}

.title {
  margin: 24px 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
}

.loading {
  color: var(--text-muted);
}

.users-grid {
  display: grid;
  /* Auto-fill instead of a hard 4 columns: adapts to tablet/portrait and to
     many cashiers without cramming or stretching huge cards on a wide screen. */
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 16px;
}

.user-card {
  background: var(--bg-surface);
  border-radius: 16px;
  padding: 20px;
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-sm);
  cursor: pointer;

  &:active {
    transform: scale(0.97);
    box-shadow: none;
  }
}

.avatar {
  position: relative;
  width: 56px;
  height: 56px;
  margin: 0 auto 12px;
  border-radius: 50%;
  background: var(--bg-surface-2);
  color: var(--accent-primary);
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Green dot — cashier already has an ACTIVE shift (from /cashiers on_shift) */
.avatar__shift {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #22c55e;
  border: 2px solid var(--bg-surface);
}

.name {
  font-size: 16px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.role {
  font-size: 12px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Empty state — first run before anyone has signed in on this terminal */
.empty-users {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 40px 20px;
  text-align: center;
}

.empty-icon {
  color: var(--text-muted);
}

.empty-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
}

.empty-hint {
  font-size: 14px;
  color: var(--text-muted);
  max-width: 420px;
  line-height: 1.55;
}


/* DIALOG */
.modal {
  margin-inline: 5px;
}
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.modal {
  background: var(--bg-surface);
  border-radius: 16px;
  padding: 16px;
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-md);
}

.modal--wide {
  width: min(720px, calc(100vw - 24px));
  padding: 20px;
}

.modal-title {
  color: var(--text-primary);
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 16px;
}

/* Two-column layout: IP entry on the left, device toggles on the right */
.settings-grid {
  display: grid;
  grid-template-columns: minmax(260px, 320px) 1fr;
  gap: 16px;
  margin-bottom: 16px;
}

.settings-col {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  background: var(--bg-surface-2);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  min-width: 0;
}

.col-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.col-header .q-icon {
  color: var(--accent-primary);
}

.settings-col--ip .keyboard-numeric {
  margin-top: auto;
}

/* Toggle cards (right column) */
.toggle-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 12px;
}

.toggle-card__head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.toggle-card__icon {
  color: var(--accent-primary);
  flex-shrink: 0;
}

.toggle-card__text {
  flex: 1;
  min-width: 0;
}

.toggle-card__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 2px;
}

.toggle-card__hint {
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.4;
}

/* Stack on narrow screens (POS terminals are usually wide, but small touch
   devices or rotated displays should still work). */
@media (max-width: 600px) {
  .settings-grid {
    grid-template-columns: 1fr;
  }
}

.field-label {
  color: var(--text-muted);
  font-size: 14px;
}

.input-display {
  width: 100%;
  height: 44px;
  margin-top: 6px;
  padding: 0 12px;
  border-radius: 12px;
  background: var(--bg-surface-2);
  color: var(--text-primary);
  display: flex;
  align-items: center;
  margin-bottom: 12px;
  border: 1px solid var(--border-color);
}

.actions {
  display: flex;
  gap: 8px;
}

.btn {
  flex: 1;
  height: 44px;
  border-radius: 12px;
  border: none;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.55;

    &:active {
      transform: none;
      box-shadow: var(--shadow-sm);
    }
  }
}

.btn.primary {
  background: var(--accent-primary);
  color: #ffffff;
  box-shadow: var(--shadow-sm);

  &:active {
    transform: scale(0.97);
    box-shadow: none;
  }
}

.btn.secondary {
  background: var(--btn-secondary-bg);
  color: var(--btn-secondary-text);
  box-shadow: var(--shadow-sm);

  &:active {
    transform: scale(0.97);
    box-shadow: none;
  }
}

/* RELOAD OVERLAY */
.reload-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 17, 21, 0.75);
  backdrop-filter: blur(2px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  z-index: 3000;
  cursor: wait;
}

.reload-text {
  color: var(--text-primary);
  font-size: 16px;
  font-weight: 500;
}
</style>
