// Payment-screen UI preferences (per-PC, live across windows):
//  - methodsLayout: 'grid' (default) | 'vertical' — how the payment-type
//    buttons (Naqd/Uzcard/Humo/Payme) are arranged.
//  - quickAmounts: the +amount template buttons (editable in Settings).
// Same one-source + composable pattern as useOrderTypes / useDiscountPolicy.

import { ref } from 'vue';
import { read, write } from 'src/utils/storage';

export type MethodsLayout = 'grid' | 'vertical';

export interface PaymentPrefs {
  methodsLayout: MethodsLayout;
  quickAmounts: number[];
}

export const PAYMENT_PREFS_KEY = 'pos:paymentPrefs';

const DEFAULT_PREFS: PaymentPrefs = {
  methodsLayout: 'grid',
  quickAmounts: [1000, 5000, 10000, 50000, 100000],
};

function merged(stored: Partial<PaymentPrefs> | null | undefined): PaymentPrefs {
  const s = stored ?? {};
  const amounts = Array.isArray(s.quickAmounts)
    ? s.quickAmounts.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0)
    : DEFAULT_PREFS.quickAmounts;
  return {
    methodsLayout: s.methodsLayout === 'vertical' ? 'vertical' : 'grid',
    quickAmounts: amounts.length ? amounts : DEFAULT_PREFS.quickAmounts,
  };
}

const prefs = ref<PaymentPrefs>(merged(read<Partial<PaymentPrefs>>(PAYMENT_PREFS_KEY)));

let subscribed = false;
function ensureSync(): void {
  if (subscribed) return;
  if (!window.electron?.kv?.onChanged) return;
  subscribed = true;
  window.electron.kv.onChanged((all) => {
    prefs.value = merged(all[PAYMENT_PREFS_KEY] as Partial<PaymentPrefs> | undefined);
  });
}
ensureSync();

export function usePaymentPrefs(): {
  prefs: typeof prefs;
  save: (next: PaymentPrefs) => Promise<void>;
} {
  const save = async (next: PaymentPrefs): Promise<void> => {
    const clean = merged(next);
    prefs.value = clean;
    await write(PAYMENT_PREFS_KEY, clean);
  };
  return { prefs, save };
}
