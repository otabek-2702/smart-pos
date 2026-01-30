<template>
  <q-page class="settings-page">
    <!-- Header -->
    <div class="settings-header">
      <button type="button" class="menu-btn" @click="toggleSidebar">
        <q-icon :name="sidebarOpen ? 'close' : 'menu'" size="24px" />
      </button>
      <p class="settings-title">{{ currentPageTitle }}</p>
      <button type="button" class="back-btn" @click="goBack">
        <q-icon name="chevron_right" size="22px" />
        <span>Ortga</span>
      </button>
    </div>

    <div class="settings-container">
      <!-- Overlay backdrop -->
      <Transition name="fade">
        <div
          v-if="sidebarOpen"
          class="sidebar-backdrop"
          @click="closeSidebar"
        />
      </Transition>

      <!-- Sidebar -->
      <Transition name="slide">
        <nav v-if="sidebarOpen" class="settings-sidebar">
          <div class="sidebar-header">
            <q-icon name="settings" size="24px" />
            <span>Sozlamalar</span>
          </div>

          <div class="sidebar-menu">
            <button
              v-for="item in menuItems"
              :key="item.route"
              type="button"
              class="sidebar-item"
              :class="{ active: currentRoute === item.route }"
              @click="navigateTo(item.route)"
            >
              <q-icon :name="item.icon" size="22px" />
              <span>{{ item.label }}</span>
              <q-icon
                v-if="currentRoute === item.route"
                name="chevron_right"
                size="20px"
                class="active-indicator"
              />
            </button>

            <!-- Divider -->
            <div class="sidebar-divider" />

            <!-- Future items (disabled) -->
            <button
              v-for="item in futureItems"
              :key="item.label"
              type="button"
              class="sidebar-item disabled"
              disabled
            >
              <q-icon :name="item.icon" size="22px" />
              <span>{{ item.label }}</span>
              <span class="coming-soon">Tez kunda</span>
            </button>
          </div>
        </nav>
      </Transition>

      <!-- Content -->
      <div class="settings-content" :class="{ 'keyboard-open': keyboardVisible }">
        <router-view />
      </div>

      <!-- Virtual Keyboard -->
      <Transition name="keyboard-slide">
        <div v-if="keyboardVisible && virtualKeyboardEnabled" class="keyboard-container">
          <VirtualKeyboard
            :nums_on="keyboardWithNumbers"
            @input="onKeyboardInput"
            @backspace="onKeyboardBackspace"
          />
        </div>
      </Transition>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, provide } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import VirtualKeyboard from 'src/components/virtual-keyboard/VirtualKeyboard.vue';
import { virtualKeyboardEnabled } from 'src/boot/virtual-keyboard';

const router = useRouter();
const route = useRoute();

const sidebarOpen = ref(false);
const keyboardVisible = ref(false);
const keyboardWithNumbers = ref(false);
const activeInput = ref<HTMLInputElement | HTMLTextAreaElement | null>(null);

const currentRoute = computed(() => route.name);

// Get current page title
const currentPageTitle = computed(() => {
  const item = menuItems.find(m => m.route === currentRoute.value);
  return item?.label || 'Sozlamalar';
});

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
  { route: 'settings-display', label: 'Displey sozlamalari', icon: 'tv' },
  { route: 'settings-categories', label: 'Kategoriyalar', icon: 'category' }, 
];

const futureItems: FutureItem[] = [
  { label: 'Mahsulotlar', icon: 'inventory_2' },
  { label: 'Foydalanuvchilar', icon: 'group' },
];

// Sidebar functions
function toggleSidebar(): void {
  sidebarOpen.value = !sidebarOpen.value;
}

function closeSidebar(): void {
  sidebarOpen.value = false;
}

function navigateTo(routeName: string): void {
  void router.push({ name: routeName });
  setTimeout(() => {
    closeSidebar();
  }, 150);
}

function goBack(): void {
  void router.push({ name: 'orders' });
}

// Keyboard functions
function showKeyboard(input: HTMLInputElement | HTMLTextAreaElement, withNumbers = false): void {
  activeInput.value = input;
  keyboardWithNumbers.value = withNumbers;
  keyboardVisible.value = true;
  
  // Scroll input into view after keyboard animation
  setTimeout(() => {
    scrollInputIntoView(input);
  }, 350);
}

function scrollInputIntoView(input: HTMLElement): void {
  const keyboardHeight = 260; // Approximate keyboard height
  const inputRect = input.getBoundingClientRect();
  const viewportHeight = window.innerHeight;
  const visibleAreaBottom = viewportHeight - keyboardHeight - 20; // 20px padding
  
  // If input is below visible area, scroll it into view
  if (inputRect.bottom > visibleAreaBottom) {
    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function hideKeyboard(): void {
  keyboardVisible.value = false;
  activeInput.value = null;
}

function onKeyboardInput(char: string): void {
  if (activeInput.value) {
    const start = activeInput.value.selectionStart || 0;
    const end = activeInput.value.selectionEnd || 0;
    const value = activeInput.value.value;
    
    // Insert character at cursor position
    activeInput.value.value = value.substring(0, start) + char + value.substring(end);
    
    // Move cursor after inserted character
    const newPos = start + char.length;
    activeInput.value.setSelectionRange(newPos, newPos);
    
    // Trigger input event for v-model to update
    activeInput.value.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

function onKeyboardBackspace(): void {
  if (activeInput.value) {
    const start = activeInput.value.selectionStart || 0;
    const end = activeInput.value.selectionEnd || 0;
    const value = activeInput.value.value;
    
    if (start === end && start > 0) {
      // No selection, delete character before cursor
      activeInput.value.value = value.substring(0, start - 1) + value.substring(end);
      activeInput.value.setSelectionRange(start - 1, start - 1);
    } else if (start !== end) {
      // Has selection, delete selected text
      activeInput.value.value = value.substring(0, start) + value.substring(end);
      activeInput.value.setSelectionRange(start, start);
    }
    
    // Trigger input event for v-model to update
    activeInput.value.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

// Provide keyboard functions to child components
provide('showKeyboard', showKeyboard);
provide('hideKeyboard', hideKeyboard);

// Handle focus events globally
function handleFocusIn(event: FocusEvent): void {
  const target = event.target as HTMLElement;
  
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
    const input = target as HTMLInputElement | HTMLTextAreaElement;
    const inputType = input.getAttribute('type') || 'text';
    
    // Don't show keyboard for color, file, checkbox, radio inputs
    if (['color', 'file', 'checkbox', 'radio', 'range', 'hidden'].includes(inputType)) {
      return;
    }
    
    // Check if input should have numbers
    const withNumbers = inputType === 'number' || 
                        inputType === 'tel' || 
                        input.dataset.keyboardNums === 'true';
    
    showKeyboard(input, withNumbers);
  }
}

function handleFocusOut(event: FocusEvent): void {
  const relatedTarget = event.relatedTarget as HTMLElement;
  
  // Don't hide if focus moved to keyboard or another input
  if (relatedTarget) {
    if (relatedTarget.closest('.keyboard-container') ||
        relatedTarget.tagName === 'INPUT' ||
        relatedTarget.tagName === 'TEXTAREA') {
      return;
    }
  }
  
  // Small delay to allow clicking keyboard buttons
  setTimeout(() => {
    if (document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA' &&
        !document.activeElement?.closest('.keyboard-container')) {
      hideKeyboard();
    }
  }, 100);
}

function handleClickOutside(event: MouseEvent): void {
  const target = event.target as HTMLElement;
  
  // If clicking outside keyboard and not on an input, hide keyboard
  if (!target.closest('.keyboard-container') &&
      target.tagName !== 'INPUT' &&
      target.tagName !== 'TEXTAREA') {
    hideKeyboard();
  }
}

onMounted(() => {
  document.addEventListener('focusin', handleFocusIn);
  document.addEventListener('focusout', handleFocusOut);
  document.addEventListener('mousedown', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('focusin', handleFocusIn);
  document.removeEventListener('focusout', handleFocusOut);
  document.removeEventListener('mousedown', handleClickOutside);
});

// Close sidebar on route change
watch(currentRoute, () => {
  closeSidebar();
  hideKeyboard();
});
</script>

<style scoped lang="scss">
.settings-page {
  background: var(--bg-app);
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}

// Header
.settings-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border-color);
  z-index: 100;
}

.menu-btn {
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
  flex: 1;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.back-btn {
  display: flex;
  align-items: center;
  // gap: 8px;
  padding: 10px 16px;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  color: var(--text-muted);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: var(--bg-surface-2);
    color: var(--text-primary);
  }

  &:active {
    transform: scale(0.97);
  }
}

// Container
.settings-container {
  flex: 1;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

// Backdrop
.sidebar-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 200;
  backdrop-filter: blur(2px);
}

// Sidebar
.settings-sidebar {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  width: 280px;
  max-width: 85vw;
  background: var(--bg-surface);
  border-right: 1px solid var(--border-color);
  z-index: 300;
  display: flex;
  flex-direction: column;
  box-shadow: 4px 0 20px rgba(0, 0, 0, 0.15);
}

.sidebar-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);

  .q-icon {
    color: var(--accent-primary);
  }
}

.sidebar-menu {
  flex: 1;
  padding: 12px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sidebar-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 12px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;
  width: 100%;

  &:hover:not(.disabled) {
    background: var(--bg-surface-2);
    color: var(--text-primary);
  }

  &:active:not(.disabled) {
    transform: scale(0.98);
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
  }
}

.active-indicator {
  margin-left: auto;
  opacity: 0.7;
}

.coming-soon {
  margin-left: auto;
  font-size: 10px;
  padding: 3px 8px;
  border-radius: 8px;
  background: var(--bg-surface-2);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.sidebar-divider {
  height: 1px;
  background: var(--border-color);
  margin: 8px 0;
}

// Content
.settings-content {
  flex: 1;
  padding: 12px;
  overflow-y: auto;
  background: var(--bg-app);
  transition: padding-bottom 0.3s ease;

  &.keyboard-open {
    padding-bottom: 300px; // Height of keyboard + some extra space
  }
}

// Keyboard container - FIXED at bottom of screen
.keyboard-container {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 500;
  padding: 8px 12px 12px;
  background: var(--bg-app);
  border-top: 1px solid var(--border-color);
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.15);
}

// Animations
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.slide-enter-active {
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.slide-leave-active {
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.slide-enter-from,
.slide-leave-to {
  transform: translateX(-100%);
}

// Keyboard slide animation
.keyboard-slide-enter-active {
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.keyboard-slide-leave-active {
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.keyboard-slide-enter-from,
.keyboard-slide-leave-to {
  transform: translateY(100%);
}
</style>