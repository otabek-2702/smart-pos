<template>
  <q-page class="page-pin flex flex-center">
    <!-- Back -->
    <button type="button" class="back-button" aria-label="Go back" @click="goBack">
      <q-icon name="arrow_back" size="24px" />
    </button>

    <div class="pin-wrapper">
      <div class="user-name">{{ userName }}</div>

      <!-- PIN dots -->
      <div class="pin-dots">
        <span
          v-for="index in PIN_LENGTH"
          :key="index"
          class="dot"
          :class="{ filled: pin.length >= index }"
        />
      </div>

      <!-- Error -->
      <div v-if="errorMessage" class="error-text">
        {{ errorMessage }}
      </div>

      <!-- Keypad -->
      <div class="keypad">
        <button
          v-for="key in numberKeys"
          :key="key"
          type="button"
          class="key"
          :disabled="isLoading"
          @click="onKeyPress(key)"
        >
          {{ key }}
        </button>

        <button type="button" class="key key-clear" :disabled="isLoading" @click="removeLast">
          ⌫
        </button>

        <button type="button" class="key key-zero" :disabled="isLoading" @click="onKeyPress(0)">
          0
        </button>

        <button type="button" class="key key-cancel" :disabled="isLoading" @click="goBack">
          Bekor qilish
        </button>
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from 'boot/axios';

/* ============
 * Types
 * ============ */

type UserRole = 'ADMIN' | 'CASHIER' | 'MANAGER';

interface LoginResponse {
  success: boolean;
  message: string;
  data: {
    token: string;
    user: {
      id: number;
      email: string;
      first_name: string;
      last_name: string;
      role: UserRole;
      status: 'ACTIVE' | 'INACTIVE';
    };
  };
}

/* ============
 * Constants
 * ============ */

const PIN_LENGTH = 4;

/* ============
 * Router
 * ============ */

const router = useRouter();
const route = useRoute();

/* ============
 * State
 * ============ */

const pin = ref<string>('');
const isLoading = ref<boolean>(false);
const errorMessage = ref<string>('');

const numberKeys: ReadonlyArray<number> = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/* ============
 * Computed
 * ============ */

const userEmail = computed<string | null>(() => {
  const value = route.query.email;
  return typeof value === 'string' ? value : null;
});

const userName = computed<string>(() => {
  const name = route.query.name;
  return typeof name === 'string' && name.length > 0 ? name : 'User';
});

/* ============
 * Methods
 * ============ */

function onKeyPress(key: number): void {
  if (isLoading.value || pin.value.length >= PIN_LENGTH) return;

  pin.value += String(key);
  errorMessage.value = '';

  if (pin.value.length === PIN_LENGTH) {
    void submitPin();
  }
}

function removeLast(): void {
  if (isLoading.value) return;
  pin.value = pin.value.slice(0, -1);
}

async function submitPin(): Promise<void> {
  if (!userEmail.value) {
    void router.replace({ name: 'users' });
    return;
  }

  isLoading.value = true;

  try {
    const response = await api.post<LoginResponse>('/auth-login', {
      email: userEmail.value,
      password: +pin.value,
    });

    const { token, user } = response.data.data;

    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_user', JSON.stringify(user));

    void router.replace({ name: 'orders' });
  } catch (error) {
    console.error(error);
    errorMessage.value = 'PIN noto‘g‘ri';
    pin.value = '';
  } finally {
    isLoading.value = false;
  }
}

function goBack(): void {
  void router.replace({ name: 'users' });
}

/* ============
 * Guard
 * ============ */

onMounted(() => {
  if (!userEmail.value) {
    void router.replace({ name: 'users' });
  }
});
</script>

<style lang="scss">
.page-pin {
  background: var(--bg-app);
  position: relative;
}

/* Back button */
.back-button {
  position: absolute;
  top: 16px;
  left: 16px;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  color: var(--text-primary);
  cursor: pointer;
  box-shadow: var(--shadow-sm);

  display: flex;
  align-items: center;
  justify-content: center;

  &:active {
    transform: scale(0.95);
    box-shadow: none;
  }
}

.pin-wrapper {
  width: 100%;
  max-width: 360px;
  padding: 24px;
  text-align: center;
  background: var(--bg-surface);
  border-radius: 20px;
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-md);
}

.user-name {
  margin-bottom: 16px;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

/* PIN dots */
.pin-dots {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-bottom: 12px;
}

.dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--bg-surface-2);
  border: 1px solid var(--border-color);

  &.filled {
    background: var(--accent-primary);
    border-color: var(--accent-primary);
  }
}

/* Error */
.error-text {
  margin-bottom: 12px;
  font-size: 12px;
  color: #c62828;
}

/* Keypad */
.keypad {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.key {
  height: 56px;
  border-radius: 14px;
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  color: var(--text-primary);
  font-size: 18px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: var(--shadow-sm);

  &:active {
    transform: scale(0.96);
    box-shadow: none;
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    box-shadow: none;
  }
}

.key-clear,
.key-cancel {
  color: var(--text-muted);
}

.key-zero {
  grid-column: 2;
}
</style>
