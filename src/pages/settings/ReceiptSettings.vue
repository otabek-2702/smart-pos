<template>
  <div class="receipt-settings">
    <div class="settings-form">
      <h2 class="section-title">Chek sozlamalari</h2>
      <p class="section-description">
        Chekda ko'rsatiladigan ma'lumotlarni sozlang
      </p>

      <!-- Logo Section -->
      <div class="form-section">
        <h3 class="form-section-title">
          <q-icon name="image" size="20px" />
          Logo
        </h3>

        <div class="form-group">
          <label class="toggle-label">
            <input
              type="checkbox"
              v-model="settings.useDefaultLogo"
              class="toggle-input"
            />
            <span class="toggle-switch"></span>
            <span>Standart logoni ishlatish</span>
          </label>
        </div>

        <div v-if="!settings.useDefaultLogo" class="form-group">
          <label class="form-label">Maxsus logo yuklash</label>
          <div class="logo-upload">
            <div
              v-if="settings.logoBase64"
              class="logo-preview"
            >
              <img :src="settings.logoBase64" alt="Logo preview" />
              <button type="button" class="remove-logo" @click="removeLogo">
                <q-icon name="close" size="16px" />
              </button>
            </div>
            <label v-else class="upload-area">
              <input
                type="file"
                accept="image/png,image/jpeg,image/jpg"
                @change="handleLogoUpload"
                hidden
              />
              <q-icon name="cloud_upload" size="32px" />
              <span>Logo yuklash</span>
              <span class="upload-hint">PNG yoki JPG, max 2MB</span>
            </label>
          </div>
        </div>
      </div>

      <!-- (Old global "Matn o'lchami" removed — use the per-part size editor on
           the preview: tap a receipt part → slider, each with this-PC/all scope.) -->

      <!-- Thank You Message -->
      <div class="form-section">
        <h3 class="form-section-title">
          <q-icon name="favorite" size="20px" />
          Rahmat xabari
        </h3>

        <div class="form-group">
          <label class="toggle-label">
            <input
              type="checkbox"
              v-model="settings.showThankYouMessage"
              class="toggle-input"
            />
            <span class="toggle-switch"></span>
            <span>Ko'rsatish</span>
          </label>
        </div>

        <div v-if="settings.showThankYouMessage" class="form-group">
          <label class="form-label">Matn</label>
          <input
            type="text"
            v-model="settings.thankYouMessage"
            class="form-input"
            placeholder="Rahmat!"
          />
        </div>
      </div>

      <!-- QR code -->
      <div class="form-section">
        <h3 class="form-section-title">
          <q-icon name="qr_code_2" size="20px" />
          QR kod
        </h3>

        <div class="form-group">
          <label class="toggle-label">
            <input
              type="checkbox"
              v-model="settings.showQr"
              class="toggle-input"
            />
            <span class="toggle-switch"></span>
            <span>Ko'rsatish (Telegram bot / aksiyalar)</span>
          </label>
        </div>

        <div v-if="settings.showQr">
          <div class="form-group">
            <label class="form-label">Havola yoki matn</label>
            <input
              type="text"
              v-model="settings.qrData"
              class="form-input"
              placeholder="https://t.me/smartfood_bot"
            />
            <span class="field-hint">
              Havolani kiriting — QR avtomatik yaratiladi
            </span>
          </div>

          <div class="qr-row">
            <div class="qr-box">
              <img
                v-if="settings.qrImageBase64"
                :src="settings.qrImageBase64"
                alt="QR"
              />
              <div v-else-if="qrGenerating" class="qr-state">Yaratilmoqda…</div>
              <div v-else-if="qrError" class="qr-state error">{{ qrError }}</div>
              <div v-else class="qr-state">
                <q-icon name="qr_code_2" size="28px" />
                <span>Havola kiriting</span>
              </div>
            </div>

            <div class="qr-fields">
              <div class="form-group">
                <label class="form-label">Sarlavha</label>
                <input
                  type="text"
                  v-model="settings.qrCaption"
                  class="form-input"
                  placeholder="Telegram botimizga ulaning"
                />
              </div>
              <div class="form-group">
                <label class="form-label">Tagidagi matn</label>
                <input
                  type="text"
                  v-model="settings.qrHandle"
                  class="form-input"
                  placeholder="@smartfood_bot"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer Phone -->
      <div class="form-section">
        <h3 class="form-section-title">
          <q-icon name="phone" size="20px" />
          Telefon raqam (pastki qism)
        </h3>

        <div class="form-group">
          <label class="toggle-label">
            <input
              type="checkbox"
              v-model="settings.showFooterPhone"
              class="toggle-input"
            />
            <span class="toggle-switch"></span>
            <span>Ko'rsatish</span>
          </label>
        </div>

        <div v-if="settings.showFooterPhone">
          <div class="form-group">
            <label class="form-label">Sarlavha</label>
            <input
              type="text"
              v-model="settings.footerTitle"
              class="form-input"
              placeholder="Fikr bildirish"
            />
          </div>

          <div class="form-group">
            <label class="form-label">Telefon raqam</label>
            <input
              type="text"
              v-model="settings.footerPhone"
              class="form-input"
              placeholder="+998 90 205 50 80"
            />
          </div>
        </div>
      </div>

      <!-- Additional Footer -->
      <div class="form-section">
        <h3 class="form-section-title">
          <q-icon name="text_fields" size="20px" />
          Qo'shimcha matn
        </h3>

        <div class="form-group">
          <label class="toggle-label">
            <input
              type="checkbox"
              v-model="settings.showAdditionalFooter"
              class="toggle-input"
            />
            <span class="toggle-switch"></span>
            <span>Ko'rsatish</span>
          </label>
        </div>

        <div v-if="settings.showAdditionalFooter" class="form-group">
          <label class="form-label">Matn (Instagram, manzil va h.k.)</label>
          <textarea
            v-model="settings.additionalFooterText"
            class="form-textarea"
            rows="3"
            placeholder="Instagram: @yourcompany&#10;Manzil: Toshkent sh."
          ></textarea>
        </div>
      </div>

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
          :disabled="saving"
        >
          <q-icon v-if="!saving" name="save" size="20px" />
          <span v-if="saving">Saqlanmoqda...</span>
          <span v-else>Saqlash</span>
        </button>
      </div>
    </div>

    <!-- Preview -->
    <div class="preview-section">
      <div class="preview-header">
        <h3>Ko'rinish</h3>
        <button
          type="button"
          class="btn btn-outline"
          @click="testPrint"
          :disabled="testPrinting"
        >
          <q-icon name="print" size="20px" />
          <span v-if="testPrinting">Chop etilmoqda...</span>
          <span v-else>Test chop etish</span>
        </button>
      </div>

      <!-- per-part size editor — sits ABOVE the preview so the control is
           right where you're looking; tap a part in the receipt below to select. -->
      <div class="size-panel">
        <template v-if="selectedPart">
          <div class="size-panel__head">
            <span>{{ partLabel(selectedPart) }} — o'lcham</span>
            <button type="button" class="size-panel__x" @click="selectedPart = null">
              <q-icon name="close" size="18px" />
            </button>
          </div>
          <div class="size-row">
            <q-icon name="text_decrease" size="20px" />
            <q-slider
              v-model="selectedSize"
              :min="SIZE_MIN"
              :max="SIZE_MAX"
              :step="0.05"
              color="primary"
              class="size-slider"
            />
            <q-icon name="text_increase" size="24px" />
            <span class="size-val">{{ Math.round(selectedSize * 100) }}%</span>
          </div>
          <div class="size-scope">
            <button
              type="button"
              :class="{ active: selectedScope === 'this-pc' }"
              @click="setSelectedScope('this-pc')"
            >
              Shu PC
            </button>
            <button
              type="button"
              :class="{ active: selectedScope === 'global' }"
              @click="setSelectedScope('global')"
            >
              Hammasi
            </button>
          </div>
        </template>
        <div v-else class="size-hint">
          Matn o'lchamini o'zgartirish uchun chekdagi qismni bosing.
        </div>
      </div>

      <div class="preview-container">
        <div
          class="receipt-preview"
          :style="previewStyle"
          v-html="previewHtml"
          @click="onPreviewClick"
        ></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted } from 'vue';
import type { ReceiptSettings } from 'src/types/settings';
import { DEFAULT_RECEIPT_SETTINGS } from 'src/types/settings';
import { generateQrDataUrl } from 'src/utils/qr';
import {
  RECEIPT_PARTS,
  RECEIPT_SIZE_MIN,
  RECEIPT_SIZE_MAX,
  useReceiptSize,
} from 'src/composables/useReceiptSizes';
import type { TweakScope } from 'src/composables/useTweaks';

// Types for Electron IPC
interface IpcResult {
  success: boolean;
  error?: string;
}

// State
const settings = reactive<ReceiptSettings>({ ...DEFAULT_RECEIPT_SETTINGS });
const saving = ref(false);
const testPrinting = ref(false);
const previewHtml = ref<string>('');
const qrGenerating = ref(false);
const qrError = ref<string>('');

/* ---- per-part receipt sizes (tap a part in the preview → slider) ---- */
const sizeTweaks = Object.fromEntries(
  RECEIPT_PARTS.map((p) => [p.key, useReceiptSize(p.key)]),
) as Record<string, ReturnType<typeof useReceiptSize>>;

const SIZE_MIN = RECEIPT_SIZE_MIN;
const SIZE_MAX = RECEIPT_SIZE_MAX;

// font-size + the --sz-* CSS vars so the preview reflects each part's size live.
const previewStyle = computed<Record<string, string>>(() => {
  const vars: Record<string, string> = {
    fontSize: `${Math.round(13 * (settings.fontScale || 1))}px`,
  };
  for (const p of RECEIPT_PARTS) vars[`--sz-${p.key}`] = String(sizeTweaks[p.key]!.value.value);
  return vars;
});

const selectedPart = ref<string | null>(null);
function partLabel(key: string | null): string {
  return RECEIPT_PARTS.find((p) => p.key === key)?.label ?? '';
}
const selectedSize = computed<number>({
  get: () => (selectedPart.value ? sizeTweaks[selectedPart.value]!.value.value : 1),
  set: (v) => {
    if (selectedPart.value) sizeTweaks[selectedPart.value]!.value.value = v;
  },
});
const selectedScope = computed<TweakScope>(() =>
  selectedPart.value ? sizeTweaks[selectedPart.value]!.scope.value : 'global',
);
function setSelectedScope(s: TweakScope): void {
  if (selectedPart.value) sizeTweaks[selectedPart.value]!.setScope(s);
}
function onPreviewClick(e: MouseEvent): void {
  const el = (e.target as HTMLElement | null)?.closest?.('[data-part]') as HTMLElement | null;
  if (el?.dataset.part) selectedPart.value = el.dataset.part;
}

// Load settings on mount
onMounted(async () => {
  await loadSettings();
  await regenerateQr();
  updatePreview();
});

// Watch for changes and update preview
watch(
  settings,
  () => {
    updatePreview();
  },
  { deep: true },
);

// Regenerate the QR whenever the link or the toggle changes (debounced).
let qrTimer: ReturnType<typeof setTimeout> | null = null;
watch(
  () => [settings.showQr, settings.qrData] as const,
  () => {
    if (qrTimer) clearTimeout(qrTimer);
    qrTimer = setTimeout(() => void regenerateQr(), 250);
  },
);

async function regenerateQr(): Promise<void> {
  const data = settings.qrData.trim();
  if (!settings.showQr || !data) {
    settings.qrImageBase64 = null;
    qrError.value = '';
    return;
  }
  qrGenerating.value = true;
  qrError.value = '';
  try {
    settings.qrImageBase64 = await generateQrDataUrl(data);
  } catch (e) {
    console.error('QR generation failed:', e);
    settings.qrImageBase64 = null;
    qrError.value = 'QR yaratib bo\'lmadi';
  } finally {
    qrGenerating.value = false;
  }
}

async function loadSettings(): Promise<void> {
  try {
    const result = await window.electron.settings.getReceipt() as ReceiptSettings;
    Object.assign(settings, result);
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
}

async function saveSettings(): Promise<void> {
  saving.value = true;
  try {
    const result = await window.electron.settings.saveReceipt({ ...settings }) as IpcResult;

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

function updatePreview(): void {
  try {
    previewHtml.value = generateLocalPreview();
  } catch (error) {
    console.error('Failed to update preview:', error);
  }
}

// Escape operator-entered text before it goes into the v-html preview —
// otherwise a stray "<" breaks the markup and arbitrary HTML is an XSS sink.
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Mirrors the print template (src-electron/receipt-template.ts) so the on-screen
// preview matches what prints. Sample = a paid delivery order showcasing every
// optional block; toggles/text/QR/size come straight from `settings`.
function generateLocalPreview(): string {
  const s = settings;

  let logo = '';
  if (s.useDefaultLogo) logo = '<div class="r-logo placeholder">LOGO</div>';
  else if (s.logoBase64) logo = `<div class="r-logo"><img src="${s.logoBase64}" /></div>`;

  const thank =
    s.showThankYouMessage && s.thankYouMessage
      ? `<div class="strong">${esc(s.thankYouMessage)}</div>`
      : '';
  const footPhone =
    s.showFooterPhone && (s.footerTitle || s.footerPhone)
      ? `<div>${[s.footerTitle, s.footerPhone].filter(Boolean).map((t) => esc(t)).join(' ')}</div>`
      : '';
  const extra =
    s.showAdditionalFooter && s.additionalFooterText
      ? `<div class="extra">${s.additionalFooterText.split('\n').map((l) => esc(l)).join('<br>')}</div>`
      : '';
  const foot =
    thank || footPhone || extra
      ? `<div class="r-foot" data-part="footer">${thank}${footPhone}${extra}</div>`
      : '';

  const qr =
    s.showQr && s.qrImageBase64
      ? `
        <div class="r-rule"></div>
        <div class="r-qr">
          <img src="${s.qrImageBase64}" />
          ${s.qrCaption ? `<div class="cap">${esc(s.qrCaption)}</div>` : ''}
          ${s.qrHandle ? `<div class="handle">${esc(s.qrHandle)}</div>` : ''}
        </div>`
      : '';

  return `
    <div class="r-receipt">
      ${logo}

      <div class="r-meta" data-part="meta">
        <div>15.01.2025 · 14:30</div>
        <div>Chek №123 · Yetkazib berish · Kassir Ismi</div>
      </div>

      <div class="r-rule"></div>
      <div class="r-deliv" data-part="delivery">
        <div class="r-seclabel">Yetkazib berish</div>
        <div class="r-dblock"><div class="r-dk">Mijoz</div><div class="r-dv-phone">+998 90 123 45 67</div></div>
        <div class="r-dblock"><div class="r-dk">Manzil</div><div class="r-dv-addr">Chilonzor t., 12-kvartal, 5-uy</div></div>
      </div>

      <div class="r-rule"></div>

      <div class="r-item" data-part="items"><span class="name">Lavash Klassik</span><span class="qty">2×</span><span class="sum">50 000</span></div>
      <div class="r-item" data-part="items"><span class="name">Cola 0.5L</span><span class="qty">1×</span><span class="sum">8 000</span></div>
      <div class="r-item" data-part="items"><span class="name">Kartoshka Fri</span><span class="qty">1×</span><span class="sum">12 000</span></div>
      <div class="r-free" data-part="items"><span class="name">Souz BBQ <span class="promo">· SMART10</span></span><span class="badge">Bepul</span></div>

      <div class="r-rule"></div>

      <div class="r-tot" data-part="total"><span>Oraliq summa</span><span class="val">70 000</span></div>
      <div class="r-tot" data-part="total"><span>Chegirma 10%</span><span class="off">−7 000</span></div>
      <div class="r-grand" data-part="grand"><span class="lbl">Jami</span><span class="amt">63 000<span class="cur"> so'm</span></span></div>

      <div class="r-status" data-part="status"><span class="r-pill paid"><span class="dot"></span>To'landi · Karta</span></div>

      ${qr}

      <div class="r-orderno" data-part="orderno"><div class="lbl">BUYURTMA RAQAMI</div><div class="num">123</div></div>

      ${foot}
    </div>
  `;
}

async function testPrint(): Promise<void> {
  testPrinting.value = true;
  try {
    // First save current settings
    await window.electron.settings.saveReceipt({ ...settings });

    // Then test print
    const result = await window.electron.printer.test() as IpcResult;

    if (result.success) {
      alert('Test chop etildi!');
    } else {
      alert('Xatolik: ' + (result.error || 'Printer bilan muammo'));
    }
  } catch (error) {
    console.error('Test print failed:', error);
    alert('Test chop etishda xatolik');
  } finally {
    testPrinting.value = false;
  }
}

function handleLogoUpload(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];

  if (!file) return;

  // Check file size (max 2MB)
  if (file.size > 2 * 1024 * 1024) {
    alert('Logo hajmi 2MB dan oshmasligi kerak');
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    settings.logoBase64 = reader.result as string;
  };
  reader.readAsDataURL(file);
}

function removeLogo(): void {
  settings.logoBase64 = null;
}

function resetToDefaults(): void {
  if (confirm('Barcha sozlamalarni standartga qaytarishni xohlaysizmi?')) {
    Object.assign(settings, DEFAULT_RECEIPT_SETTINGS);
  }
}
</script>

<style scoped lang="scss">
.receipt-settings {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 12px;
  height: 100%;
}

.settings-form {
  background: var(--bg-surface);
  border-radius: 16px;
  padding: 24px;
  border: 1px solid var(--border-color);
  overflow-y: auto;
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

.field-hint {
  display: block;
  margin-top: 6px;
  font-size: 12px;
  color: var(--text-muted);
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

.form-textarea {
  width: 100%;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  padding: 12px 14px;
  background: var(--bg-surface);
  color: var(--text-primary);
  font-size: 15px;
  font-family: inherit;
  resize: vertical;
  min-height: 80px;

  &:focus {
    outline: none;
    border-color: var(--accent-primary);
  }

  &::placeholder {
    color: var(--text-muted);
  }
}

// Text-size segmented control
.size-options {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.size-btn {
  height: 44px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    border-color: var(--accent-primary);
  }

  &.active {
    background: var(--accent-primary);
    color: var(--on-primary);
    border-color: var(--accent-primary);
  }
}

// QR settings row
.qr-row {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.qr-box {
  flex-shrink: 0;
  width: 120px;
  height: 120px;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;

  img {
    width: 104px;
    height: 104px;
    image-rendering: pixelated;
  }
}

.qr-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-muted);
  text-align: center;
  padding: 8px;

  &.error {
    color: var(--error);
  }
}

.qr-fields {
  flex: 1;
  min-width: 0;

  .form-group:last-child {
    margin-bottom: 0;
  }
}

// Toggle switch
.toggle-label {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  font-size: 15px;
  color: var(--text-primary);
}

.toggle-input {
  display: none;
}

.toggle-switch {
  width: 48px;
  height: 26px;
  background: var(--bg-surface-2);
  border-radius: 13px;
  position: relative;
  transition: background 0.2s ease;
  flex-shrink: 0;

  &::after {
    content: '';
    position: absolute;
    top: 3px;
    left: 3px;
    width: 20px;
    height: 20px;
    background: white;
    border-radius: 50%;
    transition: transform 0.2s ease;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }
}

.toggle-input:checked + .toggle-switch {
  background: var(--accent-primary);

  &::after {
    transform: translateX(22px);
  }
}

// Logo upload
.logo-upload {
  margin-top: 8px;
}

.logo-preview {
  position: relative;
  width: 200px;
  height: 100px;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid var(--border-color);

  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    background: white;
  }
}

.remove-logo {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    background: var(--error);
  }
}

.upload-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 200px;
  height: 100px;
  border: 2px dashed var(--border-color);
  border-radius: 10px;
  cursor: pointer;
  color: var(--text-muted);
  transition: all 0.2s ease;

  &:hover {
    border-color: var(--accent-primary);
    color: var(--accent-primary);
  }
}

.upload-hint {
  font-size: 12px;
}

// Actions
.form-actions {
  display: flex;
  justify-content: space-between;
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid var(--border-color);
}

// Buttons
.btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 600;
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
  color: var(--on-primary);

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

// Preview section
.preview-section {
  display: flex;
  flex-direction: column;
  background: var(--bg-surface);
  border-radius: 16px;
  border: 1px solid var(--border-color);
  overflow: hidden;
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);

  h3 {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
  }
}

.preview-container {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
  background: var(--surface-2);
  display: flex;
  justify-content: center;
}

// On-screen receipt mock — mirrors the print template. Authored in em so the
// font-size set on this container (from fontScale) resizes the whole mock.
.receipt-preview {
  background: #fff;
  width: 300px;
  height: max-content;
  padding: 24px 20px;
  font-family: 'Manrope', 'Hanken Grotesk', system-ui, sans-serif;
  color: #000;
  line-height: 1.5;
  box-shadow: 0 18px 46px rgba(20, 22, 26, 0.14);
  border-radius: 14px;

  :deep(.r-logo) {
    text-align: center;
    margin: 4px 0 2px;
    color: #000;
    letter-spacing: 0.3em;
    font-size: 0.85em;
    font-weight: 600;
  }
  :deep(.r-logo.placeholder) {
    height: 46px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  :deep(.r-logo img) {
    width: 100%;
    height: auto;
    letter-spacing: 0;
  }

  :deep(.r-meta) {
    text-align: center;
    color: #000;
    font-size: 0.92em;
    line-height: 1.55;
    margin-top: 0.6em;
  }

  :deep(.r-rule) {
    border-top: 1px solid #000;
    margin: 0.9em 0;
  }

  :deep(.r-seclabel) {
    font-size: 0.82em;
    letter-spacing: 0.12em;
    color: #000;
    font-weight: 700;
    text-transform: uppercase;
    margin-bottom: 0.6em;
  }

  :deep(.r-kv) {
    display: flex;
    justify-content: space-between;
    gap: 0.8em;
    margin-bottom: 0.4em;
  }
  :deep(.r-kv .k) {
    color: #000;
    font-size: 0.92em;
    flex-shrink: 0;
  }
  :deep(.r-kv .v) {
    font-weight: 700;
    text-align: right;
  }
  :deep(.r-kv .v.nums) {
    font-variant-numeric: tabular-nums;
  }

  /* delivery block — stacked small label over big value (matches print) */
  :deep(.r-dblock) { margin-bottom: 0.7em; }
  :deep(.r-dblock:last-child) { margin-bottom: 0; }
  :deep(.r-dk) {
    font-size: 0.82em;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    font-weight: 700;
    color: #000;
    margin-bottom: 0.1em;
  }
  :deep(.r-dv-phone) {
    font-size: 1.4em;
    font-weight: 800;
    letter-spacing: -0.01em;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
  }
  :deep(.r-dv-addr) {
    font-size: 1.25em;
    font-weight: 700;
    line-height: 1.3;
    word-break: break-word;
  }

  :deep(.r-item) {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.7em;
    margin-bottom: 0.7em;
  }
  :deep(.r-item .name) {
    flex: 1;
    font-weight: 600;
  }
  :deep(.r-item .qty) {
    color: #000;
    font-size: 0.92em;
  }
  :deep(.r-item .sum) {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  :deep(.r-free) {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.7em;
    margin-bottom: 0.7em;
  }
  :deep(.r-free .name) {
    flex: 1;
    font-weight: 600;
  }
  :deep(.r-free .promo) {
    color: #000;
    font-size: 0.82em;
    font-weight: 600;
  }
  :deep(.r-free .badge) {
    background: #000;
    color: #fff;
    border-radius: 0.45em;
    padding: 0.1em 0.6em;
    font-size: 0.82em;
    font-weight: 700;
  }

  :deep(.r-tot) {
    display: flex;
    justify-content: space-between;
    color: #000;
    margin-bottom: 0.4em;
  }
  :deep(.r-tot .val) {
    font-variant-numeric: tabular-nums;
  }
  :deep(.r-tot .off) {
    color: #000;
    font-weight: 700;
  }
  :deep(.r-grand) {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-top: 0.7em;
  }
  :deep(.r-grand .lbl) {
    font-size: 1.15em;
    font-weight: 700;
  }
  :deep(.r-grand .amt) {
    font-size: 1.7em;
    font-weight: 800;
    letter-spacing: -0.01em;
    font-variant-numeric: tabular-nums;
  }
  :deep(.r-grand .cur) {
    font-size: 0.6em;
    font-weight: 600;
    color: #000;
  }

  :deep(.r-status) {
    text-align: center;
    margin-top: 1.1em;
  }
  :deep(.r-pill) {
    display: inline-flex;
    align-items: center;
    gap: 0.5em;
    border-radius: 999px;
    font-size: 0.92em;
    font-weight: 700;
  }
  :deep(.r-pill.paid) {
    background: #000;
    color: #fff;
    padding: 0.5em 1.1em;
  }
  :deep(.r-pill.paid .dot) {
    width: 0.45em;
    height: 0.45em;
    border-radius: 50%;
    background: #fff;
  }

  :deep(.r-qr) {
    text-align: center;
  }
  :deep(.r-qr img) {
    width: 96px;
    height: 96px;
    image-rendering: pixelated;
  }
  :deep(.r-qr .cap) {
    font-size: 0.92em;
    font-weight: 600;
    margin-top: 0.45em;
  }
  :deep(.r-qr .handle) {
    font-size: 0.82em;
    color: #000;
  }

  :deep(.r-orderno) {
    text-align: center;
    margin-top: 1.2em;
  }
  :deep(.r-orderno .lbl) {
    font-size: 0.82em;
    letter-spacing: 0.16em;
    color: #000;
    font-weight: 600;
  }
  :deep(.r-orderno .num) {
    font-size: 5em;
    font-weight: 800;
    line-height: 1;
    letter-spacing: -0.03em;
    margin-top: 0.06em;
  }

  :deep(.r-foot) {
    text-align: center;
    color: #000;
    font-size: 0.85em;
    line-height: 1.6;
    margin-top: 1.2em;
  }
  :deep(.r-foot .strong) {
    font-weight: 700;
    color: #000;
  }
  :deep(.r-foot .extra) {
    margin-top: 0.5em;
  }

  /* per-part size multipliers (from --sz-* vars on the container) + the
     click-to-resize affordance. Placed last so they win the font-size. */
  :deep([data-part='meta']) {
    font-size: calc(0.92em * var(--sz-meta, 1));
  }
  :deep([data-part='delivery']) {
    font-size: calc(1em * var(--sz-delivery, 1));
  }
  :deep([data-part='items']) {
    font-size: calc(1em * var(--sz-items, 1));
  }
  :deep([data-part='total']) {
    font-size: calc(1em * var(--sz-total, 1));
  }
  :deep([data-part='grand']) {
    font-size: calc(1em * var(--sz-grand, 1));
  }
  :deep([data-part='status']) {
    font-size: calc(1em * var(--sz-status, 1));
  }
  :deep([data-part='orderno']) {
    font-size: calc(1em * var(--sz-orderno, 1));
  }
  :deep([data-part='footer']) {
    font-size: calc(0.85em * var(--sz-footer, 1));
  }
  :deep([data-part]) {
    cursor: pointer;
    border-radius: 6px;
    transition: background 0.12s ease, outline-color 0.12s ease;
  }
  :deep([data-part]:hover) {
    background: var(--primary-weak);
    outline: 1px dashed var(--primary-border);
    outline-offset: 2px;
  }
}

/* per-part size editor below the preview */
.size-panel {
  margin: 12px 16px 4px;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 14px;
}
.size-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 8px;
}
.size-panel__x {
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}
.size-row {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-muted);
}
.size-slider {
  flex: 1;
}
.size-val {
  min-width: 48px;
  text-align: right;
  font-weight: 700;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}
.size-scope {
  display: inline-flex;
  gap: 2px;
  margin-top: 10px;
  padding: 2px;
  border-radius: var(--r-pill);
  background: var(--surface-2);
  border: 1px solid var(--border);
}
.size-scope button {
  padding: 5px 14px;
  border: none;
  border-radius: var(--r-pill);
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.size-scope button.active {
  background: var(--primary);
  color: var(--on-primary);
}
.size-hint {
  font-size: 13px;
  color: var(--text-muted);
}
</style>
