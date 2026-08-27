<template>
  <div class="kds-page" :class="`kds-${theme}`">
    <!-- ORDERS — round-robin into columns (item i → column i % N) so tickets
         read oldest→newest left-to-right (17 18 19 20 / 21 22 23) while each
         column still packs tight (no big row-height gaps). -->
    <div v-if="orders.length > 0" class="orders-board">
      <div v-for="(col, ci) in columns" :key="ci" class="kds-col">
        <div v-for="order in col" :key="order.id" class="order-wrapper">
          <OrderCard :order="order" @status-changed="handleStatusChanged" />
        </div>
      </div>
    </div>

    <!-- EMPTY -->
    <div v-else class="empty-state">
      <span class="empty-text">
        {{ currentMode === 'PREPARING' ? "Buyurtmalar yo'q" : "Tayyor buyurtmalar yo'q" }}
      </span>
    </div>

    <!-- FOOTER -->
    <footer class="page-footer">
      <div class="footer-left">
        <div class="kds-tabs">
          <button
            class="tab-btn"
            :class="{ active: currentMode === 'PREPARING' }"
            @click="switchMode('PREPARING')"
          >
            JARAYONDA
            <span v-if="currentMode === 'PREPARING' && orders.length > 0" class="tab-count">
              {{ orders.length }}
            </span>
          </button>

          <button
            class="tab-btn"
            :class="{ active: currentMode === 'READY' }"
            @click="switchMode('READY')"
          >
            TAYYOR
            <span v-if="currentMode === 'READY' && orders.length > 0" class="tab-count">
              {{ orders.length }}
            </span>
          </button>
        </div>

        <!-- Mute the new-order beep — left, after the tabs -->
        <button
          type="button"
          class="mute-btn"
          :class="{ muted }"
          :aria-label="muted ? 'Ovozni yoqish' : 'Ovozni o\'chirish'"
          @click="toggleMute"
        >
          <q-icon :name="muted ? 'volume_off' : 'volume_up'" size="22px" />
        </button>

        <!-- Theme cycle (light → dark → blue) — after the mute button -->
        <button
          type="button"
          class="mute-btn theme-btn"
          :class="`theme-${theme}`"
          :aria-label="themeLabel"
          :title="themeLabel"
          @click="cycleTheme"
        >
          <q-icon :name="themeIcon" size="22px" />
        </button>
      </div>

      <div class="footer-center">
        <AppClock size="md" />
      </div>

      <div class="footer-right">
        <!-- Columns per row (chef picks; Avto = responsive) -->
        <div class="cols-ctl" role="group" aria-label="Ustunlar soni">
          <q-icon name="view_column" size="16px" />
          <button
            v-for="n in COL_OPTIONS"
            :key="n"
            type="button"
            class="cols-btn"
            :class="{ active: colsPerRow === n }"
            @click="setCols(n)"
          >
            {{ n }}
          </button>
          <button
            type="button"
            class="cols-btn"
            :class="{ active: colsPerRow === null }"
            @click="setCols(null)"
          >
            Avto
          </button>
        </div>
        <button type="button" class="nav-btn" @click="router.push({ name: 'orders' })">
          <q-icon name="arrow_back" size="20px" />
          Ortga
        </button>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { api } from 'src/boot/axios';
import { useRouter } from 'vue-router';
import OrderCard from 'src/components/OrderCard.vue';
import AppClock from 'src/components/AppClock.vue';
import { useOrderStream } from 'src/composables/useOrderStream';
import { suppressInternetWarningOnPage } from 'src/composables/useInternetWarningSuppress';
import { read, write } from 'src/utils/storage';

// Kitchen staff must not be interrupted by an internet modal. The KDS keeps
// its last successful ticket board and continues polling the local POS server.
suppressInternetWarningOnPage();

/* Chef-chosen columns per row (overrides the responsive default). Persisted
   per-PC; null = automatic (responsive media queries). */
const KDS_COLS_KEY = 'pos:kdsCols';
const COL_OPTIONS = [3, 4, 5, 6];
const colsPerRow = ref<number | null>(read<number>(KDS_COLS_KEY) ?? null);
function setCols(n: number | null): void {
  colsPerRow.value = n;
  void write(KDS_COLS_KEY, n);
}

/* Mute the new-order beep (persisted per-PC). */
const KDS_MUTED_KEY = 'pos:kdsMuted';
const muted = ref<boolean>(read<boolean>(KDS_MUTED_KEY) === true);
function toggleMute(): void {
  muted.value = !muted.value;
  void write(KDS_MUTED_KEY, muted.value);
  // This click is a browser-recognized gesture, so turning sound back on also
  // unlocks and confirms the new-order alert instead of leaving it silently
  // suspended until the next ticket arrives.
  if (!muted.value) {
    unlockAudio();
    playBeep();
  }
}

/* KDS color theme (persisted per-PC): light → dark → blue. Cycles on the
   footer button. `blue` = the navy ticket-wall look (blue card + bg). */
type KdsTheme = 'light' | 'dark' | 'blue';
const KDS_THEME_KEY = 'pos:kdsTheme';
const KDS_DARK_KEY = 'pos:kdsDark'; // legacy boolean — migrate to the theme key
const KDS_THEMES: KdsTheme[] = ['light', 'dark', 'blue'];
const theme = ref<KdsTheme>(
  read<KdsTheme>(KDS_THEME_KEY) ?? (read<boolean>(KDS_DARK_KEY) === true ? 'dark' : 'light'),
);
function cycleTheme(): void {
  const i = KDS_THEMES.indexOf(theme.value);
  theme.value = KDS_THEMES[(i + 1) % KDS_THEMES.length]!;
  void write(KDS_THEME_KEY, theme.value);
}
const themeIcon = computed<string>(() =>
  theme.value === 'light' ? 'light_mode' : theme.value === 'dark' ? 'dark_mode' : 'palette',
);
const themeLabel = computed<string>(() =>
  theme.value === 'light'
    ? "Yorug' mavzu"
    : theme.value === 'dark'
      ? "Qorong'i mavzu"
      : "Ko'k mavzu",
);

/* ================= TYPES ================= */

type OrderStatus = 'PREPARING' | 'READY';

interface OrderItem {
  id: number;
  product__name: string;
  quantity: number;
  // Orders-list serializer sends the item note as `detail`.
  detail?: string | null;
}

interface Cashier {
  name: string;
}

interface OrderUser {
  email?: string | null;
}

interface OrderCustomer {
  telegram_id?: number | string | null;
}

interface Order {
  id: number;
  display_id: number;
  order_type: 'HALL' | 'PICKUP' | 'DELIVERY';
  status: OrderStatus;
  created_at: string;
  ready_at: string;
  updated_at: string;
  cashier: Cashier | null;
  user?: OrderUser | null;
  customer?: OrderCustomer | null;
  source?: string | null;
  order_source?: string | null;
  channel?: string | null;
  origin?: string | null;
  is_telegram?: boolean;
  items: OrderItem[];
}

interface OrdersResponse {
  data: {
    orders: Order[];
  };
}

/* ================= STATE ================= */

const router = useRouter();

const currentMode = ref<OrderStatus>('PREPARING');
const orders = ref<Order[]>([]);

/* ---- column distribution (round-robin, row-major reading order) ---- */
const windowWidth = ref(window.innerWidth);
function onResize(): void {
  windowWidth.value = window.innerWidth;
}
// Responsive column count when the chef hasn't pinned one (Avto).
const responsiveCols = computed<number>(() => {
  const w = windowWidth.value;
  if (w <= 500) return 1;
  if (w <= 800) return 2;
  if (w <= 1100) return 3;
  if (w <= 1400) return 4;
  if (w <= 1600) return 5;
  return 6;
});
const columnCount = computed<number>(() => colsPerRow.value ?? responsiveCols.value);
// orders[i] → column (i % N): row r reads left→right as orders[r*N … r*N+N-1].
const columns = computed<Order[][]>(() => {
  const n = Math.max(1, columnCount.value);
  const cols: Order[][] = Array.from({ length: n }, () => []);
  orders.value.forEach((o, i) => cols[i % n]!.push(o));
  return cols;
});

/* new-order detection */
const previousOrderIds = ref<Set<number>>(new Set());
const isInitialLoad = ref(true);

/* polling */
let pollingInterval: number | undefined;

/* Both the 3s poll and every SSE event call fetchOrders with no in-flight
   guard, so responses can land out of order — a slow older one overwriting a
   fresh list (flicker) and corrupting new-order detection. Tag each request;
   only the latest issued one is allowed to apply its result. */
let fetchSeq = 0;

/* Telegram checkout uses a service account (`tg-…@telegram.local`). The
   list endpoint on older local servers does not include that identity, so
   resolve it once from the detail endpoint only for tickets with no cashier.
   The result is cached per order and never guessed from a person's name. */
const telegramOriginByOrderId = new Map<number, boolean>();
const telegramOriginRequests = new Set<number>();

function explicitTelegramOrigin(order: Order): boolean | null {
  if (order.is_telegram === true) return true;
  if (order.customer?.telegram_id != null) return true;

  const source = [
    order.source,
    order.order_source,
    order.channel,
    order.origin,
  ].find((value): value is string => typeof value === 'string' && value.length > 0);
  return source ? source.toLowerCase().includes('telegram') : null;
}

async function hydrateTelegramOrigins(ticketList: Order[]): Promise<void> {
  const unresolved = ticketList.filter((order) => {
    const explicit = explicitTelegramOrigin(order);
    if (explicit != null) {
      telegramOriginByOrderId.set(order.id, explicit);
      return false;
    }
    return order.cashier == null
      && !telegramOriginByOrderId.has(order.id)
      && !telegramOriginRequests.has(order.id);
  });

  await Promise.all(unresolved.map(async (order) => {
    telegramOriginRequests.add(order.id);
    let isTelegram = false;
    try {
      const response = await api.get<{ data?: { order?: Order } }>(`/orders/${order.id}`);
      const detail = response.data?.data?.order;
      isTelegram = /^tg-.+@telegram\.local$/i.test(detail?.user?.email ?? '');
    } catch (error) {
      // A failed optional enrichment must never wipe, delay, or mislabel a
      // kitchen ticket. Cache "not identified" to avoid retrying every 3 sec.
      console.warn('[KDS] Telegram source lookup failed:', error);
    } finally {
      telegramOriginRequests.delete(order.id);
      telegramOriginByOrderId.set(order.id, isTelegram);
    }

    // The board may have switched tabs or received a newer list while the
    // detail request was in flight. Update only the still-visible ticket.
    if (orders.value.some((current) => current.id === order.id)) {
      orders.value = orders.value.map((current) =>
        current.id === order.id ? { ...current, is_telegram: isTelegram } : current,
      );
    }
  }));
}

/* ================= SOUND (NEW ORDERS ONLY) ================= */

let audioContext: AudioContext | null = null;

function initAudioContext(): void {
  if (audioContext === null) {
    audioContext = new AudioContext();
  }
}

function unlockAudio(): void {
  initAudioContext();
  if (audioContext?.state === 'suspended') {
    void audioContext.resume();
  }
}

function playBeep(): void {
  if (muted.value) return;
  if (audioContext === null) return;
  // Created without a user gesture (onMounted), the context starts 'suspended'
  // per the autoplay policy — start()/stop() would schedule silently. Resume
  // it here as a safety net so the new-order beep is actually audible.
  unlockAudio();
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.frequency.value = 880;
  oscillator.type = 'sine';

  gainNode.gain.setValueAtTime(0.4, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.25);

  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.25);
}

// function playDoubleBeep(): void {
//   playBeep()
//   setTimeout(() => {
//     playBeep()
//   }, 300)
// }

function checkForNewOrders(newOrders: Order[]): void {
  const newIds = new Set(newOrders.map((o) => o.id));
  if (!isInitialLoad.value) {
    for (const id of newIds) {
      if (!previousOrderIds.value.has(id)) {
        playBeep();
        break;
      }
    }
  }

  previousOrderIds.value = newIds;
  isInitialLoad.value = false;
}

/* ================= API ================= */

async function fetchOrders(): Promise<void> {
  // Called from a 3s poll AND on every SSE event — must never throw, or it
  // floods the kitchen display with unhandled rejections. On a transient
  // failure keep the current list rather than wiping the board.
  const seq = ++fetchSeq;
  try {
    const response = await api.get<OrdersResponse>('/orders', {
      params: {
        statuses: currentMode.value,
        per_page: 100000,
      },
    });

    // A newer fetch was issued while this one was in flight — its result is
    // fresher, so discard this (possibly stale) response to avoid overwriting
    // it or double-counting orders in the new-order beep detection.
    if (seq !== fetchSeq) return;

    const newOrders = (response.data?.data?.orders ?? []).map((order) => {
      const explicit = explicitTelegramOrigin(order);
      const cached = telegramOriginByOrderId.get(order.id);
      const isTelegram = explicit ?? cached;
      return isTelegram == null ? order : { ...order, is_telegram: isTelegram };
    });

    if (currentMode.value === 'PREPARING') {
      checkForNewOrders(newOrders);
    }

    // Newest orders first (top of the board). created_at is ISO, so a string
    // compare is chronological.
    orders.value = [...newOrders].sort((a, b) =>
      (b.created_at || '').localeCompare(a.created_at || ''),
    );
    void hydrateTelegramOrigins(orders.value);
  } catch (e) {
    console.error('[KDS] fetchOrders failed:', e);
  }
}

function switchMode(newMode: OrderStatus): void {
  if (currentMode.value === newMode) return;

  currentMode.value = newMode;
  isInitialLoad.value = true;
  previousOrderIds.value = new Set();
  void fetchOrders();
}

function handleStatusChanged(): void {
  void fetchOrders();
}

/* ================= POLLING ================= */

// 3s to match the cashier OrdersPage cadence and the product spec — the
// kitchen needs new tickets to appear about as fast as the cashier sees them.
const POLL_INTERVAL_MS = 3000;

function startPolling(): void {
  pollingInterval = window.setInterval(() => {
    void fetchOrders();
  }, POLL_INTERVAL_MS);
}

function stopPolling(): void {
  if (pollingInterval !== undefined) {
    clearInterval(pollingInterval);
    pollingInterval = undefined;
  }
}

/* ================= LIFECYCLE ================= */

function handleUserInteraction(): void {
  // A real gesture is what unlocks Web Audio. Listen for pointer and keyboard
  // input, not just a mouse click, so touch-screen and keyboard-only kitchens
  // receive the first new-order alert too.
  unlockAudio();
  document.removeEventListener('pointerdown', handleUserInteraction);
  document.removeEventListener('keydown', handleUserInteraction);
}

// SSE makes new tickets appear immediately for the kitchen. Polling stays
// on as fallback (backend BE-3 spec) — either path triggers fetchOrders().
useOrderStream({
  onEvent: () => {
    void fetchOrders();
  },
});

onMounted(() => {
  initAudioContext();
  document.addEventListener('pointerdown', handleUserInteraction, { once: true });
  document.addEventListener('keydown', handleUserInteraction, { once: true });
  window.addEventListener('resize', onResize);
  void fetchOrders();
  startPolling();
});

onUnmounted(() => {
  stopPolling();
  document.removeEventListener('pointerdown', handleUserInteraction);
  document.removeEventListener('keydown', handleUserInteraction);
  window.removeEventListener('resize', onResize);

  if (audioContext !== null) {
    void audioContext.close();
  }
});
</script>

<style scoped lang="scss">
.kds-page {
  height: 100vh;
  background: var(--kds-bg-app);
  display: flex;
  flex-direction: column;
}

/* Dark theme — overrides the design tokens for the whole KDS screen. CSS
   custom properties inherit through component boundaries, so OrderCard and
   the footer controls pick these up automatically. */
.kds-page.kds-dark {
  --bg-app: #0f1115;
  --kds-bg-app: #0f1115;
  --surface: #1a1d23;
  --bg-surface: #1a1d23;
  --kds-bg-card: #1a1d23;
  --surface-2: #22262e;
  --bg-surface-2: #22262e;
  --surface-3: #2b3038;
  --line: #2e333c;
  --border-color: #2e333c;
  --kds-border-color: #2e333c;
  --line-strong: #3a404a;
  --ink: #f1f3f5;
  --text-primary: #f1f3f5;
  --kds-text-primary: #f1f3f5;
  --ink-2: #a7b0bd;
  --text-muted: #a7b0bd;
  --kds-text-muted: #a7b0bd;
  --ink-3: #6b7480;
  /* status / brand tints over the dark surface */
  --brand-soft: color-mix(in srgb, var(--brand) 26%, #1a1d23);
  --ready-bg: color-mix(in srgb, #15803d 30%, #1a1d23);
  --paid-bg: color-mix(in srgb, #15803d 30%, #1a1d23);
  --unpaid-bg: color-mix(in srgb, #b45309 30%, #1a1d23);
  --prep-bg: color-mix(in srgb, #1d4ed8 30%, #1a1d23);
  --cancel-bg: color-mix(in srgb, #b91c1c 30%, #1a1d23);
  /* order-type pill: light-green text so it isn't the same hue as its tint */
  --kds-pill-bg: color-mix(in srgb, #22c55e 20%, #1a1d23);
  --kds-pill-text: #6ee7a0;
}

/* Blue theme — the navy ticket-wall look (blue cards on a deep-navy board).
   Same token-override trick as dark; cards/footer inherit it automatically. */
.kds-page.kds-blue {
  --bg-app: #081b30;
  --kds-bg-app: #081b30;
  --surface: #123a5e;
  --bg-surface: #123a5e;
  --kds-bg-card: #123a5e;
  --surface-2: #19476f;
  --bg-surface-2: #19476f;
  --surface-3: #215581;
  --line: #295e8c;
  --border-color: #295e8c;
  --kds-border-color: #295e8c;
  --line-strong: #336da0;
  --ink: #eaf3fc;
  --text-primary: #eaf3fc;
  --kds-text-primary: #eaf3fc;
  --ink-2: #a6c6e6;
  --text-muted: #a6c6e6;
  --kds-text-muted: #a6c6e6;
  --ink-3: #6f95bd;
  /* status / brand tints over the blue surface */
  --brand-soft: color-mix(in srgb, var(--brand) 30%, #123a5e);
  --ready-bg: color-mix(in srgb, #15803d 32%, #123a5e);
  --paid-bg: color-mix(in srgb, #15803d 32%, #123a5e);
  --unpaid-bg: color-mix(in srgb, #b45309 32%, #123a5e);
  --prep-bg: color-mix(in srgb, #1d4ed8 36%, #123a5e);
  --cancel-bg: color-mix(in srgb, #b91c1c 32%, #123a5e);
  /* order-type pill: light-green text so it isn't the same hue as its tint */
  --kds-pill-bg: color-mix(in srgb, #22c55e 20%, #123a5e);
  --kds-pill-text: #6ee7a0;
}

/* theme button shows a small accent matching the active theme */
.theme-btn.theme-dark {
  color: #facc15;
}
.theme-btn.theme-blue {
  color: #4aa3ff;
  border-color: color-mix(in srgb, #4aa3ff 40%, var(--line));
}

/* TABS */
.kds-tabs {
  display: flex;
  gap: 6px;
  background: var(--kds-bg-app);
  padding: 4px;
  border-radius: var(--kds-radius-md);
  box-shadow: var(--kds-shadow-sm);
}

.tab-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 18px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--kds-text-muted);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.tab-btn.active {
  background: var(--kds-btn-primary-bg);
  color: var(--kds-btn-primary-text);
}

.tab-count {
  background: rgba(255, 255, 255, 0.25);
  padding: 2px 7px;
  border-radius: 10px;
  font-size: 11px;
}

/* MASONRY */
/* Columns packed tight; reading order is row-major via round-robin in JS.
   Each column stacks its tickets with a gap (the "space between rows"). */
.orders-board {
  flex: 1;
  overflow-y: auto;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
}
.kds-col {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.order-wrapper {
  min-width: 0;
}

/* EMPTY */
.empty-state {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 80px 20px;
  color: var(--kds-text-muted);
}

/* FOOTER */
.page-footer {
  padding: 8px 10px;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);

  // Equal 1fr side columns + auto center: the left tabs and right buttons
  // each own half the width, so the clock stays dead-center and the footer
  // never shifts when the tab-count badge appears/disappears or you switch
  // pages.
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  font-size: 12px;
  color: var(--text-muted);
}

.footer-left {
  justify-self: start;
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.kds-tabs {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* back-to-orders / nav button (left corner) */
.nav-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 0 16px;
  border-radius: var(--r-md);
  border: 1px solid var(--line-strong);
  background: var(--surface);
  color: var(--ink);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  &:active {
    transform: scale(0.97);
  }
}

.mute-btn {
  width: 44px;
  height: 44px;
  border-radius: var(--r-md);
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--ink-2);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  &.muted {
    color: var(--cancel);
    border-color: color-mix(in srgb, var(--cancel) 35%, var(--line));
  }
  &:active {
    transform: scale(0.94);
  }
}

.footer-center {
  justify-self: center;
  display: flex;
  align-items: center;
  gap: 12px;
}

.footer-right {
  justify-self: end;
  display: flex;
  align-items: center;
  gap: 12px;
}

/* columns-per-row selector */
.cols-ctl {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface-2);
  color: var(--ink-3);
}
.cols-btn {
  min-width: 30px;
  height: 30px;
  padding: 0 8px;
  border: none;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--ink-2);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease;
}
.cols-btn:hover {
  background: var(--surface-3);
  color: var(--ink);
}
.cols-btn.active {
  background: var(--brand);
  color: #fff;
}

.btn {
  height: 42px;
  border-radius: 14px;
  border: none;
  font-size: 15px;
  font-weight: 600;
  box-shadow: var(--shadow-sm);
  padding: 0 20px;

  &:active {
    transform: scale(0.97);
    box-shadow: none;
  }
}

.btn.secondary {
  background: var(--btn-secondary-bg);
  color: var(--btn-secondary-text);
}
</style>
