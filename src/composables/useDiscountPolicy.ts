// Whether cashiers may give discounts, and the 4-digit PIN that authorizes it.
// Per-PC (kv-store, live across windows). Managers/admins always may, no PIN.
//
// One source + composable (same pattern as useOrderTypes). See
// [[feedback_centralize_labels]] for the project rule.

import { ref } from 'vue';
import { read, write } from 'src/utils/storage';

export interface DiscountPolicy {
  // When true, cashiers can apply a discount AFTER entering the PIN below.
  // When false, only managers can discount.
  cashierAllowed: boolean;
  // 4-digit authorization PIN asked of a cashier before they may discount.
  pin: string;
}

export const DISCOUNT_POLICY_KEY = 'pos:discountPolicy';

const DEFAULT_POLICY: DiscountPolicy = { cashierAllowed: false, pin: '' };

function merged(stored: Partial<DiscountPolicy> | null | undefined): DiscountPolicy {
  return { ...DEFAULT_POLICY, ...(stored ?? {}) };
}

const policy = ref<DiscountPolicy>(merged(read<Partial<DiscountPolicy>>(DISCOUNT_POLICY_KEY)));

let subscribed = false;
function ensureSync(): void {
  if (subscribed) return;
  if (!window.electron?.kv?.onChanged) return;
  subscribed = true;
  window.electron.kv.onChanged((all) => {
    policy.value = merged(all[DISCOUNT_POLICY_KEY] as Partial<DiscountPolicy> | undefined);
  });
}
ensureSync();

export function useDiscountPolicy(): {
  policy: typeof policy;
  save: (next: DiscountPolicy) => Promise<void>;
} {
  const save = async (next: DiscountPolicy): Promise<void> => {
    policy.value = { ...next };
    await write(DISCOUNT_POLICY_KEY, next);
  };
  return { policy, save };
}
