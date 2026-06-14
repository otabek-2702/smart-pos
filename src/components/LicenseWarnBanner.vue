<template>
  <!-- Non-blocking prepaid-billing warning. The backend raises `warn` on
       /api/licensing/status BEFORE the kill switch fires (low balance / few
       days left), so the operator gets a chance to top up before the POS is
       refused. Hidden once the license is actually blocked — at that point
       LicenseBlockedScreen takes over. -->
  <Transition name="lic-warn-fade">
    <div v-if="show" class="lic-warn" role="status">
      <q-icon name="warning" size="18px" class="lic-warn__icon" />
      <span class="lic-warn__text">{{ message }}</span>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useLicenseStatus } from 'src/composables/useLicenseStatus';

const license = useLicenseStatus();
const route = useRoute();
const snap = computed(() => license.snapshot.value);

// Operator-facing warning only. Never show it on the customer-facing
// fullscreen client display — customers shouldn't see billing prompts.
const show = computed(
  () =>
    snap.value.warn === true &&
    snap.value.is_blocked !== true &&
    route.meta.fullscreen !== true,
);

const message = computed(() => {
  const days = snap.value.days_remaining;
  if (typeof days === 'number') {
    return `Litsenziya muddati tugashiga ${days} kun qoldi. Iltimos, hisobni to'ldiring.`;
  }
  if (snap.value.message) return snap.value.message;
  return "Litsenziya balansi tugayapti. Iltimos, hisobni to'ldiring.";
});
</script>

<style scoped lang="scss">
.lic-warn {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 5500; // below the blocked overlay (6000), above pages
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 8px 16px;
  background: var(--warning);
  color: var(--on-primary);
  font-size: 13px;
  font-weight: 600;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
}
.lic-warn__icon {
  flex-shrink: 0;
}
.lic-warn__text {
  line-height: 1.4;
}

.lic-warn-fade-enter-active,
.lic-warn-fade-leave-active {
  transition: transform 220ms ease, opacity 220ms ease;
}
.lic-warn-fade-enter-from,
.lic-warn-fade-leave-to {
  transform: translateY(-100%);
  opacity: 0;
}
</style>
