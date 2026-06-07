// Single source of truth for the order-type labels (Zal / S soboy / Dostavka).
//
// They were hardcoded in 6+ places; now every screen reads them from here, and
// editing them in Settings updates ALL screens (and other windows) live. The
// labels persist per-PC in the kv-store; the main process reads the same key
// for printed receipts (see src-electron/receipt-template.ts), so there is ONE
// source, never drift.
//
// IMPORTANT (project rule): any future user-facing label that appears in more
// than one place should follow this pattern — one persisted source + a
// composable — not copy-pasted strings.

import { ref } from 'vue';
import { read, write } from 'src/utils/storage';

export type OrderType = 'HALL' | 'PICKUP' | 'DELIVERY';
export type OrderTypeLabels = Record<OrderType, string>;

export const ORDER_TYPES: ReadonlyArray<OrderType> = ['HALL', 'PICKUP', 'DELIVERY'];

export const DEFAULT_ORDER_TYPE_LABELS: OrderTypeLabels = {
  HALL: 'Zal',
  PICKUP: 'Olib ketish',
  DELIVERY: 'Yetkazib berish',
};

// Persisted per-PC. Main process reads the same key for receipts.
export const ORDER_TYPE_LABELS_KEY = 'pos:orderTypeLabels';

function merged(stored: Partial<OrderTypeLabels> | null | undefined): OrderTypeLabels {
  return { ...DEFAULT_ORDER_TYPE_LABELS, ...(stored ?? {}) };
}

// Module-level singleton ref → shared, reactive across every component that
// uses the composable. Seeded from the boot-time storage cache.
const labels = ref<OrderTypeLabels>(merged(read<Partial<OrderTypeLabels>>(ORDER_TYPE_LABELS_KEY)));

// Keep live when ANY window edits the labels (kv-store broadcasts changes).
let subscribed = false;
function ensureSync(): void {
  if (subscribed) return;
  if (!window.electron?.kv?.onChanged) return;
  subscribed = true;
  window.electron.kv.onChanged((all) => {
    labels.value = merged(all[ORDER_TYPE_LABELS_KEY] as Partial<OrderTypeLabels> | undefined);
  });
}
ensureSync();

export interface UseOrderTypes {
  labels: typeof labels;
  /** Human label for an order type; falls back to the raw value if unknown. */
  labelFor: (type: string) => string;
  /** Persist new labels (writes to kv-store → broadcasts to all windows). */
  save: (next: OrderTypeLabels) => Promise<void>;
}

export function useOrderTypes(): UseOrderTypes {
  const labelFor = (type: string): string =>
    labels.value[type as OrderType] ?? type;

  const save = async (next: OrderTypeLabels): Promise<void> => {
    labels.value = { ...next };
    await write(ORDER_TYPE_LABELS_KEY, next);
  };

  return { labels, labelFor, save };
}
