// CreateOrder category-filter layout preference (per-PC, live across windows).
// 'scroll' = single row, horizontal scroll (default). 'wrap' = multiple rows.
// Same one-source + composable pattern as useOrderTypes / useDiscountPolicy
// (see [[feedback_centralize_labels]]).

import { ref } from 'vue';
import { read, write } from 'src/utils/storage';

export type CategoryLayout = 'scroll' | 'wrap';

export const CATEGORY_LAYOUT_KEY = 'pos:categoryLayout';

function normalize(v: unknown): CategoryLayout {
  return v === 'wrap' ? 'wrap' : 'scroll';
}

const layout = ref<CategoryLayout>(normalize(read<CategoryLayout>(CATEGORY_LAYOUT_KEY)));

let subscribed = false;
function ensureSync(): void {
  if (subscribed) return;
  if (!window.electron?.kv?.onChanged) return;
  subscribed = true;
  window.electron.kv.onChanged((all) => {
    layout.value = normalize(all[CATEGORY_LAYOUT_KEY]);
  });
}
ensureSync();

export function useCategoryLayout(): {
  layout: typeof layout;
  save: (next: CategoryLayout) => Promise<void>;
} {
  const save = async (next: CategoryLayout): Promise<void> => {
    layout.value = next;
    await write(CATEGORY_LAYOUT_KEY, next);
  };
  return { layout, save };
}
