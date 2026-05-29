// src/composables/useInternetWarningSuppress.ts
//
// Lets specific pages / dialogs hide the InternetWarningDialog while they
// are open. The cashier shouldn't get an interruption modal in the middle
// of creating an order or confirming a payment — they'd lose focus on the
// transaction they're processing.
//
// Important: this DEFERS the dialog, it doesn't permanently skip the drop.
// When suppression lifts (page unmounts, dialog closes), the dialog
// component's watcher re-evaluates and pops the warning if:
//   - internet is still down, AND
//   - not session-dismissed, AND
//   - not already shown for THIS drop (per the dialog's own latch).
//
// Refcounting so nested suppressions (e.g. CreateOrderPage suppresses
// page-wide, then opens PaymentConfirmationDialog which also suppresses)
// don't release prematurely.

import { ref, watch, onUnmounted, type Ref } from 'vue';

const _count = ref(0);

/** Reactive count read by InternetWarningDialog. > 0 means "stay closed". */
export function getInternetWarningSuppression(): Ref<number> {
  return _count;
}

/**
 * Suppress the internet warning dialog for the lifetime of the current
 * component. Auto-releases on unmount. Use on entire pages where an
 * unexpected modal would interrupt a critical user flow.
 */
export function suppressInternetWarningOnPage(): void {
  _count.value++;
  onUnmounted(() => {
    _count.value--;
  });
}

/**
 * Suppress the internet warning dialog while the given ref is true.
 * For Quasar q-dialogs / similar that stay mounted but toggle a boolean
 * — pass a toRef of their v-model. Cleans up on unmount in case the
 * dialog is still "open" when its parent unmounts.
 */
export function suppressInternetWarningWhile(active: Ref<boolean>): void {
  let isCounted = false;
  const sync = (val: boolean): void => {
    if (val && !isCounted) {
      _count.value++;
      isCounted = true;
    } else if (!val && isCounted) {
      _count.value--;
      isCounted = false;
    }
  };

  watch(active, sync, { immediate: true });

  onUnmounted(() => {
    if (isCounted) {
      _count.value--;
      isCounted = false;
    }
  });
}
