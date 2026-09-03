// src/composables/usePrintPolicy.ts
//
// Per-order-type receipt print policy, built on the scoped tweak store. For each
// order type the cashier can choose whether the check prints BEFORE payment (at
// creation) or AFTER payment. A legacy configuration may have both flags enabled;
// in that case BEFORE wins so an order is never automatically printed twice.
// Scope defaults to 'global' (print policy is usually the same on every till).
// All-instant orders are still never auto-printed (handled by the callers via
// useInstantProducts).

import { useTweak, readTweak } from './useTweaks';

export type OrderTypeKey = 'HALL' | 'DELIVERY' | 'PICKUP';

export const PRINT_BEFORE_DEFAULTS: Record<OrderTypeKey, boolean> = {
  HALL: false,
  DELIVERY: true,
  PICKUP: true,
};
// AFTER remains available for every type, but is suppressed whenever BEFORE is
// enabled for the same type.
export const PRINT_AFTER_DEFAULTS: Record<OrderTypeKey, boolean> = {
  HALL: true,
  DELIVERY: true,
  PICKUP: true,
};

export const beforeKey = (t: OrderTypeKey): string => `print.${t}.before`;
export const afterKey = (t: OrderTypeKey): string => `print.${t}.after`;

export const usePrintBefore = (t: OrderTypeKey) =>
  useTweak<boolean>(beforeKey(t), PRINT_BEFORE_DEFAULTS[t], 'global');
export const usePrintAfter = (t: OrderTypeKey) =>
  useTweak<boolean>(afterKey(t), PRINT_AFTER_DEFAULTS[t], 'global');

// Imperative reads for the print path.
export function shouldPrintBefore(t: string): boolean {
  const k = t as OrderTypeKey;
  return readTweak<boolean>(beforeKey(k), PRINT_BEFORE_DEFAULTS[k] ?? false, 'global');
}
export function shouldPrintAfter(t: string): boolean {
  const k = t as OrderTypeKey;
  const before = readTweak<boolean>(beforeKey(k), PRINT_BEFORE_DEFAULTS[k] ?? false, 'global');
  const after = readTweak<boolean>(afterKey(k), PRINT_AFTER_DEFAULTS[k] ?? false, 'global');
  return resolvePrintAfter(before, after);
}

export function resolvePrintAfter(before: boolean, after: boolean): boolean {
  return after && !before;
}
