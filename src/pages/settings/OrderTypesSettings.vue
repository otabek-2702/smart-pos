<template>
  <div class="ot-settings">
    <div class="settings-form">
      <h2 class="section-title">Buyurtma turlari</h2>
      <p class="section-description">
        Zal / S soboy / Dostavka nomlarini o'zgartiring. O'zgarish hamma joyda
        (buyurtmalar, kassa, KDS, chek) bir vaqtda qo'llaniladi.
      </p>

      <div class="form-section">
        <h3 class="form-section-title">
          <q-icon name="restaurant_menu" size="20px" />
          Nomlar
        </h3>

        <div class="form-group">
          <label class="form-label">Zal (ichkarida)</label>
          <input
            type="text"
            v-model="form.HALL"
            class="form-input"
            placeholder="Zal"
            maxlength="24"
          />
        </div>

        <div class="form-group">
          <label class="form-label">Olib ketish (s soboy)</label>
          <input
            type="text"
            v-model="form.PICKUP"
            class="form-input"
            placeholder="S soboy"
            maxlength="24"
          />
        </div>

        <div class="form-group">
          <label class="form-label">Yetkazib berish (dostavka)</label>
          <input
            type="text"
            v-model="form.DELIVERY"
            class="form-input"
            placeholder="Dostavka"
            maxlength="24"
          />
        </div>
      </div>

      <div class="form-actions">
        <button type="button" class="btn btn-secondary" @click="resetToDefaults" :disabled="saving">
          <q-icon name="restart_alt" size="20px" />
          Standartga qaytarish
        </button>
        <button type="button" class="btn btn-primary" @click="onSave" :disabled="saving || !isValid">
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
import {
  useOrderTypes,
  DEFAULT_ORDER_TYPE_LABELS,
  type OrderTypeLabels,
} from 'src/composables/useOrderTypes';

const { labels, save } = useOrderTypes();

// Local editable copy seeded from the live labels.
const form = reactive<OrderTypeLabels>({ ...labels.value });
const saving = ref(false);

const isValid = computed(
  () =>
    form.HALL.trim().length > 0 &&
    form.PICKUP.trim().length > 0 &&
    form.DELIVERY.trim().length > 0,
);

async function onSave(): Promise<void> {
  if (!isValid.value || saving.value) return;
  saving.value = true;
  try {
    await save({
      HALL: form.HALL.trim(),
      PICKUP: form.PICKUP.trim(),
      DELIVERY: form.DELIVERY.trim(),
    });
    toast.success('Saqlandi — barcha ekranlarda yangilandi');
  } catch (e) {
    console.error('Failed to save order-type labels:', e);
    toast.error('Saqlashda xatolik');
  } finally {
    saving.value = false;
  }
}

function resetToDefaults(): void {
  Object.assign(form, DEFAULT_ORDER_TYPE_LABELS);
}
</script>

<style scoped lang="scss">
.ot-settings {
  padding: 4px;
}
.settings-form {
  max-width: 560px;
}
.section-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 6px;
}
.section-description {
  font-size: 14px;
  color: var(--text-muted);
  line-height: 1.55;
  margin-bottom: 20px;
}
.form-section {
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 18px;
  margin-bottom: 18px;
}
.form-section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 14px;

  .q-icon { color: var(--accent-primary, #ff7a00); }
}
.form-group {
  margin-bottom: 14px;

  &:last-child { margin-bottom: 0; }
}
.form-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted);
  margin-bottom: 6px;
}
.form-input {
  width: 100%;
  height: 48px;
  padding: 0 14px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: var(--bg-surface-2);
  color: var(--text-primary);
  font-size: 15px;

  &:focus {
    outline: none;
    border-color: var(--accent-primary, #ff7a00);
  }
}
.form-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}
.btn {
  height: 48px;
  padding: 0 20px;
  border-radius: 12px;
  border: 1px solid transparent;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;

  &:disabled { opacity: 0.55; cursor: not-allowed; }
  &:active:not(:disabled) { transform: scale(0.97); }
}
.btn-secondary {
  background: var(--bg-surface-2);
  color: var(--text-primary);
  border-color: var(--border-color);
}
.btn-primary {
  background: var(--accent-primary, #ff7a00);
  color: var(--on-primary);
}
</style>
