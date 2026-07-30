<template>
  <div class="telegram-settings">
    <div class="page-heading">
      <div>
        <h2>Telegram hisobotlari</h2>
        <p>
          Buyurtmalar asosiy kompyuterda muddatsiz saqlanadi. Telegram orqali
          savdo, kassirlar va buyurtmalarni xavfsiz ko‘ring.
        </p>
      </div>
      <span v-if="status" class="main-badge" :class="{ secondary: !status.isMainPc }">
        <q-icon :name="status.isMainPc ? 'dns' : 'computer'" size="17px" />
        {{ status.isMainPc ? 'Asosiy kompyuter' : 'Qo‘shimcha kassa' }}
      </span>
    </div>

    <div v-if="loading && !status" class="state-card">
      <q-icon name="progress_activity" size="30px" class="spin" />
      Hisobot xizmati tekshirilmoqda…
    </div>

    <div v-else-if="status && !status.isMainPc" class="state-card warning">
      <q-icon name="info" size="34px" />
      <div>
        <h3>Bu sozlama faqat asosiy kompyuterda ochiladi</h3>
        <p>
          Ushbu kassa <code>{{ status.backendHost }}</code> serveriga ulangan.
          Bot tokeni va savdo bazasi serverning o‘zida saqlanadi.
        </p>
      </div>
    </div>

    <template v-else-if="status">
      <div v-if="errorMessage" class="notice error">
        <q-icon name="error_outline" size="20px" />
        <span>{{ errorMessage }}</span>
        <button type="button" aria-label="Yopish" @click="errorMessage = ''">×</button>
      </div>
      <div v-if="successMessage" class="notice success">
        <q-icon name="check_circle" size="20px" />
        <span>{{ successMessage }}</span>
      </div>

      <div class="health-grid">
        <div class="health-card">
          <q-icon name="database" size="23px" />
          <div><strong>{{ formatNumber(status.storedOrderCount) }}</strong><span>buyurtma</span></div>
        </div>
        <div class="health-card">
          <q-icon :name="status.running ? 'smart_toy' : 'smart_toy_off'" size="23px" />
          <div>
            <strong>{{ status.running ? 'Ishlayapti' : status.configured ? 'To‘xtagan' : 'Ulanmagan' }}</strong>
            <span>Telegram bot</span>
          </div>
        </div>
        <div class="health-card">
          <q-icon name="sync" size="23px" />
          <div>
            <strong>{{ status.pendingRefreshCount }}</strong>
            <span>navbatdagi yangilanish</span>
          </div>
        </div>
      </div>

      <section class="settings-card">
        <div class="card-title">
          <span class="icon-box telegram"><q-icon name="send" size="22px" /></span>
          <div>
            <h3>Telegram bot</h3>
            <p>Token Windows himoyalangan xotirasida shifrlanadi va qayta ko‘rsatilmaydi.</p>
          </div>
          <span
            class="status-dot"
            :class="{ online: status.running, configured: status.configured }"
          >
            {{ status.running ? 'Online' : status.configured ? 'Offline' : 'Ulanmagan' }}
          </span>
        </div>

        <div v-if="!status.configured || replacingToken" class="token-form">
          <div class="guide">
            <span>1</span>
            <p>
              Telegramda <b>@BotFather</b> orqali bot yarating. Nomi:
              <b>Alfa POS Daily Reports</b>; username <b>bot</b> bilan tugashi kerak.
            </p>
          </div>
          <div class="guide">
            <span>2</span>
            <p>BotFather bergan tokenni shu yerga kiriting. Nomi, tavsifi, rasmi va buyruqlari avtomatik sozlanadi.</p>
          </div>

          <label class="field-label" for="telegram-token">Bot tokeni</label>
          <div class="token-input">
            <q-icon name="key" size="20px" />
            <input
              id="telegram-token"
              v-model="tokenInput"
              :type="showToken ? 'text' : 'password'"
              data-no-keyboard="true"
              autocomplete="off"
              spellcheck="false"
              placeholder="123456789:AA..."
              @keyup.enter="connectBot"
            />
            <button type="button" :aria-label="showToken ? 'Yashirish' : 'Ko‘rsatish'" @click="showToken = !showToken">
              <q-icon :name="showToken ? 'visibility_off' : 'visibility'" size="20px" />
            </button>
          </div>

          <div class="actions">
            <button
              type="button"
              class="btn primary"
              :disabled="busy || tokenInput.trim().length < 20"
              @click="connectBot"
            >
              <q-icon name="verified" size="20px" />
              Tekshirish va ulash
            </button>
            <button
              v-if="status.configured"
              type="button"
              class="btn ghost"
              :disabled="busy"
              @click="cancelReplacement"
            >
              Bekor qilish
            </button>
          </div>
        </div>

        <div v-else class="connected-bot">
          <div class="bot-avatar"><q-icon name="assessment" size="30px" /></div>
          <div class="bot-identity">
            <strong>{{ status.botName || 'Alfa POS Daily Reports' }}</strong>
            <span>@{{ status.botUsername }}</span>
          </div>
          <div class="actions compact">
            <button type="button" class="btn ghost" :disabled="busy" @click="replacingToken = true">
              Tokenni almashtirish
            </button>
            <button type="button" class="btn danger" :disabled="busy" @click="disconnectBot">
              Uzish
            </button>
          </div>
        </div>
      </section>

      <section v-if="status.configured" class="settings-card">
        <div class="card-title">
          <span class="icon-box"><q-icon name="lock" size="22px" /></span>
          <div>
            <h3>Hisobot egasini ulash</h3>
            <p>Faqat bitta tasdiqlangan shaxs restoran savdosini ko‘ra oladi.</p>
          </div>
        </div>

        <div v-if="status.pairedOwner" class="owner-row">
          <div class="owner-avatar">{{ ownerInitials }}</div>
          <div>
            <strong>{{ status.pairedOwner.displayName }}</strong>
            <span v-if="status.pairedOwner.username">@{{ status.pairedOwner.username }}</span>
            <small>{{ formatDateTime(status.pairedOwner.pairedAt) }} da ulangan</small>
          </div>
          <button type="button" class="btn danger subtle" :disabled="busy" @click="unpairOwner">
            Ulanishni bekor qilish
          </button>
        </div>

        <div v-else class="pairing-area">
          <p>
            Bir martalik havola 10 daqiqa ishlaydi. Uni o‘z Telegram hisobingizda
            oching va <b>Start</b> bosing.
          </p>
          <button type="button" class="btn primary" :disabled="busy" @click="createPairing">
            <q-icon name="link" size="20px" />
            Xavfsiz ulanish havolasini yaratish
          </button>

          <div v-if="pairingUrl" class="pairing-result">
            <img v-if="pairingQr" :src="pairingQr" alt="Telegram pairing QR" />
            <div>
              <strong>Telegramda oching</strong>
              <code class="pairing-link">{{ pairingUrl }}</code>
              <button type="button" class="btn ghost pairing-copy" @click="copyPairingLink">
                <q-icon name="content_copy" size="17px" />
                Havolani nusxalash
              </button>
              <small>{{ formatDateTime(pairingExpiresAt) }} gacha amal qiladi</small>
            </div>
          </div>
        </div>
      </section>

      <section v-if="status.configured" class="settings-card">
        <div class="card-title">
          <span class="icon-box"><q-icon name="schedule" size="22px" /></span>
          <div>
            <h3>Avtomatik kunlik hisobot</h3>
            <p>Yakunlangan ish kunini ulangan Telegram hisobiga yuboradi.</p>
          </div>
        </div>

        <div class="preference-row">
          <div>
            <strong>Har kuni yuborish</strong>
            <span>Vaqt mintaqasi: Asia/Tashkent</span>
          </div>
          <label class="switch">
            <input
              v-model="preferences.dailyEnabled"
              type="checkbox"
              @change="preferencesDirty = true"
            />
            <span />
          </label>
        </div>
        <div class="time-row">
          <label for="daily-time">Hisobot vaqti</label>
          <input
            id="daily-time"
            v-model="preferences.dailyTime"
            type="time"
            min="03:00"
            max="23:59"
            data-no-keyboard="true"
            :disabled="!preferences.dailyEnabled"
            @input="preferencesDirty = true"
          />
          <span>
            Standart 03:10 — ish kuni 03:00 da tugagandan keyin. 03:00 dan
            oldingi vaqtni tanlab bo‘lmaydi.
          </span>
        </div>
        <div class="actions">
          <button
            type="button"
            class="btn primary"
            :disabled="busy || !preferencesDirty"
            @click="savePreferences"
          >
            <q-icon name="save" size="20px" />
            Saqlash
          </button>
          <button
            type="button"
            class="btn ghost"
            :disabled="busy || !status.pairedOwner"
            @click="sendTest"
          >
            <q-icon name="send" size="19px" />
            Sinov hisobotini yuborish
          </button>
        </div>
      </section>

      <section class="settings-card">
        <div class="card-title">
          <span class="icon-box"><q-icon name="storage" size="22px" /></span>
          <div>
            <h3>Mahalliy savdo bazasi</h3>
            <p>Ma’lumotlar faqat ushbu asosiy kompyuterning ProgramData papkasida saqlanadi.</p>
          </div>
        </div>

        <div class="data-grid">
          <div><span>Buyurtmalar</span><strong>{{ formatNumber(status.storedOrderCount) }}</strong></div>
          <div><span>Baza hajmi</span><strong>{{ formatBytes(status.databaseSizeBytes) }}</strong></div>
          <div><span>Birinchi yozuv</span><strong>{{ formatDateTime(status.earliestOrderAt) }}</strong></div>
          <div><span>Oxirgi yozuv</span><strong>{{ formatDateTime(status.latestOrderAt) }}</strong></div>
          <div><span>Oxirgi sinxronlash</span><strong>{{ formatDateTime(status.lastSyncAt) }}</strong></div>
          <div><span>Navbat</span><strong>{{ status.pendingRefreshCount }}</strong></div>
        </div>

        <div v-if="status.lastError" class="sync-error">
          <q-icon name="warning_amber" size="20px" />
          {{ status.lastError }}
        </div>

        <div class="actions">
          <button type="button" class="btn ghost" :disabled="busy" @click="refreshReports">
            <q-icon name="sync" size="20px" :class="{ spin: refreshing }" />
            Hozir sinxronlash
          </button>
        </div>
        <p class="retention-note">
          <q-icon name="all_inclusive" size="18px" />
          Avtomatik o‘chirish yo‘q — tarix muddatsiz saqlanadi.
        </p>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import QRCode from 'qrcode';
import { toast } from 'vue3-toastify';

type ReportsStatus = Awaited<ReturnType<typeof window.electron.reports.status>>;
type ReportsPreferences = ReportsStatus['preferences'];

const status = ref<ReportsStatus | null>(null);
const loading = ref(true);
const busy = ref(false);
const refreshing = ref(false);
const tokenInput = ref('');
const showToken = ref(false);
const replacingToken = ref(false);
const pairingUrl = ref('');
const pairingQr = ref('');
const pairingExpiresAt = ref('');
const errorMessage = ref('');
const successMessage = ref('');
const preferencesDirty = ref(false);
const preferences = reactive<ReportsPreferences>({
  dailyEnabled: true,
  dailyTime: '03:10',
});
let pollTimer: ReturnType<typeof setInterval> | null = null;

const ownerInitials = computed(() => {
  const name = status.value?.pairedOwner?.displayName ?? '';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part: string) => part[0]?.toUpperCase())
    .join('');
});

function applyStatus(next: ReportsStatus): void {
  const wasPaired = Boolean(status.value?.pairedOwner);
  status.value = next;
  if (!preferencesDirty.value) {
    preferences.dailyEnabled = next.preferences.dailyEnabled;
    preferences.dailyTime = next.preferences.dailyTime;
  }
  if (!wasPaired && next.pairedOwner) {
    pairingUrl.value = '';
    pairingQr.value = '';
    pairingExpiresAt.value = '';
    successMessage.value = `${next.pairedOwner.displayName} muvaffaqiyatli ulandi`;
  }
}

async function loadStatus(silent = false): Promise<void> {
  try {
    applyStatus(await window.electron.reports.status());
    if (!silent) errorMessage.value = '';
  } catch (error) {
    if (!silent) errorMessage.value = messageFrom(error);
  } finally {
    loading.value = false;
  }
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : 'Amalni bajarib bo‘lmadi';
}

async function run(action: () => Promise<void>, success?: string): Promise<void> {
  busy.value = true;
  errorMessage.value = '';
  successMessage.value = '';
  try {
    await action();
    if (success) {
      successMessage.value = success;
      toast.success(success);
    }
  } catch (error) {
    errorMessage.value = messageFrom(error);
    toast.error(errorMessage.value);
  } finally {
    busy.value = false;
  }
}

async function connectBot(): Promise<void> {
  const token = tokenInput.value.trim();
  if (!token) return;
  await run(async () => {
    applyStatus(await window.electron.reports.connectTelegram(token));
    tokenInput.value = '';
    showToken.value = false;
    replacingToken.value = false;
  }, 'Telegram bot xavfsiz ulandi');
}

function cancelReplacement(): void {
  tokenInput.value = '';
  replacingToken.value = false;
}

async function disconnectBot(): Promise<void> {
  if (!window.confirm('Bot tokeni va Telegram ulanishini ushbu kompyuterdan o‘chirasizmi?')) return;
  await run(async () => {
    applyStatus(await window.electron.reports.disconnectTelegram());
    pairingUrl.value = '';
    pairingQr.value = '';
  }, 'Telegram bot uzildi');
}

async function createPairing(): Promise<void> {
  await run(async () => {
    const result = await window.electron.reports.createPairing();
    pairingUrl.value = result.url;
    pairingExpiresAt.value = result.expiresAt;
    pairingQr.value = await QRCode.toDataURL(result.url, {
      width: 220,
      margin: 1,
      errorCorrectionLevel: 'M',
    });
    await loadStatus(true);
  });
}

async function copyPairingLink(): Promise<void> {
  if (!pairingUrl.value) return;
  try {
    await navigator.clipboard.writeText(pairingUrl.value);
    toast.success('Ulanish havolasi nusxalandi');
  } catch {
    errorMessage.value = 'Havolani nusxalab bo‘lmadi';
    toast.error(errorMessage.value);
  }
}

async function unpairOwner(): Promise<void> {
  if (!window.confirm('Ulangan Telegram hisobining hisobotlarga kirishini bekor qilasizmi?')) return;
  await run(async () => {
    applyStatus(await window.electron.reports.unpair());
  }, 'Telegram hisobi uzildi');
}

async function savePreferences(): Promise<void> {
  await run(async () => {
    const next = await window.electron.reports.savePreferences({
      dailyEnabled: preferences.dailyEnabled,
      dailyTime: preferences.dailyTime,
    });
    preferencesDirty.value = false;
    applyStatus(next);
  }, 'Kunlik hisobot sozlamalari saqlandi');
}

async function sendTest(): Promise<void> {
  await run(async () => {
    await window.electron.reports.sendTest();
  }, 'Sinov hisoboti Telegramga yuborildi');
}

async function refreshReports(): Promise<void> {
  refreshing.value = true;
  await run(async () => {
    applyStatus(await window.electron.reports.refreshNow());
  }, 'Mahalliy hisobotlar yangilandi');
  refreshing.value = false;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('uz-UZ').format(value);
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 KB';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** index).toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
}

function formatDateTime(value: string | null): string {
  if (!value) return 'Hali yo‘q';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Hali yo‘q';
  return new Intl.DateTimeFormat('uz-UZ', {
    timeZone: 'Asia/Tashkent',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

onMounted(() => {
  void loadStatus();
  pollTimer = setInterval(() => void loadStatus(true), 5_000);
});

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
});
</script>

<style scoped lang="scss">
.telegram-settings {
  width: 100%;
  max-width: 920px;
  padding: 4px 4px 44px;
  color: var(--text-primary);
}

.page-heading {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20px;
  margin-bottom: 20px;

  h2 {
    margin: 0 0 6px;
    font-size: 24px;
    font-weight: 800;
  }

  p {
    max-width: 650px;
    margin: 0;
    color: var(--text-muted);
    font-size: 14px;
    line-height: 1.55;
  }
}

.main-badge {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 8px 12px;
  border: 1px solid var(--primary-border);
  border-radius: var(--r-pill);
  background: var(--primary-weak);
  color: var(--primary);
  font-size: 12px;
  font-weight: 800;

  &.secondary {
    border-color: var(--border-color);
    background: var(--bg-surface-2);
    color: var(--text-muted);
  }
}

.state-card {
  min-height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 28px;
  border: 1px solid var(--border-color);
  border-radius: 16px;
  background: var(--bg-surface);
  color: var(--text-muted);

  &.warning {
    justify-content: flex-start;
    color: var(--warning);

    h3 { margin: 0 0 7px; color: var(--text-primary); }
    p { margin: 0; color: var(--text-muted); line-height: 1.55; }
  }
}

.health-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.health-card {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 76px;
  padding: 14px 16px;
  border: 1px solid var(--border-color);
  border-radius: 14px;
  background: var(--bg-surface);

  > .q-icon { color: var(--accent-primary); }
  div { min-width: 0; display: flex; flex-direction: column; }
  strong { font-size: 17px; line-height: 1.2; }
  span { margin-top: 3px; color: var(--text-muted); font-size: 12px; }
}

.settings-card {
  margin-bottom: 16px;
  padding: 20px;
  border: 1px solid var(--border-color);
  border-radius: 16px;
  background: var(--bg-surface);
}

.card-title {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 18px;

  h3 { margin: 0 0 3px; font-size: 17px; font-weight: 750; }
  p { margin: 0; color: var(--text-muted); font-size: 13px; line-height: 1.45; }
  > div:nth-child(2) { flex: 1; }
}

.icon-box {
  width: 42px;
  height: 42px;
  flex: 0 0 42px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: var(--primary-weak);
  color: var(--accent-primary);

  &.telegram {
    background: color-mix(in srgb, #229ed9 14%, transparent);
    color: #229ed9;
  }
}

.status-dot {
  padding: 6px 10px;
  border-radius: var(--r-pill);
  background: var(--bg-surface-2);
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 800;

  &.configured { color: var(--warning); }
  &.online { background: color-mix(in srgb, var(--success) 14%, transparent); color: var(--success); }
}

.guide {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin: 10px 0;

  > span {
    width: 23px;
    height: 23px;
    flex: 0 0 23px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--primary-weak);
    color: var(--accent-primary);
    font-size: 12px;
    font-weight: 800;
  }

  p { margin: 1px 0 0; color: var(--text-secondary); font-size: 13px; line-height: 1.5; }
}

.field-label {
  display: block;
  margin: 18px 0 7px;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 700;
}

.token-input {
  display: flex;
  align-items: center;
  gap: 9px;
  max-width: 650px;
  height: 50px;
  padding: 0 12px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-surface-2);

  &:focus-within { border-color: var(--accent-primary); box-shadow: 0 0 0 3px var(--primary-weak); }
  > .q-icon { color: var(--text-muted); }
  input {
    min-width: 0;
    flex: 1;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: 14px;
  }
  button {
    border: 0;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
  }
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 16px;

  &.compact { margin: 0 0 0 auto; }
}

.btn {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 16px;
  border: 1px solid transparent;
  border-radius: 11px;
  font-size: 13px;
  font-weight: 750;
  cursor: pointer;

  &:disabled { opacity: 0.5; cursor: not-allowed; }
  &:active:not(:disabled) { transform: scale(0.98); }
  &.primary { background: var(--accent-primary); color: var(--on-primary); }
  &.ghost { border-color: var(--border-color); background: var(--bg-surface-2); color: var(--text-primary); }
  &.danger { border-color: color-mix(in srgb, var(--error) 40%, transparent); background: transparent; color: var(--error); }
  &.subtle { margin-left: auto; }
}

.connected-bot,
.owner-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--border-color);
  border-radius: 13px;
  background: var(--bg-surface-2);
}

.bot-avatar,
.owner-avatar {
  width: 48px;
  height: 48px;
  flex: 0 0 48px;
  display: grid;
  place-items: center;
  border-radius: 15px;
  background: linear-gradient(145deg, #229ed9, #4ab7e8);
  color: #fff;
  font-weight: 850;
}

.bot-identity,
.owner-row > div:nth-child(2) {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
  span, small { color: var(--text-muted); font-size: 12px; }
}

.pairing-area > p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.55;
}

.pairing-result {
  display: flex;
  align-items: center;
  gap: 18px;
  margin-top: 16px;
  padding: 15px;
  border: 1px dashed var(--primary-border);
  border-radius: 14px;
  background: var(--primary-weak);

  img { width: 150px; height: 150px; border-radius: 10px; background: #fff; }
  > div { display: flex; min-width: 0; flex-direction: column; gap: 7px; }
  .pairing-link {
    max-width: 100%;
    overflow-wrap: anywhere;
    color: var(--accent-primary);
    font-size: 12px;
  }
  .pairing-copy { align-self: flex-start; height: 38px; padding: 0 12px; }
  small { color: var(--text-muted); }
}

.preference-row,
.time-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-color);
}

.preference-row {
  justify-content: space-between;
  > div { display: flex; flex-direction: column; gap: 3px; }
  span { color: var(--text-muted); font-size: 12px; }
}

.time-row {
  label { min-width: 110px; font-weight: 700; }
  input {
    height: 42px;
    padding: 0 12px;
    border: 1px solid var(--border-color);
    border-radius: 10px;
    background: var(--bg-surface-2);
    color: var(--text-primary);
    font: inherit;
  }
  span { color: var(--text-muted); font-size: 12px; }
}

.switch {
  position: relative;
  width: 48px;
  height: 27px;
  input { opacity: 0; position: absolute; }
  span {
    position: absolute;
    inset: 0;
    border-radius: 20px;
    background: var(--border-color);
    cursor: pointer;
    transition: 0.18s;
    &::after {
      content: '';
      position: absolute;
      width: 21px;
      height: 21px;
      top: 3px;
      left: 3px;
      border-radius: 50%;
      background: #fff;
      transition: 0.18s;
    }
  }
  input:checked + span { background: var(--accent-primary); }
  input:checked + span::after { transform: translateX(21px); }
}

.data-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;

  > div {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px;
    border-radius: 11px;
    background: var(--bg-surface-2);
  }
  span { color: var(--text-muted); font-size: 11px; }
  strong { overflow: hidden; text-overflow: ellipsis; font-size: 13px; }
}

.sync-error,
.retention-note,
.notice {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 13px;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 12px;
}

.sync-error { background: color-mix(in srgb, var(--warning) 12%, transparent); color: var(--warning); }
.retention-note { background: var(--primary-weak); color: var(--text-secondary); }

.notice {
  margin: 0 0 12px;
  font-size: 13px;
  &.error { background: color-mix(in srgb, var(--error) 12%, transparent); color: var(--error); }
  &.success { background: color-mix(in srgb, var(--success) 12%, transparent); color: var(--success); }
  span { flex: 1; }
  button { border: 0; background: transparent; color: currentColor; font-size: 21px; cursor: pointer; }
}

.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

@media (max-width: 760px) {
  .page-heading { flex-direction: column; }
  .health-grid, .data-grid { grid-template-columns: 1fr; }
  .connected-bot, .owner-row, .pairing-result, .time-row { align-items: flex-start; flex-direction: column; }
  .actions.compact, .btn.subtle { margin-left: 0; }
  .pairing-result img { align-self: center; }
}
</style>
