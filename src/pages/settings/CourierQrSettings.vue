<template>
  <div class="cq">
    <div class="cq__form">
      <div class="form-section">
        <h3 class="form-section-title">
          <q-icon name="qr_code_2" size="20px" />
          Kuryer login QR
        </h3>
        <p class="section-description">
          Kuryer Alfa Courier ilovasida shu QR kodni skaner qiladi — ilova serverga
          ulanadi va avtomatik tizimga kiradi. (Avval kuryer akkаunti yaratilgan bo'lishi kerak.)
        </p>

        <button type="button" class="fld" :class="{ active: field === 'server' }" @click="field = 'server'">
          <span class="fld__label"><q-icon name="dns" size="15px" /> Server manzili</span>
          <span class="fld__val fld__val--url">{{ serverUrl || '—' }}</span>
        </button>

        <button type="button" class="fld" :class="{ active: field === 'phone' }" @click="field = 'phone'">
          <span class="fld__label"><q-icon name="call" size="15px" /> Kuryer telefoni</span>
          <span class="fld__val"><span class="fld__pfx">+998</span>{{ formattedPhone || ' —' }}</span>
        </button>

        <button type="button" class="fld" :class="{ active: field === 'password' }" @click="field = 'password'">
          <span class="fld__label"><q-icon name="lock" size="15px" /> Parol</span>
          <span class="fld__val">{{ password ? '•'.repeat(password.length) : '—' }}</span>
        </button>

        <div class="cq__actions">
          <button type="button" class="btn btn-primary" :disabled="!canGenerate" @click="generate">
            <q-icon name="qr_code_2" size="20px" /> QR yaratish
          </button>
        </div>
      </div>

      <!-- keyboard for the active field -->
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

    <!-- result -->
    <div class="cq__result">
      <div v-if="qrImage" class="qr-card">
        <div class="qr-frame"><img :src="qrImage" alt="QR" class="qr-img" /></div>
        <div class="qr-phone">+998 {{ formattedPhone }}</div>
        <div class="qr-hint">
          <q-icon name="qr_code_scanner" size="18px" />
          Alfa Courier ilovasida ushbu kodni skaner qiling
        </div>
        <div class="qr-warn">
          <q-icon name="lock" size="16px" />
          Kodda kuryer paroli bor — faqat o'sha kuryerga ko'rsating.
        </div>
      </div>
      <div v-else class="qr-empty">
        <q-icon name="qr_code_2" size="48px" />
        <span>Ma'lumotlarni kiriting va "QR yaratish"ni bosing.</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { toast } from 'vue3-toastify';
import { read, write } from 'src/utils/storage';
import { generateQrDataUrl } from 'src/utils/qr';
import VirtualKeyboard from 'src/components/virtual-keyboard/VirtualKeyboard.vue';
import NumericKeyboard from 'src/components/numeric-keyboard/NumericKeyboard.vue';

// The courier app talks to the SERVER edition (over the internet), not the local
// in-store backend — so the QR carries the server URL. Persisted per-PC so it's
// set once.
const SERVER_KEY = 'pos:courierServerUrl';
const DEFAULT_SERVER = 'https://pos.78.111.90.65.nip.io';

const serverUrl = ref<string>(read<string>(SERVER_KEY) || DEFAULT_SERVER);
const phone = ref('');
const password = ref('');
const field = ref<'server' | 'phone' | 'password'>('phone');
const qrImage = ref('');

const formattedPhone = computed(() => {
  const d = phone.value;
  if (!d) return '';
  let r = ` ${d.slice(0, 2)}`;
  if (d.length > 2) r += ` ${d.slice(2, 5)}`;
  if (d.length > 5) r += ` ${d.slice(5, 7)}`;
  if (d.length > 7) r += ` ${d.slice(7, 9)}`;
  return r;
});

const canGenerate = computed(
  () => phone.value.length === 9 && password.value.length > 0 && serverUrl.value.trim().length > 0,
);

function onNumInput(v: string): void {
  if (phone.value.length >= 9) return;
  phone.value += v;
}
function onTextInput(c: string): void {
  if (field.value === 'server') serverUrl.value += c;
  else if (field.value === 'password') password.value += c;
}
function onTextBackspace(): void {
  if (field.value === 'server') serverUrl.value = serverUrl.value.slice(0, -1);
  else if (field.value === 'password') password.value = password.value.slice(0, -1);
}

async function generate(): Promise<void> {
  if (!canGenerate.value) return;
  // Payload the courier app parses (provisioning.ts): server + a `token` that the
  // server's /auth/courier/login treats as "phone:password".
  const payload = JSON.stringify({
    v: 1,
    server: serverUrl.value.trim(),
    token: `+998${phone.value}:${password.value}`,
  });
  try {
    qrImage.value = await generateQrDataUrl(payload);
    await write(SERVER_KEY, serverUrl.value.trim()); // remember the server URL
    toast.success('QR tayyor');
  } catch (e) {
    console.error('QR generate failed:', e);
    toast.error("QR yaratib bo'lmadi");
  }
}

onMounted(() => {
  field.value = 'phone';
});
</script>

<style scoped lang="scss">
.cq {
  display: grid;
  grid-template-columns: 1fr 360px;
  gap: 16px;
  height: 100%;
  overflow: hidden;
}
.cq__form {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}
.form-section {
  flex: 1;
  overflow-y: auto;
  padding: 4px;
}
.form-section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 6px;
}
.section-description {
  font-size: 13px;
  color: var(--text-muted);
  margin: 0 0 14px;
  line-height: 1.5;
}

.fld {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 12px 16px;
  margin-bottom: 10px;
  border-radius: 14px;
  cursor: pointer;
  text-align: left;
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  &.active {
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent-primary) 22%, transparent);
  }
}
.fld__label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
}
.fld__val {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}
.fld__val--url {
  font-size: 15px;
  font-weight: 600;
  word-break: break-all;
}
.fld__pfx {
  color: var(--accent-primary);
}

.cq__actions {
  margin-top: 8px;
}
.btn {
  height: 48px;
  border-radius: 12px;
  border: none;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 22px;
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  &:active:not(:disabled) {
    transform: scale(0.98);
  }
}
.btn-primary {
  background: var(--accent-primary);
  color: var(--on-primary);
}

.cq__kb {
  flex-shrink: 0;
  padding-top: 8px;
}

.cq__result {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 20px;
}
.qr-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.qr-frame {
  width: 240px;
  height: 240px;
  padding: 12px;
  background: #fff;
  border-radius: 18px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
}
.qr-img {
  width: 100%;
  height: 100%;
  image-rendering: pixelated;
}
.qr-phone {
  font-size: 18px;
  font-weight: 800;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}
.qr-hint {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-muted);
  text-align: center;
}
.qr-warn {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  color: var(--warning);
  text-align: center;
}
.qr-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: var(--text-muted);
  font-size: 14px;
  text-align: center;
}
</style>
