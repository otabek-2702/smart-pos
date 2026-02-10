<template>
  <div class="products-settings">
    <!-- Header -->
    <div class="page-header">
      <div class="header-left">
        <h2 class="page-title">Mahsulotlar</h2>
        <span class="product-count">{{ filteredProducts.length }} ta</span>
      </div>
      <button type="button" class="btn-add" @click="openCreateDialog">
        <q-icon name="add" size="20px" />
        Qo'shish
      </button>
    </div>

    <!-- Category Filter Tabs -->
    <div class="category-tabs">
      <button
        type="button"
        class="tab-btn"
        :class="{ active: selectedCategoryId === null }"
        @click="selectedCategoryId = null"
      >
        Barchasi
      </button>
      <button
        v-for="category in categories"
        :key="category.id"
        type="button"
        class="tab-btn"
        :class="{ active: selectedCategoryId === category.id }"
        :style="{ '--tab-color': category.colors?.[0] || 'var(--accent-primary)' }"
        @click="selectedCategoryId = category.id"
      >
        {{ category.name }}
      </button>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="loading-state">
      <q-spinner size="40px" color="primary" />
      <span>Yuklanmoqda...</span>
    </div>

    <!-- Empty State -->
    <div v-else-if="filteredProducts.length === 0" class="empty-state">
      <q-icon name="inventory_2" size="64px" />
      <h3>Mahsulotlar yo'q</h3>
      <p>{{ selectedCategoryId ? 'Bu kategoriyada mahsulot yo\'q' : 'Birinchi mahsulotni qo\'shing' }}</p>
      <button type="button" class="btn-add" @click="openCreateDialog">
        <q-icon name="add" size="20px" />
        Mahsulot qo'shish
      </button>
    </div>

    <!-- Products Grid -->
    <div v-else class="products-grid">
      <div
        v-for="product in filteredProducts"
        :key="product.id"
        class="product-card"
        :style="{ '--product-color': product.color?.[0] || 'transparent' }"
        @click="openEditDialog(product)"
      >
        <div class="product-info">
          <span class="product-name">{{ product.name }}</span>
          <span class="product-price">{{ formatPrice(product.price) }}</span>
        </div>
        <div class="product-color-bar"></div>
      </div>
    </div>

    <!-- Create/Edit Dialog -->
    <q-dialog v-model="showDialog">
      <div class="product-dialog" @click.stop>
        <div class="dialog-header">
          <h3>{{ isEditing ? 'Mahsulotni tahrirlash' : 'Mahsulot qo\'shish' }}</h3>
          <button type="button" class="btn-close" @click="closeDialog">
            <q-icon name="close" size="24px" />
          </button>
        </div>

        <div class="dialog-body">
          <!-- Name -->
          <div class="form-group">
            <label class="form-label">Nomi</label>
            <input
              ref="nameInputRef"
              type="text"
              v-model="form.name"
              class="form-input"
              placeholder="Mahsulot nomi"
              maxlength="100"
            />
          </div>

          <!-- Price -->
          <div class="form-group">
            <label class="form-label">Narxi (so'm)</label>
            <input
              type="text"
              v-model="form.priceDisplay"
              class="form-input price-input"
              placeholder="0"
              inputmode="numeric"
              @input="onPriceInput"
            />
          </div>

          <!-- Category -->
          <div class="form-group">
            <label class="form-label">Kategoriya</label>
            <div class="category-selector">
              <button
                v-for="category in categories"
                :key="category.id"
                type="button"
                class="category-btn"
                :class="{ active: form.category_id === category.id }"
                :style="{ '--cat-color': category.colors?.[0] || 'var(--accent-primary)' }"
                @click="form.category_id = category.id"
              >
                {{ category.name }}
              </button>
            </div>
          </div>

          <!-- Color -->
          <div class="form-group">
            <label class="form-label">Rang (ixtiyoriy)</label>
            <div class="color-picker-section">
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
              <div class="custom-color">
                <div class="color-input-wrapper">
                  <input type="color" v-model="form.color" class="color-input" />
                  <div 
                    class="color-preview" 
                    :style="{ backgroundColor: form.color || '#e2e5e9' }"
                  ></div>
                </div>
              </div>
            </div>
          </div>

          <!-- Preview -->
          <div class="form-group">
            <label class="form-label">Ko'rinishi</label>
            <div 
              class="product-preview"
              :style="{ '--preview-color': form.color || 'transparent' }"
            >
              <div class="preview-info">
                <span class="preview-name">{{ form.name || 'Mahsulot nomi' }}</span>
                <span class="preview-price">{{ formatPrice(form.price || 0) }}</span>
              </div>
              <div class="preview-color-bar"></div>
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
              @click="saveProduct"
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
        <h3>Mahsulotni o'chirish</h3>
        <p>"{{ editingProduct?.name }}" ni o'chirishni xohlaysizmi?</p>
        <div class="confirm-actions">
          <button type="button" class="btn-cancel" @click="showDeleteConfirm = false">
            Bekor qilish
          </button>
          <button type="button" class="btn-delete-confirm" @click="deleteProduct" :disabled="deleting">
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
interface Category {
  id: number;
  name: string;
  slug: string;
  colors: string[];
}

interface Product {
  id: number;
  name: string;
  description: string;
  price: string;
  color: string[];
  category: Category;
  popularity: number;
}

interface ProductsResponse {
  success: boolean;
  data: {
    products: Product[];
    pagination: {
      total_products: number;
    };
  };
}

interface CategoriesResponse {
  success: boolean;
  data: {
    categories: Category[];
  };
}

// Preset colors
const presetColors = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899',
  '#6b7280', '#78716c',
];

// State
const products = ref<Product[]>([]);
const categories = ref<Category[]>([]);
const loading = ref(true);
const saving = ref(false);
const deleting = ref(false);
const showDialog = ref(false);
const showDeleteConfirm = ref(false);
const isEditing = ref(false);
const editingProduct = ref<Product | null>(null);
const selectedCategoryId = ref<number | null>(null);
const nameInputRef = ref<HTMLInputElement | null>(null);

// Form
const form = reactive({
  name: '',
  price: 0,
  priceDisplay: '',
  category_id: null as number | null,
  color: '',
});

// Computed
const filteredProducts = computed(() => {
  if (selectedCategoryId.value === null) {
    return products.value;
  }
  return products.value.filter(p => p.category.id === selectedCategoryId.value);
});

const isFormValid = computed(() => {
  return (
    form.name.trim() !== '' &&
    form.price > 0 &&
    form.category_id !== null
  );
});

// Methods
function formatPrice(price: number | string): string {
  const num = typeof price === 'string' ? parseFloat(price) : price;
  return num.toLocaleString('uz-UZ') + ' so\'m';
}

function onPriceInput(event: Event): void {
  const input = event.target as HTMLInputElement;
  // Remove non-digits
  const raw = input.value.replace(/\D/g, '');
  const num = parseInt(raw, 10) || 0;
  form.price = num;
  // Format with spaces
  form.priceDisplay = num > 0 ? num.toLocaleString('uz-UZ') : '';
}

// Fetch products
async function fetchProducts(): Promise<void> {
  try {
    const response = await api.get<ProductsResponse>('/products', {
      params: { per_page: 500 }
    });
    products.value = response.data.data.products;
  } catch (error) {
    console.error('Failed to fetch products:', error);
    toast.error('Mahsulotlarni yuklashda xatolik');
  }
}

// Fetch categories
async function fetchCategories(): Promise<void> {
  try {
    const response = await api.get<CategoriesResponse>('/categories', {
      params: { per_page: 100 }
    });
    categories.value = response.data.data.categories;
  } catch (error) {
    console.error('Failed to fetch categories:', error);
    toast.error('Kategoriyalarni yuklashda xatolik');
  }
}

// Load data
async function loadData(): Promise<void> {
  loading.value = true;
  await Promise.all([fetchProducts(), fetchCategories()]);
  loading.value = false;
}

// Open create dialog
async function openCreateDialog(): Promise<void> {
  isEditing.value = false;
  editingProduct.value = null;
  form.name = '';
  form.price = 0;
  form.priceDisplay = '';
  form.category_id = selectedCategoryId.value || (categories.value[0]?.id ?? null);
  form.color = '';
  showDialog.value = true;

  await nextTick();
  setTimeout(() => {
    nameInputRef.value?.focus();
  }, 100);
}

// Open edit dialog
async function openEditDialog(product: Product): Promise<void> {
  isEditing.value = true;
  editingProduct.value = product;
  form.name = product.name;
  form.price = parseFloat(product.price);
  form.priceDisplay = parseFloat(product.price).toLocaleString('uz-UZ');
  form.category_id = product.category.id;
  form.color = product.color?.[0] || '';
  showDialog.value = true;

  await nextTick();
  setTimeout(() => {
    nameInputRef.value?.focus();
  }, 100);
}

// Close dialog
function closeDialog(): void {
  showDialog.value = false;
  editingProduct.value = null;
}

// Save product
async function saveProduct(): Promise<void> {
  if (!isFormValid.value) return;

  saving.value = true;
  try {
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      price: form.price,
      category_id: form.category_id,
    };

    // Add color if set
    if (form.color) {
      payload.colors = [form.color];
    } else {
      payload.colors = [];
    }

    if (isEditing.value && editingProduct.value) {
      await api.put(`/products/${editingProduct.value.id}/update`, payload);
      toast.success('Mahsulot yangilandi');
    } else {
      await api.post('/products/create', payload);
      toast.success('Mahsulot qo\'shildi');
    }

    closeDialog();
    await fetchProducts();
  } catch (error: unknown) {
    console.error('Failed to save product:', error);
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

// Delete product
async function deleteProduct(): Promise<void> {
  if (!editingProduct.value) return;

  deleting.value = true;
  try {
    await api.delete(`/products/${editingProduct.value.id}/delete`);
    toast.success('Mahsulot o\'chirildi');
    showDeleteConfirm.value = false;
    closeDialog();
    await fetchProducts();
  } catch (error) {
    console.error('Failed to delete product:', error);
    toast.error('O\'chirishda xatolik');
  } finally {
    deleting.value = false;
  }
}

// Lifecycle
onMounted(() => {
  void loadData();
});
</script>

<style scoped lang="scss">
.products-settings {
  height: 100%;
  display: flex;
  flex-direction: column;
}

// Header
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
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

.product-count {
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

// Category Tabs
.category-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  overflow-x: auto;
  padding-bottom: 4px;

  &::-webkit-scrollbar {
    height: 4px;
  }

  &::-webkit-scrollbar-thumb {
    background: var(--border-color);
    border-radius: 2px;
  }
}

.tab-btn {
  --tab-color: var(--accent-primary);

  padding: 8px 16px;
  border-radius: 20px;
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s ease;

  &:hover {
    background: var(--bg-surface-2);
  }

  &.active {
    background: var(--tab-color);
    color: white;
    border-color: var(--tab-color);
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

// Products Grid
.products-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
  overflow-y: auto;
  padding: 4px;
}

.product-card {
  --product-color: transparent;

  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  overflow: hidden;
  display: flex;
  flex-direction: column;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  }

  &:active {
    transform: scale(0.98);
  }
}

.product-info {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}

.product-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.3;
}

.product-price {
  font-size: 13px;
  color: var(--text-muted);
}

.product-color-bar {
  height: 4px;
  background: var(--product-color);
}

// ========== DIALOG ==========
.product-dialog {
  width: 100%;
  max-width: 480px;
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

.price-input {
  font-weight: 600;
  font-size: 18px;
}

// Category selector
.category-selector {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.category-btn {
  --cat-color: var(--accent-primary);

  padding: 8px 14px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: var(--bg-surface-2);
  }

  &.active {
    background: var(--cat-color);
    color: white;
    border-color: var(--cat-color);
  }
}

// Color picker
.color-picker-section {
  display: flex;
  align-items: center;
  gap: 12px;
}

.preset-colors {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  flex: 1;
}

.preset-color {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    transform: scale(1.1);
  }

  &.active {
    border-color: var(--text-primary);
    box-shadow: 0 0 0 2px var(--bg-surface);
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
  align-items: center;
}

.color-input-wrapper {
  position: relative;
  width: 40px;
  height: 40px;
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
  border-radius: 10px;
  border: 2px solid var(--border-color);
  pointer-events: none;
}

// Product preview
.product-preview {
  --preview-color: transparent;

  background: var(--bg-surface-2);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  overflow: hidden;
}

.preview-info {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.preview-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.preview-price {
  font-size: 13px;
  color: var(--text-muted);
}

.preview-color-bar {
  height: 4px;
  background: var(--preview-color);
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