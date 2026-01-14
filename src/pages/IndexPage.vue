<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { api } from 'boot/axios';
import NumericKeyboard from 'src/components/numeric-keyboard/NumericKeyboard.vue';
import { virtualKeyboardEnabled, setVirtualKeyboardEnabled } from 'boot/virtual-keyboard';

/* ============
 * Constants
 * ============ */

const logoUrl = new URL('../assets/logo.png', import.meta.url).href;

const BASE_URL_KEY = 'pos:IpAdress';

/* ============
 * Types
 * ============ */

type UserRole = 'ADMIN' | 'CASHIER' | 'MANAGER';
type UserStatus = 'ACTIVE' | 'INACTIVE';

interface ApiUser {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
}

interface UsersApiResponse {
  success: boolean;
  data: {
    users: ApiUser[];
  };
}

interface User {
  id: number;
  firstName: string;
  lastName: string;
  role: UserRole;
  email: string;
}

const vk = computed({
  get: () => virtualKeyboardEnabled.value,
  set: (v: boolean) => setVirtualKeyboardEnabled(v),
});

/* ============
 * State
 * ============ */

const router = useRouter();

const users = ref<User[]>([]);
const isLoading = ref(false);

/* Settings */
const showSettings = ref(false);
const serverIpAdress = ref('');
const printerIpAdress = ref('');

/* ============
 * Methods
 * ============ */

async function fetchUsers(): Promise<void> {
  isLoading.value = true;

  try {
    const response = await api.get<UsersApiResponse>('/users');

    users.value = response.data.data.users
      .filter((u) => u.status === 'ACTIVE')
      .map((u) => ({
        id: u.id,
        firstName: u.first_name,
        lastName: u.last_name,
        role: u.role,
        email: u.email,
      }));
  } catch (e) {
    console.error(e);
    users.value = [];
  } finally {
    isLoading.value = false;
  }
}

function reloadUsers(): void {
  // void fetchUsers();
  window.location.reload();
}

function goToPin(user: User): void {
  void router.push({
    name: 'pin',
    query: {
      email: user.email,
      name: `${user.firstName} ${user.lastName}`,
    },
  });
}

/* SETTINGS */

function openSettings(): void {
  serverIpAdress.value = localStorage.getItem(BASE_URL_KEY) ?? api.defaults.baseURL ?? '';
  showSettings.value = true;
}

function closeSettings(): void {
  showSettings.value = false;
}

/* VIRTUAL KEYBOARD HANDLERS */

function onKeyboardInput(value: string): void {
  serverIpAdress.value += value;
}

function onKeyboardBackspace(): void {
  serverIpAdress.value = serverIpAdress.value.slice(0, -1);
}

function onKeyboardClear(): void {
  serverIpAdress.value = '';
}

function onKeyboard2Input(value: string): void {
  printerIpAdress.value += value;
}

function onKeyboard2Backspace(): void {
  printerIpAdress.value = printerIpAdress.value.slice(0, -1);
}

function onKeyboard2Clear(): void {
  printerIpAdress.value = '';
}

function saveSettings(): void {
  if (!serverIpAdress.value.trim()) return;

  localStorage.setItem(BASE_URL_KEY, serverIpAdress.value);
  api.defaults.baseURL = serverIpAdress.value;
  window.location.reload();

  showSettings.value = false;
}

/* ============
 * Lifecycle
 * ============ */

onMounted(() => {
  void fetchUsers();
});
</script>
<template>
  <q-page class="page-users flex flex-center">
    <!-- TOP LEFT ACTIONS -->
    <div class="top-actions">
      <button class="icon-btn" @click="reloadUsers">
        <q-icon name="refresh" size="22px" />
      </button>

      <button class="icon-btn" @click="openSettings">
        <q-icon name="settings" size="22px" />
      </button>
    </div>

    <div class="users-wrapper">
      <div class="logo">
        <img :src="logoUrl" alt="Restaurant logo" />
      </div>

      <div class="title">Foydalanuvchini tanlang</div>

      <div v-if="isLoading" class="loading">Yuklanmoqda…</div>

      <div v-else class="users-grid">
        <button
          v-for="user in users"
          :key="user.id"
          type="button"
          class="user-card"
          @click="goToPin(user)"
        >
          <div class="avatar">
            <q-icon name="person" size="28px" />
          </div>

          <div class="name">{{ user.firstName }} {{ user.lastName }}</div>
          <div class="role">{{ user.role }}</div>
        </button>
      </div>
    </div>

    <!-- SETTINGS DIALOG -->
    <div v-if="showSettings" class="modal-backdrop" @click.self="closeSettings">
      <div class="modal">
        <div class="modal-title">Server sozlamalari</div>

        <div class="content">
          <div class="left">
            <label class="field-label">Ip Adress Server</label>

            <input class="input-display" v-model="serverIpAdress" />

            <NumericKeyboard
              dot
              class="keyboard-numeric"
              @input="onKeyboardInput"
              @backspace="onKeyboardBackspace"
              @clear="onKeyboardClear"
              style="margin-bottom: 10px"
            />
          </div>
          <div class="right">
            <label class="field-label">Ip Adress Server</label>

            <input class="input-display" v-model="serverIpAdress" />

            <NumericKeyboard
              dot
              class="keyboard-numeric"
              @input="onKeyboard2Input"
              @backspace="onKeyboard2Backspace"
              @clear="onKeyboard2Clear"
              style="margin-bottom: 10px"
            />
          </div>
        </div>
        <q-toggle v-model="vk" color="green" label="Virtual klaviatura" left-label />

        <div class="actions">
          <button class="btn secondary" @click="closeSettings">Bekor qilish</button>
          <button class="btn primary" @click="saveSettings">Saqlash</button>
        </div>
      </div>
    </div>
  </q-page>
</template>

<style scoped lang="scss">
.page-users {
  background: var(--bg-app);
  position: relative;
  --accent-primary: #ff7a00;
}

/* TOP LEFT */
.top-actions {
  position: absolute;
  top: 16px;
  left: 16px;
  display: flex;
  gap: 8px;
}

.icon-btn {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  color: var(--text-primary);
  box-shadow: var(--shadow-sm);
  cursor: pointer;

  &:active {
    transform: scale(0.95);
    box-shadow: none;
  }
}

/* USERS */
.users-wrapper {
  width: 100%;
  padding: 32px 24px;
  text-align: center;
}

.logo img {
  height: 164px;
}

.title {
  margin: 24px 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
}

.loading {
  color: var(--text-muted);
}

.users-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.user-card {
  background: var(--bg-surface);
  border-radius: 16px;
  padding: 20px;
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-sm);
  cursor: pointer;

  &:active {
    transform: scale(0.97);
    box-shadow: none;
  }
}

.avatar {
  width: 56px;
  height: 56px;
  margin: 0 auto 12px;
  border-radius: 50%;
  background: var(--bg-surface-2);
  color: var(--accent-primary);
  display: flex;
  align-items: center;
  justify-content: center;
}

.name {
  font-size: 16px;
  font-weight: 500;
}

.role {
  font-size: 12px;
  color: var(--text-muted);
}

/* DIALOG */
.modal {
  margin-inline: 5px;
}
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.modal {
  background: var(--bg-surface);
  border-radius: 16px;
  padding: 16px;
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-md);
}

.modal-title {
  color: var(--text-primary);
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 12px;
}

.content {
  display: flex;
  gap: 10px;
  .left,
  .right {
    width: 270px;
  }
}

.field-label {
  color: var(--text-muted);
  font-size: 14px;
}

.input-display {
  width: 100%;
  height: 44px;
  margin-top: 6px;
  padding: 0 12px;
  border-radius: 12px;
  background: var(--bg-surface-2);
  color: var(--text-primary);
  display: flex;
  align-items: center;
  margin-bottom: 12px;
  border: 1px solid var(--border-color);
}

.actions {
  display: flex;
  gap: 8px;
}

.btn {
  flex: 1;
  height: 44px;
  border-radius: 12px;
  border: none;
  font-weight: 600;
  cursor: pointer;
}

.btn.primary {
  background: var(--accent-primary);
  color: #ffffff;
  box-shadow: var(--shadow-sm);

  &:active {
    transform: scale(0.97);
    box-shadow: none;
  }
}

.btn.secondary {
  background: var(--btn-secondary-bg);
  color: var(--btn-secondary-text);
  box-shadow: var(--shadow-sm);

  &:active {
    transform: scale(0.97);
    box-shadow: none;
  }
}
</style>
