<template>
  <div class="dc-settings">
    <div class="settings-form">
      <h2 class="section-title">Promokod sozlamalari</h2>
      <p class="section-description">
        Kassir promokod bera oladimi va buning uchun qaysi PIN so'ralishini
        belgilang. Menejerlar har doim PINsiz promokod bera oladi.
      </p>

      <div class="form-section">
        <div class="toggle-row">
          <div class="toggle-info">
            <div class="toggle-title">Kassir promokod bera oladi</div>
            <div class="toggle-hint">
              {{
                form.cashierAllowed
                  ? "Yoqilgan: kassir promokod berishdan oldin PIN kiritadi"
                  : "O'chirilgan: faqat menejer promokod bera oladi"
              }}
            </div>
          </div>
          <q-toggle v-model="form.cashierAllowed" color="green" size="lg" />
        </div>

        <div v-if="form.cashierAllowed" class="form-group">
          <label class="form-label">Promokod PIN (4 raqam)</label>

          <!-- PIN already set → show a change button, not the raw PIN -->
          <div v-if="!showPinField" class="pin-set">
            <span class="pin-mask">PIN o'rnatilgan ••••</span>
            <button type="button" class="btn-change" @click="startEditPin">
              <q-icon name="edit" size="16px" /> PINni o'zgartirish
            </button>
          </div>

          <!-- entering / changing the PIN -->
          <template v-else>
            <div class="pin-edit-row">
              <input
                v-model="form.pin"
                class="form-input pin"
                inputmode="numeric"
                data-keyboard-nums="true"
                maxlength="4"
                placeholder="••••"
                @input="onPinInput"
              />
              <button v-if="hasPin" type="button" class="btn-cancel" @click="cancelEditPin">Bekor</button>
            </div>
            <div class="form-hint">Kassir promokod berganda shu PIN so'raladi.</div>
          </template>
        </div>
      </div>

      <div class="form-actions">
        <button type="button" class="btn btn-primary" :disabled="saving || !isValid" @click="onSave">
          <q-icon v-if="!saving" name="save" size="20px" />
          <span v-if="saving">Saqlanmoqda...</span>
          <span v-else>Saqlash</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, computed, ref } from 'vue';
import { toast } from 'vue3-toastify';
import { useDiscountPolicy, type DiscountPolicy } from 'src/composables/useDiscountPolicy';

const { policy, save } = useDiscountPolicy();
const form = reactive<DiscountPolicy>({ ...policy.value });
const saving = ref(false);

// A PIN is already configured?
const hasPin = computed(() => /^\d{4}$/.test(policy.value.pin));
// Editing/entering the PIN (always when none set yet; or after "change").
const editingPin = ref(false);
const showPinField = computed(() => !hasPin.value || editingPin.value);

function startEditPin(): void {
  editingPin.value = true;
  form.pin = '';
}
function cancelEditPin(): void {
  editingPin.value = false;
  form.pin = policy.value.pin;
}

const isValid = computed(
  () => !form.cashierAllowed || !showPinField.value || /^\d{4}$/.test(form.pin),
);

function onPinInput(): void {
  form.pin = form.pin.replace(/[^\d]/g, '').slice(0, 4);
}

async function onSave(): Promise<void> {
  if (!isValid.value || saving.value) return;
  saving.value = true;
  try {
    // Keep the existing PIN when the field isn't being edited.
    const pin = form.cashierAllowed ? (showPinField.value ? form.pin : policy.value.pin) : '';
    await save({ cashierAllowed: form.cashierAllowed, pin });
    editingPin.value = false;
    toast.success('Saqlandi');
  } catch (e) {
    console.error('Failed to save discount policy:', e);
    toast.error('Saqlashda xatolik');
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped lang="scss">
.dc-settings { padding: 4px; }
.settings-form { max-width: 560px; }
.section-title { font-size: 22px; font-weight: 700; color: var(--text-primary); margin-bottom: 6px; }
.section-description { font-size: 14px; color: var(--text-muted); line-height: 1.55; margin-bottom: 20px; }
.form-section {
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 18px;
  margin-bottom: 18px;
}
.toggle-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.toggle-title { font-size: 15px; font-weight: 600; color: var(--text-primary); }
.toggle-hint { font-size: 13px; color: var(--text-muted); margin-top: 2px; }
.form-group { margin-top: 16px; }
.form-label { display: block; font-size: 13px; font-weight: 600; color: var(--text-muted); margin-bottom: 6px; }
.form-input {
  width: 100%;
  height: 48px;
  padding: 0 14px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: var(--bg-surface-2);
  color: var(--text-primary);
  font-size: 16px;
  &:focus { outline: none; border-color: var(--accent-primary, #ff7a00); }
}
.form-input.pin { letter-spacing: 8px; font-weight: 700; text-align: center; max-width: 180px; }
.form-hint { font-size: 12px; color: var(--text-muted); margin-top: 6px; }

.pin-set { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.pin-mask { font-size: 15px; font-weight: 700; color: var(--text-primary); letter-spacing: 2px; }
.pin-edit-row { display: flex; align-items: center; gap: 12px; }
.btn-change, .btn-cancel {
  height: 40px; padding: 0 16px; border-radius: 10px; cursor: pointer;
  border: 1px solid var(--border-color); background: var(--bg-surface-2); color: var(--text-primary);
  font-size: 14px; font-weight: 600;
  display: inline-flex; align-items: center; gap: 6px;
  &:active { transform: scale(0.97); }
}
.btn-change { border-color: var(--accent-primary, #ff7a00); color: var(--accent-primary, #ff7a00); }
.form-actions { display: flex; justify-content: flex-end; }
.btn {
  height: 48px; padding: 0 22px; border-radius: 12px; border: 1px solid transparent;
  font-size: 15px; font-weight: 700; cursor: pointer;
  display: inline-flex; align-items: center; gap: 8px;
  &:disabled { opacity: 0.55; cursor: not-allowed; }
  &:active:not(:disabled) { transform: scale(0.97); }
}
.btn-primary { background: var(--accent-primary, #ff7a00); color: #fff; }
</style>
