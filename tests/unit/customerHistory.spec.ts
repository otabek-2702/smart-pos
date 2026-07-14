import { describe, expect, it } from 'vitest';
import {
  composeLegacyDeliveryDescription,
  distinctDeliveryAddresses,
} from 'src/utils/customerHistory';

describe('customer delivery history', () => {
  it('prefers structured addresses and removes formatting-only duplicates', () => {
    expect(
      distinctDeliveryAddresses([
        { order_type: 'DELIVERY', delivery_address: 'Amir Temur 10' },
        { order_type: 'DELIVERY', delivery_address: '  amir-temur, 10  ' },
        { order_type: 'DELIVERY', delivery_address: 'Chilonzor 4' },
      ]),
    ).toEqual(['Amir Temur 10', 'Chilonzor 4']);
  });

  it('does not turn non-delivery order notes into address history', () => {
    expect(
      distinctDeliveryAddresses([
        { order_type: 'HALL', delivery_address: 'Bu maydon ham hisobga olinmaydi' },
        { order_type: 'HALL', description: 'Piyozsiz' },
        { order_type: 'PICKUP', description: "O'zi olib ketish" },
      ]),
    ).toEqual([]);
  });

  it('reads the address portion from legacy delivery descriptions', () => {
    expect(
      distinctDeliveryAddresses([
        { order_type: 'DELIVERY', description: 'Yunusobod 12 — Eshik yonida qo‘ng‘iroq qiling' },
        { order_type: 'DELIVERY', description: 'Manzil: Qatortol 7\nIzoh: domofon ishlamaydi' },
      ]),
    ).toEqual(['Yunusobod 12', 'Qatortol 7']);
  });

  it('composes the old description without dangling separators', () => {
    expect(composeLegacyDeliveryDescription('Yunusobod 12', 'Domofon 42')).toBe(
      'Yunusobod 12 — Domofon 42',
    );
    expect(composeLegacyDeliveryDescription('', 'Piyozsiz')).toBe('Piyozsiz');
  });
});
