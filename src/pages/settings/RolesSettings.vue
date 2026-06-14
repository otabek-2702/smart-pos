<template>
  <div class="roles-settings">
    <!-- Backend-not-ready notice — mirrors the pattern used on CashBoxPage. -->
    <div v-if="!apiAvailable" class="api-banner">
      <q-icon name="info" size="22px" class="api-banner__icon" />
      <div class="api-banner__body">
        <div class="api-banner__title">Rollar moduli hali mavjud emas</div>
        <div class="api-banner__text">
          Server <code>/api/admins/roles</code> va <code>/api/admins/permissions</code>
          endpointlarini hali qoʻllab-quvvatlamaydi. Bu sahifa backend tayyor
          boʻlganda ishlaydi.
        </div>
      </div>
    </div>

    <header class="header">
      <div>
        <h2 class="title">Rollar va ruxsatlar</h2>
        <p class="subtitle">
          Har bir rol uchun yoqilgan amallarni belgilang. Oʻzgarishlar saqlangach,
          bu roldagi xodimlar keyingi kirishidan boshlab ta'sir koʻradi.
        </p>
      </div>
      <button
        type="button"
        class="btn primary"
        :disabled="!apiAvailable || !selectedRole || saving || !dirty"
        @click="save"
      >
        <span v-if="saving">Saqlanmoqda…</span>
        <span v-else>Saqlash</span>
      </button>
    </header>

    <div v-if="loading" class="status">Yuklanmoqda…</div>

    <div v-else-if="apiAvailable && roles.length > 0" class="body">
      <!-- Role tabs -->
      <div class="role-tabs">
        <button
          v-for="role in roles"
          :key="role.name"
          type="button"
          class="role-tab"
          :class="{ active: selectedRoleName === role.name }"
          @click="selectRole(role.name)"
        >
          <q-icon name="badge" size="18px" />
          {{ role.name }}
          <span class="role-tab__count">{{ role.permissions.length }}</span>
        </button>
      </div>

      <!-- Permission groups -->
      <div v-if="selectedRole" class="groups">
        <div v-for="group in groupedPermissions" :key="group.name" class="group">
          <div class="group-header">
            <h3>{{ group.name }}</h3>
            <button
              type="button"
              class="group-toggle"
              @click="toggleGroup(group)"
            >
              {{ groupAllSelected(group) ? 'Hammasini olib tashlash' : 'Hammasini tanlash' }}
            </button>
          </div>
          <div class="checkbox-grid">
            <label
              v-for="perm in group.permissions"
              :key="perm.key"
              class="perm"
              :class="{ checked: draftSet.has(perm.key) }"
            >
              <input
                type="checkbox"
                :checked="draftSet.has(perm.key)"
                @change="togglePerm(perm.key)"
              />
              <span class="perm-label">{{ perm.label }}</span>
              <span class="perm-key">{{ perm.key }}</span>
            </label>
          </div>
        </div>
      </div>
    </div>

    <div v-else-if="apiAvailable" class="status">Hech qanday rol topilmadi.</div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from 'boot/axios';
import type { AxiosError } from 'axios';

interface Permission {
  key: string;
  label: string;
  group: string;
}
interface Role {
  name: string;
  permissions: string[];
}
interface PermissionsResponse {
  success: boolean;
  data: { permissions: Permission[] };
}
interface RolesResponse {
  success: boolean;
  data: { roles: Role[] };
}
interface SaveRoleResponse {
  success: boolean;
  data: Role;
}

const loading = ref(false);
const saving = ref(false);
const apiAvailable = ref(true);

const permissions = ref<Permission[]>([]);
const roles = ref<Role[]>([]);
const selectedRoleName = ref<string | null>(null);

// Local working copy of the selected role's permissions; only flushed to the
// server on Save. Set-backed so toggle + dirty check are O(1).
const draftSet = ref<Set<string>>(new Set());
const originalSet = ref<Set<string>>(new Set());

const selectedRole = computed<Role | null>(() =>
  roles.value.find((r) => r.name === selectedRoleName.value) ?? null,
);

// Group permissions by .group for the checkbox grid.
interface PermissionGroup {
  name: string;
  permissions: Permission[];
}
const groupedPermissions = computed<PermissionGroup[]>(() => {
  const map = new Map<string, Permission[]>();
  for (const p of permissions.value) {
    const list = map.get(p.group) ?? [];
    list.push(p);
    map.set(p.group, list);
  }
  return Array.from(map.entries()).map(([name, perms]) => ({ name, permissions: perms }));
});

const dirty = computed<boolean>(() => {
  if (draftSet.value.size !== originalSet.value.size) return true;
  for (const k of draftSet.value) if (!originalSet.value.has(k)) return true;
  return false;
});

function selectRole(name: string): void {
  if (dirty.value && !confirm('Saqlanmagan oʻzgarishlar bor. Davom etamizmi?')) {
    return;
  }
  selectedRoleName.value = name;
  const role = roles.value.find((r) => r.name === name);
  const perms = role?.permissions ?? [];
  draftSet.value = new Set(perms);
  originalSet.value = new Set(perms);
}

function togglePerm(key: string): void {
  const next = new Set(draftSet.value);
  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }
  draftSet.value = next;
}

function groupAllSelected(group: PermissionGroup): boolean {
  return group.permissions.every((p) => draftSet.value.has(p.key));
}

function toggleGroup(group: PermissionGroup): void {
  const all = groupAllSelected(group);
  const next = new Set(draftSet.value);
  for (const p of group.permissions) {
    if (all) next.delete(p.key);
    else next.add(p.key);
  }
  draftSet.value = next;
}

async function load(): Promise<void> {
  loading.value = true;
  try {
    const [permsRes, rolesRes] = await Promise.all([
      api.get<PermissionsResponse>('/api/admins/permissions'),
      api.get<RolesResponse>('/api/admins/roles'),
    ]);
    permissions.value = permsRes.data.data.permissions;
    roles.value = rolesRes.data.data.roles;
    apiAvailable.value = true;
    if (roles.value.length > 0 && roles.value[0]) {
      selectRoleSilently(roles.value[0].name);
    }
  } catch (e) {
    const status = (e as AxiosError)?.response?.status;
    if (status === 404) {
      apiAvailable.value = false;
    } else {
      console.error('Failed to load roles/permissions:', e);
    }
  } finally {
    loading.value = false;
  }
}

// Bypass the unsaved-changes confirm — used on initial load.
function selectRoleSilently(name: string): void {
  selectedRoleName.value = name;
  const role = roles.value.find((r) => r.name === name);
  const perms = role?.permissions ?? [];
  draftSet.value = new Set(perms);
  originalSet.value = new Set(perms);
}

async function save(): Promise<void> {
  if (!selectedRoleName.value || saving.value) return;
  saving.value = true;
  try {
    const next = Array.from(draftSet.value);
    const res = await api.patch<SaveRoleResponse>(
      `/api/admins/roles/${encodeURIComponent(selectedRoleName.value)}`,
      { permissions: next },
    );
    // Update local cache so the next selectRole reflects what's on the server.
    const saved = res.data.data;
    const idx = roles.value.findIndex((r) => r.name === saved.name);
    if (idx >= 0) roles.value[idx] = saved;
    originalSet.value = new Set(saved.permissions);
    draftSet.value = new Set(saved.permissions);
    alert('Saqlandi');
  } catch (e) {
    console.error('Failed to save role permissions:', e);
    alert('Saqlashda xatolik');
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<style scoped lang="scss">
.roles-settings {
  padding: 16px;
  max-width: 1100px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.api-banner {
  display: flex;
  gap: 12px;
  padding: 14px 16px;
  background: var(--warning-weak);
  border: 1px solid color-mix(in srgb, var(--warning) 35%, transparent);
  border-radius: 12px;
  color: var(--text-primary);
}
.api-banner__icon { color: var(--warning); flex-shrink: 0; margin-top: 2px; }
.api-banner__title { font-weight: 600; font-size: 14px; margin-bottom: 4px; }
.api-banner__text { font-size: 13px; color: var(--text-muted); line-height: 1.5; }
.api-banner__text code {
  background: var(--bg-surface-2);
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 12px;
  color: var(--text-primary);
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}
.title { margin: 0 0 4px; font-size: 20px; font-weight: 700; color: var(--text-primary); }
.subtitle { margin: 0; font-size: 13px; color: var(--text-muted); max-width: 720px; line-height: 1.5; }

.status { padding: 40px; text-align: center; color: var(--text-muted); }

.body { display: flex; flex-direction: column; gap: 16px; }

/* Role tabs */
.role-tabs {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  padding: 8px;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 14px;
}
.role-tab {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  color: var(--text-primary);
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover { background: var(--bg-surface-2); }
  &:active { transform: scale(0.98); }

  &.active {
    background: var(--accent-soft);
    border-color: var(--accent-primary);
    color: var(--accent-primary);
  }
}
.role-tab__count {
  background: var(--bg-surface-2);
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 700;
  color: var(--text-muted);
}
.role-tab.active .role-tab__count {
  background: var(--accent-primary);
  color: var(--on-primary);
}

/* Permission groups */
.groups { display: flex; flex-direction: column; gap: 12px; }
.group {
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 14px;
}
.group-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;

  h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 700;
    color: var(--text-primary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
}
.group-toggle {
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 12px;
  color: var(--text-muted);
  cursor: pointer;

  &:hover { color: var(--accent-primary); border-color: var(--accent-primary); }
}

.checkbox-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 8px;
}
.perm {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: var(--bg-surface-2);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  cursor: pointer;
  user-select: none;
  transition: all 0.15s ease;

  input { width: 18px; height: 18px; cursor: pointer; }

  &:hover { border-color: var(--accent-primary); }

  &.checked {
    background: var(--accent-soft);
    border-color: var(--accent-primary);
  }
}
.perm-label { flex: 1; font-size: 14px; color: var(--text-primary); font-weight: 500; }
.perm-key {
  font-family: monospace;
  font-size: 11px;
  color: var(--text-muted);
  background: var(--bg-surface);
  padding: 2px 6px;
  border-radius: 4px;
}

/* Buttons */
.btn {
  height: 42px;
  padding: 0 18px;
  border-radius: 12px;
  border: none;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: var(--shadow-sm);

  &:disabled { opacity: 0.55; cursor: not-allowed; }
  &:active:not(:disabled) { transform: scale(0.97); }
}
.btn.primary { background: var(--accent-primary); color: var(--on-primary); }
</style>
