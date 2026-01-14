<template>
  <button
    v-if="isAdmin"
    type="button"
    class="settings-btn"
    @click="goToSettings"
    :title="'Sozlamalar'"
  >
    <q-icon name="settings" size="24px" />
    <span v-if="showLabel">Sozlamalar</span>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';

interface Props {
  showLabel?: boolean;
}

withDefaults(defineProps<Props>(), {
  showLabel: false,
});

const router = useRouter();

interface AuthUser {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  role: 'ADMIN' | 'CASHIER' | 'MANAGER';
  status: 'ACTIVE' | 'INACTIVE';
}

const isAdmin = computed<boolean>(() => {
  try {
    const authUserStr = localStorage.getItem('auth_user');
    if (!authUserStr) return false;

    const user = JSON.parse(authUserStr) as AuthUser;
    return user.role === 'ADMIN';
  } catch {
    return false;
  }
});

function goToSettings(): void {
  void router.push({ name: 'settings-receipt' });
}
</script>

<style scoped lang="scss">
.settings-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: var(--bg-surface-2);
  }

  &:active {
    transform: scale(0.97);
  }

  .q-icon {
    color: var(--text-muted);
  }
}
</style>
