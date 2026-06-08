<template>
  <!-- LOGOUT BUTTON -->
  <button type="button" class="logout-fab" @click="openConfirm">
    <q-icon name="logout" size="22px" />

    Chiqish
  </button>

  <!-- CONFIRM DIALOG -->
  <div v-if="showConfirm" class="confirm-backdrop" @click.self="closeConfirm">
    <div class="confirm-modal">
      <div class="confirm-title">Chiqishni tasdiqlaysizmi?</div>

      <div class="confirm-text">Tizimdan chiqilgandan so‘ng qayta kirish talab qilinadi.</div>

      <button type="button" class="btn shift" @click="openShiftClose">
        <q-icon name="point_of_sale" size="18px" />
        Smenani yakunlash va chiqish
      </button>

      <div class="confirm-actions">
        <button type="button" class="btn secondary" @click="closeConfirm">Bekor qilish</button>

        <button type="button" class="btn danger" @click="confirmLogout">Chiqish (smena ochiq)</button>
      </div>
    </div>
  </div>

  <!-- Shift close (per-payment-type reconciliation) → then logout -->
  <ShiftCloseDialog v-model="showShiftClose" @closed="doLogout" />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from 'boot/axios';
import { remove } from 'src/utils/storage';
import ShiftCloseDialog from 'src/components/ShiftCloseDialog.vue';

const router = useRouter();
const showConfirm = ref<boolean>(false);
const showShiftClose = ref<boolean>(false);

function openConfirm(): void {
  showConfirm.value = true;
}

function closeConfirm(): void {
  showConfirm.value = false;
}

// Open the shift-close (reconciliation) flow; it logs out via @closed → doLogout.
function openShiftClose(): void {
  showConfirm.value = false;
  showShiftClose.value = true;
}

// Plain logout — keeps the shift open so the cashier can resume after re-login.
function confirmLogout(): void {
  showConfirm.value = false;
  void doLogout();
}

async function doLogout(): Promise<void> {
  try {
    await api.post('/auth-logout');
  } catch {
    // backend failure is ignored on purpose
  } finally {
    // Await the deletes so the in-memory cache is empty before the router
    // navigates to a page that would re-issue requests.
    await remove('auth_token');
    await remove('auth_user');

    void router.replace({ name: 'users' });
  }
}
</script>

<style scoped lang="scss">
/* LOGOUT BUTTON */
.logout-fab {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 42px;
  height: 42px;
  white-space: nowrap;

  background: var(--btn-secondary-bg);
  color: var(--btn-secondary-text);

  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 0 18px;

  font-size: 14px;
  font-weight: 600;

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

.confirm-check {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--text-primary);
  cursor: pointer;
  user-select: none;

  input { width: 18px; height: 18px; cursor: pointer; }
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

.btn.shift {
  width: 100%;
  background: var(--accent-primary, #ff7a00);
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
</style>
