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
            placeholder="XARIDINGIZ UCHUN RAHMAT!"
          />
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
              placeholder="FIKR BILDIRISH UCHUN TEL:"
            />
          </div>

          <div class="form-group">
            <label class="form-label">Telefon raqam</label>
            <input
              type="text"
              v-model="settings.footerPhone"
              class="form-input"
              placeholder="+998 90 123 45 67"
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

      <div class="preview-container">
        <div class="receipt-preview" v-html="previewHtml"></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch, onMounted } from 'vue';
import type { ReceiptSettings } from 'src/types/settings';
import { DEFAULT_RECEIPT_SETTINGS } from 'src/types/settings';

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

// Load settings on mount
onMounted(async () => {
  await loadSettings();
  updatePreview();
});

// Watch for changes and update preview
watch(settings, () => {
  updatePreview();
}, { deep: true });

async function loadSettings(): Promise<void> {
  try {
    const electron = (window as unknown as { electron: { ipcRenderer: { invoke: (channel: string, ...args: unknown[]) => Promise<unknown> } } }).electron;
    const result = await electron.ipcRenderer.invoke('settings:getReceipt') as ReceiptSettings;
    Object.assign(settings, result);
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
}

async function saveSettings(): Promise<void> {
  saving.value = true;
  try {
    const electron = (window as unknown as { electron: { ipcRenderer: { invoke: (channel: string, ...args: unknown[]) => Promise<unknown> } } }).electron;
    const result = await electron.ipcRenderer.invoke('settings:saveReceipt', { ...settings }) as IpcResult;

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
    // Generate preview HTML locally (simpler approach)
    previewHtml.value = generateLocalPreview();
  } catch (error) {
    console.error('Failed to update preview:', error);
  }
}

function generateLocalPreview(): string {
  const thankYouHtml = settings.showThankYouMessage && settings.thankYouMessage
    ? `<div class="thank-you">${settings.thankYouMessage}</div>`
    : '';

  const footerPhoneHtml = settings.showFooterPhone
    ? `
      <div class="footer">
        ${settings.footerTitle ? `<div class="footer-title">${settings.footerTitle}</div>` : ''}
        ${settings.footerPhone ? `<div class="footer-phone">${settings.footerPhone}</div>` : ''}
      </div>
    `
    : '';

  const additionalFooterHtml = settings.showAdditionalFooter && settings.additionalFooterText
    ? `
      <div class="additional-footer">
        ${settings.additionalFooterText.split('\n').map(line => `<div>${line}</div>`).join('')}
      </div>
    `
    : '';

  // Determine logo HTML
  let logoSection = '';
  if (settings.useDefaultLogo) {
    logoSection = '<div class="logo-placeholder">LOGO</div>';
  } else if (settings.logoBase64) {
    logoSection = `<div class="logo"><img src="${settings.logoBase64}" /></div>`;
  }

  return `
    <div class="receipt-mock">
      ${logoSection}

      <div class="order-info">
        <div><span class="label">Sana:</span> 15.01.2025 14:30</div>
        <div><span class="label">Kassir:</span> Kassir Ismi</div>
        <div><span class="label">Chek №:</span> 123</div>
        <div><span class="label">Turi:</span> Zal</div>
      </div>

      <div class="divider"></div>

      <table class="items-table">
        <thead>
          <tr>
            <th>Nomi</th>
            <th>Soni</th>
            <th>Summa</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Lavash Klassik</td>
            <td>2</td>
            <td>50 000</td>
          </tr>
          <tr>
            <td>Cola 0.5L</td>
            <td>1</td>
            <td>8 000</td>
          </tr>
          <tr>
            <td>Kartoshka Fri</td>
            <td>1</td>
            <td>12 000</td>
          </tr>
        </tbody>
      </table>

      <div class="divider"></div>

      ${thankYouHtml}

      <div class="total-section">
        <div class="total-row">
          <span>Summa:</span>
          <span>70 000 so'm</span>
        </div>
        <div class="total-row grand-total">
          <span>JAMI:</span>
          <span>70 000 so'm</span>
        </div>
      </div>

      <div class="divider"></div>

      <div class="client-info">
        <div class="client-label">Mijoz tel:</div>
        <div class="client-value">+998 90 123 45 67</div>
      </div>

      <div class="divider"></div>

      <div class="display_id">123</div>

      ${footerPhoneHtml}
      ${additionalFooterHtml}
    </div>
  `;
}

async function testPrint(): Promise<void> {
  testPrinting.value = true;
  try {
    // First save current settings
    const electron = (window as unknown as { electron: { ipcRenderer: { invoke: (channel: string, ...args: unknown[]) => Promise<unknown> } } }).electron;
    await electron.ipcRenderer.invoke('settings:saveReceipt', { ...settings });

    // Then test print
    const result = await electron.ipcRenderer.invoke('print-test') as IpcResult;

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
  grid-template-columns: 1fr 400px;
  gap: 24px;
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
    background: #c62828;
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
  padding: 20px;
  overflow-y: auto;
  background: #e5e5e5;
  display: flex;
  justify-content: center;
}

.receipt-preview {
  background: white;
  width: 300px;
  padding: 15px;
  font-size: 12px;
  font-family: 'Courier New', monospace;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  color: #000;

  :deep(.logo-placeholder) {
    text-align: center;
    padding: 20px;
    background: #f5f5f5;
    border: 1px dashed #ccc;
    margin-bottom: 15px;
    font-weight: bold;
    color: #999;
  }

  :deep(.logo) {
    text-align: center;
    margin-bottom: 15px;

    img {
      max-width: 200px;
      height: auto;
    }
  }

  :deep(.order-info) {
    font-size: 11px;
    line-height: 1.6;
    margin-bottom: 10px;

    .label {
      font-weight: bold;
      display: inline-block;
      min-width: 60px;
    }
  }

  :deep(.divider) {
    border-top: 1px dashed #000;
    margin: 10px 0;
  }

  :deep(.items-table) {
    width: 100%;
    font-size: 11px;
    border-collapse: collapse;

    th {
      text-align: left;
      padding: 5px 0;
      border-bottom: 1px solid #000;
      font-size: 10px;
    }

    th:nth-child(2),
    th:nth-child(3) {
      text-align: right;
    }

    td {
      padding: 4px 0;
      vertical-align: top;
    }

    td:nth-child(2),
    td:nth-child(3) {
      text-align: right;
    }
  }

  :deep(.thank-you) {
    text-align: center;
    font-size: 11px;
    font-weight: bold;
    margin: 10px 0;
    padding: 8px 0;
  }

  :deep(.total-section) {
    margin: 10px 0;

    .total-row {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      padding: 3px 0;

      &.grand-total {
        font-size: 13px;
        font-weight: bold;
        border-top: 1px solid #000;
        padding-top: 8px;
        margin-top: 5px;
      }
    }
  }

  :deep(.client-info) {
    margin: 8px 0;
    font-size: 10px;

    .client-label {
      font-weight: bold;
    }
  }

  :deep(.display_id) {
    font-size: 36px;
    font-weight: bold;
    text-align: center;
    margin: 15px 0;
  }

  :deep(.footer) {
    text-align: center;
    font-size: 10px;
    margin-top: 15px;

    .footer-title {
      font-weight: bold;
      margin-bottom: 3px;
    }

    .footer-phone {
      font-size: 12px;
      font-weight: bold;
    }
  }

  :deep(.additional-footer) {
    text-align: center;
    font-size: 9px;
    margin-top: 10px;
    line-height: 1.5;
  }
}
</style>
