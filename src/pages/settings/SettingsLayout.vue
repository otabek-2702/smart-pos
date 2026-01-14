<template>
  <q-page class="settings-page">
    <!-- Header -->
    <div class="settings-header">
      <button type="button" class="back-btn" @click="goBack">
        <q-icon name="arrow_back" size="24px" />
      </button>
      <h1 class="settings-title">Sozlamalar</h1>
    </div>

    <div class="settings-container">
      <!-- Sidebar -->
      <nav class="settings-sidebar">
        <router-link
          v-for="item in menuItems"
          :key="item.route"
          :to="{ name: item.route }"
          class="sidebar-item"
          :class="{ active: currentRoute === item.route }"
        >
          <q-icon :name="item.icon" size="24px" />
          <span>{{ item.label }}</span>
        </router-link>

        <!-- Future items (disabled) -->
        <div
          v-for="item in futureItems"
          :key="item.label"
          class="sidebar-item disabled"
        >
          <q-icon :name="item.icon" size="24px" />
          <span>{{ item.label }}</span>
          <span class="badge">Tez kunda</span>
        </div>
      </nav>

      <!-- Content -->
      <div class="settings-content">
        <router-view />
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';

const router = useRouter();
const route = useRoute();

const currentRoute = computed(() => route.name);

interface MenuItem {
  route: string;
  label: string;
  icon: string;
}

interface FutureItem {
  label: string;
  icon: string;
}

const menuItems: MenuItem[] = [
  { route: 'settings-receipt', label: 'Chek sozlamalari', icon: 'receipt_long' },
  { route: 'settings-printer', label: 'Printer sozlamalari', icon: 'print' },
];

const futureItems: FutureItem[] = [
  { label: 'Mahsulotlar', icon: 'inventory_2' },
  { label: 'Kategoriyalar', icon: 'category' },
  { label: 'Displey ranglari', icon: 'palette' },
  { label: 'Foydalanuvchilar', icon: 'group' },
];

function goBack(): void {
  void router.push({ name: 'orders' });
}
</script>

<style scoped lang="scss">
.settings-page {
  background: var(--bg-app);
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.settings-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 24px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border-color);
}

.back-btn {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  color: var(--text-primary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;

  &:hover {
    background: var(--bg-surface-2);
  }

  &:active {
    transform: scale(0.95);
  }
}

.settings-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.settings-container {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.settings-sidebar {
  width: 280px;
  background: var(--bg-surface);
  border-right: 1px solid var(--border-color);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
}

.sidebar-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 12px;
  color: var(--text-muted);
  text-decoration: none;
  font-size: 15px;
  font-weight: 500;
  transition: all 0.2s ease;
  cursor: pointer;

  &:hover:not(.disabled) {
    background: var(--bg-surface-2);
    color: var(--text-primary);
  }

  &.active {
    background: var(--accent-primary);
    color: white;

    .q-icon {
      color: white;
    }
  }

  &.disabled {
    opacity: 0.5;
    cursor: not-allowed;
    position: relative;
  }
}

.badge {
  margin-left: auto;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  background: var(--bg-surface-2);
  color: var(--text-muted);
}

.settings-content {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
  background: var(--bg-app);
}
</style>
