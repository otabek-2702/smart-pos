// src/composables/useCouriers.ts
//
// Active couriers (DeliveryPerson) for the order courier picker. The local
// edition exposes them on the staff API:
//   GET  /couriers                       -> { data: { items: [{id,name,phone}] } }
//   POST /orders/{id}/courier {delivery_person_id}  -> assign / replace / clear
//
// The list is small and rarely changes, so we cache it in a module ref and
// refresh on demand (the picker calls loadCouriers when it opens).

import { ref } from 'vue';
import { api } from 'boot/axios';

export interface Courier {
  id: number;
  name: string;
  phone?: string | null;
}

interface CouriersResp {
  data?: { items?: Courier[] };
}

const couriers = ref<Courier[]>([]);
const loaded = ref(false);

/** Fetch the active courier list. Pass force to bypass the once-cache. */
export async function loadCouriers(force = false): Promise<Courier[]> {
  if (loaded.value && !force) return couriers.value;
  try {
    const res = await api.get<CouriersResp>('/couriers', { validateStatus: () => true });
    couriers.value = res.data?.data?.items ?? [];
    loaded.value = true;
  } catch (e) {
    console.error('[couriers] load failed:', e);
  }
  return couriers.value;
}

/**
 * Assign / replace / clear the courier on an existing order.
 * Pass null/0 to clear. Returns true on success.
 */
export async function assignCourier(
  orderId: number,
  deliveryPersonId: number | null,
): Promise<boolean> {
  try {
    const r = await api.post(
      `/orders/${orderId}/courier`,
      { delivery_person_id: deliveryPersonId },
      { validateStatus: () => true },
    );
    return r.status === 200 || r.status === 201;
  } catch (e) {
    console.error('[couriers] assign failed:', e);
    return false;
  }
}

export function useCouriers() {
  return { couriers, loadCouriers, assignCourier };
}
