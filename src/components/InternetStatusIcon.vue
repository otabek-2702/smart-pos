<template>
  <!-- Visible indicator of internet status. Hidden when internet is up
       (we don't want a permanent badge competing with real content). When
       down, shows an amber chip with a cloud_off icon — visible at a glance
       but never popping a dialog or stealing focus. Tap to force re-probe. -->
  <Transition name="net-fade">
    <button
      v-if="!network.internetReachable.value"
      type="button"
      class="net-icon"
      :title="tooltip"
      @click="network.refreshInternet()"
    >
      <q-icon name="cloud_off" :size="size" />
      <span v-if="showLabel" class="net-icon__label">Internet yo'q</span>
    </button>
  </Transition>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { NetworkStatus } from 'src/composables/useNetworkStatus';

const props = withDefaults(
  defineProps<{
    network: NetworkStatus;
    showLabel?: boolean;
    size?: string;
  }>(),
  { showLabel: false, size: '20px' },
);

const tooltip = computed(() => {
  const t = props.network.internetLastProbeAt.value;
  const when = t ? new Date(t).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' }) : '—';
  return `Internet aloqasi yo'q. Sinxronizatsiya vaqtincha to'xtatildi. (oxirgi tekshiruv: ${when}) — bosing va qayta tekshiring`;
});
</script>

<style scoped lang="scss">
.net-icon {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--warning) 45%, transparent);
  background: var(--warning-weak);
  color: var(--warning);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  user-select: none;
  transition: background 120ms ease, transform 80ms ease;

  &:hover { background: color-mix(in srgb, var(--warning) 14%, transparent); }
  &:active { transform: scale(0.96); }
}

.net-icon__label {
  white-space: nowrap;
}

.net-fade-enter-active,
.net-fade-leave-active {
  transition: opacity 200ms ease, transform 200ms ease;
}
.net-fade-enter-from,
.net-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.95);
}
</style>
