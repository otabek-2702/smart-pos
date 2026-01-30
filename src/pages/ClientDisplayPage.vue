<template>
  <div class="client-display" :style="displayStyles">
    <!-- FULLSCREEN READY NOTIFICATION -->
    <Transition name="fullscreen">
      <div
        v-if="showFullscreenNotification"
        class="fullscreen-notification"
        :style="{
          background: `linear-gradient(135deg, ${colors.readyColor} 0%, ${colors.readyDark} 100%)`,
        }"
      >
        <div class="fullscreen-content">
          <div class="fullscreen-label">BUYURTMA TAYYOR!</div>
          <div class="fullscreen-number">{{ formatId(currentFullscreenOrder) }}</div>
          <div class="fullscreen-hint">Iltimos, buyurtmangizni oling</div>
        </div>
        <div class="fullscreen-bg-pulse"></div>
      </div>
    </Transition>

    <!-- HEADER -->
    <header class="header">
      <div class="datetime">
        <div class="date" :style="{ color: displaySettings.headerTextColor }">{{ currentDate }}</div>
        <div class="day" :style="{ color: displaySettings.headerTextColor }">{{ currentDay }}</div>
      </div>
      <div
        class="title"
        :style="{
          color: displaySettings.headerTextColor,
          fontSize: fontSizeValue,
        }"
      >
        {{ displaySettings.companyName }}
      </div>
      <div class="time-display">
        <div class="time-segment">
          <div class="flip-clock">
            <Transition name="flip" mode="out-in">
              <span :key="hours" class="flip-number" :style="{ color: displaySettings.headerTextColor }">{{
                hours
              }}</span>
            </Transition>
          </div>
        </div>
        <span class="time-separator" :style="{ color: displaySettings.headerTextColor }">:</span>
        <div class="time-segment">
          <div class="flip-clock">
            <Transition name="flip" mode="out-in">
              <span :key="minutes" class="flip-number" :style="{ color: displaySettings.headerTextColor }">{{
                minutes
              }}</span>
            </Transition>
          </div>
        </div>
        <span class="time-separator" :style="{ color: displaySettings.headerTextColor }">:</span>
        <div class="time-segment seconds">
          <div class="flip-clock">
            <Transition name="flip" mode="out-in">
              <span :key="seconds" class="flip-number" :style="{ color: displaySettings.headerTextColor }">{{
                seconds
              }}</span>
            </Transition>
          </div>
        </div>
      </div>
    </header>

    <!-- CONTENT -->
    <main class="content">
      <!-- PROCESSING -->
      <section class="column processing">
        <h2 :style="{ color: displaySettings.headerTextColor }">JARAYONDA</h2>
        <div v-if="processing.length === 0" class="empty">
          <div
            class="empty-icon"
            :style="{ filter: colors.isDark ? 'grayscale(1) brightness(10)' : 'none' }"
          >
            🍳
          </div>
          <div class="empty-text" :style="{ color: displaySettings.headerTextColor }">Buyurtmalar yo'q</div>
        </div>
        <div class="orders">
          <TransitionGroup name="order-list">
            <div
              v-for="o in processing"
              :key="o.id"
              class="order-box processing-box"
              :style="{ color: displaySettings.brandColor }"
            >
              {{ formatId(o.display_id) }}
            </div>
          </TransitionGroup>
        </div>
      </section>

      <!-- DIVIDER -->
      <div class="divider"></div>

      <!-- READY -->
      <section class="column ready" :style="{ background: colors.readySectionBg }">
        <h2 :style="{ color: colors.readyColor }">TAYYOR</h2>
        <div v-if="finished.length === 0" class="empty">
          <div class="empty-icon">✨</div>
          <div class="empty-text" :style="{ color: colors.readyMuted }">—</div>
        </div>
        <div class="orders">
          <TransitionGroup name="ready-list">
            <div
              v-for="o in finished"
              :key="o.id"
              class="order-box ready-box"
              :class="{ 'new-ready': newlyFinishedIds.has(o.id) }"
              :style="{
                color: colors.readyColor,
                borderColor: colors.readyColor,
                '--ready-shadow': `rgba(${hexToRgb(colors.readyColor)}, 0.4)`,
              }"
            >
              {{ formatId(o.display_id) }}
            </div>
          </TransitionGroup>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue';
import { api } from 'boot/axios';

// Types
interface DisplayOrder {
  id: number;
  display_id: number;
}

interface DisplaySettings {
  companyName: string;
  titleFontSize: 'small' | 'medium' | 'large' | 'xlarge';
  brandColor: string;
  readyColor: string;
  headerTextColor: string;
}

// Default settings (fallback)
const DEFAULT_SETTINGS: DisplaySettings = {
  companyName: 'SMART FOOD',
  titleFontSize: 'large',
  brandColor: '#ff6b00',
  readyColor: '#16a34a',
  headerTextColor: '#ffffff',
};

// Font size mapping
const FONT_SIZE_MAP: Record<DisplaySettings['titleFontSize'], string> = {
  small: '1.5rem',
  medium: '2rem',
  large: '2.5rem',
  xlarge: '3rem',
};

// State
const displaySettings = reactive<DisplaySettings>({ ...DEFAULT_SETTINGS });
const processing = ref<DisplayOrder[]>([]);
const finished = ref<DisplayOrder[]>([]);

const previousFinishedIds = new Set<number>();
const newlyFinishedIds = ref<Set<number>>(new Set());
let firstLoad = true;

// Fullscreen notification
const showFullscreenNotification = ref(false);
const currentFullscreenOrder = ref<number>(0);
const notificationQueue = ref<number[]>([]);
let isProcessingQueue = false;

/* ================= COMPUTED COLORS ================= */

const colors = computed(() => {
  const brand = displaySettings.brandColor;
  const ready = displaySettings.readyColor;

  const isDark = isColorDark(brand);

  return {
    isDark,
    gradientStart: brand,
    gradientEnd: isDark ? lightenColor(brand, 20) : lightenColor(brand, 15),
    textColor: isDark ? '#ffffff' : '#1a1d23',
    readySectionBg: lightenColor(brand, 92),
    readyColor: ready,
    readyDark: darkenColor(ready, 15),
    readyLightBg: lightenColor(ready, 85),
    readyMuted: '#9ca3af',
  };
});

const displayStyles = computed(() => ({
  background: `linear-gradient(145deg, ${colors.value.gradientStart} 0%, ${colors.value.gradientEnd} 100%)`,
}));

const fontSizeValue = computed(() => FONT_SIZE_MAP[displaySettings.titleFontSize]);

/* ================= COLOR HELPERS ================= */

function isColorDark(hexColor: string): boolean {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.5;
}

function lightenColor(hexColor: string, percent: number): string {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  const newR = Math.min(255, Math.floor(r + (255 - r) * (percent / 100)));
  const newG = Math.min(255, Math.floor(g + (255 - g) * (percent / 100)));
  const newB = Math.min(255, Math.floor(b + (255 - b) * (percent / 100)));

  return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
}

function darkenColor(hexColor: string, percent: number): string {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  const newR = Math.max(0, Math.floor(r * (1 - percent / 100)));
  const newG = Math.max(0, Math.floor(g * (1 - percent / 100)));
  const newB = Math.max(0, Math.floor(b * (1 - percent / 100)));

  return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
}

function hexToRgb(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

/* ================= SETTINGS ================= */

async function loadSettings(): Promise<void> {
  try {
    // Check if running in Electron
    const electron = (
      window as unknown as {
        electron?: {
          ipcRenderer: { invoke: (channel: string, ...args: unknown[]) => Promise<unknown> };
        };
      }
    ).electron;

    if (electron) {
      const result = (await electron.ipcRenderer.invoke('settings:getDisplay')) as DisplaySettings;
      Object.assign(displaySettings, result);
      console.log('Display settings loaded:', result);
    }
  } catch (error) {
    console.error('Failed to load display settings:', error);
  }
}

function setupSettingsListener(): void {
  try {
    const electron = (
      window as unknown as {
        electron?: {
          ipcRenderer: {
            on: (channel: string, callback: (...args: unknown[]) => void) => void;
          };
        };
      }
    ).electron;

    if (electron) {
      electron.ipcRenderer.on('display-settings-updated', (newSettings: unknown) => {
        console.log('Display settings updated:', newSettings);
        Object.assign(displaySettings, newSettings as DisplaySettings);
      });
    }
  } catch (error) {
    console.error('Failed to setup settings listener:', error);
  }
}

/* ================= CLOCK ================= */

const hours = ref('00');
const minutes = ref('00');
const seconds = ref('00');
const currentDate = ref('');
const currentDay = ref('');

const uzbekDays: Record<number, string> = {
  0: 'Yakshanba',
  1: 'Dushanba',
  2: 'Seshanba',
  3: 'Chorshanba',
  4: 'Payshanba',
  5: 'Juma',
  6: 'Shanba',
};

const uzbekMonths: Record<number, string> = {
  0: 'Yanvar',
  1: 'Fevral',
  2: 'Mart',
  3: 'Aprel',
  4: 'May',
  5: 'Iyun',
  6: 'Iyul',
  7: 'Avgust',
  8: 'Sentabr',
  9: 'Oktabr',
  10: 'Noyabr',
  11: 'Dekabr',
};

function updateClock(): void {
  const now = new Date();
  hours.value = now.getHours().toString().padStart(2, '0');
  minutes.value = now.getMinutes().toString().padStart(2, '0');
  seconds.value = now.getSeconds().toString().padStart(2, '0');

  currentDate.value = `${now.getDate()} ${uzbekMonths[now.getMonth()]} ${now.getFullYear()}`;
  currentDay.value = uzbekDays[now.getDay()] ?? '';
}

/* ================= AUDIO ================= */

const audio: HTMLAudioElement = new Audio(
  new URL('../assets/sounds/notifier.wav', import.meta.url).href,
);
audio.volume = 1.0;

function playReadySound(): void {
  if (audio) {
    audio.currentTime = 0;
    audio.play().catch((e) => console.error('Audio play error:', e));
  }
}

/* ================= FULLSCREEN NOTIFICATION QUEUE ================= */

async function processNotificationQueue(): Promise<void> {
  if (isProcessingQueue || notificationQueue.value.length === 0) return;

  isProcessingQueue = true;

  while (notificationQueue.value.length > 0) {
    const displayId = notificationQueue.value.shift()!;
    currentFullscreenOrder.value = displayId;
    showFullscreenNotification.value = true;

    playReadySound();

    await new Promise((resolve) => setTimeout(resolve, 2000));

    showFullscreenNotification.value = false;

    if (notificationQueue.value.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  isProcessingQueue = false;
}

async function addToNotificationQueue(displayIds: number[]): Promise<void> {
  notificationQueue.value.push(...displayIds);
  await processNotificationQueue();
}

/* ================= API ================= */

async function fetchData(): Promise<void> {
  try {
    const res = await api.get('/display/client');
    const data = res.data.data;

    processing.value = data.processing || [];
    finished.value = data.finished || [];

    detectNewFinished(data.finished || []);
  } catch (e) {
    console.error('Fetch error:', e);
  }
}

function detectNewFinished(list: DisplayOrder[]): void {
  const currentIds = new Set(list.map((o) => o.id));
  const newOnes: DisplayOrder[] = [];

  if (!firstLoad) {
    for (const order of list) {
      if (!previousFinishedIds.has(order.id)) {
        newOnes.push(order);
      }
    }
  }

  if (newOnes.length > 0) {
    const newIds = new Set(newOnes.map((o) => o.id));
    newlyFinishedIds.value = newIds;

    void addToNotificationQueue(newOnes.map((o) => o.display_id));

    setTimeout(() => {
      newlyFinishedIds.value = new Set();
    }, 2000);
  }

  previousFinishedIds.clear();
  currentIds.forEach((id) => previousFinishedIds.add(id));
  firstLoad = false;
}

/* ================= HELPERS ================= */

function formatId(id: number): string {
  return id.toString().padStart(2, '0');
}

/* ================= LIFECYCLE ================= */

let poll: number | undefined;
let clockTimer: number | undefined;

onMounted(async () => {
  // Load settings first
  await loadSettings();
  setupSettingsListener();

  // Start clock and polling
  updateClock();
  void fetchData();

  poll = window.setInterval(() => {
    void fetchData();
  }, 3000);
  clockTimer = window.setInterval(updateClock, 1000);
});

onUnmounted(() => {
  if (poll) clearInterval(poll);
  if (clockTimer) clearInterval(clockTimer);
});
</script>

<style scoped>
/* ===== BASE LAYOUT ===== */
.client-display {
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-family:
    'Inter',
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    Roboto,
    sans-serif;
  position: relative;
}

/* ===== HEADER ===== */
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 20px;
}

.datetime {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.date {
  font-size: 1.3rem;
  font-weight: 600;
}

.day {
  font-size: 1.2rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 1px;
  opacity: 0.9;
}

.title {
  font-weight: 900;
  letter-spacing: 6px;
  text-transform: uppercase;
}

/* ===== FLIP CLOCK ===== */
.time-display {
  display: flex;
  align-items: center;
  gap: 4px;
}

.time-segment {
  border-radius: 8px;
  padding: 8px 12px;
  min-width: 56px;
  display: flex;
  justify-content: center;
}

.flip-clock {
  position: relative;
  overflow: hidden;
}

.flip-number {
  display: block;
  font-size: 1.8rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.time-separator {
  font-size: 2rem;
  font-weight: 700;
}

/* Flip animation */
.flip-enter-active {
  animation: flipIn 0.3s ease-out;
}

.flip-leave-active {
  animation: flipOut 0.3s ease-in;
}

@keyframes flipIn {
  0% {
    transform: translateY(-100%);
    opacity: 0;
  }
  100% {
    transform: translateY(0);
    opacity: 1;
  }
}

@keyframes flipOut {
  0% {
    transform: translateY(0);
    opacity: 1;
  }
  100% {
    transform: translateY(100%);
    opacity: 0;
  }
}

/* ===== CONTENT ===== */
.content {
  flex: 1;
  display: flex;
  position: relative;
}

.column {
  flex: 1;
  padding: 0px 25px;
  display: flex;
  flex-direction: column;
  &.ready{
    border-top-left-radius: 10px;
  }
}

/* ===== TITLES ===== */
h2 {
  text-align: center;
  font-size: 2.2rem;
  font-weight: 800;
  letter-spacing: 4px;
  text-transform: uppercase;
  margin: 0 0 15px 0;
}

/* ===== ORDERS ===== */
.orders {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 25px;
  align-content: flex-start;
  justify-content: center;
}

.order-box {
  width: 160px;
  height: 160px;
  border-radius: 20px;
  font-size: 4.5rem;
  font-weight: 900;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
}

.processing-box {
  background: #ffffff;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
}

.ready-box {
  background: #ffffff;
  border: 4px solid;
  box-shadow: 0 10px 40px var(--ready-shadow, rgba(22, 163, 74, 0.2));
}

.ready-box.new-ready {
  animation: ready-bounce 0.6s ease 3;
}

@keyframes ready-bounce {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.1);
    box-shadow: 0 15px 50px var(--ready-shadow, rgba(22, 163, 74, 0.4));
  }
}

/* ===== EMPTY STATE ===== */
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  opacity: 0.7;
}

.empty-icon {
  font-size: 4rem;
  margin-bottom: 15px;
}

.empty-text {
  font-size: 1.3rem;
  font-weight: 500;
}

/* ===== LIST ANIMATIONS ===== */
.order-list-enter-active,
.ready-list-enter-active {
  animation: slideIn 0.4s ease-out;
}

.order-list-leave-active,
.ready-list-leave-active {
  animation: slideOut 0.3s ease-in;
}

.order-list-move,
.ready-list-move {
  transition: transform 0.4s ease;
}

@keyframes slideIn {
  0% {
    opacity: 0;
    transform: translateY(-30px) scale(0.8);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes slideOut {
  0% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  100% {
    opacity: 0;
    transform: translateY(30px) scale(0.8);
  }
}

/* ===== FULLSCREEN NOTIFICATION ===== */
.fullscreen-notification {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.fullscreen-content {
  text-align: center;
  z-index: 2;
  animation: contentPop 0.5s ease-out;
}

@keyframes contentPop {
  0% {
    transform: scale(0.5);
    opacity: 0;
  }
  70% {
    transform: scale(1.05);
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

.fullscreen-label {
  font-size: 3rem;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.9);
  letter-spacing: 8px;
  margin-bottom: 30px;
  text-transform: uppercase;
}

.fullscreen-number {
  font-size: 20rem;
  font-weight: 900;
  color: #ffffff;
  line-height: 1;
  text-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  animation: numberPulse 1s ease-in-out infinite;
}

@keyframes numberPulse {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.02);
  }
}

.fullscreen-hint {
  font-size: 1.8rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.8);
  margin-top: 40px;
  letter-spacing: 2px;
}

.fullscreen-bg-pulse {
  position: absolute;
  width: 150%;
  height: 150%;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.1) 0%, transparent 70%);
  animation: bgPulse 2s ease-in-out infinite;
}

@keyframes bgPulse {
  0%,
  100% {
    transform: scale(1);
    opacity: 0.5;
  }
  50% {
    transform: scale(1.2);
    opacity: 1;
  }
}

/* Fullscreen transitions */
.fullscreen-enter-active {
  animation: fullscreenIn 0.4s ease-out;
}

.fullscreen-leave-active {
  animation: fullscreenOut 0.4s ease-in;
}

@keyframes fullscreenIn {
  0% {
    opacity: 0;
    transform: scale(1.1);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes fullscreenOut {
  0% {
    opacity: 1;
    transform: scale(1);
  }
  100% {
    opacity: 0;
    transform: scale(0.9);
  }
}

/* ===== RESPONSIVE ===== */
@media (min-width: 1920px) {
  .order-box {
    width: 200px;
    height: 200px;
    font-size: 5.5rem;
  }

  .time-segment {
    min-width: 70px;
    padding: 10px 16px;
  }

  .flip-number {
    font-size: 2.2rem;
  }

  h2 {
    font-size: 2.8rem;
  }

  .fullscreen-number {
    font-size: 28rem;
  }

  .fullscreen-label {
    font-size: 4rem;
  }
}

@media (max-width: 1280px) {
  .order-box {
    width: 130px;
    height: 130px;
    font-size: 3.5rem;
  }

  .fullscreen-number {
    font-size: 15rem;
  }
}

@media (max-width: 1024px) {
  .order-box {
    width: 110px;
    height: 110px;
    font-size: 3rem;
  }

  h2 {
    font-size: 1.6rem;
  }

  .fullscreen-number {
    font-size: 12rem;
  }

  .fullscreen-label {
    font-size: 2rem;
  }
}
</style>
