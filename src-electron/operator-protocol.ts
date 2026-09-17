import type { RawData } from 'ws';
import type {
  OperatorCallRecord,
  OperatorLiveCall,
  OperatorLiveCallState,
  OperatorRole,
} from '../src/types/operator';
import { parseOperatorCallRecord } from './operator-call-archive';

/** A phone lists at most this many calls (current + recent ended) per snapshot. */
export const MAX_LIVE_CALLS = 10;
const MAX_PHONE_LENGTH = 40;
const MAX_ID_LENGTH = 160;
const MAX_NAME_LENGTH = 240;
const MAX_APP_LENGTH = 120;
// Digits with the usual dialling punctuation; empty means a hidden number.
const PHONE_PATTERN = /^[0-9+*#().\-\s]*$/;
const CALL_STATES: readonly OperatorLiveCallState[] = ['ringing', 'active', 'waiting', 'ended'];

export type OperatorPhoneMessage =
  | { type: 'call_record'; record: OperatorCallRecord }
  | { type: 'call_start'; phone: string; direction: 'in' | 'out' }
  | { type: 'call_end'; phone: string; record: OperatorCallRecord | null }
  | { type: 'operator_hello'; protocol: number; role: OperatorRole; app: string }
  | { type: 'call_state'; calls: OperatorLiveCall[] };

export interface OperatorOrderCreated {
  type: 'order_created';
  phone: string;
  orderId: number;
  at: number;
}

function text(raw: RawData): string {
  return Array.isArray(raw)
    ? Buffer.concat(raw).toString('utf8')
    : Buffer.isBuffer(raw)
      ? raw.toString('utf8')
      : Buffer.from(raw).toString('utf8');
}

function isPhone(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_PHONE_LENGTH && PHONE_PATTERN.test(value);
}

function parseLiveCall(value: unknown): OperatorLiveCall | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const call = value as Record<string, unknown>;
  if (
    typeof call.id !== 'string' ||
    !call.id ||
    call.id.length > MAX_ID_LENGTH ||
    !isPhone(call.phone) ||
    (call.direction !== 'in' && call.direction !== 'out') ||
    !CALL_STATES.includes(call.state as OperatorLiveCallState) ||
    typeof call.since !== 'number' ||
    !Number.isFinite(call.since) ||
    call.since <= 0 ||
    (call.customerName !== undefined &&
      call.customerName !== null &&
      (typeof call.customerName !== 'string' || call.customerName.length > MAX_NAME_LENGTH))
  )
    return null;
  const name = typeof call.customerName === 'string' ? call.customerName.trim() : '';
  return {
    id: call.id,
    phone: call.phone.trim(),
    direction: call.direction,
    state: call.state as OperatorLiveCallState,
    since: call.since,
    ...(name ? { customerName: name } : {}),
  };
}

/**
 * Validates one phone → POS frame. Unknown fields are dropped; a single invalid
 * entry rejects the whole frame so malformed data never reaches the renderer.
 */
export function parseOperatorMessage(raw: RawData): OperatorPhoneMessage | null {
  try {
    const event: unknown = JSON.parse(text(raw));
    if (!event || typeof event !== 'object' || Array.isArray(event)) return null;
    const value = event as Record<string, unknown>;
    if (value.type === 'call_record') {
      const record = parseOperatorCallRecord(value.record);
      return record ? { type: 'call_record', record } : null;
    }
    if (value.type === 'operator_hello') {
      if (
        !Number.isSafeInteger(value.protocol) ||
        Number(value.protocol) < 3 ||
        Number(value.protocol) > 1000 ||
        (value.role !== 'operator' && value.role !== 'cashier') ||
        (value.app !== undefined &&
          (typeof value.app !== 'string' || value.app.length > MAX_APP_LENGTH))
      )
        return null;
      return {
        type: 'operator_hello',
        protocol: Number(value.protocol),
        role: value.role,
        app: typeof value.app === 'string' ? value.app : '',
      };
    }
    if (value.type === 'call_state') {
      if (!Array.isArray(value.calls) || value.calls.length > MAX_LIVE_CALLS) return null;
      const calls: OperatorLiveCall[] = [];
      for (const entry of value.calls as unknown[]) {
        const call = parseLiveCall(entry);
        if (!call) return null;
        calls.push(call);
      }
      return { type: 'call_state', calls };
    }
    if (typeof value.phone !== 'string' || !value.phone.trim() || value.phone.length > 80) {
      return null;
    }
    if (value.type === 'call_start' && (value.direction === 'in' || value.direction === 'out')) {
      return { type: value.type, phone: value.phone, direction: value.direction };
    }
    if (value.type === 'call_end')
      return {
        type: value.type,
        phone: value.phone,
        record: parseOperatorCallRecord(value.record),
      };
  } catch {
    // Malformed frames never reach the renderer.
  }
  return null;
}

/** Renderer → main `operator:order-created` arguments, validated before broadcast. */
export function parseOrderCreated(
  phone: unknown,
  orderId: unknown,
  at = Date.now(),
): OperatorOrderCreated | null {
  if (
    typeof phone !== 'string' ||
    !phone.trim() ||
    !isPhone(phone) ||
    !/\d/.test(phone) ||
    !Number.isSafeInteger(orderId) ||
    Number(orderId) <= 0
  )
    return null;
  return { type: 'order_created', phone: phone.trim(), orderId: Number(orderId), at };
}
