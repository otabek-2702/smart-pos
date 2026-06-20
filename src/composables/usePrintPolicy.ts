// src/composables/usePrintPolicy.ts
//
// Per-order-type receipt print policy, built on the scoped tweak store. For each
// order type the cashier can choose whether the check prints BEFORE payment (at
// creation) and/or AFTER payment. Defaults reproduce the previous hardcoded
// behaviour. Scope defaults to 'global' (print policy is usually the same on
// every till). All-instant orders are still never auto-printed (handled by the
// callers via useInstantProducts).

import { useTweak, readTweak } from './useTweaks';

export type OrderTypeKey = 'HALL' | 'DELIVERY' | 'PICKUP';

export const PRINT_BEFORE_DEFAULTS: Record<OrderTypeKey, boolean> = {
  HALL: false,
  DELIVERY: true,
  PICKUP: true,
};
export const PRINT_AFTER_DEFAULTS: Record<OrderTypeKey, boolean> = {
  HALL: true,
  DELIVERY: false,
  PICKUP: false,
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
  return readTweak<boolean>(afterKey(k), PRINT_AFTER_DEFAULTS[k] ?? false, 'global');
}
