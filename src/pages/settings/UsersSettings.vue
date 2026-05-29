<template>
  <div class="users-settings">
    <!-- Header -->
    <div class="page-header">
      <div class="header-left">
        <h2 class="page-title">Foydalanuvchilar</h2>
        <span class="user-count">{{ users.length }} ta</span>
      </div>
      <button
        type="button"
        class="btn-add"
        :disabled="!apiAvailable"
        :title="apiAvailable ? '' : 'Backend hali tayyor emas'"
        @click="openCreateDialog"
      >
        <q-icon name="add" size="20px" />
        Qo'shish
      </button>
    </div>

    <!-- Backend-not-ready notice -->
    <div v-if="!apiAvailable" class="api-banner">
      <q-icon name="info" size="22px" class="api-banner__icon" />
      <div class="api-banner__body">
        <div class="api-banner__title">Foydalanuvchilarni boshqarish hali mavjud emas</div>
        <div class="api-banner__text">
          Server <code>/users</code> endpointini hali qo'llab-quvvatlamaydi.
          Foydalanuvchilarni hozircha Django admin paneli orqali qo'shing
          (<code>http://&lt;server&gt;:8000/admin/</code>).
        </div>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="loading-state">
      <q-spinner size="40px" color="primary" />
      <span>Yuklanmoqda...</span>
    </div>

    <!-- Empty State -->
    <div v-else-if="users.length === 0 && apiAvailable" class="empty-state">
      <q-icon name="people" size="64px" />
      <h3>Foydalanuvchilar yo'q</h3>
      <p>Birinchi foydalanuvchini qo'shing</p>
      <button type="button" class="btn-add" @click="openCreateDialog">
        <q-icon name="add" size="20px" />
        Foydalanuvchi qo'shish
      </button>
    </div>

    <!-- Users Grid -->
    <div v-else class="users-grid">
      <div
        v-for="user in users"
        :key="user.id"
        class="user-card"
        @click="openEditDialog(user)"
      >
        <div class="user-avatar">
          {{ getInitials(user.first_name, user.last_name) }}
        </div>
        <div class="user-info">
          <span class="user-name">{{ user.first_name }} {{ user.last_name }}</span>
          <span class="user-role" :class="getRoleClass(user.role)">
            {{ getRoleLabel(user.role) }}
          </span>
        </div>
        <q-icon name="chevron_right" size="20px" class="card-arrow" />
      </div>
    </div>

    <!-- Create/Edit Dialog -->
    <q-dialog v-model="showDialog">
      <div class="user-dialog" @click.stop>
        <div class="dialog-header">
          <h3>{{ isEditing ? 'Foydalanuvchini tahrirlash' : 'Foydalanuvchi qo\'shish' }}</h3>
          <button type="button" class="btn-close" @click="closeDialog">
            <q-icon name="close" size="24px" />
          </button>
        </div>

        <div class="dialog-content">
          <!-- Left Side: Form -->
          <div class="dialog-left">
            <!-- First Name -->
            <div class="form-group">
              <label class="form-label">Ism</label>
              <input
                ref="firstNameRef"
                type="text"
                v-model="form.first_name"
                class="form-input"
                placeholder="Ism"
                maxlength="50"
              />
            </div>

            <!-- Last Name -->
            <div class="form-group">
              <label class="form-label">Familiya</label>
              <input
                type="text"
                v-model="form.last_name"
                class="form-input"
                placeholder="Familiya"
                maxlength="50"
              />
            </div>

            <!-- Email -->
            <!-- <div class="form-group">
              <label class="form-label">Email</label>
              <input
                type="email"
                v-model="form.email"
                class="form-input"
                placeholder="email@example.com"
                maxlength="100"
              />
            </div> -->

            <!-- Role -->
            <div class="form-group">
              <label class="form-label">Rol</label>
              <div class="role-selector">
                <button
                  v-for="role in roles"
                  :key="role.value"
                  type="button"
                  class="role-btn"
                  :class="{ active: form.role === role.value }"
                  @click="form.role = role.value"
                >
                  <q-icon :name="role.icon" size="20px" />
                  {{ role.label }}
                </button>
              </div>
            </div>
          </div>

          <!-- Right Side: PIN Numpad -->
          <div class="dialog-right">
            <div class="pin-section">
              <label class="form-label pin-label">
                {{ isEditing ? 'Yangi PIN' : 'PIN kod' }}
                <span v-if="isEditing" class="pin-hint">(bo'sh = o'zgarmaydi)</span>
              </label>

              <!-- PIN Display -->
              <div 
                class="pin-display"
                tabindex="0"
                ref="pinDisplayRef"
                @keydown="onPinKeydown"
              >
                <span 
                  v-for="i in 4" 
                  :key="i" 
                  class="pin-digit"
                  :class="{ filled: form.password.length >= i }"
                >
                  {{ form.password.length >= i ? '•' : '' }}
                </span>
              </div>

              <!-- Numpad -->
              <div class="numpad">
                <button
                  v-for="num in [1, 2, 3, 4, 5, 6, 7, 8, 9]"
                  :key="num"
                  type="button"
                  class="numpad-btn"
                  @click="onNumpadPress(num)"
                >
                  {{ num }}
                </button>
                <button type="button" class="numpad-btn numpad-clear" @click="clearPin">
                  C
                </button>
                <button type="button" class="numpad-btn" @click="onNumpadPress(0)">
                  0
                </button>
                <button type="button" class="numpad-btn numpad-backspace" @click="removeLastDigit">
                  ⌫
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="dialog-footer">
          <button
            v-if="isEditing"
            type="button"
            class="btn-delete"
            @click="confirmDelete"
            :disabled="saving"
          >
            <q-icon name="delete" size="20px" />
            O'chirish
          </button>
          <div class="footer-right">
            <button
              type="button"
              class="btn-save"
              @click="saveUser"
              :disabled="!isFormValid || saving"
            >
              <q-spinner v-if="saving" size="18px" color="white" />
              <span v-else>{{ isEditing ? 'Saqlash' : 'Qo\'shish' }}</span>
            </button>
          </div>
        </div>
      </div>
    </q-dialog>

    <!-- Delete Confirmation Dialog -->
    <q-dialog v-model="showDeleteConfirm">
      <div class="confirm-dialog" @click.stop>
        <div class="confirm-icon">
          <q-icon name="warning" size="48px" color="negative" />
        </div>
        <h3>Foydalanuvchini o'chirish</h3>
        <p>"{{ editingUser?.first_name }} {{ editingUser?.last_name }}" ni o'chirishni xohlaysizmi?</p>
        <div class="confirm-actions">
          <button type="button" class="btn-cancel" @click="showDeleteConfirm = false">
            Bekor qilish
          </button>
          <button type="button" class="btn-delete-confirm" @click="deleteUser" :disabled="deleting">
            <q-spinner v-if="deleting" size="18px" color="white" />
            <span v-else>O'chirish</span>
          </button>
        </div>
      </div>
    </q-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, nextTick } from 'vue';
import { api } from 'boot/axios';
import { toast } from 'vue3-toastify';

// Types
interface User {
  id: number;
  first_name: string;
  last_name: string;
  // email: string;
  role: UserRole;
  status: string;
  last_login_at: string | null;
}

type UserRole = 'ADMIN' | 'COOK' | 'CASHIER';

interface UsersResponse {
  success: boolean;
  data: {
    users: User[];
    pagination: {
      current_page: number;
      total_pages: number;
      total_users: number;
    };
  };
}

// Roles config
const roles: { value: UserRole; label: string; icon: string }[] = [
  { value: 'ADMIN', label: 'Admin', icon: 'admin_panel_settings' },
  { value: 'COOK', label: 'Oshpaz', icon: 'restaurant' },
  { value: 'CASHIER', label: 'Kassir', icon: 'point_of_sale' },
];

// State
const users = ref<User[]>([]);
const loading = ref(true);
const saving = ref(false);
const deleting = ref(false);
const showDialog = ref(false);
const showDeleteConfirm = ref(false);
const isEditing = ref(false);
const editingUser = ref<User | null>(null);
const firstNameRef = ref<HTMLInputElement | null>(null);
const pinDisplayRef = ref<HTMLDivElement | null>(null);

// Backend ships /api/admins/users CRUD now. apiAvailable is kept as a
// safety net: a deployment where the backend is older than this build
// would still 404, in which case we degrade gracefully to a read-only
// banner instead of throwing per-row errors.
const apiAvailable = ref(true);

// Form
const form = reactive({
  first_name: '',
  last_name: '',
  // email: '',
  role: 'CASHIER' as UserRole,
  password: '',
});

// Computed
const isFormValid = computed(() => {
  const hasRequiredFields = 
    form.first_name.trim() !== '' &&
    form.last_name.trim() !== '' &&
    // form.email.trim() !== '' &&
    form.role !== null;

  // For create: password required (4 digits)
  if (!isEditing.value) {
    return hasRequiredFields && form.password.length === 4;
  }

  // For edit: password optional, but if entered must be 4 digits
  if (form.password.length > 0 && form.password.length !== 4) {
    return false;
  }

  return hasRequiredFields;
});

// Methods
function getInitials(firstName: string, lastName: string): string {
  const first = firstName?.charAt(0)?.toUpperCase() || '';
  const last = lastName?.charAt(0)?.toUpperCase() || '';
  return first + last || '??';
}

function getRoleLabel(role: UserRole): string {
  const found = roles.find(r => r.value === role);
  return found?.label || role;
}

function getRoleClass(role: UserRole): string {
  return `role-${role.toLowerCase()}`;
}

// PIN numpad handlers
function onNumpadPress(num: number): void {
  if (form.password.length < 4) {
    form.password += String(num);
  }
}

function removeLastDigit(): void {
  form.password = form.password.slice(0, -1);
}

function clearPin(): void {
  form.password = '';
}

// Physical keyboard support for PIN
function onPinKeydown(event: KeyboardEvent): void {
  if (/^[0-9]$/.test(event.key)) {
    event.preventDefault();
    onNumpadPress(parseInt(event.key, 10));
  } else if (event.key === 'Backspace') {
    event.preventDefault();
    removeLastDigit();
  } else if (event.key === 'Delete' || event.key === 'Escape') {
    event.preventDefault();
    clearPin();
  }
}

// Fetch users
async function fetchUsers(): Promise<void> {
  loading.value = true;
  try {
    const response = await api.get<UsersResponse>('/api/admins/users', {
      params: { per_page: 100 }
    });
    users.value = response.data.data.users;
    apiAvailable.value = true;
  } catch (error: unknown) {
    const status = (error as { response?: { status?: number } })?.response?.status;
    if (status === 404) {
      // Endpoint not implemented on backend yet — switch to read-only banner.
      apiAvailable.value = false;
    } else {
      console.error('Failed to fetch users:', error);
      toast.error('Foydalanuvchilarni yuklashda xatolik');
    }
    users.value = [];
  } finally {
    loading.value = false;
  }
}

// Open create dialog
async function openCreateDialog(): Promise<void> {
  isEditing.value = false;
  editingUser.value = null;
  form.first_name = '';
  form.last_name = '';
  // form.email = '';
  form.role = 'CASHIER';
  form.password = '';
  showDialog.value = true;

  await nextTick();
  setTimeout(() => {
    firstNameRef.value?.focus();
  }, 100);
}

// Open edit dialog
async function openEditDialog(user: User): Promise<void> {
  isEditing.value = true;
  editingUser.value = user;
  form.first_name = user.first_name;
  form.last_name = user.last_name;
  // form.email = user.email;
  form.role = user.role;
  form.password = '';
  showDialog.value = true;

  await nextTick();
  setTimeout(() => {
    firstNameRef.value?.focus();
  }, 100);
}

// Close dialog
function closeDialog(): void {
  showDialog.value = false;
  editingUser.value = null;
}

// Save user (create or update)
async function saveUser(): Promise<void> {
  if (!isFormValid.value) return;

  saving.value = true;
  try {
    const payload: Record<string, unknown> = {
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      // email: form.email.trim(),
      role: form.role,
    };

    // Only include password if it's set (4 digits)
    if (form.password.length === 4) {
      payload.password = form.password;
    }

    if (isEditing.value && editingUser.value) {
      await api.patch(`/api/admins/users/${editingUser.value.id}`, payload);
      toast.success('Foydalanuvchi yangilandi');
    } else {
      await api.post('/api/admins/users', payload);
      toast.success('Foydalanuvchi qo\'shildi');
    }

    closeDialog();
    await fetchUsers();
  } catch (error: unknown) {
    console.error('Failed to save user:', error);
    const err = error as { response?: { data?: { message?: string } } };
    const message = err.response?.data?.message || 'Xatolik yuz berdi';
    toast.error(message);
  } finally {
    saving.value = false;
  }
}

// Confirm delete
function confirmDelete(): void {
  showDeleteConfirm.value = true;
}

// Delete user
async function deleteUser(): Promise<void> {
  if (!editingUser.value) return;

  deleting.value = true;
  try {
    await api.delete(`/api/admins/users/${editingUser.value.id}`);
    toast.success('Foydalanuvchi o\'chirildi');
    showDeleteConfirm.value = false;
    closeDialog();
    await fetchUsers();
  } catch (error) {
    console.error('Failed to delete user:', error);
    toast.error('O\'chirishda xatolik');
  } finally {
    deleting.value = false;
  }
}

// Lifecycle
onMounted(() => {
  void fetchUsers();
});
</script>

<style scoped lang="scss">
.users-settings {
  height: 100%;
  display: flex;
  flex-direction: column;
}

// Header
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.page-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.user-count {
  font-size: 14px;
  color: var(--text-muted);
  background: var(--bg-surface-2);
  padding: 4px 10px;
  border-radius: 12px;
}

.btn-add {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  border-radius: 12px;
  border: none;
  background: var(--accent-primary);
  color: white;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover:not(:disabled) {
    opacity: 0.9;
  }

  &:active:not(:disabled) {
    transform: scale(0.97);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

/* Backend-unavailable banner */
.api-banner {
  display: flex;
  gap: 12px;
  padding: 14px 16px;
  margin-bottom: 16px;
  background: rgba(255, 184, 0, 0.08);
  border: 1px solid rgba(255, 184, 0, 0.35);
  border-radius: 12px;
  color: var(--text-primary);
}

.api-banner__icon {
  color: #f59e0b;
  flex-shrink: 0;
  margin-top: 2px;
}

.api-banner__body {
  flex: 1;
  min-width: 0;
}

.api-banner__title {
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 4px;
}

.api-banner__text {
  font-size: 13px;
  color: var(--text-muted);
  line-height: 1.5;

  code {
    background: var(--bg-surface-2);
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 12px;
    color: var(--text-primary);
  }
}

// Loading & Empty states
.loading-state,
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-muted);
}

.empty-state {
  h3 {
    margin: 0;
    font-size: 18px;
    color: var(--text-primary);
  }

  p {
    margin: 0;
    font-size: 14px;
  }

  .btn-add {
    margin-top: 12px;
  }
}

// ========== GRID LAYOUT ==========
.users-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
  overflow-y: auto;
  padding: 4px;
}

.user-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
  padding: 16px;
  display: flex;
  align-items: center;
  gap: 12px;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  }

  &:active {
    transform: scale(0.98);
  }
}

.user-avatar {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: var(--accent-primary);
  color: white;
  font-size: 16px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.user-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.user-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-role {
  font-size: 12px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 6px;
  width: fit-content;

  &.role-admin {
    background: #fef2f2;
    color: #dc2626;
  }

  &.role-cook {
    background: #fef3c7;
    color: #d97706;
  }

  &.role-cashier {
    background: #ecfdf5;
    color: #059669;
  }
}

.card-arrow {
  color: var(--text-muted);
  flex-shrink: 0;
}

// ========== DIALOG ==========
.user-dialog {
  width: 100%;
  max-width: 640px;
  background: var(--bg-surface);
  border-radius: 20px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 18px 20px;
  border-bottom: 1px solid var(--border-color);

  h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 700;
    color: var(--text-primary);
  }
}

.btn-close {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  border: none;
  background: var(--bg-surface-2);
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;

  &:hover {
    background: var(--border-color);
    color: var(--text-primary);
  }
}

// Two-column layout
.dialog-content {
  display: flex;
  gap: 1px;
  background: var(--border-color);
}

.dialog-left {
  flex: 1;
  padding: 15px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: var(--bg-surface);
}

.dialog-right {
  width: 220px;
  padding: 15px;
  background: var(--bg-surface-2);
  display: flex;
  flex-direction: column;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.form-input {
  height: 48px;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  padding: 0 16px;
  font-size: 15px;
  background: var(--bg-surface);
  color: var(--text-primary);
  transition: border-color 0.2s ease;

  &:focus {
    outline: none;
    border-color: var(--accent-primary);
  }

  &::placeholder {
    color: var(--text-muted);
  }
}

// Role selector
.role-selector {
  display: flex;
  gap: 8px;
}

.role-btn {
  flex: 1;
  padding: 10px 6px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  transition: all 0.2s ease;

  &:hover {
    background: var(--bg-surface-2);
  }

  &.active {
    background: var(--accent-primary);
    color: white;
    border-color: var(--accent-primary);
  }
}

// PIN Section
.pin-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
}

.pin-label {
  text-align: center;
}

.pin-hint {
  display: block;
  font-size: 11px;
  font-weight: 400;
  color: var(--text-muted);
  margin-top: 2px;
}

.pin-display {
  display: flex;
  justify-content: center;
  gap: 10px;
  padding: 12px;
  background: var(--bg-surface);
  border-radius: 12px;
  border: 1px solid var(--border-color);
  outline: none;
  cursor: pointer;

  &:focus {
    border-color: var(--accent-primary);
  }
}

.pin-digit {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: var(--bg-surface-2);
  border: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
  transition: all 0.15s ease;

  &.filled {
    background: var(--accent-primary);
    border-color: var(--accent-primary);
    color: white;
  }
}

// Numpad
.numpad {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.numpad-btn {
  height: 48px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  color: var(--text-primary);
  font-size: 18px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: var(--bg-surface-2);
  }

  &:active {
    transform: scale(0.95);
    background: var(--accent-primary);
    color: white;
  }
}

.numpad-clear {
  color: var(--text-muted);
}

.numpad-backspace {
  font-size: 20px;
  color: var(--text-muted);
}

// Dialog footer
.dialog-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-top: 1px solid var(--border-color);
  background: var(--bg-surface-2);
}

.footer-right {
  display: flex;
  gap: 10px;
  margin-left: auto;
}

.btn-cancel {
  padding: 12px 20px;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  color: var(--text-primary);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: var(--bg-surface-2);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

.btn-save {
  padding: 12px 24px;
  border-radius: 12px;
  border: none;
  background: var(--accent-primary);
  color: white;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s ease;

  &:hover:not(:disabled) {
    opacity: 0.9;
  }

  &:active:not(:disabled) {
    transform: scale(0.97);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

.btn-delete {
  padding: 12px 16px;
  border-radius: 12px;
  border: 1px solid #ef4444;
  background: transparent;
  color: #ef4444;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s ease;

  &:hover:not(:disabled) {
    background: #fef2f2;
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

// Confirm dialog
.confirm-dialog {
  width: 100%;
  max-width: 360px;
  background: var(--bg-surface);
  border-radius: 20px;
  padding: 24px;
  text-align: center;
}

.confirm-icon {
  margin-bottom: 16px;
}

.confirm-dialog h3 {
  margin: 0 0 8px 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
}

.confirm-dialog p {
  margin: 0 0 20px 0;
  font-size: 14px;
  color: var(--text-muted);
}

.confirm-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
}

.btn-delete-confirm {
  padding: 12px 24px;
  border-radius: 12px;
  border: none;
  background: #ef4444;
  color: white;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s ease;

  &:hover:not(:disabled) {
    background: #dc2626;
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}
</style>