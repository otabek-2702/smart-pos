<template>
  <div class="printer-settings">
    <div class="settings-form">
      <h2 class="section-title">Printer sozlamalari</h2>
      <p class="section-description">
        Termal printer ulanish sozlamalarini kiriting
      </p>

      <!-- Connection Section -->
      <div class="form-section">
        <h3 class="form-section-title">
          <q-icon name="print" size="20px" />
          Ulanish turi
        </h3>

        <div class="conn-type">
          <button
            type="button"
            class="conn-btn"
            :class="{ active: settings.connectionType === 'network' }"
            @click="settings.connectionType = 'network'"
          >
            <q-icon name="lan" size="22px" />
            <span>Tarmoq (IP)</span>
          </button>
          <button
            type="button"
            class="conn-btn"
            :class="{ active: settings.connectionType === 'usb' }"
            @click="selectUsb"
          >
            <q-icon name="usb" size="22px" />
            <span>USB / Windows</span>
          </button>
        </div>

        <!-- NETWORK -->
        <div v-if="settings.connectionType === 'network'" class="form-row">
          <div class="form-group flex-2">
            <label class="form-label">IP manzil</label>
            <input
              type="text"
              v-model="settings.ip"
              class="form-input"
              placeholder="192.168.123.100"
              @input="validateIp"
            />
            <span v-if="ipError" class="form-error">{{ ipError }}</span>
          </div>

          <div class="form-group flex-1">
            <label class="form-label">Port</label>
            <input
              type="number"
              v-model.number="settings.port"
              class="form-input"
              placeholder="9100"
              min="1"
              max="65535"
            />
          </div>
        </div>

        <!-- USB / Windows printer -->
        <div v-else class="form-group">
          <label class="form-label">Windows printeri</label>
          <div class="usb-row">
            <select v-model="settings.usbPrinterName" class="form-input">
              <option value="">Standart printer (Windows)</option>
              <option v-for="p in printersList" :key="p.name" :value="p.name">
                {{ p.displayName }}{{ p.isDefault ? ' — standart' : '' }}
              </option>
            </select>
            <button type="button" class="btn btn-outline usb-refresh" @click="loadPrinters" title="Yangilash">
              <q-icon name="refresh" size="20px" />
            </button>
          </div>
          <span v-if="printersList.length === 0" class="form-hint">
            Printer topilmadi. Windowsda printer o'rnatilganini tekshiring.
          </span>

          <!-- Print scale: tune until the receipt prints 1:1 (fixes 2x / too big) -->
          <label class="form-label scale-label">Chop o'lchami (%)</label>
          <div class="scale-row">
            <input
              v-model.number="settings.printScale"
              type="number"
              min="20"
              max="300"
              step="5"
              class="form-input scale-input"
              data-keyboard-nums="true"
            />
            <button type="button" class="btn btn-outline scale-reset" @click="settings.printScale = 67" title="67%">
              67% (standart)
            </button>
          </div>
          <span class="form-hint">
            <strong>67%</strong> = to'g'ri o'lcham (sinovdan o'tgan). Chek qog'oz eniga
            to'liq sig'masa biroz o'zgartiring. So'ng «Saqlash» va «Test chop etish».
          </span>
        </div>

        <div class="connection-status" :class="connectionStatus">
          <q-icon :name="connectionIcon" size="20px" />
          <span>{{ connectionText }}</span>
        </div>

        <button
          type="button"
          class="btn btn-outline"
          @click="testConnection"
          :disabled="testing || (settings.connectionType === 'network' && !isValidIp)"
        >
          <q-icon v-if="!testing" name="print" size="20px" />
          <q-spinner-dots v-if="testing" size="20px" />
          <span>{{ testing ? 'Chop etilmoqda...' : 'Test chop etish' }}</span>
        </button>
      </div>

      <!-- Paper Settings -->
      <!-- <div class="form-section">
        <h3 class="form-section-title">
          <q-icon name="straighten" size="20px" />
          Qog'oz sozlamalari
        </h3>

        <div class="form-group">
          <label class="form-label">Qog'oz kengligi</label>
          <div class="paper-options">
            <label class="paper-option" :class="{ active: settings.paperWidth === 58 }">
              <input
                type="radio"
                v-model="settings.paperWidth"
                :value="58"
                hidden
              />
              <div class="paper-preview paper-58">
                <div class="paper-lines">
                  <div></div>
                  <div></div>
                  <div></div>
                </div>
              </div>
              <span class="paper-label">58mm</span>
              <span class="paper-desc">Kichik printer</span>
            </label>

            <label class="paper-option" :class="{ active: settings.paperWidth === 80 }">
              <input
                type="radio"
                v-model="settings.paperWidth"
                :value="80"
                hidden
              />
              <div class="paper-preview paper-80">
                <div class="paper-lines">
                  <div></div>
                  <div></div>
                  <div></div>
                  <div></div>
                </div>
              </div>
              <span class="paper-label">80mm</span>
              <span class="paper-desc">Standart printer</span>
            </label>
          </div>
        </div>
      </div> -->

      <!-- Actions -->
      <div class="form-actions">
        <button
          type="button"
          class="btn btn-secondary"
          @click="resetToDefaults"
          :disabled="saving"
        >
          <q-icon name="restart_alt" size="20px" />
          Standartga qaytarish
        </button>

        <button
          type="button"
          class="btn btn-primary"
          @click="saveSettings"
          :disabled="saving || !canSave"
        >
          <q-icon v-if="!saving" name="save" size="20px" />
          <span v-if="saving">Saqlanmoqda...</span>
          <span v-else>Saqlash</span>
        </button>
      </div>
    </div>

    <!-- Info Panel -->
    <div class="info-panel">
      <div class="info-card">
        <q-icon name="info" size="24px" class="info-icon" />
        <h4>Printer haqida</h4>
        <p>
          Termal printer tarmoq orqali ulanishi kerak. Printer IP manzilini
          printer sozlamalaridan yoki tarmoq skaneridan aniqlashingiz mumkin.
        </p>
      </div>

      <div class="info-card">
        <q-icon name="tips_and_updates" size="24px" class="info-icon" />
        <h4>Maslahat</h4>
        <ul>
          <li>Standart port: <strong>9100</strong></li>
          <li>Printer va kompyuter bir tarmoqda bo'lishi kerak</li>
          <li>Firewall printerga ulanishga ruxsat berishi kerak</li>
        </ul>
      </div>

      <div class="info-card">
        <q-icon name="help_outline" size="24px" class="info-icon" />
        <h4>Muammo bormi?</h4>
        <p>
          Agar printer ulanmasa, quyidagilarni tekshiring:
        </p>
        <ul>
          <li>Printer yoqilganmi</li>
          <li>Tarmoq kabeli ulanganmi</li>
          <li>IP manzil to'g'rimi</li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import type { PrinterSettings } from 'src/types/settings';
import { DEFAULT_PRINTER_SETTINGS } from 'src/types/settings';

// Types
interface IpcResult {
  success: boolean;
  error?: string;
}

// State
const settings = reactive<PrinterSettings>({ ...DEFAULT_PRINTER_SETTINGS });
const saving = ref(false);
const testing = ref(false);
const ipError = ref<string>('');
const connectionStatus = ref<'idle' | 'success' | 'error'>('idle');
type StatusReason =
  | 'connected' | 'offline' | 'paper-out' | 'paused'
  | 'not-found' | 'unreachable' | 'error' | 'unknown';
const statusReason = ref<StatusReason | null>(null);
const printersList = ref<{ name: string; displayName: string; isDefault: boolean }[]>([]);

// Network needs a valid IP; USB just needs a (possibly default) printer.
const canSave = computed(() => settings.connectionType === 'usb' || isValidIp.value);

async function loadPrinters(): Promise<void> {
  try {
    printersList.value = (await window.electron.printer.list()) ?? [];
  } catch (e) {
    console.error('Failed to list printers:', e);
    printersList.value = [];
  }
}

function selectUsb(): void {
  settings.connectionType = 'usb';
  if (printersList.value.length === 0) void loadPrinters();
}

// Computed
const isValidIp = computed(() => {
  const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (!ipPattern.test(settings.ip)) return false;
  // Bound each octet 0-255 — the regex alone lets 999.1.1.1 through and would
  // enable Save on an invalid address.
  return settings.ip.split('.').every((part) => {
    const n = Number(part);
    return n >= 0 && n <= 255;
  });
});

const connectionIcon = computed(() => {
  switch (connectionStatus.value) {
    case 'success': return 'check_circle';
    case 'error': return 'error';
    default: return 'radio_button_unchecked';
  }
});

const connectionText = computed(() => {
  if (connectionStatus.value === 'success') return 'Printer ulangan';
  if (connectionStatus.value === 'idle') return 'Ulanish tekshirilmagan';
  // error → show the real cause
  switch (statusReason.value) {
    case 'paper-out': return "Qog'oz tugagan";
    case 'paused': return "Printer to'xtatilgan";
    case 'unreachable': return "Printerga ulanib bo'lmadi (tarmoq/IP)";
    case 'offline': return "Printer oflayn (o'chiq yoki uzilgan)";
    case 'not-found': return 'Printer topilmadi';
    default: return 'Printer topilmadi';
  }
});

// Load settings on mount
onMounted(async () => {
  await loadSettings();
});

async function loadSettings(): Promise<void> {
  try {
    const result = await window.electron.settings.getPrinter() as PrinterSettings;
    Object.assign(settings, result);
    if (settings.connectionType === 'usb') void loadPrinters();
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
}

async function saveSettings(): Promise<void> {
  if (!canSave.value) return;

  saving.value = true;
  try {
    const result = await window.electron.settings.savePrinter({ ...settings }) as IpcResult;

    if (result.success) {
      alert('Sozlamalar saqlandi!');
    } else {
      alert('Xatolik: ' + (result.error || 'Noma\'lum xatolik'));
    }
  } catch (error) {
    console.error('Failed to save settings:', error);
    alert('Sozlamalarni saqlashda xatolik');
  } finally {
    saving.value = false;
  }
}

async function testConnection(): Promise<void> {
  testing.value = true;
  connectionStatus.value = 'idle';
  statusReason.value = null;

  try {
    await window.electron.settings.savePrinter({ ...settings });

    // REAL connectivity check first (no paper wasted if it's offline).
    const st = await window.electron.printer.status();
    statusReason.value = st.reason;
    if (!st.online) {
      connectionStatus.value = 'error';
      return;
    }

    // Online → print a sample to confirm end-to-end (doPrint fail-fasts too).
    const result = (await window.electron.printer.test()) as IpcResult;
    connectionStatus.value = result.success ? 'success' : 'error';
    if (!result.success) statusReason.value = 'error';
  } catch (error) {
    console.error('Connection test failed:', error);
    statusReason.value = 'error';
    connectionStatus.value = 'error';
  } finally {
    testing.value = false;
  }
}

function validateIp(): void {
  if (!settings.ip) {
    ipError.value = '';
    return;
  }

  const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (!ipPattern.test(settings.ip)) {
    ipError.value = 'IP manzil formati noto\'g\'ri';
    return;
  }

  const parts = settings.ip.split('.').map(Number);
  const isValid = parts.every(part => part >= 0 && part <= 255);

  if (!isValid) {
    ipError.value = 'IP manzil qiymatlari 0-255 orasida bo\'lishi kerak';
    return;
  }

  ipError.value = '';
}

function resetToDefaults(): void {
  if (confirm('Barcha sozlamalarni standartga qaytarishni xohlaysizmi?')) {
    Object.assign(settings, DEFAULT_PRINTER_SETTINGS);
    connectionStatus.value = 'idle';
  }
}
</script>

<style scoped lang="scss">
.printer-settings {
  display: grid;
  grid-template-columns: minmax(0, 560px) 320px;
  gap: 20px;
  height: 100%;
  align-content: start;
}

.settings-form {
  background: var(--bg-surface);
  border-radius: 16px;
  padding: 24px;
  border: 1px solid var(--border-color);
}

.section-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 8px 0;
}

.section-description {
  color: var(--text-muted);
  font-size: 14px;
  margin: 0 0 24px 0;
}

.form-section {
  margin-bottom: 32px;
  padding-bottom: 24px;
  border-bottom: 1px solid var(--border-color);

  &:last-of-type {
    border-bottom: none;
    margin-bottom: 0;
    padding-bottom: 0;
  }
}

.form-section-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 16px 0;
}

.form-row {
  display: flex;
  gap: 16px;
}

.flex-1 {
  flex: 1;
}

.flex-2 {
  flex: 2;
}

.form-group {
  margin-bottom: 16px;
}

.form-label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-muted);
  margin-bottom: 8px;
}

.form-input {
  width: 100%;
  height: 44px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  padding: 0 14px;
  background: var(--bg-surface);
  color: var(--text-primary);
  font-size: 15px;

  &:focus {
    outline: none;
    border-color: var(--accent-primary);
  }

  &::placeholder {
    color: var(--text-muted);
  }
}

.form-error {
  display: block;
  color: #c62828;
  font-size: 12px;
  margin-top: 6px;
}

// Connection status
.conn-type {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 16px;
}
.conn-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 56px;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  background: var(--bg-surface-2);
  color: var(--text-primary);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;

  &.active {
    border-color: var(--accent-primary, #ff7a00);
    color: var(--accent-primary, #ff7a00);
    background: color-mix(in srgb, var(--accent-primary, #ff7a00) 10%, transparent);
  }
  &:active { transform: scale(0.98); }
}
.usb-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.usb-row .form-input { flex: 1; min-width: 0; }
.scale-label { margin-top: 14px; }
.scale-row { display: flex; gap: 8px; align-items: center; }
.scale-input { width: 120px; }
.scale-reset { white-space: nowrap; }
.usb-refresh {
  width: 48px;
  flex-shrink: 0;
  padding: 0;
}
.form-hint {
  display: block;
  margin-top: 6px;
  font-size: 12px;
  color: var(--text-muted);
}

.connection-status {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-radius: 10px;
  margin-bottom: 16px;
  font-size: 14px;
  font-weight: 500;

  &.idle {
    background: var(--bg-surface-2);
    color: var(--text-muted);
  }

  &.success {
    background: rgba(46, 125, 50, 0.1);
    color: #2e7d32;
  }

  &.error {
    background: rgba(198, 40, 40, 0.1);
    color: #c62828;
  }
}

// Paper options
.paper-options {
  display: flex;
  gap: 16px;
}

.paper-option {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px;
  border: 2px solid var(--border-color);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    border-color: var(--text-muted);
  }

  &.active {
    border-color: var(--accent-primary);
    background: rgba(22, 163, 74, 0.05);
  }
}

.paper-preview {
  width: 100%;
  background: white;
  border: 1px solid #ddd;
  border-radius: 4px;
  margin-bottom: 12px;
  display: flex;
  justify-content: center;
  align-items: center;
}

.paper-58 {
  height: 60px;
  max-width: 58px;
}

.paper-80 {
  height: 60px;
  max-width: 80px;
}

.paper-lines {
  width: 80%;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 0;

  div {
    height: 4px;
    background: #e0e0e0;
    border-radius: 2px;
  }
}

.paper-label {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.paper-desc {
  font-size: 12px;
  color: var(--text-muted);
}

// Actions
.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

// Buttons
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 48px;
  padding: 0 20px;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition: all 0.2s ease;
  border: none;

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

.btn-primary {
  background: var(--accent-primary);
  color: white;

  &:hover:not(:disabled) {
    opacity: 0.9;
  }

  &:active:not(:disabled) {
    transform: scale(0.97);
  }
}

.btn-secondary {
  background: var(--bg-surface-2);
  color: var(--text-primary);

  &:hover:not(:disabled) {
    background: var(--border-color);
  }
}

.btn-outline {
  background: transparent;
  border: 1px solid var(--border-color);
  color: var(--text-primary);

  &:hover:not(:disabled) {
    background: var(--bg-surface-2);
  }
}

// Info panel
.info-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.info-card {
  background: var(--bg-surface);
  border-radius: 12px;
  padding: 20px;
  border: 1px solid var(--border-color);

  .info-icon {
    color: var(--accent-primary);
    margin-bottom: 12px;
  }

  h4 {
    font-size: 15px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 10px 0;
  }

  p {
    font-size: 13px;
    color: var(--text-muted);
    line-height: 1.6;
    margin: 0;
  }

  ul {
    margin: 8px 0 0 0;
    padding-left: 20px;
    font-size: 13px;
    color: var(--text-muted);
    line-height: 1.8;

    strong {
      color: var(--text-primary);
    }
  }
}
</style>
