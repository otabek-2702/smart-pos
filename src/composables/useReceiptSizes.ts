// src/composables/useReceiptSizes.ts
//
// Per-part receipt font-size multipliers, on the scoped tweak store. Each part
// (meta, items, total, grand, status, orderno, footer) has a size 0.6–2.0
// (default 1.0). Used by the ReceiptSettings live preview (click a part → slider)
// and mirrored into the printed receipt (the print template reads the same keys
// via the main-process tweak store). Default scope 'global' — the receipt design
// is normally identical on every till.

import { useTweak } from './useTweaks';

export interface ReceiptPart {
  key: string;
  label: string;
}

// Keys MUST match RECEIPT_SIZE_KEYS in src-electron/receipt-template.ts.
export const RECEIPT_PARTS: ReceiptPart[] = [
  { key: 'meta', label: 'Sarlavha (sana / kassir)' },
  { key: 'items', label: 'Mahsulotlar' },
  { key: 'total', label: 'Oraliq summa / chegirma' },
  { key: 'grand', label: 'Jami summa' },
  { key: 'status', label: "To'lov holati" },
  { key: 'orderno', label: 'Buyurtma raqami' },
  { key: 'footer', label: 'Pastki matn' },
];

export const RECEIPT_SIZE_MIN = 0.6;
export const RECEIPT_SIZE_MAX = 2.0;

export const receiptSizeKey = (part: string): string => `receipt.size.${part}`;

export function useReceiptSize(part: string) {
  return useTweak<number>(receiptSizeKey(part), 1, 'global');
}
