<template>
  <div v-if="showDetails" class="modal-backdrop" @click.self="save">
    <div class="modal">
      <div class="content">
        <!-- LEFT -->
        <div class="left">
          <div class="field">
            <textarea
              placeholder="Tavsif"
              v-model="descriptionLocal"
              class="description-box"
            ></textarea>
          </div>

          <VirtualKeyboard
            class="keyboard-text"
            @input="onTextInput"
            @backspace="onTextBackspace"
            nums_on
          />
        </div>

        <!-- RIGHT -->
        <div class="right">
          <div class="field">
            <label>Telefon raqam</label>
            <div class="phone-input">
              <div class="prefix">+998</div>
              <input type="text" v-model="formattedPhone" class="number" />
            </div>
          </div>

          <NumericKeyboard
            class="keyboard-numeric"
            @input="onNumberInput"
            @backspace="onNumberBackspace"
            @clear="onNumberClear"
          />

          <button type="button" class="btn primary" @click="save">Saqlash</button>
        </div>
      </div>
    </div>
  </div>

  <!-- OPEN -->
  <button type="button" class="btn primary" @click="open">Tafsilot qo‘shish</button>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import VirtualKeyboard from 'components/virtual-keyboard/VirtualKeyboard.vue';
import NumericKeyboard from 'components/numeric-keyboard/NumericKeyboard.vue';

/* EMITS */
const emit = defineEmits<{
  (e: 'update:description', value: string): void;
  (e: 'update:phone', value: string): void;
}>();

/* STATE */
const showDetails = ref(false);
const descriptionLocal = ref('');
const phoneDigitsLocal = ref('');

/* FORMAT PHONE */
const formattedPhone = computed(() => {
  const d = phoneDigitsLocal.value;
  if (!d) return '';

  let result = ` ${d.slice(0, 2)}`;

  if (d.length > 2) {
    result += `-${d.slice(2, Math.min(5, d.length))}`;
  }
  if (d.length > 5) {
    result += `-${d.slice(5, Math.min(7, d.length))}`;
  }
  if (d.length > 7) {
    result += `-${d.slice(7, Math.min(9, d.length))}`;
  }

  return result;
});

const fullPhone = computed(() => `+998${phoneDigitsLocal.value}`);

/* OPEN / CLOSE */
function open(): void {
  showDetails.value = true;
}

function close(): void {
  showDetails.value = false;
}

/* RESET — CALL ONLY ON NEW ORDER */
function reset(): void {
  descriptionLocal.value = '';
  phoneDigitsLocal.value = '';
}

/* INPUTS */
function onTextInput(value: string): void {
  descriptionLocal.value += value;
}

function onTextBackspace(): void {
  descriptionLocal.value = descriptionLocal.value.slice(0, -1);
}

function onNumberInput(value: string): void {
  if (phoneDigitsLocal.value.length >= 9) return;
  phoneDigitsLocal.value += value;
}

function onNumberBackspace(): void {
  phoneDigitsLocal.value = phoneDigitsLocal.value.slice(0, -1);
}
function onNumberClear(): void {
  phoneDigitsLocal.value = '';
}

/* SAVE */
function save(): void {
  emit('update:description', descriptionLocal.value);
  emit('update:phone', fullPhone.value);
  close();
}

/* EXPOSE RESET FOR PARENT */
defineExpose({ reset });
</script>

<style scoped lang="scss">
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.modal {
  width: 90%;
  max-width: 900px;
  background: var(--bg-surface);
  border-radius: 20px;
  padding: 16px;
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-md);
}

.content {
  display: grid;
  grid-template-columns: 2.5fr 1fr;
  gap: 16px;
}

/* COLUMNS */
.left,
.right {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* FIELDS */
.field label {
  font-size: 14px;
  color: var(--text-muted);
}

/* DESCRIPTION */
.description-box {
  background: var(--bg-surface-2);
  border-radius: 12px;
  padding: 12px;
  color: var(--text-primary);
  min-height: 120px;
  width: 100%;
  font-size: 18px;
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-sm);
}

/* PHONE */
.phone-input {
  display: flex;
  align-items: center;
  background: var(--bg-surface-2);
  border-radius: 12px;
  padding:0 12px;
  gap: 8px;
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-sm);
}

.prefix {
  color: var(--accent-primary);
  font-weight: 600;
  font-size: 17px;
  padding-block: 12px;
}

.number {
  color: var(--text-primary);
  font-size: 18px;
  border: none;
  outline: none;
  background-color: transparent;
  padding-block: 12px;

}

/* BUTTONS */
.btn {
  height: 48px;
  border-radius: 12px;
  border: none;
  font-size: 16px;
  font-weight: 600;
  padding: 0 10px;
  cursor: pointer;
  box-shadow: var(--shadow-sm);
  transition:
    transform 0.1s ease,
    box-shadow 0.1s ease;
}

.btn:active {
  transform: scale(0.97);
  box-shadow: none;
}

.btn.primary {
  background: var(--accent-primary);
  color: #ffffff;
}
</style>
