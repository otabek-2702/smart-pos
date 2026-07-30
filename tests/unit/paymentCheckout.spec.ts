import { describe, expect, it } from 'vitest';
import {
  buildCheckoutPayload,
  clearPendingPaymentAttempt,
  getOrCreatePendingPaymentAttempt,
  PendingPaymentConflictError,
  pendingPaymentStorageKey,
  shouldRetainPendingPaymentAttempt,
  type DurablePaymentStore,
} from 'src/utils/paymentCheckout';

function memoryStore(): DurablePaymentStore & { values: Map<string, unknown>; writes: string[] } {
  const values = new Map<string, unknown>();
  const writes: string[] = [];
  return {
    values,
    writes,
    read<T>(key: string): Promise<T | null> {
      return Promise.resolve((values.get(key) as T | undefined) ?? null);
    },
    write<T>(key: string, value: T): Promise<void> {
      values.set(key, value);
      writes.push(key);
      return Promise.resolve();
    },
    remove(key: string): Promise<void> {
      values.delete(key);
      return Promise.resolve();
    },
  };
}

describe('cashier checkout payload', () => {
  it('sends explicit exact-CASH tender lines', () => {
    const result = buildCheckoutPayload({
      orderId: 101,
      effectiveTotal: 100_000,
      discountPercent: 0,
      payments: [{ method: ' cash ', amount: 100_000 }],
    });

    expect(result).toMatchObject({
      ok: true,
      payload: {
        payments: [{ method: 'CASH', amount: 100_000 }],
        discount_percent: 0,
        payment_method: 'CASH',
      },
    });
  });

  it('retains a cash banknote above the bill so change remains auditable', () => {
    const result = buildCheckoutPayload({
      orderId: 102,
      effectiveTotal: 100_000,
      discountPercent: 0,
      payments: [{ method: 'CASH', amount: 120_000 }],
    });

    expect(result).toMatchObject({
      ok: true,
      payload: { payments: [{ method: 'CASH', amount: 120_000 }] },
    });
  });

  it('accepts mixed non-cash plus cash change and derives the dominant method', () => {
    const result = buildCheckoutPayload({
      orderId: 103,
      effectiveTotal: 100_000,
      discountPercent: 0,
      payments: [
        { method: ' humo ', amount: 70_000 },
        { method: 'cash', amount: 50_000 },
      ],
    });

    expect(result).toMatchObject({
      ok: true,
      payload: {
        payments: [
          { method: 'HUMO', amount: 70_000 },
          { method: 'CASH', amount: 50_000 },
        ],
        payment_method: 'HUMO',
      },
    });
  });

  it.each([
    ['rejects a non-cash overpayment', [{ method: 'HUMO', amount: 101_000 }], 'NONCASH_OVERPAYMENT'],
    ['rejects a short tender total', [{ method: 'CASH', amount: 99_000 }], 'PAYMENT_SHORT'],
    ['rejects a non-zero order with no tenders', [], 'EMPTY_PAYMENTS'],
  ])('%s', (_label, payments, code) => {
    const result = buildCheckoutPayload({
      orderId: 104,
      effectiveTotal: 100_000,
      discountPercent: 0,
      payments,
    });

    expect(result).toEqual({ ok: false, code });
  });

  it('uses the documented empty-tender compatibility shape for a zero-total order', () => {
    const result = buildCheckoutPayload({
      orderId: 105,
      effectiveTotal: 0,
      discountPercent: 100,
      payments: [],
    });

    expect(result).toMatchObject({
      ok: true,
      payload: { payments: [], discount_percent: 100, payment_method: 'CASH' },
    });
  });

  it('aggregates repeated methods and preserves first-seen ties for payment_method', () => {
    const repeated = buildCheckoutPayload({
      orderId: 106,
      effectiveTotal: 100_000,
      discountPercent: 0,
      payments: [
        { method: 'CASH', amount: 20_000 },
        { method: 'HUMO', amount: 40_000 },
        { method: 'CASH', amount: 40_000 },
      ],
    });
    const tied = buildCheckoutPayload({
      orderId: 107,
      effectiveTotal: 100_000,
      discountPercent: 0,
      payments: [
        { method: 'PAYME', amount: 50_000 },
        { method: 'HUMO', amount: 50_000 },
      ],
    });

    expect(repeated).toMatchObject({ ok: true, payload: { payment_method: 'CASH' } });
    expect(tied).toMatchObject({ ok: true, payload: { payment_method: 'PAYME' } });
  });
});

describe('durable payment idempotency attempts', () => {
  it('persists before send and reuses the exact same key after a retry or reload', async () => {
    const store = memoryStore();
    const fingerprint = 'same-business-action';
    const createKey = (orderId: number) => `smart-pos-pay:${orderId}:deterministic-token`;

    const first = await getOrCreatePendingPaymentAttempt(200, fingerprint, store, createKey);
    const retried = await getOrCreatePendingPaymentAttempt(200, fingerprint, store, createKey);

    expect(store.writes).toEqual([pendingPaymentStorageKey(200)]);
    expect(retried).toEqual(first);
  });

  it('creates a new key when the tender body fingerprint changes after a definite rejection', async () => {
    const store = memoryStore();
    let sequence = 0;
    const createKey = (orderId: number) => `smart-pos-pay:${orderId}:key-${++sequence}`;

    const first = await getOrCreatePendingPaymentAttempt(201, 'cash-100000', store, createKey);
    await clearPendingPaymentAttempt(201, store);
    const changed = await getOrCreatePendingPaymentAttempt(201, 'humo-100000', store, createKey);

    expect(first.key).not.toEqual(changed.key);
    expect(changed.key).toBe('smart-pos-pay:201:key-2');
  });

  it('does not overwrite an ambiguous previous attempt with changed tender lines', async () => {
    const store = memoryStore();
    await getOrCreatePendingPaymentAttempt(202, 'cash-100000', store, () => 'first-key');

    await expect(
      getOrCreatePendingPaymentAttempt(202, 'humo-100000', store, () => 'second-key'),
    ).rejects.toBeInstanceOf(PendingPaymentConflictError);
    expect(store.values.get(pendingPaymentStorageKey(202))).toEqual({
      fingerprint: 'cash-100000',
      key: 'first-key',
    });
  });

  it('keeps retry evidence for an ambiguous network/409/5xx outcome and clears only definite non-409 4xx', () => {
    expect(shouldRetainPendingPaymentAttempt(undefined)).toBe(true);
    expect(shouldRetainPendingPaymentAttempt(409)).toBe(true);
    expect(shouldRetainPendingPaymentAttempt(500)).toBe(true);
    expect(shouldRetainPendingPaymentAttempt(503)).toBe(true);
    expect(shouldRetainPendingPaymentAttempt(400)).toBe(false);
    expect(shouldRetainPendingPaymentAttempt(422)).toBe(false);
  });
});
