<template>
  <div v-if="showDetails" class="modal-backdrop">
    <div class="modal">
      <div class="title">Buyurtma tafsilotlari</div>

      <!-- DESCRIPTION -->
      <div class="field">
        <label>Tavsif</label>
        <div class="readonly-input">
          {{ descriptionLocal || '—' }}
        </div>
      </div>

      <!-- PHONE -->
      <div class="field">
        <label>Telefon raqam</label>

        <div class="phone-input">
          <div class="prefix">+998</div>
          <div class="number">
            {{ phoneDigitsLocal || '—' }}
          </div>
        </div>
      </div>

      <!-- KEYBOARDS -->
      <div class="keyboards">
        <VirtualKeyboard @input="onTextInput" @backspace="onTextBackspace" />

        <NumericKeyboard @input="onNumberInput" @backspace="onNumberBackspace" />
      </div>

      <!-- ACTIONS -->
      <div class="actions">
        <button type="button" class="btn secondary" @click="close">Yopish</button>

        <button type="button" class="btn primary" @click="save">Saqlash</button>
      </div>
    </div>
  </div>
  <button type="button" class="btn primary" v-else @click="showDetails = true">
    Tafsilot qo‘shish
  </button>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import VirtualKeyboard from 'components/virtual-keyboard/VirtualKeyboard.vue';
import NumericKeyboard from 'components/numeric-keyboard/NumericKeyboard.vue';

/* PROPS / EMITS */

const emit = defineEmits<{
  (e: 'update:description', value: string): void;
  (e: 'update:phone', value: string): void;
}>();

/* LOCAL STATE */
const showDetails = ref<boolean>(false);
const descriptionLocal = ref<string>('');
const phoneDigitsLocal = ref<string>('');

const phoneLocal = computed(() => `+998${phoneDigitsLocal.value}`);

/* RESET ON OPEN */
watch(showDetails, (open) => {
  if (open) {
    descriptionLocal.value = '';
    phoneDigitsLocal.value = '';
  }
});

/* TEXT INPUT */
function onTextInput(value: string): void {
  descriptionLocal.value += value;
}

function onTextBackspace(): void {
  descriptionLocal.value = descriptionLocal.value.slice(0, -1);
}

/* NUMBER INPUT */
function onNumberInput(value: string): void {
  if (phoneDigitsLocal.value.length >= 9) return;
  phoneDigitsLocal.value += value;
}

function onNumberBackspace(): void {
  phoneDigitsLocal.value = phoneDigitsLocal.value.slice(0, -1);
}

/* ACTIONS */
function close(): void {
  showDetails.value = false;
}

function save(): void {
  emit('update:description', descriptionLocal.value);
  emit('update:phone', phoneLocal.value);

  close();
}
</script>

<style lang="scss">
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  width: 720px;
  max-height: 90vh;
  background: #0f1115;
  border-radius: 20px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.title {
  font-size: 18px;
  font-weight: 600;
  color: #ffffff;
}

.field label {
  font-size: 13px;
  color: #b0b0b0;
}

.readonly-input {
  background: #1a1d23;
  border-radius: 12px;
  padding: 12px;
  color: #ffffff;
}

.phone-input {
  display: flex;
  background: #1a1d23;
  border-radius: 12px;
  padding: 12px;
  gap: 8px;
}

.prefix {
  color: #ff7a00;
  font-weight: 600;
}

.keyboards {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 12px;
}

.actions {
  display: flex;
  gap: 8px;
  margin-top: auto;
}

.btn {
  flex: 1;
  height: 48px;
  border-radius: 12px;
  border: none;
  font-weight: 600;
}

.btn.primary {
  background: #ff7a00;
  color: #ffffff;
}

.btn.secondary {
  background: #23262d;
  color: #b0b0b0;
}
</style>
