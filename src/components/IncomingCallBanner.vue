<template>
  <!-- Non-blocking call notice (operator role while an order is being entered,
       or a call waiting behind an active one). No overlay, no autofocus, and
       its buttons do not take focus from the field being edited. -->
  <Teleport to="body">
    <Transition name="icb">
      <div v-if="notice" class="icb" role="status" aria-live="polite">
        <q-icon :name="notice.direction === 'out' ? 'call_made' : 'ring_volume'" size="20px" />
        <div class="icb__text">
          <div class="icb__line">📞 {{ displayPhone }} {{ action }}</div>
          <div v-if="notice.name" class="icb__name">{{ notice.name }}</div>
        </div>
        <button type="button" class="icb__open" @mousedown.prevent @click="store.openBanner()">
          Ochish
        </button>
        <button
          type="button"
          class="icb__x"
          aria-label="Yopish"
          @mousedown.prevent
          @click="store.dismissBanner()"
        >
          <q-icon name="close" size="18px" />
        </button>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useOperatorStore } from 'src/stores/operator';
import { formatUzPhone } from 'src/utils/phone';

const store = useOperatorStore();

const notice = computed(() => store.banner);
const displayPhone = computed(() => {
  const phone = store.banner?.phone ?? '';
  return formatUzPhone(phone) || phone;
});
const action = computed(() => {
  if (store.banner?.direction === 'out') return 'raqamiga qo‘ng‘iroq qilinmoqda';
  return store.banner?.waiting ? 'qo‘ng‘iroq qilmoqda (kutmoqda)' : 'qo‘ng‘iroq qilmoqda';
});
</script>

<style scoped lang="scss">
.icb {
  position: fixed;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 4100; /* above the order details panel, below the call modal */
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: min(560px, calc(100vw - 24px));
  padding: 10px 10px 10px 16px;
  border-radius: var(--r-md);
  border: 1px solid var(--primary);
  background: var(--surface);
  color: var(--primary);
  box-shadow: var(--shadow-lg);
}
.icb__text {
  min-width: 0;
  flex: 1;
}
.icb__line {
  font-size: 15px;
  font-weight: 700;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.icb__name {
  font-size: 13px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.icb__open,
.icb__x {
  flex-shrink: 0;
  height: 38px;
  border-radius: var(--r-md);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  &:active {
    transform: scale(0.96);
  }
}
.icb__open {
  padding: 0 14px;
  border: 1px solid transparent;
  background: var(--primary);
  color: var(--on-primary);
  font-size: 14px;
  font-weight: 700;
}
.icb__x {
  width: 38px;
  border: 1px solid var(--border-color);
  background: var(--surface-2);
  color: var(--text);
}
.icb-enter-active,
.icb-leave-active {
  transition:
    opacity 160ms ease,
    transform 160ms ease;
}
.icb-enter-from,
.icb-leave-to {
  opacity: 0;
  transform: translate(-50%, -8px);
}
</style>
