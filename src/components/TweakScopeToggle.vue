<template>
  <div class="scope-toggle" :title="title">
    <button
      type="button"
      class="scope-opt"
      :class="{ active: scope === 'this-pc' }"
      @click="setScope('this-pc')"
    >
      <q-icon name="computer" size="14px" /> Shu PC
    </button>
    <button
      type="button"
      class="scope-opt"
      :class="{ active: scope === 'global' }"
      @click="setScope('global')"
    >
      <q-icon name="lan" size="14px" /> Hammasi
    </button>
  </div>
</template>

<script setup lang="ts">
import { useTweak, type TweakScope } from 'src/composables/useTweaks';

// Reusable scope switch for a single tweak: per-PC vs shared across all tills.
const props = withDefaults(
  defineProps<{ tweakKey: string; defaultScope?: TweakScope }>(),
  { defaultScope: 'this-pc' },
);

const { scope, setScope } = useTweak<unknown>(props.tweakKey, null, props.defaultScope);

const title = "Bu sozlama faqat shu kompyuter uchunmi yoki barcha kompyuterlar uchunmi";
</script>

<style scoped>
.scope-toggle {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border-radius: var(--r-pill);
  background: var(--surface-2);
  border: 1px solid var(--border);
}
.scope-opt {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border: none;
  border-radius: var(--r-pill);
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.scope-opt.active {
  background: var(--primary);
  color: var(--on-primary);
}
</style>
