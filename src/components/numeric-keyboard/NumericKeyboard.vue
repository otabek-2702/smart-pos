<template>
  <div class="nk">
    <!-- 1–9 -->
    <button v-for="key in keys" :key="key" type="button" class="nk-key" @click="onPress(key)">
      {{ key }}
    </button>
    <button class="hidden-btn"> {{" "}}</button>
    <button type="button" class="nk-key" @click="onPress('0')">0</button>
    <button type="button" class="nk-key" @click="onBackspace">⌫</button>

    <!-- 0 centered -->
    <!-- <div class="nk-zero">
    </div> -->

    <!-- backspace -->
  </div>
</template>

<script setup lang="ts">
const emit = defineEmits<{
  (e: 'input', value: string): void;
  (e: 'backspace'): void;
}>();

const keys: ReadonlyArray<string> = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ];

function onPress(key: string): void {
  emit('input', key);
}

function onBackspace(): void {
  emit('backspace');
}
</script>

<style lang="scss">
.nk {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  justify-content: end;
}

.nk-key {
  height: 56px;
  border-radius: 12px;
  border: none;
  background: #23262d;
  color: #ffffff;
  font-size: 20px;
  font-weight: 600;

  &:active {
    transform: scale(0.97);
  }
}

.nk-key.back {
  grid-column: span 3;
}

.nk-zero {
  grid-column: 1 / -1; /* span all */
  display: flex;
  // gap: 8px;
  justify-content: end;
  button{
    width: 33%;
  }
}

.hidden-btn{
  opacity: 0;
}
</style>
