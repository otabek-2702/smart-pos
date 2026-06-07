<template>
  <q-page class="page-pin flex flex-center">
    <div 
      ref="focusRef"
      tabindex="0"
      class="pin-focus-wrapper"
      @keydown="onPhysicalKeyPress"
    >
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
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from 'boot/axios';
import { read, write } from 'src/utils/storage';
import { usePinHandoffStore } from 'src/stores/pin-handoff';
import { loadPaymentMethods } from 'src/composables/usePaymentMethods';
import { ensureShiftStarted } from 'src/composables/useShift';
import type { AxiosError } from 'axios';

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
      // Granular permission keys; '*' means all. Per-route gating reads
      // this from the cached auth_user (see usePermissions composable).
      // Optional on the wire for backward compat with older builds.
      permissions?: string[];
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
const pinHandoff = usePinHandoffStore();

/* ============
 * State
 * ============ */

const focusRef = ref<HTMLDivElement | null>(null);
const pin = ref<string>('');
const isLoading = ref<boolean>(false);
const errorMessage = ref<string>('');

const numberKeys: ReadonlyArray<number> = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/* ============
 * Computed
 * ============ */

// Handoff comes from the Pinia store (set by the picker). Fall back to route
// query for any legacy/external navigation that still passes them.
const userEmail = computed<string | null>(() => {
  if (pinHandoff.email) return pinHandoff.email;
  const value = route.query.email;
  return typeof value === 'string' ? value : null;
});

// Preferred login key: the picker hands off the user id (the `/cashiers`
// endpoint no longer returns email). Email is the legacy fallback.
const userId = computed<number | null>(() => {
  if (pinHandoff.userId != null) return pinHandoff.userId;
  const v = route.query.user_id;
  return typeof v === 'string' && v !== '' ? Number(v) : null;
});

const userName = computed<string>(() => {
  if (pinHandoff.name) return pinHandoff.name;
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
  errorMessage.value = '';
}

// Handle physical keyboard input
function onPhysicalKeyPress(event: KeyboardEvent): void {
  if (isLoading.value) return;

  // Number keys (0-9)
  if (/^[0-9]$/.test(event.key)) {
    event.preventDefault();
    onKeyPress(parseInt(event.key, 10));
    return;
  }

  // Backspace
  if (event.key === 'Backspace') {
    event.preventDefault();
    removeLast();
    return;
  }

  // Escape - go back
  if (event.key === 'Escape') {
    event.preventDefault();
    goBack();
    return;
  }
}

// Keep focus on wrapper for keyboard input
function maintainFocus(): void {
  if (focusRef.value && document.activeElement !== focusRef.value) {
    // Only refocus if not clicking on a button
    const active = document.activeElement;
    if (!active || !active.closest('.keypad')) {
      focusRef.value.focus();
    }
  }
}

async function submitPin(): Promise<void> {
  if (userId.value == null && !userEmail.value) {
    void router.replace({ name: 'users' });
    return;
  }

  isLoading.value = true;
  const enteredPin = pin.value;

  try {
    // Log in by user_id when we have it (current picker), else by email (legacy).
    const credentials =
      userId.value != null ? { user_id: userId.value } : { email: userEmail.value };
    const response = await api.post<LoginResponse>('/auth-login', {
      ...credentials,
      password: +enteredPin,
    });

    const { token, user } = response.data.data;

    // Await both so a redirect + next-page-fetch can't race the writes
    // (axios's request interceptor would otherwise read an empty token
    // from the in-memory cache).
    await write('auth_token', token);
    await write('auth_user', user);

    await cacheUserForPicker(user);

    // Cache the payment-methods catalog once per session (not on the hot
    // payment path). Fire-and-forget; falls back to built-ins if absent.
    void loadPaymentMethods();

    // Open the cashier's shift (manual now — login no longer auto-starts it).
    // Resumes if one's already open. Fire-and-forget.
    void ensureShiftStarted();

    void router.replace({ name: 'orders' });
    return;
  } catch (error) {
    const axiosErr = error as AxiosError;
    const status = axiosErr.response?.status;

    // Local backend answered with an auth/server response → wrong PIN.
    if (status !== undefined) {
      errorMessage.value = "PIN noto'g'ri";
      pin.value = '';
      focusRef.value?.focus();
      return;
    }

    // No response = local backend unreachable. The system requires the
    // local backend to operate; block login with a clear message.
    errorMessage.value = "Server bilan aloqa yo'q. Lokal serverni tekshiring.";
    pin.value = '';
    focusRef.value?.focus();
  } finally {
    isLoading.value = false;
  }
}

function goBack(): void {
  void router.replace({ name: 'users' });
}

interface CachedUser {
  id: number;
  firstName: string;
  lastName: string;
  role: UserRole;
  email: string;
}

const CACHED_USERS_KEY = 'pos:cachedUsers';

async function cacheUserForPicker(
  user: LoginResponse['data']['user'],
): Promise<void> {
  try {
    const list = read<CachedUser[]>(CACHED_USERS_KEY) ?? [];
    const next: CachedUser = {
      id: user.id,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role,
      email: user.email,
    };
    const dedup = list.filter((u) => u.email !== next.email);
    dedup.push(next);
    await write(CACHED_USERS_KEY, dedup);
  } catch (e) {
    console.warn('Failed to cache user for picker:', e);
  }
}

/* ============
 * Lifecycle
 * ============ */

let focusInterval: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  // Guard: need either a user_id (current picker) or an email (legacy) to log in.
  if (userId.value == null && !userEmail.value) {
    void router.replace({ name: 'users' });
    return;
  }

  // Initial focus
  focusRef.value?.focus();

  // Maintain focus periodically (for when clicking outside)
  focusInterval = setInterval(maintainFocus, 500);
});

onUnmounted(() => {
  if (focusInterval) {
    clearInterval(focusInterval);
  }
});
</script>

<style scoped lang="scss">
.page-pin {
  background: var(--bg-app);
  position: relative;
}

.pin-focus-wrapper {
  outline: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  position: relative;
}

/* Back button — fixed to the viewport so it's always at the screen's
   top-left, regardless of where the centered PIN card sits. */
.back-button {
  position: fixed;
  top: 16px;
  left: 16px;
  z-index: 10;
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
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  transition: all 0.15s ease;

  &.filled {
    background: var(--accent-primary);
    border-color: var(--accent-primary);
    transform: scale(1.1);
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
  transition: transform 0.1s ease, box-shadow 0.1s ease;

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

/* "Bekor qilish" is a long label in a ~100px keypad cell — shrink it so it
   stays on one line instead of wrapping/clipping. */
.key-cancel {
  font-size: 13px;
  padding: 0 4px;
}

.key-zero {
  grid-column: 2;
}
</style>