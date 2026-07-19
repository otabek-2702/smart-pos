<template>
  <div class="cq">
    <div class="cq__form">
      <div class="form-section">
        <h3 class="form-section-title">
          <q-icon name="local_shipping" size="20px" />
          Kuryer akkaunti va login QR
        </h3>
        <p class="section-description">
          Kuryerni shu yerdan yarating. Tizim Alfa Courier ilovasiga kirish uchun
          bir martalik, qisqa muddatli QR kod beradi.
        </p>

        <div v-if="qrCouriers.length" class="existing">
          <span class="existing__label">Mavjud kuryer uchun yangi QR</span>
          <div class="existing__list">
            <button
              v-for="courier in qrCouriers"
              :key="courier.id"
              type="button"
              class="existing__item"
              :class="{ active: selectedCourierId === courier.id }"
              :disabled="saving"
              @click="regenerate(courier)"
            >
              <span>{{ courier.name }}</span>
              <small>{{ courier.phone || 'Telefon kiritilmagan' }}</small>
            </button>
          </div>
        </div>

        <div class="form-divider"><span>Yangi kuryer</span></div>

        <button type="button" class="fld" :class="{ active: field === 'firstName' }" @click="field = 'firstName'">
          <span class="fld__label"><q-icon name="person" size="15px" /> Ismi</span>
          <span class="fld__val">{{ firstName || '-' }}</span>
        </button>

        <button type="button" class="fld" :class="{ active: field === 'lastName' }" @click="field = 'lastName'">
          <span class="fld__label"><q-icon name="badge" size="15px" /> Familiyasi (ixtiyoriy)</span>
          <span class="fld__val">{{ lastName || '-' }}</span>
        </button>

        <button type="button" class="fld" :class="{ active: field === 'phone' }" @click="field = 'phone'">
          <span class="fld__label"><q-icon name="call" size="15px" /> Kuryer telefoni</span>
          <span class="fld__val"><span class="fld__pfx">+998</span>{{ formattedPhone || ' -' }}</span>
        </button>

        <div class="cq__actions">
          <button type="button" class="btn btn-primary" :disabled="!canCreate || saving" @click="createCourier">
            <q-icon :name="saving ? 'progress_activity' : 'qr_code_2'" size="20px" />
            {{ saving ? 'Yaratilmoqda...' : 'Akkaunt va QR yaratish' }}
          </button>
        </div>
      </div>

      <div class="cq__kb">
        <NumericKeyboard
          v-if="field === 'phone'"
          @input="onNumInput"
          @backspace="phone = phone.slice(0, -1)"
          @clear="phone = ''"
        />
        <VirtualKeyboard v-else position="inline" numbers @input="onTextInput" @backspace="onTextBackspace" />
      </div>
    </div>

    <div class="cq__result">
      <div v-if="qrImage && provisioned" class="qr-card">
        <div class="qr-frame"><img :src="qrImage" alt="Courier login QR" class="qr-img" /></div>
        <div class="qr-name">{{ provisioned.name }}</div>
        <div class="qr-phone">{{ provisioned.phone }}</div>
        <div class="qr-expiry">
          <q-icon name="schedule" size="17px" />
          {{ expiryLabel(provisioned.expiresAt) }} gacha skaner qiling
        </div>
        <div class="qr-hint">
          <q-icon name="qr_code_scanner" size="18px" />
          Alfa Courier ilovasida ushbu kodni skaner qiling
        </div>
        <div class="qr-warn">
          <q-icon name="visibility_off" size="16px" />
          QR bir marta ishlaydi. Uni faqat shu kuryerga bering.
        </div>
      </div>
      <div v-else class="qr-empty">
        <q-icon name="qr_code_2" size="48px" />
        <span>Kuryer ma'lumotlarini kiriting va QR yarating.</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { toast } from 'vue3-toastify';
import { api } from 'boot/axios';
import { useCouriers, type Courier } from 'src/composables/useCouriers';
import { generateQrDataUrl } from 'src/utils/qr';
import VirtualKeyboard from 'src/components/virtual-keyboard/VirtualKeyboard.vue';
import NumericKeyboard from 'src/components/numeric-keyboard/NumericKeyboard.vue';

interface ProvisioningPayload {
  id: number;
  phone: string;
  expires_at: string;
  courier?: { name?: string; phone?: string };
  qr: { v: 2; type: 'courier_login'; server: string; token: string; expires_at: string };
}

interface ProvisioningResponse {
  success: boolean;
  message?: string;
  data?: ProvisioningPayload;
}

const { couriers, loadCouriers } = useCouriers();
const firstName = ref('');
const lastName = ref('');
const phone = ref('');
const field = ref<'firstName' | 'lastName' | 'phone'>('firstName');
const qrImage = ref('');
const provisioned = ref<{ id: number; name: string; phone: string; expiresAt: string } | null>(null);
const saving = ref(false);
const selectedCourierId = ref<number | null>(null);
const qrCouriers = computed(() => couriers.value.filter((courier) => courier.source === 'courier-api'));

const formattedPhone = computed(() => {
  const digits = phone.value;
  if (!digits) return '';
  let result = ` ${digits.slice(0, 2)}`;
  if (digits.length > 2) result += ` ${digits.slice(2, 5)}`;
  if (digits.length > 5) result += ` ${digits.slice(5, 7)}`;
  if (digits.length > 7) result += ` ${digits.slice(7, 9)}`;
  return result;
});

const canCreate = computed(() => firstName.value.trim().length > 0 && phone.value.length === 9);

function onNumInput(value: string): void {
  if (phone.value.length < 9) phone.value += value;
}

function onTextInput(value: string): void {
  if (field.value === 'firstName') firstName.value += value;
  else if (field.value === 'lastName') lastName.value += value;
}

function onTextBackspace(): void {
  if (field.value === 'firstName') firstName.value = firstName.value.slice(0, -1);
  else if (field.value === 'lastName') lastName.value = lastName.value.slice(0, -1);
}

function expiryLabel(expiresAt: string): string {
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return 'Tez orada';
  return date.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
}

async function showProvisioning(payload: ProvisioningPayload): Promise<void> {
  if (!payload.qr?.server || !payload.qr.token || !payload.expires_at) {
    throw new Error("Backend qaytargan QR ma'lumotlari to'liq emas");
  }
  qrImage.value = await generateQrDataUrl(JSON.stringify(payload.qr));
  provisioned.value = {
    id: payload.id,
    name: payload.courier?.name || firstName.value.trim() || 'Kuryer',
    phone: payload.courier?.phone || payload.phone,
    expiresAt: payload.expires_at,
  };
}

async function createCourier(): Promise<void> {
  if (!canCreate.value || saving.value) return;
  saving.value = true;
  selectedCourierId.value = null;
  try {
    const body: { first_name: string; last_name?: string; phone: string } = {
      first_name: firstName.value.trim(),
      phone: `+998${phone.value}`,
    };
    if (lastName.value.trim()) body.last_name = lastName.value.trim();
    const response = await api.post<ProvisioningResponse>('/api/couriers/create', body);
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.message || 'Akkaunt yaratilmadi');
    }
    await showProvisioning(response.data.data);
    await loadCouriers(true);
    toast.success('Kuryer akkaunti va QR tayyor');
  } catch (error) {
    console.error('Courier create failed:', error);
    const message = error instanceof Error ? error.message : "Kuryer akkauntini yaratib bo'lmadi";
    toast.error(message);
  } finally {
    saving.value = false;
  }
}

async function regenerate(courier: Courier): Promise<void> {
  if (saving.value || courier.source !== 'courier-api') return;
  saving.value = true;
  selectedCourierId.value = courier.id;
  try {
    const response = await api.post<ProvisioningResponse>(`/api/couriers/${courier.id}/regenerate`, {});
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.message || 'QR yangilanmadi');
    }
    const fallbackCourier = {
      name: courier.name,
      ...(courier.phone ? { phone: courier.phone } : {}),
    };
    await showProvisioning({
      ...response.data.data,
      courier: response.data.data.courier ?? fallbackCourier,
    });
    toast.success('Yangi login QR tayyor');
  } catch (error) {
    console.error('Courier QR regeneration failed:', error);
    const message = error instanceof Error ? error.message : "QR kodni yangilab bo'lmadi";
    toast.error(message);
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  void loadCouriers(true);
});
</script>

<style scoped lang="scss">
.cq { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 16px; height: 100%; overflow: hidden; }
.cq__form { display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.form-section { flex: 1; overflow-y: auto; padding: 4px; }
.form-section-title { display: flex; align-items: center; gap: 8px; font-size: 16px; font-weight: 700; color: var(--text-primary); margin: 0 0 6px; }
.section-description { font-size: 13px; color: var(--text-muted); margin: 0 0 14px; line-height: 1.5; }
.existing { margin-bottom: 14px; padding: 11px; border: 1px solid var(--border-color); border-radius: 14px; background: var(--bg-surface); }
.existing__label { display: block; margin-bottom: 8px; font-size: 12px; font-weight: 700; color: var(--text-muted); }
.existing__list { display: flex; flex-wrap: wrap; gap: 7px; max-height: 104px; overflow-y: auto; }
.existing__item { min-width: 128px; padding: 8px 10px; border: 1px solid var(--border-color); border-radius: 10px; background: var(--bg-app); color: var(--text-primary); text-align: left; cursor: pointer; }
.existing__item.active, .existing__item:hover { border-color: var(--accent-primary); }
.existing__item:disabled { opacity: .55; cursor: wait; }
.existing__item span, .existing__item small { display: block; }
.existing__item span { font-size: 13px; font-weight: 700; }
.existing__item small { margin-top: 2px; font-size: 11px; color: var(--text-muted); }
.form-divider { display: flex; align-items: center; gap: 8px; margin: 13px 0 10px; color: var(--text-muted); font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; }
.form-divider::before, .form-divider::after { content: ''; flex: 1; border-top: 1px solid var(--border-color); }
.fld { width: 100%; display: flex; flex-direction: column; gap: 5px; padding: 12px 16px; margin-bottom: 10px; border-radius: 14px; cursor: pointer; text-align: left; border: 1px solid var(--border-color); background: var(--bg-surface); }
.fld.active { border-color: var(--accent-primary); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent-primary) 22%, transparent); }
.fld__label { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: var(--text-muted); }
.fld__val { min-height: 24px; font-size: 18px; font-weight: 700; color: var(--text-primary); font-variant-numeric: tabular-nums; }
.fld__pfx { color: var(--accent-primary); }
.cq__actions { margin-top: 8px; }
.btn { height: 48px; border-radius: 12px; border: none; font-size: 15px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 0 22px; }
.btn:disabled { opacity: .5; cursor: not-allowed; }
.btn:active:not(:disabled) { transform: scale(.98); }
.btn-primary { background: var(--accent-primary); color: var(--on-primary); }
.cq__kb { flex-shrink: 0; padding-top: 8px; }
.cq__result { display: flex; align-items: center; justify-content: center; background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 16px; padding: 20px; }
.qr-card { display: flex; flex-direction: column; align-items: center; gap: 9px; text-align: center; }
.qr-frame { width: 240px; height: 240px; padding: 12px; background: #fff; border-radius: 18px; box-shadow: 0 10px 30px rgba(0, 0, 0, .18); }
.qr-img { width: 100%; height: 100%; image-rendering: pixelated; }
.qr-name { font-size: 18px; font-weight: 800; color: var(--text-primary); }
.qr-phone { font-size: 15px; font-weight: 700; color: var(--text-primary); font-variant-numeric: tabular-nums; }
.qr-expiry { display: inline-flex; align-items: center; gap: 6px; padding: 7px 11px; border-radius: 8px; background: var(--bg-app); color: var(--text-primary); font-size: 13px; font-weight: 700; }
.qr-hint, .qr-warn { display: flex; align-items: center; gap: 7px; font-size: 12px; color: var(--text-muted); text-align: center; }
.qr-warn { color: var(--warning); }
.qr-empty { display: flex; flex-direction: column; align-items: center; gap: 12px; color: var(--text-muted); font-size: 14px; text-align: center; }
@media (max-width: 760px) { .cq { grid-template-columns: 1fr; overflow-y: auto; } .cq__result { min-height: 330px; } }
</style>
