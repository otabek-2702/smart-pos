<template>
  <!-- Full-screen security/admin panel. Replaces the earlier centered modal
       for two reasons: (1) the IP-change flow needs the touch numpad and
       auto-discovery list, both of which deserve real screen real estate;
       (2) on a 15" POS or tablet a centered card with controls inside felt
       cramped and triggered modal-on-modal pop-in/out flicker.

       Layout: top header (status title + refresh), two-column body
       (left = IP recovery, right = status + support), bottom action bar. -->
  <Transition name="diag-fade">
    <div v-if="visible" class="diag" role="dialog" aria-modal="true">
      <!-- Header -->
      <header class="diag__head">
        <q-icon
          name="error"
          size="28px"
          class="diag__head-icon"
          :class="{ 'is-warn': network.failureReason.value === 'no-network' }"
        />
        <div class="diag__head-text">
          <div class="diag__title">{{ network.failureLabel.value }}</div>
          <div class="diag__sub">
            Birinchi kirish uchun aloqani tiklang. IP manzilni o'zgartiring
            yoki avtomatik qidiring.
          </div>
        </div>
        <button
          type="button"
          class="diag__refresh"
          title="Qayta tekshirish"
          @click="network.refresh()"
        >
          <q-icon name="refresh" size="22px" />
        </button>
      </header>

      <!-- Body: two columns on wide screens, stacked on narrow -->
      <main class="diag__body">

        <!-- LEFT: IP recovery -->
        <section class="col col--left">
          <div class="col__section">
            <div class="col__section-head">
              <q-icon name="dns" size="20px" />
              <span>Server IP manzil</span>
            </div>

            <input
              ref="ipInputRef"
              v-model="newIp"
              type="text"
              inputmode="numeric"
              class="ip-input"
              placeholder="192.168.1.10"
              :disabled="testing || saving"
              @keydown.enter="testIp"
            />

            <!-- Numeric keyboard — always visible because the typical user
                 is on a touch monoblock or tablet without a physical
                 keyboard. PC users with a real keyboard ignore it. -->
            <NumericKeyboard
              dot
              class="ip-numpad"
              @input="onNumpadInput"
              @backspace="onNumpadBackspace"
              @clear="onNumpadClear"
            />

            <!-- Inline test result — never an alert/popup -->
            <div
              v-if="testResult"
              class="ip-result"
              :class="testResult.ok ? 'ok' : 'fail'"
            >
              <q-icon
                :name="testResult.ok ? 'check_circle' : 'cancel'"
                size="18px"
              />
              <span>{{ testResult.message }}</span>
              <span v-if="testResult.ms != null" class="ip-result__ms">
                {{ testResult.ms }} ms
              </span>
            </div>

            <div class="ip-actions">
              <button
                type="button"
                class="btn btn--ghost"
                :disabled="testing || saving"
                @click="resetEdit"
              >
                Tozalash
              </button>
              <button
                type="button"
                class="btn btn--secondary"
                :disabled="!newIp.trim() || testing || saving"
                @click="testIp"
              >
                <q-spinner v-if="testing" size="16px" />
                <span v-else>Tekshirish</span>
              </button>
              <button
                type="button"
                class="btn btn--primary"
                :disabled="!newIp.trim() || saving"
                @click="saveIp"
              >
                <q-spinner v-if="saving" size="16px" color="white" />
                <span v-else>Saqlash</span>
              </button>
            </div>
          </div>

          <!-- Auto-discovery -->
          <div class="col__section">
            <div class="col__section-head">
              <q-icon name="travel_explore" size="20px" />
              <span>Avtomatik qidirish</span>
            </div>

            <div class="discover-hint">
              Bu kompyuter LAN tarmog'ida {{ scanSubnetLabel || '...' }}
              manzillarini tekshiradi va port 8000 ochiq bo'lgan serverlarni
              ko'rsatadi.
            </div>

            <div class="discover-actions">
              <button
                type="button"
                class="btn btn--secondary"
                :disabled="scanning || !canScan"
                @click="startScan"
              >
                <q-spinner v-if="scanning" size="16px" />
                <span v-else>{{ scanning ? '...' : 'Qidirishni boshlash' }}</span>
              </button>
              <button
                v-if="scanning"
                type="button"
                class="btn btn--ghost"
                @click="cancelScan"
              >
                To'xtatish
              </button>
            </div>

            <div v-if="scanError" class="discover-error">
              <q-icon name="warning" size="16px" />
              {{ scanError }}
            </div>

            <!-- Found servers list — tap to fill the input -->
            <ul v-if="foundServers.length > 0" class="found-list">
              <li
                v-for="srv in foundServers"
                :key="srv.ip"
                class="found-row"
                @click="useFound(srv.ip)"
              >
                <q-icon name="check_circle" size="18px" class="found-row__ok" />
                <code class="found-row__ip">{{ srv.ip }}</code>
                <span class="found-row__ms">{{ srv.ms }} ms</span>
                <q-icon name="chevron_right" size="18px" class="found-row__arrow" />
              </li>
            </ul>

            <div v-if="scanFinished && foundServers.length === 0" class="discover-empty">
              Hech narsa topilmadi. Asosiy kompyuterning yoqilganligini va
              firewall sozlamalarini tekshiring.
            </div>
          </div>
        </section>

        <!-- RIGHT: status + support -->
        <section class="col col--right">

          <!-- Status rows -->
          <div class="col__section">
            <div class="col__section-head">
              <q-icon name="monitor_heart" size="20px" />
              <span>Aloqa holati</span>
            </div>

            <ul class="status-list">
              <!-- LAN
                lanUp is `serverReachable || online` — i.e. if the local
                backend answered, LAN is definitively up regardless of
                what `navigator.onLine` thinks (it's unreliable when LAN
                exists but no internet route exists, which is normal in
                this app's deployment target). -->
              <li class="status-row">
                <q-icon
                  :name="lanUp ? 'lan' : 'signal_disconnected'"
                  size="20px"
                  class="status-row__icon"
                  :class="lanUp ? 'ok' : 'fail'"
                />
                <div class="status-row__body">
                  <div class="status-row__label">Tarmoq aloqasi (LAN/Wi-Fi)</div>
                  <div class="status-row__value">
                    <span v-if="lanUp">Ulangan</span>
                    <span v-else>Aloqa yo'q — kabelni yoki Wi-Fi ni tekshiring</span>
                  </div>
                </div>
                <button type="button" class="row-action" @click="emit('open-wifi')">
                  Wi-Fi
                </button>
              </li>

              <!-- Server -->
              <li class="status-row">
                <q-icon
                  :name="network.serverReachable.value ? 'cloud_done' : 'cloud_off'"
                  size="20px"
                  class="status-row__icon"
                  :class="network.serverReachable.value ? 'ok' : 'fail'"
                />
                <div class="status-row__body">
                  <div class="status-row__label">
                    Asosiy kompyuter
                    <code class="status-row__ip">{{ configuredServerIp || '—' }}</code>
                  </div>
                  <div class="status-row__value">
                    <span v-if="network.serverReachable.value">
                      Javob bermoqda ({{ network.lastStatus.value }})
                    </span>
                    <span v-else>
                      Javob bermayapti — kompyuter o'chirilgan, IP noto'g'ri
                      yoki LAN kabel uzilgan bo'lishi mumkin
                    </span>
                  </div>
                </div>
              </li>
            </ul>
          </div>

          <!-- Support -->
          <div class="col__section">
            <div class="col__section-head">
              <q-icon name="support_agent" size="20px" />
              <span>Yordam</span>
            </div>

            <div class="support-text">
              Hech narsa yordam bermasa, qo'llab-quvvatlash xizmatiga
              murojaat qiling:
            </div>

            <div class="support-phone" @click="copy(supportPhone, COPY_PHONE_OK)">
              <q-icon name="call" size="20px" />
              <span class="support-phone__num">{{ supportPhone }}</span>
              <q-icon name="content_copy" size="14px" class="support-phone__copy" />
            </div>

            <div class="support-tellthem">
              <div class="support-tellthem__label">Yordamchiga aytish:</div>
              <button
                type="button"
                class="support-tellthem__bundle"
                @click="copy(diagnosticBundle, COPY_BUNDLE_OK)"
              >
                <code>{{ diagnosticBundle }}</code>
                <q-icon name="content_copy" size="14px" />
              </button>
            </div>
          </div>
        </section>
      </main>

      <!-- Footer -->
      <footer class="diag__foot">
        <button
          type="button"
          class="btn btn--ghost"
          :disabled="!allowDismiss"
          :title="allowDismiss ? '' : 'Avval aloqani tiklang'"
          @click="emit('close')"
        >
          Yashirish
        </button>
      </footer>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import axios from 'axios';
import { toast } from 'vue3-toastify';
import NumericKeyboard from 'src/components/numeric-keyboard/NumericKeyboard.vue';
import type { NetworkStatus } from 'src/composables/useNetworkStatus';

const props = defineProps<{
  network: NetworkStatus;
  /** When false, hides the dismiss button. Lets the parent enforce that
      first-time users can't bypass the diagnostics. */
  allowDismiss?: boolean;
  /** What to show in the IP row. Usually the IP from kv-store. */
  configuredServerIp: string;
  /** Phone number for tech support. Shown verbatim, copyable. */
  supportPhone: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'open-wifi'): void;
  /** Fired when the user taps "Saqlash". Parent persists the new IP and
      reloads. We give the parent control of persistence so it can also
      handle the reload-overlay UX consistently. */
  (e: 'save-ip', ip: string): void;
}>();

// The full-screen recovery panel is for CONNECTIVITY failures only:
// network down or server unreachable. A 5xx means the server is alive
// and the cashier's request just hit an internal bug — interrupting them
// with a "fix your IP" overlay is wrong. Let the page-level error toast
// handle 5xx instead.
const visible = computed<boolean>(() => {
  const r = props.network.failureReason.value;
  return r === 'no-network' || r === 'server-unreachable';
});

// LAN is up if EITHER the server actually answered (definitive proof) OR
// navigator says we have a network. Server-reachable takes precedence
// because navigator.onLine returns false on LAN-only-no-internet PCs.
const lanUp = computed<boolean>(
  () => props.network.serverReachable.value || props.network.online.value,
);

/* ============ IP EDITOR ============ */

const newIp = ref('');
const testing = ref(false);
const saving = ref(false);
const ipInputRef = ref<HTMLInputElement | null>(null);

interface TestResult {
  ok: boolean;
  message: string;
  ms: number | null;
}
const testResult = ref<TestResult | null>(null);

function resetEdit(): void {
  newIp.value = '';
  testResult.value = null;
  ipInputRef.value?.focus();
}

// Initialize from current configured IP when the diag becomes visible.
// Don't re-overwrite while the user is mid-edit.
watch(
  visible,
  (v) => {
    if (v && newIp.value === '') {
      newIp.value = props.configuredServerIp || '';
    }
  },
  { immediate: true },
);

onMounted(() => {
  if (newIp.value === '') newIp.value = props.configuredServerIp || '';
  void nextTick().then(() => setTimeout(() => ipInputRef.value?.focus(), 100));
});

function onNumpadInput(v: string): void {
  // Drop test result on edit — stale info is worse than no info
  testResult.value = null;
  newIp.value += v;
}
function onNumpadBackspace(): void {
  testResult.value = null;
  newIp.value = newIp.value.slice(0, -1);
}
function onNumpadClear(): void {
  testResult.value = null;
  newIp.value = '';
}

async function testIp(): Promise<void> {
  const ip = newIp.value.trim();
  if (!ip || testing.value || saving.value) return;
  testing.value = true;
  testResult.value = null;
  // Prefer the main-process TCP probe (faster, no CORS, no HTTP overhead).
  // Fall back to axios if not running in Electron (browser dev).
  try {
    if (window.electron?.system) {
      const res = await window.electron.system.probeTcp(ip, 8000, 2000);
      testResult.value = res.ok
        ? { ok: true, message: 'Server topildi', ms: res.ms }
        : {
            ok: false,
            message: "Javob bermayapti — IP noto'g'ri yoki kompyuter o'chirilgan",
            ms: null,
          };
    } else {
      const start = performance.now();
      await axios.get(`http://${ip}:8000/auth-me`, {
        timeout: 4000,
        validateStatus: () => true,
      });
      testResult.value = {
        ok: true,
        message: 'Server topildi',
        ms: Math.round(performance.now() - start),
      };
    }
  } catch {
    testResult.value = {
      ok: false,
      message: "Javob bermayapti — IP noto'g'ri yoki kompyuter o'chirilgan",
      ms: null,
    };
  } finally {
    testing.value = false;
  }
}

function saveIp(): void {
  const ip = newIp.value.trim();
  if (!ip || saving.value) return;
  saving.value = true;
  emit('save-ip', ip);
}

/* ============ AUTO-DISCOVERY ============ */

interface FoundServer { ip: string; ms: number }

const scanning = ref(false);
const scanFinished = ref(false);
const scanError = ref<string | null>(null);
const foundServers = ref<FoundServer[]>([]);
const scanSubnet = ref<string | null>(null);

const canScan = computed<boolean>(() => !!window.electron?.system);
const scanSubnetLabel = computed<string>(() =>
  scanSubnet.value ? `${scanSubnet.value}.1 — ${scanSubnet.value}.254` : '',
);

// Resolve the subnet to scan from this PC's local IPs. Picks the first
// non-loopback IPv4. If the user has multiple adapters (Wi-Fi + Ethernet),
// the LAN one usually appears first; we could later add a picker.
async function resolveSubnet(): Promise<string | null> {
  try {
    const ips = await window.electron?.system.getLocalIps();
    if (!ips || ips.length === 0) return null;
    return ips[0]?.subnet ?? null;
  } catch {
    return null;
  }
}

async function startScan(): Promise<void> {
  if (scanning.value) return;
  scanError.value = null;
  scanFinished.value = false;
  foundServers.value = [];

  const subnet = await resolveSubnet();
  if (!subnet) {
    scanError.value = 'Lokal IP topilmadi. LAN/Wi-Fi ulanishini tekshiring.';
    return;
  }
  scanSubnet.value = subnet;
  scanning.value = true;
  try {
    const found = await window.electron?.system.scanForServers(subnet, 8000);
    foundServers.value = found ?? [];
  } catch (e) {
    console.error(e);
    scanError.value = 'Qidiruvda xatolik yuz berdi.';
  } finally {
    scanning.value = false;
    scanFinished.value = true;
  }
}

async function cancelScan(): Promise<void> {
  try {
    await window.electron?.system.cancelScan();
  } catch (e) {
    console.warn(e);
  }
}

// Tap a found server → fills the IP input AND auto-tests it so the user
// sees the green confirmation immediately. Doesn't auto-save — they still
// commit explicitly.
function useFound(ip: string): void {
  newIp.value = ip;
  testResult.value = null;
  void testIp();
}

/* ============ SUPPORT BUNDLE ============ */

const diagnosticBundle = computed<string>(() => {
  const ip = props.configuredServerIp || '?';
  const lan = props.network.online.value ? 'bor' : 'yo’q';
  const srv = props.network.serverReachable.value
    ? `OK (${props.network.lastStatus.value})`
    : 'javob bermayapti';
  const t = new Date().toLocaleString('uz-UZ', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  return `IP=${ip} · Internet=${lan} · Server=${srv} · ${t}`;
});

const COPY_PHONE_OK = 'Telefon raqam nusxalandi';
const COPY_BUNDLE_OK = "Ma'lumot nusxalandi";

async function copy(text: string, successMsg: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(successMsg, { autoClose: 1500 });
  } catch (e) {
    console.warn('clipboard copy failed:', e);
    toast.error('Nusxalashda xatolik', { autoClose: 1500 });
  }
}
</script>

<style scoped lang="scss">
/* =====================================================
   FULL-SCREEN PANEL
   ===================================================== */
.diag {
  position: fixed;
  inset: 0;
  z-index: 5000;
  background: var(--bg-app);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ===== HEADER ===== */
.diag__head {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 18px 24px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-surface);
}

.diag__head-icon {
  color: var(--error);
  flex-shrink: 0;
  margin-top: 2px;
  &.is-warn { color: var(--warning); }
}

.diag__head-text { flex: 1; min-width: 0; }

.diag__title {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
}
.diag__sub {
  font-size: 13px;
  color: var(--text-muted);
  margin-top: 4px;
}

.diag__refresh {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  color: var(--text-primary);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  &:active { transform: scale(0.95); }
}

/* ===== BODY: TWO COLUMNS ===== */
.diag__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: grid;
  grid-template-columns: minmax(360px, 1fr) minmax(320px, 1fr);
  gap: 16px;
  padding: 16px 24px;
}

@media (max-width: 980px) {
  .diag__body { grid-template-columns: 1fr; }
}

.col {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.col__section {
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.col__section-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  .q-icon { color: var(--accent-primary); }
}

/* ===== IP INPUT + NUMPAD ===== */
.ip-input {
  width: 100%;
  height: 56px;
  padding: 0 16px;
  border-radius: 12px;
  border: 1px solid var(--accent-primary);
  background: var(--bg-surface-2);
  color: var(--text-primary);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 22px;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.5px;
  text-align: center;

  &:focus {
    outline: none;
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 18%, transparent);
  }
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

.ip-numpad {
  // NumericKeyboard owns its own internal sizing — wrapper just gives it
  // the room it needs.
  width: 100%;
}

.ip-result {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;

  &.ok {
    background: var(--success-weak);
    border: 1px solid color-mix(in srgb, var(--success) 40%, transparent);
    color: var(--success);
  }
  &.fail {
    background: var(--error-weak);
    border: 1px solid color-mix(in srgb, var(--error) 40%, transparent);
    color: var(--error);
  }
}

.ip-result__ms {
  font-variant-numeric: tabular-nums;
  font-weight: 500;
  opacity: 0.85;
  padding-left: 8px;
  margin-left: 2px;
  border-left: 1px solid currentColor;
}

.ip-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

/* ===== AUTO-DISCOVERY ===== */
.discover-hint {
  font-size: 13px;
  color: var(--text-muted);
  line-height: 1.5;
}

.discover-actions {
  display: flex;
  gap: 8px;
}

.discover-error {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 10px;
  background: var(--error-weak);
  border: 1px solid color-mix(in srgb, var(--error) 40%, transparent);
  color: var(--error);
  font-size: 13px;
}

.discover-empty {
  font-size: 13px;
  color: var(--text-muted);
  padding: 10px 14px;
  background: var(--bg-surface-2);
  border-radius: 10px;
  border: 1px dashed var(--border-color);
}

.found-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.found-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  background: var(--bg-surface-2);
  border: 1px solid color-mix(in srgb, var(--success) 40%, transparent);
  border-radius: 10px;
  cursor: pointer;
  transition: background 120ms ease, transform 80ms ease;

  &:hover { background: color-mix(in srgb, var(--success) 6%, transparent); }
  &:active { transform: scale(0.99); }
}

.found-row__ok { color: var(--success); flex-shrink: 0; }
.found-row__ip {
  flex: 1;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 15px;
  color: var(--text-primary);
  background: none;
  padding: 0;
}
.found-row__ms {
  font-variant-numeric: tabular-nums;
  font-size: 12px;
  color: var(--text-muted);
}
.found-row__arrow { color: var(--text-muted); }

/* ===== STATUS LIST (right column) ===== */
.status-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.status-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: var(--bg-surface-2);
  border: 1px solid var(--border-color);
  border-radius: 10px;
}

.status-row__icon {
  flex-shrink: 0;
  color: var(--text-muted);
  &.ok { color: var(--success); }
  &.fail { color: var(--error); }
}

.status-row__body { flex: 1; min-width: 0; }

.status-row__label {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.status-row__ip {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  background: var(--bg-surface);
  padding: 2px 8px;
  border-radius: 6px;
  color: var(--text-muted);
  font-weight: 500;
}

.status-row__value {
  font-size: 13px;
  color: var(--text-muted);
  margin-top: 2px;
  word-break: break-word;
}

.row-action {
  flex-shrink: 0;
  padding: 8px 14px;
  border-radius: 10px;
  border: 1px solid var(--accent-primary);
  background: transparent;
  color: var(--accent-primary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  &:hover { background: color-mix(in srgb, var(--primary) 8%, transparent); }
  &:active { transform: scale(0.97); }
}

/* ===== SUPPORT ===== */
.support-text {
  font-size: 13px;
  color: var(--text-muted);
}

.support-phone {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: var(--bg-surface-2);
  border: 1px solid var(--accent-primary);
  border-radius: 12px;
  cursor: pointer;
  user-select: text;
  color: var(--accent-primary);
  font-weight: 700;
  font-size: 18px;
  transition: background 120ms ease, transform 80ms ease;
  align-self: flex-start;
  &:hover  { background: color-mix(in srgb, var(--primary) 6%, transparent); }
  &:active { transform: scale(0.98); }
}
.support-phone__num {
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.4px;
}
.support-phone__copy { opacity: 0.7; }

.support-tellthem__label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  margin-bottom: 4px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.support-tellthem__bundle {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 14px;
  background: var(--bg-surface-2);
  border: 1px dashed var(--border-color);
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
  color: var(--text-primary);

  &:hover  { border-color: var(--accent-primary); }
  &:active { transform: scale(0.99); }

  code {
    flex: 1;
    min-width: 0;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
    color: var(--text-primary);
    word-break: break-word;
  }
  .q-icon {
    color: var(--text-muted);
    flex-shrink: 0;
  }
}

/* ===== BUTTONS ===== */
.btn {
  flex: 1;
  min-width: 100px;
  height: 48px;
  padding: 0 18px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: transform 90ms ease, background 120ms ease;
  border: 1px solid transparent;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  &:active:not(:disabled) { transform: scale(0.97); }
}
.btn--ghost {
  background: transparent;
  border-color: var(--border-color);
  color: var(--text-primary);
  flex: 0 0 auto;
}
.btn--secondary {
  background: var(--bg-surface);
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}
.btn--primary {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
  color: var(--on-primary);
}

/* ===== FOOTER ===== */
.diag__foot {
  display: flex;
  justify-content: flex-end;
  padding: 12px 24px;
  border-top: 1px solid var(--border-color);
  background: var(--bg-surface);
}

/* ===== TRANSITIONS ===== */
.diag-fade-enter-active,
.diag-fade-leave-active {
  transition: opacity 220ms ease;
}
.diag-fade-enter-from,
.diag-fade-leave-to {
  opacity: 0;
}
</style>
