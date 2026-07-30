import { describe, expect, it } from 'vitest';
import {
  mapBackendOrder,
  moneyToInteger,
  unwrapBackendOrder,
  unwrapBackendOrders,
} from '../../src-electron/reporting/backend-order-mapper';

describe('authoritative backend order mapping', () => {
  it('keeps creator, settlement cashier and mixed tenders distinct', () => {
    const record = mapBackendOrder({
      id: 91,
      display_id: 12,
      created_at: '2026-07-29T05:10:00Z',
      updated_at: '2026-07-29T06:00:00Z',
      paid_at: '2026-07-29T05:20:00Z',
      status: 'PAID',
      is_paid: true,
      total_amount: '100000.00',
      user: { id: 4, name: 'Order creator' },
      cashier: { id: 8, name: 'Payment cashier' },
      order_type: 'hall',
      items: [
        {
          id: 2,
          product: { id: 7, name: 'Osh', category: 'Taomlar' },
          quantity: 2,
          price: '50000.00',
        },
      ],
      payment_method: 'HUMO',
      payments: [
        { method: 'HUMO', amount: '70000.00' },
        { method: 'CASH', amount: '50000.00' },
      ],
    });

    expect(record).toMatchObject({
      creator: { id: 4, name: 'Order creator' },
      cashier: { id: 8, name: 'Payment cashier' },
      totalMinor: 100_000,
      itemCount: 2,
      items: [
        {
          productId: 7,
          categoryName: 'Taomlar',
          quantity: 2,
          lineTotalMinor: 100_000,
        },
      ],
      payments: [
        { method: 'HUMO', amountMinor: 70_000 },
        { method: 'CASH', amountMinor: 50_000 },
      ],
    });
  });

  it('preserves rich child data when a list snapshot omits it', () => {
    const existing = mapBackendOrder({
      id: 5,
      display_id: 5,
      created_at: '2026-07-29T05:00:00Z',
      updated_at: '2026-07-29T05:10:00Z',
      status: 'PAID',
      is_paid: true,
      total_amount: 40_000,
      user: { id: 1, name: 'Creator' },
      cashier: { id: 2, name: 'Cashier' },
      order_type: 'PICKUP',
      items: [
        {
          product: { id: 10, name: 'Tea' },
          quantity: 1,
          price: 40_000,
        },
      ],
      payments: [{ method: 'CASH', amount: 50_000 }],
    });

    const refreshed = mapBackendOrder(
      {
        id: 5,
        display_id: 5,
        created_at: '2026-07-29T05:00:00Z',
        updated_at: '2026-07-29T05:20:00Z',
        status: 'CANCELLED',
        is_paid: true,
        total_amount: 40_000,
        order_type: 'PICKUP',
      },
      existing,
    );

    expect(refreshed.items).toEqual(existing.items);
    expect(refreshed.payments).toEqual(existing.payments);
    expect(refreshed.creator).toEqual(existing.creator);
    expect(refreshed.cashier).toEqual(existing.cashier);
    expect(refreshed.status).toBe('CANCELLED');
  });

  it('maps the flattened item shape returned by the order-list endpoint', () => {
    const record = mapBackendOrder({
      id: 6,
      display_id: 60,
      order_number: 202607290060,
      created_at: '2026-07-29T05:00:00Z',
      updated_at: '2026-07-29T05:10:00Z',
      status: 'PREPARING',
      is_paid: false,
      total_amount: '45000.00',
      cashier: { id: 8, name: 'Settlement cashier' },
      order_type: 'HALL',
      items: [
        {
          id: 12,
          product__id: 44,
          product__name: 'Lagman',
          product__category__id: 3,
          product__category__name: 'Hot food',
          quantity: 1,
          price: '45000.00',
        },
      ],
    });

    expect(record).toMatchObject({
      orderNumber: 202607290060,
      creator: { id: null, name: 'Noma’lum' },
      cashier: { id: 8, name: 'Settlement cashier' },
      items: [
        {
          productId: 44,
          name: 'Lagman',
          categoryName: 'Hot food',
          lineTotalMinor: 45_000,
        },
      ],
    });
  });

  it('accepts only whole non-negative UZS amounts', () => {
    expect(moneyToInteger('123000.00', 'amount')).toBe(123_000);
    expect(() => moneyToInteger('12.50', 'amount')).toThrow('integer UZS');
    expect(() => moneyToInteger(-1, 'amount')).toThrow('integer UZS');
  });

  it('unwraps detail and paginated list envelopes', () => {
    expect(
      unwrapBackendOrder({ data: { order: { id: 1, display_id: 1 } } }),
    ).toMatchObject({ id: 1 });
    expect(
      unwrapBackendOrders({
        data: {
          orders: [{ id: 1 }],
          pagination: { current_page: 1, total_pages: 2 },
        },
      }),
    ).toEqual({ orders: [{ id: 1 }], hasNext: true });
  });
});
