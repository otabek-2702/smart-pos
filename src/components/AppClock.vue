<template>
  <div class="clock" :class="`clock--${size}`">
    <div class="clock__segment">
      <Transition name="flip" mode="out-in">
        <span :key="hours" class="clock__number">{{ hours }}</span>
      </Transition>
    </div>
    <span class="clock__sep">:</span>
    <div class="clock__segment">
      <Transition name="flip" mode="out-in">
        <span :key="minutes" class="clock__number">{{ minutes }}</span>
      </Transition>
    </div>
    <template v-if="showSeconds">
      <span class="clock__sep">:</span>
      <div class="clock__segment clock__segment--seconds">
        <Transition name="flip" mode="out-in">
          <span :key="seconds" class="clock__number">{{ seconds }}</span>
        </Transition>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';

withDefaults(
  defineProps<{
    /** Show seconds segment. Adds animation pressure (60 transitions/min). */
    showSeconds?: boolean;
    /** Visual scale: 'sm' (footer chip), 'md' (default), 'lg' (display wall). */
    size?: 'sm' | 'md' | 'lg';
  }>(),
  { showSeconds: false, size: 'md' },
);

const hours = ref('00');
const minutes = ref('00');
const seconds = ref('00');

function tick(): void {
  const now = new Date();
  hours.value = now.getHours().toString().padStart(2, '0');
  minutes.value = now.getMinutes().toString().padStart(2, '0');
  seconds.value = now.getSeconds().toString().padStart(2, '0');
}

let timer: number | undefined;

onMounted(() => {
  tick();
  // Align to the next whole second so all clocks on screen tick together.
  const ms = 1000 - (Date.now() % 1000);
  setTimeout(() => {
    tick();
    timer = window.setInterval(tick, 1000);
  }, ms);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<style scoped lang="scss">
/* ============ CLOCK ============ */
.clock {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  color: var(--text-primary);
  user-select: none;
  line-height: 1;
}

.clock__segment {
  position: relative;
  overflow: hidden;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  // Wide enough for two tabular digits so the box never collapses/reflows
  // while a digit cross-fades (that reflow was the visible "jiggle").
  min-width: 1.7em;
  padding: 0 4px;
  border-radius: 6px;
  background: var(--bg-surface-2);
}

.clock__segment--seconds {
  // Smaller, dimmer — secondary info
  opacity: 0.72;
  font-size: 0.7em;
}

.clock__number {
  display: inline-block;
}

.clock__sep {
  opacity: 0.55;
}

/* ============ SIZES ============ */
.clock--sm {
  font-size: 16px;

  .clock__segment {
    padding: 2px 6px;
  }
}

.clock--md {
  font-size: 20px;

  .clock__segment {
    padding: 4px 8px;
  }
}

.clock--lg {
  font-size: 32px;

  .clock__segment {
    padding: 6px 12px;
    border-radius: 8px;
  }
}

/* ============ DIGIT CHANGE — clean cross-fade ============
   No 3D rotate / translate: those wobbled the digit on every tick. A plain
   opacity fade (leaving glyph absolutely positioned so it doesn't shift the
   box) reads as a calm swap with zero movement. */
.flip-enter-active,
.flip-leave-active {
  transition: opacity 0.22s ease;
}
.flip-leave-active {
  position: absolute;
}
.flip-enter-from,
.flip-leave-to {
  opacity: 0;
}
</style>
