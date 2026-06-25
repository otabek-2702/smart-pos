<template>
  <!-- Full-screen license gate (INFO ONLY). Backend's kill-switch middleware
       refuses every business endpoint with 503 until the License row is
       ACTIVE. Activation/registration is NOT done here — it happens in the
       backend's own "License & Subscription" setup app. This screen only
       SHOWS the current state and lets the operator re-check after they've
       activated on the server. Cannot be dismissed — nothing useful works
       behind it. -->
  <Transition name="lic-fade">
    <div v-if="license.isBlocked.value" class="lic" role="alertdialog" aria-modal="true">
      <div class="lic__card">
        <div class="lic__head">
          <q-icon
            :name="headIcon"
            size="36px"
            class="lic__head-icon"
            :class="{ 'lic__head-icon--warn': !!reasonOverride }"
          />
          <div>
            <div class="lic__title">{{ title }}</div>
            <div class="lic__sub">{{ subtitle }}</div>
          </div>
          <button
            type="button"
            class="lic__refresh"
            title="Holatni qayta tekshirish"
            :disabled="busy"
            @click="recheck()"
          >
            <q-icon v-if="!busy" name="refresh" size="20px" />
            <q-spinner v-else size="18px" />
          </button>
        </div>

        <!-- License snapshot — same fields the backend's setup app shows. -->
        <div class="lic__info">
          <div class="lic__row">
            <span class="lic__k"><q-icon name="info" size="16px" /> Holat</span>
            <span class="lic__v">
              <strong>{{ statusLabel }}</strong>
            </span>
          </div>
          <div v-if="snap.tenant?.org_name" class="lic__row">
            <span class="lic__k"><q-icon name="business" size="16px" /> Tashkilot</span>
            <span class="lic__v">{{ snap.tenant.org_name }}</span>
          </div>
          <div v-if="snap.tenant?.email" class="lic__row">
            <span class="lic__k"><q-icon name="mail" size="16px" /> Email</span>
            <span class="lic__v">{{ snap.tenant.email }}</span>
          </div>
          <div v-if="snap.expires_at" class="lic__row">
            <span class="lic__k"><q-icon name="event_busy" size="16px" /> Muddati</span>
            <span class="lic__v">{{ formatDate(snap.expires_at) }}</span>
          </div>
          <!-- For the offline-grace case, the operative fact is "we haven't
               checked in for a while" — show the last successful contact. -->
          <div
            v-if="snap.reason === 'license_offline_grace_exceeded' && snap.last_heartbeat_at"
            class="lic__row"
          >
            <span class="lic__k"><q-icon name="sync_problem" size="16px" /> Oxirgi aloqa</span>
            <span class="lic__v">{{ formatDate(snap.last_heartbeat_at) }}</span>
          </div>
          <div v-if="snap.days_remaining !== null" class="lic__row">
            <span class="lic__k"><q-icon name="schedule" size="16px" /> Qolgan kunlar</span>
            <span class="lic__v">{{ snap.days_remaining }}</span>
          </div>
          <div v-if="snap.balance !== null" class="lic__row">
            <span class="lic__k"><q-icon name="payments" size="16px" /> Balans</span>
            <span class="lic__v">{{ snap.balance }}</span>
          </div>
        </div>

        <!-- Connectivity diagnostics. A blocked license often LOOKS like a
             network problem to the operator; show the real state so they can
             tell "license is off" from "this box can't reach the server". -->
        <div class="lic__diag">
          <div class="lic__diag-title">Aloqa holati</div>
          <div class="lic__row">
            <span class="lic__k"><q-icon name="dns" size="16px" /> Server ({{ role.configuredIp.value }})</span>
            <span class="lic__v" :class="net.serverReachable.value ? 'lic__v--ok' : 'lic__v--bad'">
              <q-icon :name="net.serverReachable.value ? 'check_circle' : 'cancel'" size="15px" />
              {{ net.serverReachable.value
                ? `Ulandi${net.latencyMs.value !== null ? ` · ${net.latencyMs.value} ms` : ''}`
                : 'Javob yo\'q' }}
            </span>
          </div>
          <div class="lic__row">
            <span class="lic__k"><q-icon name="public" size="16px" /> Internet</span>
            <span class="lic__v" :class="net.internetReachable.value ? 'lic__v--ok' : 'lic__v--bad'">
              <q-icon :name="net.internetReachable.value ? 'check_circle' : 'cancel'" size="15px" />
              {{ net.internetReachable.value
                ? `Bor${net.internetLatencyMs.value !== null ? ` · ${net.internetLatencyMs.value} ms` : ''}`
                : "Yo'q" }}
            </span>
          </div>
        </div>

        <!-- Server-pushed banner / message, if any. -->
        <div v-if="snap.message" class="lic__server-msg">{{ snap.message }}</div>

        <!-- What to do. Activation lives in the backend's setup app, not here. -->
        <p class="lic__support">{{ actionHint }}</p>

        <button
          type="button"
          class="lic__btn lic__btn--primary"
          :disabled="busy"
          @click="recheck()"
        >
          <q-spinner v-if="busy" size="16px" color="white" />
          <span v-else>Qayta tekshirish</span>
        </button>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useLicenseStatus, type LicenseStatusCode } from 'src/composables/useLicenseStatus';
import { useNetworkStatus } from 'src/composables/useNetworkStatus';
import { useDeviceRole } from 'src/composables/useDeviceRole';

const license = useLicenseStatus();
const net = useNetworkStatus();
const role = useDeviceRole();

const snap = computed(() => license.snapshot.value);

// Re-check everything at once: license state + local server probe + internet
// probe. The operator presses this after activating on the server, so refresh
// the diagnostics too — they want to confirm the box can actually reach the
// backend, not just the license verdict.
async function recheck(): Promise<void> {
  await Promise.all([
    license.refresh(),
    net.refresh(),
    net.refreshInternet(),
  ]);
}

const busy = computed(() => license.fetching.value);

const titleByStatus: Record<LicenseStatusCode, string> = {
  UNREGISTERED: 'Litsenziya faollashtirilmagan',
  ACTIVE: 'Litsenziya faol',
  SUSPENDED: 'Litsenziya to\'xtatilgan',
  EXPIRED: 'Litsenziya muddati tugagan',
  UNKNOWN: 'Litsenziya holati noma\'lum',
};

const subtitleByStatus: Record<LicenseStatusCode, string> = {
  UNREGISTERED: 'Bu POS hali ro\'yxatdan o\'tmagan.',
  ACTIVE: '',
  SUSPENDED: 'Hisob to\'xtatilgan.',
  EXPIRED: 'To\'lov muddati tugagan.',
  UNKNOWN: 'Server bilan aloqa hozircha noaniq.',
};

// Human-readable status text (the raw `reason` is a machine code like
// `license_suspended` — not for display).
const statusLabelByStatus: Record<LicenseStatusCode, string> = {
  UNREGISTERED: 'Faollashtirilmagan',
  ACTIVE: 'Faol',
  SUSPENDED: 'To\'xtatilgan',
  EXPIRED: 'Muddati tugagan',
  UNKNOWN: 'Noma\'lum',
};

// When the license row itself is ACTIVE/healthy but the kill-switch fired for
// an OPERATIONAL reason (the periodic online check lapsed, or the control
// server isn't configured), the status word alone ("Faol") is misleading —
// it reads like the license is fine, yet the screen is locked. Describe the
// real reason so the operator knows it's a connectivity/setup issue, not an
// expired or revoked license. (We still show the true status in the row below.)
const reasonOverride = computed<{ title: string; subtitle: string; hint: string } | null>(() => {
  if (!snap.value.is_blocked) return null;
  switch (snap.value.reason) {
    case 'license_offline_grace_exceeded':
      return {
        title: 'Litsenziya tekshiruvi muddati o\'tdi',
        subtitle: 'POS litsenziya serveriga uzoq vaqtdan beri ulana olmadi.',
        hint: 'Litsenziya vaqti-vaqti bilan internet orqali tekshirilishi kerak. ' +
          'Server kompyuter internetga (litsenziya serveriga) ulanganini ' +
          'tekshiring, so\'ng "Qayta tekshirish" tugmasini bosing. Muammo davom ' +
          'etsa, qo\'llab-quvvatlash xizmatiga murojaat qiling.',
      };
    case 'control_center_url_missing':
      return {
        title: 'Litsenziya serveri sozlanmagan',
        subtitle: 'Litsenziya server manzili ko\'rsatilmagan.',
        hint: 'Server kompyuterdagi Alpha POS sozlash ilovasida litsenziya server ' +
          'manzilini kiriting, so\'ng "Qayta tekshirish" tugmasini bosing.',
      };
    default:
      return null;
  }
});

const title = computed(
  () => reasonOverride.value?.title ?? titleByStatus[snap.value.status] ?? 'Litsenziya',
);
const subtitle = computed(
  () => reasonOverride.value?.subtitle ?? subtitleByStatus[snap.value.status] ?? '',
);
const statusLabel = computed(() => statusLabelByStatus[snap.value.status] ?? snap.value.status);

// Connectivity/setup lapses get a "connection" glyph, not the red revoked-lock.
const headIcon = computed(() => {
  if (snap.value.reason === 'license_offline_grace_exceeded') return 'sync_problem';
  if (snap.value.reason === 'control_center_url_missing') return 'settings_ethernet';
  return 'lock';
});

// All blocked states are resolved the same way: activate / renew / reconnect in
// the backend, then press "Qayta tekshirish".
const actionHint = computed(() => {
  if (reasonOverride.value) return reasonOverride.value.hint;
  if (snap.value.status === 'UNREGISTERED') {
    return 'Litsenziyani faollashtirish uchun server kompyuteridagi Alpha POS ' +
      'sozlash ilovasini oching → "Litsenziya va obuna" bo\'limidan ro\'yxatdan ' +
      'o\'ting. So\'ng quyidagi tugmani bosing.';
  }
  return 'Litsenziyani tiklash uchun server kompyuteridagi Alpha POS sozlash ' +
    'ilovasidan foydalaning yoki qo\'llab-quvvatlash xizmatiga murojaat qiling. ' +
    'So\'ng quyidagi tugmani bosing.';
});

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
  color: var(--error);
  flex-shrink: 0;
  margin-top: 2px;
}
/* Operational lapse (offline grace / unconfigured server) — not a revoked
   license, so signal "attention" (amber), not "denied" (red). */
.lic__head-icon--warn {
  color: var(--warning);
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
  margin-left: auto;

  &:active { transform: scale(0.95); }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
}

/* ===== Info rows ===== */
.lic__info {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.lic__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  background: var(--bg-surface-2);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  font-size: 14px;
}
.lic__k {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--text-muted);

  .q-icon { flex-shrink: 0; }
}
.lic__v {
  color: var(--text-primary);
  text-align: right;
  word-break: break-word;
}

/* ===== Diagnostics ===== */
.lic__diag {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.lic__diag-title {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: var(--text-muted);
}
.lic__v--ok {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--success);
  font-weight: 600;
}
.lic__v--bad {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--error);
  font-weight: 600;
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
  margin: 0;
  font-size: 13px;
  color: var(--text-muted);
  line-height: 1.55;
  text-align: center;
}

/* ===== Button ===== */
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
  color: var(--on-primary);
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
