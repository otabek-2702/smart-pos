/**
 * The checkout request is deliberately assembled outside the payment dialog.
 * Keeping the money rules and the idempotency state in one small module makes
 * it much harder for a UI change to send a different legacy method, retry a
 * payment under a new key, or treat customer change as a shortage.
 */

export const MAX_PAYMENT_AMOUNT = 999_999_999;

export interface PaymentLine {
  method: string;
  amount: number;
}

export interface CheckoutPayload {
  payments: PaymentLine[];
  discount_percent: number;
  payment_method: string;
}

export type CheckoutValidationCode =
  | 'INVALID_ORDER'
  | 'INVALID_DISCOUNT'
  | 'INVALID_TOTAL'
  | 'INVALID_PAYMENT'
  | 'EMPTY_PAYMENTS'
  | 'PAYMENT_SHORT'
  | 'NONCASH_OVERPAYMENT'
  | 'ZERO_TOTAL_WITH_PAYMENT';

export interface CheckoutValidationFailure {
  ok: false;
  code: CheckoutValidationCode;
}

export interface CheckoutValidationSuccess {
  ok: true;
  payload: CheckoutPayload;
  fingerprint: string;
}

export type CheckoutValidation = CheckoutValidationFailure | CheckoutValidationSuccess;

export interface PendingPaymentAttempt {
  fingerprint: string;
  key: string;
}

/** A prior checkout may still have reached the server; do not overwrite it. */
export class PendingPaymentConflictError extends Error {
  constructor() {
    super('An unfinished payment attempt exists for this order. Retry it unchanged first.');
    this.name = 'PendingPaymentConflictError';
  }
}

export interface DurablePaymentStore {
  read<T>(key: string): Promise<T | null>;
  write<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}

function isWholeUzAmount(value: number): boolean {
  return Number.isFinite(value) && Number.isInteger(value) && value > 0 && value <= MAX_PAYMENT_AMOUNT;
}

function normalizedDiscount(value: number): number | null {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0 || value > 100) return null;
  return value;
}

/** Keep every actual tender line, but normalize its method for the API. */
export function normalizePaymentLines(lines: readonly PaymentLine[]): PaymentLine[] | null {
  const normalized: PaymentLine[] = [];

  for (const line of lines) {
    const method = String(line.method ?? '').trim().toUpperCase();
    if (!method || !isWholeUzAmount(line.amount)) return null;
    normalized.push({ method, amount: line.amount });
  }

  return normalized;
}

/**
 * Match the backend's dominant-tender compatibility rule. Equal aggregate
 * totals retain the method that appeared first in the cashier's list.
 */
export function derivePaymentMethod(lines: readonly PaymentLine[]): string {
  const first = lines[0];
  if (!first) return 'CASH';

  const totals = new Map<string, number>();
  for (const line of lines) totals.set(line.method, (totals.get(line.method) ?? 0) + line.amount);

  let dominant = first.method;
  let dominantTotal = totals.get(dominant) ?? 0;
  for (const line of lines) {
    const total = totals.get(line.method) ?? 0;
    if (total > dominantTotal) {
      dominant = line.method;
      dominantTotal = total;
    }
  }
  return dominant;
}

function stableFingerprint(orderId: number, payload: CheckoutPayload): string {
  // Object insertion order is intentionally fixed. Do not replace this with a
  // generic stringify of a reactive object: exact retries need byte-for-byte
  // stable business-action identity.
  return JSON.stringify({
    order_id: orderId,
    payments: payload.payments.map(({ method, amount }) => ({ method, amount })),
    discount_percent: payload.discount_percent,
    payment_method: payload.payment_method,
  });
}

/** Build and validate the only payment body the cashier is allowed to post. */
export function buildCheckoutPayload(input: {
  orderId: number | null;
  effectiveTotal: number;
  discountPercent: number;
  payments: readonly PaymentLine[];
}): CheckoutValidation {
  const { orderId, effectiveTotal, discountPercent } = input;
  if (typeof orderId !== 'number' || !Number.isInteger(orderId) || orderId <= 0) {
    return { ok: false, code: 'INVALID_ORDER' };
  }

  const discount = normalizedDiscount(discountPercent);
  if (discount == null) return { ok: false, code: 'INVALID_DISCOUNT' };
  if (!Number.isFinite(effectiveTotal) || !Number.isInteger(effectiveTotal) || effectiveTotal < 0) {
    return { ok: false, code: 'INVALID_TOTAL' };
  }

  const payments = normalizePaymentLines(input.payments);
  if (payments == null) return { ok: false, code: 'INVALID_PAYMENT' };

  if (effectiveTotal === 0) {
    if (payments.length) return { ok: false, code: 'ZERO_TOTAL_WITH_PAYMENT' };
    const payload: CheckoutPayload = {
      payments: [],
      discount_percent: discount,
      payment_method: 'CASH',
    };
    return { ok: true, payload, fingerprint: stableFingerprint(orderId, payload) };
  }

  if (!payments.length) return { ok: false, code: 'EMPTY_PAYMENTS' };

  const totalTendered = payments.reduce((sum, payment) => sum + payment.amount, 0);
  if (totalTendered < effectiveTotal) return { ok: false, code: 'PAYMENT_SHORT' };

  const nonCashTendered = payments
    .filter((payment) => payment.method !== 'CASH')
    .reduce((sum, payment) => sum + payment.amount, 0);
  if (nonCashTendered > effectiveTotal) return { ok: false, code: 'NONCASH_OVERPAYMENT' };

  const payload: CheckoutPayload = {
    payments,
    discount_percent: discount,
    payment_method: derivePaymentMethod(payments),
  };
  return { ok: true, payload, fingerprint: stableFingerprint(orderId, payload) };
}

export function pendingPaymentStorageKey(orderId: number): string {
  return `pos:pending-payment:${orderId}`;
}

function secureToken(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID();

  if (typeof cryptoApi?.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    cryptoApi.getRandomValues(bytes);
    return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  }

  throw new Error('Secure randomness is unavailable; payment was not sent.');
}

export function createPaymentIdempotencyKey(orderId: number): string {
  const key = `smart-pos-pay:${orderId}:${secureToken()}`;
  // The server rejects headers over 128 bytes. This protects us if an unusual
  // platform ever changes the UUID representation.
  if (key.length > 128) throw new Error('Payment idempotency key is too long.');
  return key;
}

export async function getOrCreatePendingPaymentAttempt(
  orderId: number,
  fingerprint: string,
  store: DurablePaymentStore,
  createKey: (orderId: number) => string = createPaymentIdempotencyKey,
): Promise<PendingPaymentAttempt> {
  const storageKey = pendingPaymentStorageKey(orderId);
  const existing = await store.read<PendingPaymentAttempt>(storageKey);
  if (existing && typeof existing.key === 'string' && existing.key) {
    if (existing.fingerprint === fingerprint) return existing;
    // A network/409/5xx result can arrive after the backend has committed. A
    // cashier may change tenders only after a definite rejection, which clears
    // this record before this function is reached again.
    throw new PendingPaymentConflictError();
  }

  const attempt: PendingPaymentAttempt = { fingerprint, key: createKey(orderId) };
  // Awaiting this write closes the crash window between selecting the key and
  // sending the POST. A subsequent launch can make the same request safely.
  await store.write(storageKey, attempt);
  return attempt;
}

export async function clearPendingPaymentAttempt(
  orderId: number,
  store: DurablePaymentStore,
): Promise<void> {
  await store.remove(pendingPaymentStorageKey(orderId));
}

/** Retain the key only when the server may have accepted the original POST. */
export function shouldRetainPendingPaymentAttempt(status: number | undefined): boolean {
  return status == null || status === 409 || status >= 500;
}

export function checkoutValidationMessage(code: CheckoutValidationCode): string {
  switch (code) {
    case 'EMPTY_PAYMENTS':
      return "To'lov turini va summani kiriting.";
    case 'PAYMENT_SHORT':
      return "To'lov summasi chekdan kam.";
    case 'NONCASH_OVERPAYMENT':
      return "Qaytim faqat naqd pul bilan berilishi mumkin.";
    case 'ZERO_TOTAL_WITH_PAYMENT':
      return "0 so'mlik buyurtmaga to'lov qatori qo'shilmaydi.";
    case 'INVALID_PAYMENT':
      return "Har bir to'lov summasi musbat butun so'm bo'lishi kerak.";
    default:
      return "To'lov ma'lumotlarini tekshiring.";
  }
}
