<template>
  <div class="categories-settings">
    <!-- Header -->
    <div class="page-header">
      <div class="header-left">
        <h2 class="page-title">Kategoriyalar</h2>
        <span class="category-count">{{ categories.length }} ta</span>
      </div>
      <button type="button" class="btn-add" @click="openCreateDialog">
        <q-icon name="add" size="20px" />
        Qo'shish
      </button>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="loading-state">
      <q-spinner size="40px" color="primary" />
      <span>Yuklanmoqda...</span>
    </div>

    <!-- Empty State -->
    <div v-else-if="categories.length === 0" class="empty-state">
      <q-icon name="category" size="64px" />
      <h3>Kategoriyalar yo'q</h3>
      <p>Birinchi kategoriyani qo'shing</p>
      <button type="button" class="btn-add" @click="openCreateDialog">
        <q-icon name="add" size="20px" />
        Kategoriya qo'shish
      </button>
    </div>

    <!-- Categories Grid -->
    <draggable
      v-else
      v-model="categories"
      item-key="id"
      handle=".drag-handle"
      ghost-class="dragging-ghost"
      animation="200"
      class="categories-grid"
      @end="onDragEnd"
    >
      <template #item="{ element }">
        <div
          class="category-card"
          :style="{ borderLeftColor: element.colors?.[0] || '#e2e5e9' }"
          @click="openEditDialog(element)"
        >
          <div class="drag-handle">
            <q-icon name="drag_indicator" size="20px" />
          </div>
          <div class="card-content">
            <div class="card-color" :style="{ backgroundColor: element.colors?.[0] || '#e2e5e9' }"></div>
            <div class="card-info">
              <span class="card-name">{{ element.name }}</span>
              <span class="card-status" :class="element.status.toLowerCase()">
                {{ element.status === 'ACTIVE' ? 'Faol' : 'Nofaol' }}
              </span>
            </div>
          </div>
          <q-icon name="chevron_right" size="20px" class="card-arrow" />
        </div>
      </template>
    </draggable>

    <!-- Create/Edit Dialog -->
    <q-dialog v-model="showDialog" persistent>
      <div class="category-dialog">
        <div class="dialog-header">
          <h3>{{ isEditing ? 'Kategoriyani tahrirlash' : 'Kategoriya qo\'shish' }}</h3>
          <button type="button" class="btn-close" @click="closeDialog">
            <q-icon name="close" size="24px" />
          </button>
        </div>

        <div class="dialog-body">
          <!-- Name Input -->
          <div class="form-group">
            <label class="form-label">Nomi</label>
            <input
              type="text"
              v-model="form.name"
              class="form-input"
              placeholder="Kategoriya nomi"
              maxlength="50"
            />
          </div>

          <!-- Color Picker -->
          <div class="form-group">
            <label class="form-label">Rang</label>
            <div class="color-picker-section">
              <!-- Preset Colors -->
              <div class="preset-colors">
                <button
                  v-for="color in presetColors"
                  :key="color"
                  type="button"
                  class="preset-color"
                  :class="{ active: form.color === color }"
                  :style="{ backgroundColor: color }"
                  @click="form.color = color"
                />
              </div>
              <!-- Custom Color -->
              <div class="custom-color">
                <div class="color-input-wrapper">
                  <input
                    type="color"
                    v-model="form.color"
                    class="color-input"
                  />
                  <div class="color-preview" :style="{ backgroundColor: form.color }"></div>
                </div>
                <input
                  type="text"
                  v-model="form.color"
                  class="form-input hex-input"
                  placeholder="#ffffff"
                  maxlength="7"
                />
              </div>
            </div>
          </div>

          <!-- Preview -->
          <div class="form-group">
            <label class="form-label">Ko'rinishi</label>
            <div class="category-preview" :style="{ backgroundColor: form.color }">
              {{ form.name || 'Kategoriya nomi' }}
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
              @click="saveCategory"
              :disabled="!form.name.trim() || saving"
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
      <div class="confirm-dialog">
        <div class="confirm-icon">
          <q-icon name="warning" size="48px" color="negative" />
        </div>
        <h3>Kategoriyani o'chirish</h3>
        <p>"{{ editingCategory?.name }}" kategoriyasini o'chirishni xohlaysizmi?</p>
        <div class="confirm-actions">
          <button type="button" class="btn-cancel" @click="showDeleteConfirm = false">
            Bekor qilish
          </button>
          <button type="button" class="btn-delete-confirm" @click="deleteCategory" :disabled="deleting">
            <q-spinner v-if="deleting" size="18px" color="white" />
            <span v-else>O'chirish</span>
          </button>
        </div>
      </div>
    </q-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import draggable from 'vuedraggable';
import { api } from 'boot/axios';
import { toast } from 'vue3-toastify';

// Types
interface Category {
  id: number;
  name: string;
  sort_order: number;
  colors: string[];
  status: 'ACTIVE' | 'INACTIVE';
  slug: string;
  description: string;
}

interface CategoriesResponse {
  success: boolean;
  data: {
    categories: Category[];
  };
}

// State
const categories = ref<Category[]>([]);
const loading = ref(true);
const saving = ref(false);
const deleting = ref(false);
const showDialog = ref(false);
const showDeleteConfirm = ref(false);
const isEditing = ref(false);
const editingCategory = ref<Category | null>(null);

// Form
const form = reactive({
  name: '',
  color: '#ff6b00',
});

// Preset colors
const presetColors = [
  '#ff6b00', '#e53935', '#d81b60', '#8e24aa',
  '#5e35b1', '#3949ab', '#1e88e5', '#00acc1',
  '#00897b', '#43a047', '#7cb342', '#fdd835',
  '#fb8c00', '#6d4c41', '#546e7a', '#78909c',
];

// Fetch categories
async function fetchCategories(): Promise<void> {
  loading.value = true;
  try {
    const response = await api.get<CategoriesResponse>('/categories', {
      params: { per_page: 100 }
    });
    categories.value = response.data.data.categories.sort((a, b) => a.sort_order - b.sort_order);
  } catch (error) {
    console.error('Failed to fetch categories:', error);
    toast.error('Kategoriyalarni yuklashda xatolik');
  } finally {
    loading.value = false;
  }
}

// Open create dialog
function openCreateDialog(): void {
  isEditing.value = false;
  editingCategory.value = null;
  form.name = '';
  form.color = '#ff6b00';
  showDialog.value = true;
}

// Open edit dialog
function openEditDialog(category: Category): void {
  isEditing.value = true;
  editingCategory.value = category;
  form.name = category.name;
  form.color = category.colors?.[0] || '#ff6b00';
  showDialog.value = true;
}

// Close dialog
function closeDialog(): void {
  showDialog.value = false;
  editingCategory.value = null;
}

// Save category (create or update)
async function saveCategory(): Promise<void> {
  if (!form.name.trim()) return;

  saving.value = true;
  try {
    const payload = {
      name: form.name.trim(),
      colors: [form.color],
    };

    if (isEditing.value && editingCategory.value) {
      // Update
      await api.put(`/categories/${editingCategory.value.id}/update`, payload);
      toast.success('Kategoriya yangilandi');
    } else {
      // Create
      const maxOrder = categories.value.reduce((max, c) => Math.max(max, c.sort_order), -1);
      await api.post('/categories/create', {
        ...payload,
        sort_order: maxOrder + 1,
      });
      toast.success('Kategoriya qo\'shildi');
    }

    closeDialog();
    await fetchCategories();
  } catch (error) {
    console.error('Failed to save category:', error);
    toast.error('Xatolik yuz berdi');
  } finally {
    saving.value = false;
  }
}

// Confirm delete
function confirmDelete(): void {
  showDeleteConfirm.value = true;
}

// Delete category
async function deleteCategory(): Promise<void> {
  if (!editingCategory.value) return;

  deleting.value = true;
  try {
    await api.delete(`/categories/${editingCategory.value.id}/delete`);
    toast.success('Kategoriya o\'chirildi');
    showDeleteConfirm.value = false;
    closeDialog();
    await fetchCategories();
  } catch (error) {
    console.error('Failed to delete category:', error);
    toast.error('O\'chirishda xatolik');
  } finally {
    deleting.value = false;
  }
}

// Handle drag end - update sort orders
async function onDragEnd(): Promise<void> {
  // Update sort_order for all categories based on new positions
  const updates = categories.value.map((category, index) => ({
    id: category.id,
    sort_order: index,
  }));

  // Update locally first for instant feedback
  categories.value.forEach((cat, index) => {
    cat.sort_order = index;
  });

  // Send updates to API (one by one for now, can be optimized with bulk endpoint)
  try {
    for (const update of updates) {
      await api.put(`/categories/${update.id}/update`, {
        sort_order: update.sort_order,
      });
    }
    toast.success('Tartib saqlandi');
  } catch (error) {
    console.error('Failed to update sort order:', error);
    toast.error('Tartibni saqlashda xatolik');
    // Refetch to restore correct order
    await fetchCategories();
  }
}

// Lifecycle
onMounted(() => {
  void fetchCategories();
});
</script>

<style scoped lang="scss">
.categories-settings {
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

.category-count {
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

  &:hover {
    opacity: 0.9;
  }

  &:active {
    transform: scale(0.97);
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

// Categories Grid
.categories-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  padding-right: 4px;
}

.category-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-left: 4px solid;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: var(--bg-surface-2);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  }

  &:active {
    transform: scale(0.99);
  }
}

.drag-handle {
  color: var(--text-muted);
  cursor: grab;
  padding: 4px;
  margin: -4px;
  border-radius: 6px;
  transition: all 0.2s ease;

  &:hover {
    background: var(--bg-surface-2);
    color: var(--text-primary);
  }

  &:active {
    cursor: grabbing;
  }
}

.card-content {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
}

.card-color {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  flex-shrink: 0;
}

.card-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.card-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.card-status {
  font-size: 12px;
  
  &.active {
    color: var(--accent-primary);
  }

  &.inactive {
    color: var(--text-muted);
  }
}

.card-arrow {
  color: var(--text-muted);
}

// Dragging state
.dragging-ghost {
  opacity: 0.5;
  background: var(--accent-primary) !important;
  
  * {
    color: white !important;
  }
}

// Dialog
.category-dialog {
  width: 100%;
  max-width: 420px;
  background: var(--bg-surface);
  border-radius: 20px;
  overflow: hidden;
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
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

.dialog-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
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

// Color picker
.color-picker-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.preset-colors {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.preset-color {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: 3px solid transparent;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    transform: scale(1.1);
  }

  &.active {
    border-color: var(--text-primary);
    box-shadow: 0 0 0 2px var(--bg-surface), 0 0 0 4px var(--text-primary);
  }
}

.custom-color {
  display: flex;
  gap: 12px;
  align-items: center;
}

.color-input-wrapper {
  position: relative;
  width: 48px;
  height: 48px;
}

.color-input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.color-preview {
  width: 100%;
  height: 100%;
  border-radius: 12px;
  border: 2px solid var(--border-color);
  pointer-events: none;
}

.hex-input {
  flex: 1;
  font-family: monospace;
  text-transform: uppercase;
}

// Category preview
.category-preview {
  padding: 16px 20px;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 600;
  color: white;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
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