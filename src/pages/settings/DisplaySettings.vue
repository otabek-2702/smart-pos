<template>
  <div class="display-settings">
    <div class="settings-form">
      <h2 class="section-title">Displey sozlamalari</h2>
      <p class="section-description">
        Mijozlar displeyi ko'rinishini sozlang
      </p>

      <!-- Auto-open Toggle Section -->
      <div class="form-section">
        <h3 class="form-section-title">
          <q-icon name="desktop_windows" size="20px" />
          Mijozlar displeyi
        </h3>

        <div class="toggle-row">
          <div class="toggle-info">
            <div class="toggle-title">Avtomatik ochish</div>
            <div class="toggle-hint">
              {{
                settings.clientDisplayEnabled
                  ? "Yoqilgan: ikkinchi monitor ulansa, displey avtomatik ochiladi"
                  : "O'chirilgan: ochiq displey yopiladi va avtomatik ochilmaydi"
              }}
            </div>
          </div>
          <q-toggle
            v-model="settings.clientDisplayEnabled"
            color="green"
            size="lg"
          />
        </div>
      </div>

      <!-- Create-order page: category filter layout -->
      <div class="form-section">
        <h3 class="form-section-title">
          <q-icon name="grid_view" size="20px" />
          Buyurtma sahifasi — kategoriyalar
        </h3>

        <div class="form-group">
          <label class="form-label">Kategoriyalar joylashuvi</label>
          <div class="seg-group">
            <button
              type="button"
              class="seg-opt"
              :class="{ active: categoryLayout === 'scroll' }"
              @click="setCategoryLayout('scroll')"
            >
              <q-icon name="view_column" size="18px" /> Bir qator (scroll)
            </button>
            <button
              type="button"
              class="seg-opt"
              :class="{ active: categoryLayout === 'wrap' }"
              @click="setCategoryLayout('wrap')"
            >
              <q-icon name="view_module" size="18px" /> Ko'p qator
            </button>
          </div>
          <div class="form-hint">
            Bir qator: kategoriyalar yon tomonga suriladi. Ko'p qator: hammasi
            bir nechta qatorda ko'rinadi.
          </div>
        </div>
      </div>

      <!-- Payment screen: methods layout + quick-amount templates -->
      <div class="form-section">
        <h3 class="form-section-title">
          <q-icon name="payments" size="20px" />
          To'lov ekrani
        </h3>

        <div class="form-group">
          <label class="form-label">To'lov turlari joylashuvi</label>
          <div class="seg-group">
            <button
              type="button"
              class="seg-opt"
              :class="{ active: pPrefs.methodsLayout === 'grid' }"
              @click="setMethodsLayout('grid')"
            >
              <q-icon name="grid_view" size="18px" /> Tarmoq
            </button>
            <button
              type="button"
              class="seg-opt"
              :class="{ active: pPrefs.methodsLayout === 'vertical' }"
              @click="setMethodsLayout('vertical')"
            >
              <q-icon name="view_agenda" size="18px" /> Vertikal
            </button>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Tezkor summa tugmalari</label>
          <div class="qa-list">
            <div v-for="(a, i) in quickAmountsDraft" :key="i" class="qa-item">
              <input
                v-model.number="quickAmountsDraft[i]"
                class="form-input qa-input"
                inputmode="numeric"
                data-keyboard-nums="true"
              />
              <button type="button" class="qa-del" aria-label="O'chirish" @click="removeQuickAmount(i)">
                <q-icon name="close" size="18px" />
              </button>
            </div>
            <button type="button" class="qa-add" @click="addQuickAmount">
              <q-icon name="add" size="18px" /> Qo'shish
            </button>
          </div>
          <button
            type="button"
            class="btn btn-primary qa-save"
            :disabled="!quickAmountsValid"
            @click="saveQuickAmounts"
          >
            <q-icon name="save" size="18px" /> Saqlash
          </button>
        </div>
      </div>

      <!-- Company Name Section -->
      <div class="form-section">
        <h3 class="form-section-title">
          <q-icon name="store" size="20px" />
          Kompaniya nomi
        </h3>

        <div class="form-group">
          <label class="form-label">Nomi</label>
          <input
            type="text"
            v-model="settings.companyName"
            class="form-input"
            placeholder="SMART FOOD"
            maxlength="30"
          />
        </div>

        <div class="form-group">
          <label class="form-label">Shrift o'lchami</label>
          <div class="size-options">
            <label
              v-for="size in fontSizes"
              :key="size.value"
              class="size-option"
              :class="{ active: settings.titleFontSize === size.value }"
            >
              <input
                type="radio"
                v-model="settings.titleFontSize"
                :value="size.value"
                hidden
              />
              <span class="size-preview" :style="{ fontSize: size.preview }">Aa</span>
              <span class="size-label">{{ size.label }}</span>
            </label>
          </div>
        </div>
      </div>

      <!-- Logo Section -->
      <div class="form-section">
        <h3 class="form-section-title">
          <q-icon name="image" size="20px" />
          Logotip
        </h3>

        <div class="logo-row">
          <div class="logo-preview">
            <img
              :src="settings.logoBase64 || placeholderLogo"
              :class="{ 'is-placeholder': !settings.logoBase64 }"
              alt="Logotip"
            />
          </div>
          <div class="logo-actions">
            <input
              ref="logoInput"
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              hidden
              @change="onLogoFile"
            />
            <button type="button" class="btn btn-secondary" @click="pickLogo">
              <q-icon name="upload" size="18px" />
              Rasm tanlash
            </button>
            <button
              v-if="settings.logoBase64"
              type="button"
              class="btn btn-secondary"
              @click="removeLogo"
            >
              <q-icon name="delete" size="18px" />
              O'chirish
            </button>
            <div class="logo-hint">
              {{ settings.logoBase64 ? 'Saqlash tugmasini bosing' : 'Standart placeholder. PNG / JPG / SVG (≤ 1MB).' }}
            </div>
          </div>
        </div>
      </div>

      <!-- Brand Color Section -->
      <div class="form-section">
        <h3 class="form-section-title">
          <q-icon name="palette" size="20px" />
          Asosiy rang
        </h3>

        <div class="form-group">
          <label class="form-label">Rang tanlang</label>
          <div class="color-picker-row">
            <div class="color-input-wrapper">
              <input
                type="color"
                v-model="settings.brandColor"
                class="color-input"
              />
              <div
                class="color-preview-box"
                :style="{ background: settings.brandColor }"
              ></div>
            </div>
            <input
              type="text"
              v-model="settings.brandColor"
              class="form-input hex-input"
              placeholder="#ff6b00"
              maxlength="7"
            />
          </div>
        </div>

        <!-- Preset Colors -->
        <div class="form-group">
          <label class="form-label">Tayyor ranglar</label>
          <div class="preset-colors">
            <button
              v-for="color in presetColors"
              :key="color.value"
              type="button"
              class="preset-color"
              :class="{ active: settings.brandColor === color.value }"
              :style="{ background: color.value }"
              :title="color.name"
              @click="settings.brandColor = color.value"
            />
          </div>
        </div>

        <!-- Auto-generated colors preview -->
        <div class="generated-colors">
          <div class="generated-label">Avtomatik yaratilgan ranglar:</div>
          <div class="generated-swatches">
            <div class="swatch-item">
              <div
                class="swatch"
                :style="{ background: `linear-gradient(145deg, ${computedColors.gradientStart}, ${computedColors.gradientEnd})` }"
              ></div>
              <span>Gradient</span>
            </div>
            <div class="swatch-item">
              <div
                class="swatch"
                :style="{ background: settings.headerTextColor }"
              ></div>
              <span>Matn</span>
            </div>
            <div class="swatch-item">
              <div
                class="swatch"
                :style="{ background: computedColors.readySectionBg }"
              ></div>
              <span>Tayyor fon</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Ready Color Section -->
      <div class="form-section">
        <h3 class="form-section-title">
          <q-icon name="check_circle" size="20px" />
          "Tayyor" bo'lim rangi
        </h3>

        <div class="form-group">
          <label class="form-label">Rang tanlang</label>
          <div class="color-picker-row">
            <div class="color-input-wrapper">
              <input
                type="color"
                v-model="settings.readyColor"
                class="color-input"
              />
              <div
                class="color-preview-box"
                :style="{ background: settings.readyColor }"
              ></div>
            </div>
            <input
              type="text"
              v-model="settings.readyColor"
              class="form-input hex-input"
              placeholder="#16a34a"
              maxlength="7"
            />
          </div>
        </div>

        <!-- Ready Preset Colors -->
        <div class="form-group">
          <label class="form-label">Tayyor ranglar</label>
          <div class="preset-colors">
            <button
              v-for="color in readyPresetColors"
              :key="color.value"
              type="button"
              class="preset-color"
              :class="{ active: settings.readyColor === color.value }"
              :style="{ background: color.value }"
              :title="color.name"
              @click="settings.readyColor = color.value"
            />
          </div>
        </div>
      </div>

      <!-- Header Text Color Section -->
      <div class="form-section">
        <h3 class="form-section-title">
          <q-icon name="format_color_text" size="20px" />
          Sarlavha matn rangi
        </h3>

        <div class="form-group">
          <label class="form-label">Rang tanlang (kompaniya nomi, sana, vaqt)</label>
          <div class="color-picker-row">
            <div class="color-input-wrapper">
              <input
                type="color"
                v-model="settings.headerTextColor"
                class="color-input"
              />
              <div
                class="color-preview-box"
                :style="{ background: settings.headerTextColor }"
              ></div>
            </div>
            <input
              type="text"
              v-model="settings.headerTextColor"
              class="form-input hex-input"
              placeholder="#ffffff"
              maxlength="7"
            />
          </div>
        </div>

        <!-- Text Color Presets -->
        <div class="form-group">
          <label class="form-label">Tayyor ranglar</label>
          <div class="preset-colors">
            <button
              v-for="color in textPresetColors"
              :key="color.value"
              type="button"
              class="preset-color"
              :class="{ active: settings.headerTextColor === color.value }"
              :style="{ background: color.value }"
              :title="color.name"
              @click="settings.headerTextColor = color.value"
            />
          </div>
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

    <!-- Live Preview -->
    <div class="preview-section">
      <div class="preview-header">
        <h3>Ko'rinish</h3>
        <button
          type="button"
          class="btn-open-display"
          @click="openClientDisplay"
          :disabled="displayLoading"
          :title="openButtonTitle"
        >
          <q-icon :name="displayStatus.isOpen ? 'visibility' : 'open_in_new'" size="18px" />
          <span v-if="displayLoading">Yuklanmoqda...</span>
          <span v-else-if="displayStatus.isOpen">Displeyni ko'rsatish</span>
          <span v-else>Displeyni ochish</span>
        </button>
      </div>

      <!-- Display Status Info -->
      <div class="display-status" v-if="displayStatus.isOpen || !displayStatus.hasSecondMonitor">
        <q-icon 
          :name="displayStatus.isOpen ? 'check_circle' : 'info'" 
          :class="displayStatus.isOpen ? 'status-open' : 'status-info'"
          size="16px" 
        />
        <span v-if="displayStatus.isOpen && displayStatus.mode === 'secondary'">
          Displey ikkinchi monitorda ochiq
        </span>
        <span v-else-if="displayStatus.isOpen && displayStatus.mode === 'preview'">
          Displey ko'rish rejimida ochiq
        </span>
        <span v-else-if="!displayStatus.hasSecondMonitor">
          Ikkinchi monitor topilmadi - ko'rish rejimida ochiladi
        </span>
      </div>

      <div class="preview-container">
        <div
          class="display-preview"
          :style="{
            background: `linear-gradient(145deg, ${computedColors.gradientStart}, ${computedColors.gradientEnd})`
          }"
        >
          <!-- Mini Header -->
          <div class="preview-header-bar">
            <div class="preview-datetime" :style="{ color: settings.headerTextColor }">
              <div class="preview-date">16 Yanvar 2025</div>
              <div class="preview-day">Payshanba</div>
            </div>
            <div
              class="preview-title"
              :style="{
                fontSize: fontSizeMap[settings.titleFontSize],
                color: settings.headerTextColor
              }"
            >
              {{ settings.companyName || 'COMPANY NAME' }}
            </div>
            <div class="preview-time" :style="{ color: settings.headerTextColor }">
              14:30
            </div>
          </div>

          <!-- Content -->
          <div class="preview-content">
            <!-- Processing -->
            <div class="preview-column">
              <h4 :style="{ color: settings.headerTextColor }">JARAYONDA</h4>
              <div class="preview-orders">
                <div
                  class="preview-order processing"
                  :style="{ color: settings.brandColor }"
                >
                  05
                </div>
                <div
                  class="preview-order processing"
                  :style="{ color: settings.brandColor }"
                >
                  06
                </div>
                <div
                  class="preview-order processing"
                  :style="{ color: settings.brandColor }"
                >
                  07
                </div>
              </div>
            </div>

            <!-- Ready -->
            <div
              class="preview-column ready-col"
              :style="{ background: computedColors.readySectionBg }"
            >
              <h4 :style="{ color: settings.readyColor }">TAYYOR</h4>
              <div class="preview-orders">
                <div
                  class="preview-order ready"
                  :style="{
                    color: settings.readyColor,
                    borderColor: settings.readyColor
                  }"
                >
                  03
                </div>
                <div
                  class="preview-order ready"
                  :style="{
                    color: settings.readyColor,
                    borderColor: settings.readyColor
                  }"
                >
                  04
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import type { DisplaySettings } from 'src/types/settings';
import { useCategoryLayout, type CategoryLayout } from 'src/composables/useCategoryLayout';
import { usePaymentPrefs, type MethodsLayout } from 'src/composables/usePaymentPrefs';
import {
  DEFAULT_DISPLAY_SETTINGS,
  generateDisplayColors,
} from 'src/types/settings';

// Types
interface IpcResult {
  success: boolean;
  error?: string;
}

interface DisplayStatusResult {
  isOpen: boolean;
  mode: 'secondary' | 'preview' | 'none';
  hasSecondMonitor: boolean;
}

interface FontSizeOption {
  value: DisplaySettings['titleFontSize'];
  label: string;
  preview: string;
}

interface PresetColor {
  value: string;
  name: string;
}

// Electron IPC helper
function getElectron() {
  return window.electron;
}

// Built-in placeholder until a real logo is uploaded (or shipped as default).
const placeholderLogo = new URL('../../assets/logo.png', import.meta.url).href;
const logoInput = ref<HTMLInputElement | null>(null);

// State
const settings = reactive<DisplaySettings>({ ...DEFAULT_DISPLAY_SETTINGS });
const saving = ref(false);

// Category-filter layout for the Create-order page (kv-backed, saves on change).
const { layout: categoryLayout, save: saveCategoryLayout } = useCategoryLayout();
function setCategoryLayout(v: CategoryLayout): void {
  void saveCategoryLayout(v);
}

// Payment-screen prefs: methods layout (live) + quick-amount templates (draft + save).
const { prefs: pPrefs, save: savePaymentPrefs } = usePaymentPrefs();
function setMethodsLayout(v: MethodsLayout): void {
  void savePaymentPrefs({ ...pPrefs.value, methodsLayout: v });
}
const quickAmountsDraft = ref<number[]>([...pPrefs.value.quickAmounts]);
const quickAmountsValid = computed(
  () => quickAmountsDraft.value.length > 0 && quickAmountsDraft.value.every((n) => Number(n) > 0),
);
function addQuickAmount(): void { quickAmountsDraft.value.push(1000); }
function removeQuickAmount(i: number): void { quickAmountsDraft.value.splice(i, 1); }
function saveQuickAmounts(): void {
  void savePaymentPrefs({
    ...pPrefs.value,
    quickAmounts: quickAmountsDraft.value.map(Number).filter((n) => n > 0),
  });
}

function pickLogo(): void {
  logoInput.value?.click();
}

function onLogoFile(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = ''; // allow re-selecting the same file later
  if (!file) return;
  if (file.size > 1_000_000) {
    alert('Rasm hajmi 1MB dan oshmasligi kerak');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    settings.logoBase64 = typeof reader.result === 'string' ? reader.result : null;
  };
  reader.onerror = () => alert('Rasmni o\'qishda xatolik');
  reader.readAsDataURL(file);
}

function removeLogo(): void {
  settings.logoBase64 = null;
}
const displayLoading = ref(false);
const displayStatus = reactive<DisplayStatusResult>({
  isOpen: false,
  mode: 'none',
  hasSecondMonitor: false,
});

// Font size options
const fontSizes: FontSizeOption[] = [
  { value: 'small', label: 'Kichik', preview: '14px' },
  { value: 'medium', label: "O'rta", preview: '18px' },
  { value: 'large', label: 'Katta', preview: '22px' },
  { value: 'xlarge', label: 'Juda katta', preview: '26px' },
];

// Font size map for preview (scaled down)
const fontSizeMap: Record<DisplaySettings['titleFontSize'], string> = {
  small: '0.8rem',
  medium: '1rem',
  large: '1.2rem',
  xlarge: '1.4rem',
};

// Preset brand colors
const presetColors: PresetColor[] = [
  { value: '#ff6b00', name: 'Apelsin' },
  { value: '#e53935', name: 'Qizil' },
  { value: '#d81b60', name: 'Pushti' },
  { value: '#8e24aa', name: 'Binafsha' },
  { value: '#5e35b1', name: "Ko'k binafsha" },
  { value: '#3949ab', name: 'Indigo' },
  { value: '#1e88e5', name: "Ko'k" },
  { value: '#00acc1', name: 'Moviy' },
  { value: '#00897b', name: 'Teal' },
  { value: '#43a047', name: 'Yashil' },
  { value: '#7cb342', name: 'Och yashil' },
  { value: '#fdd835', name: 'Sariq' },
  { value: '#fb8c00', name: 'Jigarrang' },
  { value: '#6d4c41', name: 'Qahva' },
  { value: '#546e7a', name: 'Kulrang ko\'k' },
  { value: '#1a1a2e', name: 'Qora' },
];

// Ready section preset colors
const readyPresetColors: PresetColor[] = [
  { value: '#16a34a', name: 'Yashil (standart)' },
  { value: '#22c55e', name: 'Och yashil' },
  { value: '#059669', name: 'Zumrad' },
  { value: '#0d9488', name: 'Teal' },
  { value: '#0891b2', name: 'Moviy' },
  { value: '#2563eb', name: "Ko'k" },
  { value: '#7c3aed', name: 'Binafsha' },
  { value: '#db2777', name: 'Pushti' },
];

// Text color presets
const textPresetColors: PresetColor[] = [
  { value: '#ffffff', name: 'Oq' },
  { value: '#f8fafc', name: 'Oq (yumshoq)' },
  { value: '#e2e8f0', name: 'Kulrang oq' },
  { value: '#fef3c7', name: 'Sariq oq' },
  { value: '#1a1a2e', name: 'Qora' },
  { value: '#334155', name: 'Kulrang qora' },
  { value: '#0f172a', name: 'To\'q qora' },
  { value: '#fef08a', name: 'Sariq' },
];

// Computed colors
const computedColors = computed(() => {
  return generateDisplayColors(settings.brandColor, settings.readyColor);
});

// Manual open works regardless of the auto-open toggle.
const openButtonTitle = computed(() => 'Mijozlar displeyini ochish');



// Load settings on mount
onMounted(async () => {
  await loadSettings();
  await checkDisplayStatus();
});

async function loadSettings(): Promise<void> {
  try {
    const result = await getElectron().settings.getDisplay() as DisplaySettings;
    Object.assign(settings, result);
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
}

async function saveSettings(): Promise<void> {
  saving.value = true;
  try {
    const result = await getElectron().settings.saveDisplay({ ...settings }) as IpcResult;

    if (result.success) {
      alert('Sozlamalar saqlandi! Displey avtomatik yangilandi.');
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

function resetToDefaults(): void {
  if (confirm('Barcha sozlamalarni standartga qaytarishni xohlaysizmi?')) {
    Object.assign(settings, DEFAULT_DISPLAY_SETTINGS);
  }
}

// Client display control
async function checkDisplayStatus(): Promise<void> {
  try {
    const result = await getElectron().clientDisplay.status() as DisplayStatusResult;
    Object.assign(displayStatus, result);
  } catch (error) {
    console.error('Failed to check display status:', error);
  }
}

async function openClientDisplay(): Promise<void> {
  displayLoading.value = true;
  try {
    await getElectron().clientDisplay.open();
    await checkDisplayStatus();
  } catch (error) {
    console.error('Failed to open client display:', error);
    alert('Displeyni ochishda xatolik');
  } finally {
    displayLoading.value = false;
  }
}
</script>

<style scoped lang="scss">
.display-settings {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  height: 100%;
}

.settings-form {
  background: var(--bg-surface);
  border-radius: 16px;
  padding: 20px;
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
  margin-bottom: 24px;
  padding-bottom: 20px;
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

// Toggle row (auto-open client display)
.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  background: var(--bg-surface-2);
  border-radius: 12px;
  border: 1px solid var(--border-color);
}

.toggle-info {
  flex: 1;
  min-width: 0;
}

.toggle-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.toggle-hint {
  font-size: 13px;
  color: var(--text-muted);
  line-height: 1.4;
}

// Size options
.size-options {
  display: flex;
  gap: 10px;
}

.size-option {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 8px;
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

.size-preview {
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 6px;
}

.size-label {
  font-size: 11px;
  color: var(--text-muted);
}

// Color picker
.color-picker-row {
  display: flex;
  gap: 12px;
  align-items: center;
}

.color-input-wrapper {
  position: relative;
  width: 60px;
  height: 44px;
}

.color-input {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}

.color-preview-box {
  width: 100%;
  height: 100%;
  border-radius: 10px;
  border: 2px solid var(--border-color);
  pointer-events: none;
}

.hex-input {
  flex: 1;
  max-width: 120px;
  font-family: monospace;
  text-transform: uppercase;
}

// Preset colors
.preset-colors {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.preset-color {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    transform: scale(1.1);
  }

  &.active {
    border-color: var(--text-primary);
    box-shadow: 0 0 0 2px var(--bg-surface), 0 0 0 4px var(--text-primary);
  }
}

// Generated colors
.generated-colors {
  margin-top: 16px;
  padding: 14px;
  background: var(--bg-surface-2);
  border-radius: 12px;
}

.generated-label {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 12px;
}

.generated-swatches {
  display: flex;
  gap: 16px;
}

.swatch-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;

  span {
    font-size: 11px;
    color: var(--text-muted);
  }
}

.swatch {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

// Logo
.logo-row {
  display: flex;
  gap: 16px;
  align-items: center;
}
.logo-preview {
  width: 120px;
  height: 120px;
  flex-shrink: 0;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  background: var(--bg-surface-2);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;

  img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
  img.is-placeholder { opacity: 0.45; }
}
.logo-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}
.logo-hint {
  font-size: 12px;
  color: var(--text-muted);
}

// Actions
.form-actions {
  display: flex;
  justify-content: space-between;
  margin-top: 24px;
  padding-top: 20px;
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
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-color);

  h3 {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
  }
}

.btn-open-display {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-radius: 10px;
  border: 1px solid var(--accent-primary);
  background: transparent;
  color: var(--accent-primary);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover:not(:disabled) {
    background: var(--accent-primary);
    color: white;
  }

  &:active:not(:disabled) {
    transform: scale(0.97);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

.display-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: var(--bg-surface-2);
  font-size: 13px;
  color: var(--text-muted);

  .status-open {
    color: var(--accent-primary);
  }

  .status-info {
    color: var(--text-muted);
  }
}

.preview-container {
  flex: 1;
  padding: 16px;
  background: #1a1a1a;
  display: flex;
  justify-content: center;
  align-items: start;
}

// Display preview (mini version)
.display-preview {
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
}

.preview-header-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
}

.preview-datetime {
  .preview-date {
    font-size: 10px;
    font-weight: 600;
  }
  .preview-day {
    font-size: 9px;
    text-transform: uppercase;
  }
}

.preview-title {
  font-weight: 800;
  letter-spacing: 2px;
  text-transform: uppercase;
}

.preview-time {
  font-size: 10px;
  font-weight: 600;
}

.preview-content {
  flex: 1;
  display: flex;
}

.preview-column {
  flex: 1;
  padding: 8px;
  display: flex;
  flex-direction: column;

  h4 {
    text-align: center;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 1px;
    margin: 0 0 8px 0;
  }
}

.ready-col {
  border-radius: 0;
  border-top-left-radius: 5px;
}

.preview-orders {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: center;
}

.preview-order {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  background: white;

  &.ready {
    border: 2px solid;
  }
}

/* segmented option group (category layout) */
.seg-group {
  display: inline-flex;
  gap: 6px;
  background: var(--surface-2);
  padding: 5px;
  border-radius: var(--r-md);
  border: 1px solid var(--line);
  flex-wrap: wrap;
}
.seg-opt {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 44px;
  padding: 0 18px;
  border: none;
  background: transparent;
  border-radius: var(--r-sm);
  color: var(--ink-2);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;

  &:hover { color: var(--ink); }
  &.active { background: var(--surface); color: var(--brand); box-shadow: var(--shadow-sm); }
}

/* quick-amount templates editor */
.qa-list { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.qa-item { position: relative; display: inline-flex; align-items: center; }
.qa-input { width: 120px; padding-right: 34px; }
.qa-del {
  position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
  width: 24px; height: 24px; border: none; background: transparent;
  color: var(--ink-3); cursor: pointer; display: inline-flex; align-items: center; justify-content: center;
}
.qa-add {
  height: 44px; padding: 0 16px; border-radius: var(--r-md);
  border: 1px dashed var(--line-strong); background: var(--surface-2); color: var(--ink-2);
  font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
}
.qa-save { margin-top: 12px; }
</style>