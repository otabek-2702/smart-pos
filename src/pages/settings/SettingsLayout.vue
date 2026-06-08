<template>
  <q-page class="settings-page">
    <!-- Header -->
    <div class="settings-header">
      <button v-if="!railMode" type="button" class="menu-btn" @click="toggleSidebar">
        <q-icon :name="sidebarOpen ? 'close' : 'menu'" size="24px" />
      </button>
      <p class="settings-title">{{ currentPageTitle }}</p>
      <button type="button" class="back-btn" @click="goBack">
        <q-icon name="chevron_right" size="22px" />
        <span>Ortga</span>
      </button>
    </div>

    <div class="settings-container">
      <!-- Overlay backdrop (drawer mode only) -->
      <Transition name="fade">
        <div v-if="sidebarOpen && !railMode" class="sidebar-backdrop" @click="closeSidebar" />
      </Transition>

      <!-- Sidebar — persistent rail ≥1024, drawer below -->
      <Transition name="slide">
        <nav v-if="sidebarOpen || railMode" class="settings-sidebar" :class="{ 'is-rail': railMode }">
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
          </div>
        </nav>
      </Transition>

      <!-- Content -->
      <div class="settings-content" :class="{ 'keyboard-open': keyboardVisible || numpadVisible }">
        <router-view />
      </div>

      <!-- Keyboards teleported to <body> so they render ABOVE Quasar dialogs
           (q-dialog teleports to body; a keyboard nested in .settings-content
           would be trapped under the dialog's stacking context → invisible). -->
      <Teleport to="body">
        <!-- Virtual Keyboard (for text inputs) -->
        <Transition name="keyboard-slide">
          <div v-if="keyboardVisible && virtualKeyboardEnabled && !numpadVisible" class="keyboard-container">
            <VirtualKeyboard
              position="inline"
              :numbers="keyboardWithNumbers"
              @input="onKeyboardInput"
              @backspace="onKeyboardBackspace"
              @enter="onKeyboardEnter"
            />
          </div>
        </Transition>

        <!-- Virtual Numpad (for numeric inputs) -->
        <Transition name="keyboard-slide">
          <div v-if="numpadVisible && virtualKeyboardEnabled" class="keyboard-container">
            <VirtualNumpad
              @input="onNumpadInput"
              @backspace="onNumpadBackspace"
              @clear="onNumpadClear"
            />
          </div>
        </Transition>
      </Teleport>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, provide } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useQuasar } from 'quasar';
import VirtualKeyboard from 'src/components/virtual-keyboard/VirtualKeyboard.vue';
import VirtualNumpad from 'src/components/virtual-keyboard/VirtualNumpad.vue';
import { virtualKeyboardEnabled } from 'src/boot/virtual-keyboard';
import { hasPermission } from 'src/composables/usePermissions';

const router = useRouter();
const route = useRoute();
const $q = useQuasar();

// Persistent left rail on wide terminals (≥1024); drawer below (SPEC §4).
const railMode = computed(() => $q.screen.gt.sm);

const sidebarOpen = ref(false);
const keyboardVisible = ref(false);
const numpadVisible = ref(false);
const keyboardWithNumbers = ref(false);
const activeInput = ref<HTMLInputElement | HTMLTextAreaElement | null>(null);

const currentRoute = computed(() => route.name);

// Get current page title — pick from the full menu so the title still
// resolves even on items the user is currently on but technically lacks
// the perm for (shouldn't happen via guard, but defensive).
const currentPageTitle = computed(() => {
  const item = ALL_MENU_ITEMS.find((m) => m.route === currentRoute.value);
  return item?.label || 'Sozlamalar';
});

interface MenuItem {
  route: string;
  label: string;
  icon: string;
  // Permission key the user must hold to see this entry. ADMIN role and
  // '*' permission both bypass the check (see usePermissions).
  permission: string;
}

const ALL_MENU_ITEMS: MenuItem[] = [
  { route: 'settings-receipt', label: 'Chek sozlamalari', icon: 'receipt_long', permission: 'receipt.manage' },
  { route: 'settings-printer', label: 'Printer sozlamalari', icon: 'print', permission: 'printer.manage' },
  { route: 'settings-display', label: 'Displey sozlamalari', icon: 'tv', permission: 'display.manage' },
  { route: 'settings-order-types', label: 'Buyurtma turlari', icon: 'restaurant_menu', permission: 'display.manage' },
  { route: 'settings-discount', label: 'Promokod', icon: 'percent', permission: 'display.manage' },
  { route: 'settings-categories', label: 'Kategoriyalar', icon: 'category', permission: 'categories.manage' },
  { route: 'settings-users', label: 'Foydalanuvchilar', icon: 'people', permission: 'users.manage' },
  { route: 'settings-products', label: 'Mahsulotlar', icon: 'inventory_2', permission: 'products.manage' },
  { route: 'settings-roles', label: 'Rollar va ruxsatlar', icon: 'admin_panel_settings', permission: '*' },
];

// Sidebar only shows entries the current user can actually open. Avoids
// the dead-click-then-redirect UX a non-admin would otherwise see.
const menuItems = computed<MenuItem[]>(() =>
  ALL_MENU_ITEMS.filter((m) => hasPermission(m.permission)),
);

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

// Check if input should show numpad (numbers only)
function isNumericInput(input: HTMLInputElement | HTMLTextAreaElement): boolean {
  const inputMode = input.getAttribute('inputmode');
  const type = input.getAttribute('type');
  const dataNumpad = input.dataset.numpad;
  
  return (
    inputMode === 'numeric' ||
    inputMode === 'decimal' ||
    type === 'number' ||
    type === 'tel' ||
    dataNumpad === 'true'
  );
}

// Keyboard functions
function showKeyboard(input: HTMLInputElement | HTMLTextAreaElement, withNumbers = false): void {
  activeInput.value = input;
  
  // Determine if we should show numpad or keyboard
  if (isNumericInput(input)) {
    numpadVisible.value = true;
    keyboardVisible.value = false;
  } else {
    keyboardWithNumbers.value = withNumbers;
    keyboardVisible.value = true;
    numpadVisible.value = false;
  }

  // Scroll input into view after keyboard animation
  setTimeout(() => {
    scrollInputIntoView(input);
  }, 350);
}

function scrollInputIntoView(input: HTMLElement): void {
  const keyboardHeight = 220; // Approximate keyboard height
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
  numpadVisible.value = false;
  activeInput.value = null;
}

// Enter on the on-screen keyboard confirms/closes the open dialog: clicks the
// dialog's primary action ([data-kb-submit]) so a create/edit form submits
// without reaching for the mouse. Falls back to just hiding the keyboard.
function onKeyboardEnter(): void {
  const el = activeInput.value;
  hideKeyboard();
  if (!el) return;
  el.blur();
  const dialog = el.closest('.q-dialog');
  const btn = dialog?.querySelector('[data-kb-submit]') as HTMLElement | null;
  btn?.click();
}

// Text keyboard handlers
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

// Numpad handlers
function onNumpadInput(digit: string): void {
  if (activeInput.value) {
    const start = activeInput.value.selectionStart || 0;
    const end = activeInput.value.selectionEnd || 0;
    const value = activeInput.value.value;

    // Insert digit at cursor position
    activeInput.value.value = value.substring(0, start) + digit + value.substring(end);

    // Move cursor after inserted digit
    const newPos = start + 1;
    activeInput.value.setSelectionRange(newPos, newPos);

    // Trigger input event for v-model to update
    activeInput.value.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

function onNumpadBackspace(): void {
  onKeyboardBackspace(); // Same logic as keyboard backspace
}

function onNumpadClear(): void {
  if (activeInput.value) {
    activeInput.value.value = '';
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

    // Skip if input has data-no-keyboard attribute
    if (input.dataset.noKeyboard === 'true') {
      return;
    }

    // Check if input should have numbers (for text keyboard)
    const withNumbers =
      inputType === 'number' || inputType === 'tel' || input.dataset.keyboardNums === 'true';

    showKeyboard(input, withNumbers);
  }
}

function handleFocusOut(event: FocusEvent): void {
  const relatedTarget = event.relatedTarget as HTMLElement;

  // Don't hide if focus moved to keyboard or another input
  if (relatedTarget) {
    if (
      relatedTarget.closest('.keyboard-container') ||
      relatedTarget.tagName === 'INPUT' ||
      relatedTarget.tagName === 'TEXTAREA'
    ) {
      return;
    }
  }

  // Small delay to allow clicking keyboard buttons
  setTimeout(() => {
    if (
      document.activeElement?.tagName !== 'INPUT' &&
      document.activeElement?.tagName !== 'TEXTAREA' &&
      !document.activeElement?.closest('.keyboard-container')
    ) {
      hideKeyboard();
    }
  }, 100);
}

function handleClickOutside(event: MouseEvent): void {
  const target = event.target as HTMLElement;

  // If clicking on keyboard/numpad, keep focus on active input
  if (target.closest('.keyboard-container')) {
    if (activeInput.value) {
      activeInput.value.focus();
    }
    return;
  }

  // If clicking outside keyboard and not on an input, hide keyboard
  if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
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
  gap: 8px;
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

/* Persistent left rail on wide terminals (≥1024px) */
@media (min-width: 1024px) {
  .settings-container { flex-direction: row; }
  .settings-sidebar.is-rail {
    position: relative;
    inset: auto;
    max-width: none;
    flex-shrink: 0;
    box-shadow: none;
    z-index: 1;
    transform: none !important;
  }
  .settings-content { flex: 1; min-width: 0; }
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

// Content
.settings-content {
  flex: 1;
  padding: 12px;
  overflow-y: auto;
  background: var(--bg-app);
  transition: padding-bottom 0.3s ease;

  &.keyboard-open {
    padding-bottom: 280px; // Height of keyboard/numpad + extra space
  }
}

// Keyboard container - FIXED at bottom of screen
.keyboard-container {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 500000;
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