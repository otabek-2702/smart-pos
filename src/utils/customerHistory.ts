export interface CustomerHistoryOrder {
  order_type?: string | null;
  delivery_address?: string | null;
  address?: string | null;
  description?: string | null;
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function addressKey(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('uz')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * Old backend builds stored address + note in one description separated by an
 * em dash. New backend responses expose delivery_address directly.
 */
export function deliveryAddressFromOrder(order: CustomerHistoryOrder): string {
  if (order.order_type && order.order_type !== 'DELIVERY') return '';

  const structured = cleanText(order.delivery_address) || cleanText(order.address);
  if (structured) return structured;

  const rawLegacy = typeof order.description === 'string' ? order.description.trim() : '';
  if (!rawLegacy) return '';

  const labelled = rawLegacy.match(/(?:^|\n)\s*Manzil\s*:\s*([^\n]+)/i)?.[1];
  if (labelled) return cleanText(labelled);

  const legacy = cleanText(rawLegacy);
  return cleanText(legacy.split(/\s+[—–]\s+/, 1)[0]);
}

/** Latest history is kept first; formatting-only duplicates collapse to one. */
export function distinctDeliveryAddresses(orders: CustomerHistoryOrder[], limit = 5): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const order of orders) {
    const address = deliveryAddressFromOrder(order);
    const key = addressKey(address);
    if (!address || !key || seen.has(key)) continue;

    seen.add(key);
    result.push(address);
    if (result.length >= limit) break;
  }

  return result;
}

/** Compatibility value for backends that still have only Order.description. */
export function composeLegacyDeliveryDescription(address: string, note: string): string {
  return [cleanText(address), cleanText(note)].filter(Boolean).join(' — ');
}
