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
      ghost-class="drag-ghost"
      drag-class="drag-active"
      chosen-class="drag-chosen"
      animation="300"
      class="categories-grid"
      @start="onDragStart"
      @end="onDragEnd"
    >
      <template #item="{ element }">
        <div
          class="category-card"
          :style="{ '--card-color': element.colors?.[0] || '#e2e5e9' }"
          @click="openEditDialog(element)"
        >
          <div class="card-color-bar"></div>
          <div class="card-body">
            <div
              class="card-color-dot"
              :style="{ backgroundColor: element.colors?.[0] || '#e2e5e9' }"
            ></div>
            <span class="card-name">{{ element.name }}</span>
          </div>
          <div class="card-footer">
            <span class="card-status" :class="element.status?.toLowerCase()">
              {{ element.status === 'ACTIVE' ? 'Faol' : 'Nofaol' }}
            </span>
            <q-icon name="drag_indicator" size="18px" class="drag-icon" />
          </div>
        </div>
      </template>
    </draggable>

    <!-- Create/Edit Dialog -->
    <q-dialog v-model="showDialog" class="category-dialog-wrapper">
      <div class="category-dialog" @click.stop>
        <div class="dialog-header">
          <h3>{{ isEditing ? 'Kategoriyani tahrirlash' : "Kategoriya qo'shish" }}</h3>
          <button type="button" class="btn-close" @click="closeDialog">
            <q-icon name="close" size="24px" />
          </button>
        </div>

        <div class="dialog-body">
          <!-- Name Input -->
          <div class="form-group">
            <label class="form-label">Nomi</label>
            <input
              ref="nameInputRef"
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
              <!-- Preset Colors -->
              <div class="preset-colors">
                <button
                  type="button"
                  class="preset-color no-color"
                  :class="{ active: !form.color }"
                  @click="form.color = ''"
                >
                  <q-icon name="block" size="16px" />
                </button>
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
                  <input type="color" v-model="form.color" class="color-input" />
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
              data-kb-submit
              @click="saveCategory"
              :disabled="!form.name.trim() || saving"
            >
              <q-spinner v-if="saving" size="18px" color="white" />
              <span v-else>{{ isEditing ? 'Saqlash' : "Qo'shish" }}</span>
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
        <h3>Kategoriyani o'chirish</h3>
        <p>"{{ editingCategory?.name }}" kategoriyasini o'chirishni xohlaysizmi?</p>
        <div class="confirm-actions">
          <button type="button" class="btn-cancel" @click="showDeleteConfirm = false">
            Bekor qilish
          </button>
          <button
            type="button"
            class="btn-delete-confirm"
            @click="deleteCategory"
            :disabled="deleting"
          >
            <q-spinner v-if="deleting" size="18px" color="white" />
            <span v-else>O'chirish</span>
          </button>
        </div>
      </div>
    </q-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, nextTick } from 'vue';
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
const isDragging = ref(false);
const nameInputRef = ref<HTMLInputElement | null>(null);

// Form
const form = reactive({
  name: '',
  color: '',
});

// Preset colors
const presetColors = [
  '#ff6b00',
  '#e53935',
  '#d81b60',
  '#8e24aa',
  '#5e35b1',
  '#3949ab',
  '#1e88e5',
  '#00acc1',
  '#00897b',
  '#43a047',
  '#7cb342',
  '#fdd835',
  '#fb8c00',
  '#6d4c41',
  '#546e7a',
  '#78909c',
];

// Fetch categories
async function fetchCategories(): Promise<void> {
  loading.value = true;
  try {
    const response = await api.get<CategoriesResponse>('/api/admins/categories', {
      params: { per_page: 100 },
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
async function openCreateDialog(): Promise<void> {
  isEditing.value = false;
  editingCategory.value = null;
  form.name = '';
  form.color = '';
  showDialog.value = true;

  // Focus input after dialog opens
  await nextTick();
  setTimeout(() => {
    nameInputRef.value?.focus();
  }, 100);
}

// Open edit dialog
async function openEditDialog(category: Category): Promise<void> {
  if (isDragging.value) return; // Don't open if dragging

  isEditing.value = true;
  editingCategory.value = category;
  form.name = category.name;
  form.color = category.colors?.[0] || '';
  showDialog.value = true;

  await nextTick();
  setTimeout(() => {
    nameInputRef.value?.focus();
  }, 100);
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
      // Update — backend expects PUT/PATCH on resource (no /update suffix)
      await api.put(`/api/admins/categories/${editingCategory.value.id}`, payload);
      toast.success('Kategoriya yangilandi');
    } else {
      // Create — backend expects POST on collection (no /create suffix)
      const maxOrder = categories.value.reduce((max, c) => Math.max(max, c.sort_order), -1);
      await api.post('/api/admins/categories', {
        ...payload,
        sort_order: maxOrder + 1,
      });
      toast.success("Kategoriya qo'shildi");
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
    await api.delete(`/api/admins/categories/${editingCategory.value.id}`);
    toast.success("Kategoriya o'chirildi");
    showDeleteConfirm.value = false;
    closeDialog();
    await fetchCategories();
  } catch (error) {
    console.error('Failed to delete category:', error);
    toast.error("O'chirishda xatolik");
  } finally {
    deleting.value = false;
  }
}

// Drag handlers
function onDragStart(): void {
  isDragging.value = true;
}

// Handle drag end - update sort orders
async function onDragEnd(): Promise<void> {
  // Small delay to prevent click from firing
  setTimeout(() => {
    isDragging.value = false;
  }, 100);

  // Update locally first for instant feedback
  categories.value.forEach((cat, index) => {
    cat.sort_order = index;
  });

  // Backend's reorder endpoint expects { orders: [{id, sort_order}, ...] }
  // (see alpha_pos/admins/services/category_service.py:268). One round-trip
  // instead of N PUTs.
  try {
    await api.post('/api/admins/categories/reorder', {
      orders: categories.value.map((c, index) => ({
        id: c.id,
        sort_order: index,
      })),
    });
    toast.success('Tartib saqlandi');
  } catch (error) {
    console.error('Failed to update sort order:', error);
    toast.error('Tartibni saqlashda xatolik');
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

// ========== GRID LAYOUT ==========
.categories-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
  overflow-y: auto;
  padding: 4px;
}

.category-card {
  --card-color: #e2e5e9;

  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
  overflow: hidden;
  display: flex;
  flex-direction: column;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);

    .drag-icon {
      opacity: 1;
    }
  }

  &:active {
    transform: scale(0.98);
  }
}

.card-color-bar {
  height: 6px;
  background: var(--card-color);
}

.card-body {
  padding: 14px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.card-color-dot {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  flex-shrink: 0;
}

.card-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-footer {
  padding: 10px 14px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-top: 1px solid var(--border-color);
  background: var(--bg-surface-2);
}

.card-status {
  font-size: 12px;
  font-weight: 500;

  &.active {
    color: var(--accent-primary);
  }

  &.inactive {
    color: var(--text-muted);
  }
}

.drag-icon {
  color: var(--text-muted);
  /* Fully visible by default — a touch monoblock has no hover, so a
     hover-only reveal left the reorder handle permanently dimmed. */
  opacity: 0.85;
  transition: opacity 0.2s ease;
  cursor: grab;

  &:active {
    cursor: grabbing;
  }
}

// ========== DRAG STATES ==========
.drag-ghost {
  opacity: 0.4;
  background: var(--bg-surface-2) !important;
}

.drag-active {
  opacity: 1 !important;
  transform: rotate(3deg) scale(1.05);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
  z-index: 1000;
}

.drag-chosen {
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
}

// ========== DIALOG ==========
.category-dialog {
  width: 100%;
  max-width: 440px;
  background: var(--bg-surface);
  border-radius: 20px;
  overflow: hidden;
  max-height: 90vh;
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

.dialog-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
  flex: 1;
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
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 3px solid transparent;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    transform: scale(1.1);
  }

  &.active {
    border-color: var(--text-primary);
    box-shadow:
      0 0 0 2px var(--bg-surface),
      0 0 0 4px var(--text-primary);
  }

  &.no-color {
    background: var(--bg-surface-2);
    border: 1px solid var(--border-color);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
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
  padding: 14px 18px;
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
