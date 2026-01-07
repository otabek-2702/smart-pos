<template>
  <div v-if="modelValue" class="modal-backdrop" @click.self="close">
    <div class="modal">
      <div class="title">Mahsulot tavsifi</div>

      <!-- DESCRIPTION PREVIEW -->
      <div class="description-box">
        {{ localDescription || '—' }}
      </div>

      <!-- VIRTUAL KEYBOARD -->
      <VirtualKeyboard class="keyboard" nums_on @input="onInput" @backspace="onBackspace" />

      <!-- ACTIONS -->
      <!-- <div class="actions">
        <button class="btn secondary" @click="close">Bekor qilish</button>
        <button class="btn primary" @click="close">Saqlash</button>
      </div> -->
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import VirtualKeyboard from 'components/virtual-keyboard/VirtualKeyboard.vue';

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    description: string | null;
  }>(),
  {
    modelValue: false,
    description: null,
  },
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'save', value: string): void;
}>();

const localDescription = ref<string>('');

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      localDescription.value = props.description ?? '';
    }
  },
);

function onInput(value: string): void {
  localDescription.value += value;
}

function onBackspace(): void {
  localDescription.value = localDescription.value.slice(0, -1);
}

function close(): void {
  emit('save', localDescription.value);
  emit('update:modelValue', false);
}
</script>

<style scoped lang="scss">
/* BACKDROP */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(17, 24, 39, 0.45); /* soft dark overlay */
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

/* MODAL */
.modal {
  width: 820px;
  background: var(--bg-surface);
  border-radius: 16px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;

  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-md);
}

/* TITLE */
.title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

/* DESCRIPTION */
.description-box {
  min-height: 80px;
  background: var(--bg-surface-2);
  border-radius: 12px;
  padding: 12px;

  color: var(--text-primary);
  font-size: 16px;
  border: 1px solid var(--border-color);
}

/* KEYBOARD */
.keyboard {
  flex: 1;
}

/* ACTIONS */
.actions {
  display: flex;
  gap: 8px;
}

/* BUTTONS */
.btn {
  flex: 1;
  height: 44px;
  border-radius: 12px;
  border: none;
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  box-shadow: var(--shadow-sm);

  &:active {
    transform: scale(0.97);
    box-shadow: none;
  }
}

.btn.primary {
  background: var(--accent-primary);
  color: #ffffff;
}

.btn.secondary {
  background: var(--btn-secondary-bg);
  color: var(--btn-secondary-text);
}
</style>
