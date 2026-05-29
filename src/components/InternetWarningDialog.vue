<template>
  <!-- Internet-down warning dialog. Main PC only. -->
  <!--
    Trigger logic (critical — has to be foolproof so users don't get
    re-popped after picking "don't show this session"):

      • sessionDismissed: boolean. Set ONLY by the "Bu seansda
        ko'rsatmaslik" button. Once true, the dialog never shows again
        for this app run. Reset only by a full page reload.

      • shownForCurrentDrop: boolean. Set when the dialog opens. Reset
        to false when internet comes back up. So a "Yopish" closes the
        current popup but a fresh drop later will re-pop.

    Net result of the two buttons:
      [Yopish]                       → close this one; show again on next drop.
      [Bu seansda ko'rsatmaslik]     → close this one; never show again this session.
  -->
  <Transition name="iw-fade">
    <div v-if="open" class="iw-backdrop" @click.self.stop>
      <div class="iw-card" role="alertdialog" aria-modal="true">
        <div class="iw-card__icon">
          <q-icon name="wifi_off" size="42px" />
        </div>

        <h2 class="iw-card__title">Internet aloqasi yo'q</h2>

        <p class="iw-card__body">
          Tizim mahalliy serverda ishlashda davom etadi.
          Internet qaytguncha buyurtmalar global serverga yuborilmaydi —
          aloqa tiklanganda avtomatik sinxronlanadi.
        </p>

        <div class="iw-card__meta">
          <q-icon name="dns" size="14px" />
          <span>Asosiy kompyuter: <code>{{ deviceIp }}</code></span>
        </div>

        <div class="iw-card__actions">
          <button type="button" class="btn btn--ghost" @click="onClose">
            Yopish
          </button>
          <button type="button" class="btn btn--primary" @click="onDismissSession">
            Bu seansda ko'rsatmaslik
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import type { NetworkStatus } from 'src/composables/useNetworkStatus';
import { getInternetWarningSuppression } from 'src/composables/useInternetWarningSuppress';

const props = defineProps<{
  network: NetworkStatus;
  /** Only the main PC opens this dialog. Secondary terminals just show the
      small status icon, never a modal. */
  enabled: boolean;
  /** IP of this device — shown inside the dialog for context. */
  deviceIp: string;
}>();

// > 0 means a page or dialog has asked us to stay closed. The watcher
// below treats this as a deferral, not a permanent skip — the moment the
// counter drops back to 0 AND internet is still down (and the drop
// hasn't already been shown), the dialog opens.
const suppression = getInternetWarningSuppression();

const open = ref(false);

// Permanent per-session dismiss. Module-level via ref so two parents that
// somehow both mounted us would share, but typically there's exactly one
// instance in MainLayout. Never reset except by page reload.
const sessionDismissed = ref(false);

// Per-drop flag. Reset when internet comes back up — that way the next
// drop is "fresh" and the dialog opens again unless sessionDismissed.
const shownForCurrentDrop = ref(false);

// React to internet up→down transitions OR suppression changes. Watching
// both sources means: if internet dropped while the user was on a
// suppressed page (e.g. CreateOrderPage) and they then navigate away,
// the suppression counter drops to 0 → watcher fires → dialog opens.
// No notification is lost; it's just deferred.
watch(
  [() => props.network.internetReachable.value, suppression],
  ([isUp, sCount]) => {
    if (isUp) {
      // Internet came back — clear the per-drop latch so a NEW drop can
      // trigger a fresh warning. Session-dismiss stays put.
      shownForCurrentDrop.value = false;
      if (open.value) open.value = false;
      return;
    }
    // Internet is down OR initial check says it's down.
    if (sCount > 0) {
      // A page/dialog has asked us to stay closed. If we happened to be
      // open already (drop just happened a frame before suppression
      // mounted), close gracefully. Don't set shownForCurrentDrop —
      // we want the dialog to re-appear when suppression lifts.
      if (open.value) open.value = false;
      return;
    }
    if (!props.enabled) return;             // only main PC
    if (sessionDismissed.value) return;     // user opted out this session
    if (shownForCurrentDrop.value) return;  // already shown for THIS drop
    open.value = true;
    shownForCurrentDrop.value = true;
  },
  // Fire immediately so if internet is already down at app launch the
  // dialog opens once on the first paint (per the spec: "the first time
  // internet goes off it shows the warning dialog").
  { immediate: true },
);

function onClose(): void {
  open.value = false;
  // shownForCurrentDrop stays true so we don't reshow for THIS drop.
  // Next drop after internet recovery will re-fire normally.
}

function onDismissSession(): void {
  open.value = false;
  sessionDismissed.value = true; // never again this session
}

// Expose a "show again now" hook in case other UI (like tapping the
// header internet icon) wants to manually re-open the dialog. Respects
// session-dismiss — if the user said "not this session" we honor that.
defineExpose({
  showNow(): void {
    if (sessionDismissed.value) return;
    if (!props.network.internetReachable.value) {
      open.value = true;
      shownForCurrentDrop.value = true;
    }
  },
});
</script>

<style scoped lang="scss">
.iw-backdrop {
  position: fixed;
  inset: 0;
  z-index: 4500;
  background: rgba(15, 17, 21, 0.5);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.iw-card {
  width: 100%;
  max-width: 480px;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 18px;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.45);
  padding: 28px 26px 22px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}

.iw-card__icon {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: rgba(245, 158, 11, 0.12);
  color: #f59e0b;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.iw-card__title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
}

.iw-card__body {
  margin: 0;
  font-size: 14px;
  color: var(--text-muted);
  line-height: 1.55;
}

.iw-card__meta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  padding: 6px 12px;
  background: var(--bg-surface-2);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  font-size: 12px;
  color: var(--text-muted);

  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
    color: var(--text-primary);
  }
}

.iw-card__actions {
  width: 100%;
  display: flex;
  gap: 10px;
  margin-top: 8px;
}

.btn {
  flex: 1;
  height: 48px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  transition: transform 90ms ease, background 120ms ease;

  &:active { transform: scale(0.97); }
}
.btn--ghost {
  background: transparent;
  border-color: var(--border-color);
  color: var(--text-primary);
}
.btn--primary {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
  color: white;
}

.iw-fade-enter-active,
.iw-fade-leave-active {
  transition: opacity 220ms ease, backdrop-filter 220ms ease;
}
.iw-fade-enter-from,
.iw-fade-leave-to {
  opacity: 0;
  backdrop-filter: blur(0px);
}
</style>
