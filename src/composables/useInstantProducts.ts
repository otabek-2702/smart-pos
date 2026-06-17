// src/composables/useInstantProducts.ts
//
// Set of "instant" product ids (Product.is_instant — drinks / packaged goods
// that need no kitchen prep). Loaded once after login from the existing
// /products endpoint (which exposes is_instant) and cached per-PC. Used to
// decide whether an order is ALL-instant, in which case the receipt is NEVER
// auto-printed (the cashier can still print it manually).
//
// The orders API doesn't carry is_instant on its items, so we resolve it by
// product id against this set. /products is capped at 100/page (MAX_PER_PAGE),
// so we page through it.

import { ref } from 'vue';
import { api } from 'boot/axios';
import { read, write } from 'src/utils/storage';

const INSTANT_KEY = 'pos:instantProductIds';
const PER_PAGE = 100;
const MAX_PAGES = 50; // safety cap (5000 products)

const instantIds = ref<Set<number>>(new Set(read<number[]>(INSTANT_KEY) ?? []));

interface ApiProductLite {
  id: number;
  is_instant?: boolean;
}
interface ProductsResp {
  data?: { products?: ApiProductLite[] };
}

/** Load + cache the instant-product id set. Call once after login. */
export async function loadInstantProducts(): Promise<void> {
  try {
    const ids: number[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const res = await api.get<ProductsResp>('/products', {
        params: { per_page: PER_PAGE, page },
        validateStatus: () => true,
      });
      const products = res.data?.data?.products ?? [];
      for (const p of products) {
        if (p.is_instant) ids.push(p.id);
      }
      if (products.length < PER_PAGE) break; // last page
    }
    instantIds.value = new Set(ids);
    await write(INSTANT_KEY, ids);
  } catch (e) {
    console.error('[instant] load failed:', e);
  }
}

export function useInstantProducts() {
  // True only when there's at least one item and EVERY item is an instant
  // product (so the order needs no kitchen work / no auto-printed receipt).
  function isAllInstant(productIds: Array<number | null | undefined>): boolean {
    const ids = productIds.filter((x): x is number => typeof x === 'number');
    return ids.length > 0 && ids.every((id) => instantIds.value.has(id));
  }
  return { isAllInstant };
}
