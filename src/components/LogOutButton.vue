<template>
  <!-- LOGOUT BUTTON -->
  <button type="button" class="logout-fab" @click="openConfirm">Chiqish</button>

  <!-- CONFIRM DIALOG -->
  <div v-if="showConfirm" class="confirm-backdrop" @click.self="closeConfirm">
    <div class="confirm-modal">
      <div class="confirm-title">Chiqishni tasdiqlaysizmi?</div>

      <div class="confirm-text">Tizimdan chiqilgandan so‘ng qayta kirish talab qilinadi.</div>

      <div class="confirm-actions">
        <button type="button" class="btn secondary" @click="closeConfirm">Bekor qilish</button>

        <button type="button" class="btn danger" @click="confirmLogout">Chiqish</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from 'boot/axios';

const router = useRouter();
const showConfirm = ref<boolean>(false);

function openConfirm(): void {
  showConfirm.value = true;
}

function closeConfirm(): void {
  showConfirm.value = false;
}

async function confirmLogout(): Promise<void> {
  showConfirm.value = false;

  try {
    await api.post('/auth-logout');
  } catch {
    // backend failure is ignored on purpose
  } finally {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');

    void router.replace({ name: 'users' });
  }
}
</script>

<style scoped lang="scss">
/* LOGOUT BUTTON */
.logout-fab {
  min-height: 42px;
  height: 100%;
  background: var(--warning-bg);
  color: var(--warning-text);

  border: 1px solid var(--warning-text);
  border-radius: 14px;
  padding: 0 18px;

  font-size: 14px;
  font-weight: 500;

  box-shadow: var(--shadow-sm);
  cursor: pointer;

  transition:
    background-color 0.15s ease,
    transform 0.1s ease;

  &:hover {
    background: var(--bg-surface-2);
    color: var(--text-primary);
  }

  &:active {
    transform: scale(0.97);
  }
}

/* BACKDROP */
.confirm-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(17, 24, 39, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 3000;
}

/* MODAL */
.confirm-modal {
  width: 420px;
  background: var(--bg-surface);
  border-radius: 16px;
  padding: 16px;

  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-md);

  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* TEXT */
.confirm-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.confirm-text {
  font-size: 14px;
  color: var(--text-muted);
}

/* ACTIONS */
.confirm-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

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

.btn.secondary {
  background: var(--btn-secondary-bg);
  color: var(--btn-secondary-text);
}

.btn.danger {
  background: var(--danger-bg);
  color: var(--danger-text);
  border: 1px solid var(--danger-text);
}
</style>
