<template>
  <div class="pp-row">
    <div class="pp-name">{{ label }}</div>
    <div class="pp-toggles">
      <q-toggle v-model="before" label="To'lovdan oldin" dense color="primary" />
      <q-toggle v-model="after" label="To'lovdan keyin" dense color="primary" />
    </div>
    <div class="pp-scope" title="Faqat shu kompyuter uchunmi yoki barchasi uchunmi">
      <button type="button" :class="{ active: scope === 'this-pc' }" @click="setScope('this-pc')">
        Shu PC
      </button>
      <button type="button" :class="{ active: scope === 'global' }" @click="setScope('global')">
        Hammasi
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { usePrintBefore, usePrintAfter, type OrderTypeKey } from 'src/composables/usePrintPolicy';
import type { TweakScope } from 'src/composables/useTweaks';

const props = defineProps<{ type: OrderTypeKey; label: string }>();

const b = usePrintBefore(props.type);
const a = usePrintAfter(props.type);
// Top-level so the template auto-unwraps them for v-model.
const before = b.value;
const after = a.value;
const scope = b.scope;

// Before + after share one scope decision per order type.
function setScope(s: TweakScope): void {
  b.setScope(s);
  a.setScope(s);
}
</script>

<style scoped>
.pp-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-color);
}
.pp-row:last-child {
  border-bottom: none;
}
.pp-name {
  flex: 0 0 120px;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
}
.pp-toggles {
  flex: 1;
  display: flex;
  gap: 18px;
  flex-wrap: wrap;
  font-size: 13px;
  color: var(--text-primary);
}
.pp-scope {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border-radius: var(--r-pill);
  background: var(--surface-2);
  border: 1px solid var(--border);
}
.pp-scope button {
  padding: 4px 10px;
  border: none;
  border-radius: var(--r-pill);
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.pp-scope button.active {
  background: var(--primary);
  color: var(--on-primary);
}
</style>
