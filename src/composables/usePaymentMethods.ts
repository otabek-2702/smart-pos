// Payment methods for the payment screen — loaded from the backend ONCE at
// login and cached per-PC (kv-store, live across windows). Never fetched on the
// hot payment path. Falls back to 4 built-in methods (with bundled icons) when
// the backend endpoint isn't present yet (see BACKEND_TODO.md §1).
//
// One source of truth, same pattern as useOrderTypes — see that file's note.

import { ref } from 'vue';
import { api } from 'boot/axios';
import { read, write } from 'src/utils/storage';

export interface PaymentMethod {
  code: string; // CASH | UZCARD | HUMO | PAYME (Order.PaymentMethod)
  label: string;
  icon: string; // inline SVG string
  color: string;
  sort_order: number;
  is_active: boolean;
}

export const PAYMENT_METHODS_KEY = 'pos:paymentMethods';

// Bundled fallbacks (used until the backend ships /payment-methods). Icons are
// inline SVGs using currentColor so they tint to each method's color.
const SVG_CASH =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/></svg>';
const SVG_CARD =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>';
const SVG_WALLET =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12V7a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7"/><circle cx="17" cy="14" r="1.4"/></svg>';

export const DEFAULT_PAYMENT_METHODS: PaymentMethod[] = [
  { code: 'CASH', label: 'Naqd', icon: SVG_CASH, color: '#16a34a', sort_order: 1, is_active: true },
  { code: 'UZCARD', label: 'Uzcard', icon: SVG_CARD, color: '#1e88e5', sort_order: 2, is_active: true },
  { code: 'HUMO', label: 'Humo', icon: SVG_CARD, color: '#00897b', sort_order: 3, is_active: true },
  { code: 'PAYME', label: 'Payme', icon: SVG_WALLET, color: '#33b6ff', sort_order: 4, is_active: true },
];

// UZCARD + HUMO are both bank-card networks; cashiers don't care which, so show
// ONE "Karta" button. The backend has no generic CARD code yet
// (Order.PaymentMethod = CASH/UZCARD/HUMO/PAYME), so all card payments record
// under HUMO for now (per Jason — a real CARD/Karta code is a later backend ask).
// To split them again, remove mergeCards(); to switch the bucket, change CARD_CANONICAL.
const CARD_CODES = new Set(['UZCARD', 'HUMO']);
const CARD_CANONICAL = 'HUMO';
const CARD_LABEL = 'Karta';

function mergeCards(list: PaymentMethod[]): PaymentMethod[] {
  const out: PaymentMethod[] = [];
  let cardDone = false;
  for (const m of list) {
    if (CARD_CODES.has(m.code)) {
      if (cardDone) continue; // fold the second card network into the first
      out.push({ ...m, code: CARD_CANONICAL, label: CARD_LABEL, icon: SVG_CARD });
      cardDone = true;
    } else {
      out.push(m);
    }
  }
  return out;
}

function normalize(list: PaymentMethod[] | null): PaymentMethod[] {
  const arr = Array.isArray(list) && list.length > 0 ? list : DEFAULT_PAYMENT_METHODS;
  const active = arr.filter((m) => m.is_active !== false);
  return mergeCards(active).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

// Module-level singleton, seeded from the cache; live across windows.
const methods = ref<PaymentMethod[]>(normalize(read<PaymentMethod[]>(PAYMENT_METHODS_KEY)));

let subscribed = false;
function ensureSync(): void {
  if (subscribed) return;
  if (!window.electron?.kv?.onChanged) return;
  subscribed = true;
  window.electron.kv.onChanged((all) => {
    methods.value = normalize(all[PAYMENT_METHODS_KEY] as PaymentMethod[] | undefined ?? null);
  });
}
ensureSync();

/**
 * Fetch the catalog from the backend and cache it. Call once after login.
 * Silent no-op (keeps fallback/cache) if the endpoint is missing or fails.
 */
export async function loadPaymentMethods(): Promise<void> {
  try {
    const res = await api.get('/payment-methods', { validateStatus: () => true });
    if (res.status === 200 && Array.isArray(res.data?.data?.methods)) {
      const fetched = res.data.data.methods as PaymentMethod[];
      methods.value = normalize(fetched);
      await write(PAYMENT_METHODS_KEY, fetched);
    }
    // Non-200 (e.g. 404 not implemented yet) → keep defaults/cache.
  } catch {
    // Offline / missing → keep defaults/cache.
  }
}

export function usePaymentMethods(): { methods: typeof methods } {
  return { methods };
}
