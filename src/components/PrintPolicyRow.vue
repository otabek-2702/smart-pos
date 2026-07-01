<template>
  <div class="pp-card">
    <div class="pp-card__head">
      <span class="pp-card__name">{{ label }}</span>
      <div class="pp-scope" title="Faqat shu kompyuter uchunmi yoki barchasi uchunmi">
        <button type="button" :class="{ active: scope === 'this-pc' }" @click="setScope('this-pc')">
          Shu PC
        </button>
        <button type="button" :class="{ active: scope === 'global' }" @click="setScope('global')">
          Hammasi
        </button>
      </div>
    </div>

    <div class="pp-opt" @click="before = !before">
      <span class="pp-opt__txt">
        <q-icon name="receipt_long" size="18px" />
        To'lovdan oldin
      </span>
      <q-toggle v-model="before" dense color="primary" @click.stop />
    </div>

    <div class="pp-opt" @click="after = !after">
      <span class="pp-opt__txt">
        <q-icon name="task_alt" size="18px" />
        To'lovdan keyin
      </span>
      <q-toggle v-model="after" dense color="primary" @click.stop />
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
.pp-card {
  background: var(--surface-2, var(--bg-surface));
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 14px 16px;
  margin-bottom: 12px;
}
.pp-card:last-child {
  margin-bottom: 0;
}

.pp-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 6px;
}
.pp-card__name {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
}

/* scope pill */
.pp-scope {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border-radius: var(--r-pill, 999px);
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  flex-shrink: 0;
}
.pp-scope button {
  padding: 5px 12px;
  border: none;
  border-radius: var(--r-pill, 999px);
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}
.pp-scope button.active {
  background: var(--primary);
  color: var(--on-primary);
}

/* toggle rows */
.pp-opt {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 2px;
  cursor: pointer;
  border-top: 1px solid var(--border-color);
}
.pp-opt__txt {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}
.pp-opt__txt .q-icon {
  color: var(--text-muted);
}
</style>
