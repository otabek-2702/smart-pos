// src/composables/useCouriers.ts
//
// Active courier accounts for the order courier picker. Current backends expose
// the courier delivery system at /api/couriers/; older installations still have
// the legacy DeliveryPerson endpoints. Keep the fallback so a staged POS update
// doesn't make an existing till lose its courier picker.

import { ref } from 'vue';
import { api } from 'boot/axios';

export interface Courier {
  id: number;
  name: string;
  phone?: string | null;
  source: 'courier-api' | 'legacy';
}

/** The display-friendly assignment embedded in an order detail response. */
export interface AssignedCourier {
  id: number;
  name: string;
  phone?: string | null;
  step?: string | null;
}

interface LegacyCourierItem {
  id: number;
  name: string;
  phone?: string | null;
}

interface LegacyCouriersResp {
  data?: { items?: LegacyCourierItem[] };
}

interface DeliveryCourierApiItem {
  id: string;
  pk: number;
  name: string;
  phone?: string | null;
}

interface DeliveryCouriersResp {
  success?: boolean;
  data?: DeliveryCourierApiItem[];
}

const couriers = ref<Courier[]>([]);
const loaded = ref(false);
// New Courier ids and legacy DeliveryPerson ids are different domains. Once
// the new list endpoint has answered, never send its ids to the legacy route.
const deliveryCourierApiAvailable = ref(false);

/** Fetch the active courier list. Pass force to bypass the once-cache. */
export async function loadCouriers(force = false): Promise<Courier[]> {
  if (loaded.value && !force) return couriers.value;
  try {
    const deliveryRes = await api.get<DeliveryCouriersResp>('/api/couriers/', {
      validateStatus: () => true,
    });
    if (deliveryRes.status >= 200 && deliveryRes.status < 300 && Array.isArray(deliveryRes.data?.data)) {
      deliveryCourierApiAvailable.value = true;
      couriers.value = deliveryRes.data.data.map((courier) => ({
        id: courier.pk,
        name: courier.name,
        phone: courier.phone ?? null,
        source: 'courier-api',
      }));
    } else {
      deliveryCourierApiAvailable.value = false;
      const legacyRes = await api.get<LegacyCouriersResp>('/couriers', { validateStatus: () => true });
      couriers.value = (legacyRes.data?.data?.items ?? []).map((courier) => ({
        ...courier,
        phone: courier.phone ?? null,
        source: 'legacy',
      }));
    }
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
  courierId: number | null,
  deliveryAddress = '',
): Promise<boolean> {
  const courier = courierId == null ? null : couriers.value.find((item) => item.id === courierId);
  try {
    if (courier?.source === 'courier-api' || (courierId == null && deliveryCourierApiAvailable.value)) {
      // The new delivery backend owns Courier accounts and emits the rider's
      // assignment event. It requires the delivery snapshot at assignment time.
      const r = await api.post(
        '/api/couriers/assign',
        { order_id: orderId, courier_id: courierId, addr_text: deliveryAddress },
        { validateStatus: () => true },
      );
      return r.status === 200 || r.status === 201;
    }
    const r = await api.post(`/orders/${orderId}/courier`, {
      delivery_person_id: courierId,
    }, { validateStatus: () => true });
    return r.status === 200 || r.status === 201;
  } catch (e) {
    console.error('[couriers] assign failed:', e);
    return false;
  }
}

export function useCouriers() {
  return { couriers, loadCouriers, assignCourier };
}
