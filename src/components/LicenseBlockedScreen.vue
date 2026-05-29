<template>
  <!-- Full-screen license gate. Backend's kill-switch middleware refuses
       every business endpoint with 503 until the License row is ACTIVE
       or PERPETUAL_UNLOCK. Without this screen, the cashier sees only
       opaque 5xx errors and can't make sense of them.

       Shown when license.is_blocked === true. Cannot be dismissed —
       there's nothing useful the user can do behind it. Setup is one
       of the few backend endpoints that still works through the kill
       switch, so we can complete registration from here. -->
  <Transition name="lic-fade">
    <div v-if="license.isBlocked.value" class="lic" role="alertdialog" aria-modal="true">
      <div class="lic__card">
        <div class="lic__head">
          <q-icon name="lock" size="36px" class="lic__head-icon" />
          <div>
            <div class="lic__title">{{ title }}</div>
            <div class="lic__sub">{{ subtitle }}</div>
          </div>
          <button
            type="button"
            class="lic__refresh"
            title="Holatni qayta tekshirish"
            :disabled="license.fetching.value"
            @click="license.refresh()"
          >
            <q-icon v-if="!license.fetching.value" name="refresh" size="20px" />
            <q-spinner v-else size="18px" />
          </button>
        </div>

        <!-- UNREGISTERED → show setup wizard inline -->
        <form
          v-if="license.isUnregistered.value"
          class="lic__form"
          @submit.prevent="onSubmitSetup"
        >
          <p class="lic__hint">
            Litsenziyani faollashtirish uchun yetkazib beruvchi tomonidan
            berilgan taklif kodi (invite code), tashkilot nomi va admin
            email kerak.
          </p>

          <label class="lic__label">
            Tashkilot nomi
            <input
              v-model="form.org_name"
              class="lic__input"
              type="text"
              placeholder="Smart Restaurant"
              required
              :disabled="submitting"
            />
          </label>

          <label class="lic__label">
            Admin email
            <input
              v-model="form.email"
              class="lic__input"
              type="email"
              placeholder="admin@kitchen.uz"
              required
              :disabled="submitting"
            />
          </label>

          <label class="lic__label">
            Taklif kodi (invite code)
            <input
              v-model="form.invite_code"
              class="lic__input lic__input--mono"
              type="text"
              placeholder="INV-XXXX-XXXX-XXXX"
              autocomplete="off"
              spellcheck="false"
              required
              :disabled="submitting"
            />
          </label>

          <div v-if="error" class="lic__error">
            <q-icon name="error_outline" size="16px" />
            <span>{{ error }}</span>
          </div>

          <button
            type="submit"
            class="lic__btn lic__btn--primary"
            :disabled="submitting || !canSubmit"
          >
            <q-spinner v-if="submitting" size="16px" color="white" />
            <span v-else>Faollashtirish</span>
          </button>
        </form>

        <!-- ANY OTHER BLOCKED STATE (SUSPENDED / EXPIRED / grace exceeded)
             → no inline action available; the operator must call support. -->
        <div v-else class="lic__blocked">
          <div class="lic__meta">
            <q-icon name="info" size="16px" />
            <span>Holat: <strong>{{ snap.status }}</strong></span>
            <span v-if="snap.reason"> · {{ snap.reason }}</span>
          </div>
          <div v-if="snap.tenant.org_name || snap.tenant.email" class="lic__meta">
            <q-icon name="business" size="16px" />
            <span>{{ snap.tenant.org_name || '—' }} · {{ snap.tenant.email || '—' }}</span>
          </div>
          <div v-if="snap.expires_at" class="lic__meta">
            <q-icon name="event_busy" size="16px" />
            <span>Muddati: {{ formatDate(snap.expires_at) }}</span>
          </div>
          <div v-if="snap.message" class="lic__server-msg">{{ snap.message }}</div>

          <p class="lic__support">
            Litsenziyani tiklash uchun qo'llab-quvvatlash xizmatiga
            murojaat qiling.
          </p>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { api } from 'boot/axios';
import { useLicenseStatus, type LicenseStatusCode } from 'src/composables/useLicenseStatus';

const license = useLicenseStatus();

const snap = computed(() => license.snapshot.value);

const titleByStatus: Record<LicenseStatusCode, string> = {
  UNREGISTERED: 'Litsenziya faollashtirilmagan',
  ACTIVE: 'Litsenziya faol',
  SUSPENDED: 'Litsenziya to\'xtatilgan',
  EXPIRED: 'Litsenziya muddati tugagan',
  PERPETUAL_UNLOCK: 'Litsenziya — abadiy',
  UNKNOWN: 'Litsenziya holati nomalum',
};

const subtitleByStatus: Record<LicenseStatusCode, string> = {
  UNREGISTERED: 'Bu POS hali ro\'yxatdan o\'tmagan. Davom etish uchun pastdagi maydonlarni to\'ldiring.',
  ACTIVE: '',
  SUSPENDED: 'Hisob to\'xtatilgan. Yordamga murojaat qiling.',
  EXPIRED: 'To\'lov muddati tugagan. Yangilash uchun yordamga murojaat qiling.',
  PERPETUAL_UNLOCK: '',
  UNKNOWN: 'Server bilan aloqa hozircha noaniq.',
};

const title = computed(() => titleByStatus[snap.value.status] ?? 'Litsenziya');
const subtitle = computed(() => subtitleByStatus[snap.value.status] ?? '');

/* ============ SETUP FORM ============ */

const form = reactive({
  email: '',
  org_name: '',
  invite_code: '',
});
const submitting = ref(false);
const error = ref<string | null>(null);

const canSubmit = computed(
  () =>
    form.email.trim().length > 0 &&
    form.org_name.trim().length > 0 &&
    form.invite_code.trim().length > 0,
);

async function onSubmitSetup(): Promise<void> {
  if (submitting.value || !canSubmit.value) return;
  submitting.value = true;
  error.value = null;
  try {
    const res = await api.post('/api/licensing/setup', {
      email: form.email.trim().toLowerCase(),
      org_name: form.org_name.trim(),
      invite_code: form.invite_code.trim(),
    }, {
      timeout: 15000,
      validateStatus: () => true,
    });
    if (res.status === 200 && res.data?.success !== false) {
      // Setup succeeded — re-poll status so the overlay closes.
      await license.refresh();
    } else {
      const msg = res.data?.message || `Xatolik (HTTP ${res.status})`;
      const errors = res.data?.errors;
      error.value = errors ? `${msg} · ${Object.values(errors).join(', ')}` : msg;
    }
  } catch (e) {
    console.error('License setup failed:', e);
    error.value = "Server bilan aloqa o'rnatib bo'lmadi. Internet va serverni tekshiring.";
  } finally {
    submitting.value = false;
  }
}

function formatDate(s: string): string {
  try {
    return new Date(s).toLocaleString('uz-UZ', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return s;
  }
}
</script>

<style scoped lang="scss">
.lic {
  position: fixed;
  inset: 0;
  z-index: 6000; // above NetworkDiagnostics (5000) — license trumps network
  background: rgba(15, 17, 21, 0.78);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.lic__card {
  width: 100%;
  max-width: 520px;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 18px;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.5);
  padding: 26px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  max-height: calc(100vh - 48px);
  overflow-y: auto;
}

.lic__head {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}
.lic__head-icon {
  color: #ef4444;
  flex-shrink: 0;
  margin-top: 2px;
}
.lic__title {
  font-size: 19px;
  font-weight: 700;
  color: var(--text-primary);
}
.lic__sub {
  font-size: 13px;
  color: var(--text-muted);
  margin-top: 4px;
  line-height: 1.5;
}
.lic__refresh {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  color: var(--text-primary);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  &:active { transform: scale(0.95); }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
}

/* ===== Setup form ===== */
.lic__form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.lic__hint {
  margin: 0;
  font-size: 13px;
  color: var(--text-muted);
  line-height: 1.55;
}
.lic__label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}
.lic__input {
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
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 3px rgba(255, 122, 0, 0.18);
  }
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}
.lic__input--mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.5px;
}

.lic__error {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 10px;
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #ef4444;
  font-size: 13px;
  font-weight: 500;
}

/* ===== Blocked (non-unregistered) ===== */
.lic__blocked {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.lic__meta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg-surface-2);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  font-size: 13px;
  color: var(--text-primary);

  .q-icon { color: var(--text-muted); flex-shrink: 0; }
}
.lic__server-msg {
  font-size: 13px;
  color: var(--text-muted);
  line-height: 1.55;
  padding: 10px 12px;
  background: var(--bg-surface-2);
  border-left: 3px solid var(--accent-primary);
  border-radius: 6px;
}
.lic__support {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--text-muted);
  text-align: center;
}

/* ===== Buttons ===== */
.lic__btn {
  height: 50px;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid transparent;
  transition: transform 90ms ease, background 120ms ease;

  &:disabled { opacity: 0.5; cursor: not-allowed; }
  &:active:not(:disabled) { transform: scale(0.97); }
}
.lic__btn--primary {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
  color: white;
  margin-top: 4px;
}

/* ===== Fade ===== */
.lic-fade-enter-active,
.lic-fade-leave-active {
  transition: opacity 220ms ease, backdrop-filter 220ms ease;
}
.lic-fade-enter-from,
.lic-fade-leave-to {
  opacity: 0;
  backdrop-filter: blur(0px);
}
</style>
