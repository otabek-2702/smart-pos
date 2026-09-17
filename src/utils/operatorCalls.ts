import type { OperatorLiveCall, OperatorLiveCallState, OperatorRole } from 'src/types/operator';
import { getUzNationalDigits } from 'src/utils/phone';

/** Ended calls stay available for quick fill this long (matches the phone). */
export const RECENT_CALL_TTL_MS = 10 * 60_000;
export const RECENT_CALL_LIMIT = 5;

export interface RecentCall {
  key: string;
  phone: string;
  direction: 'in' | 'out';
  name?: string;
  endedAt: number;
}

export interface QuickFillCall {
  key: string;
  /** Nine national digits, exactly what the order keypad produces. */
  digits: string;
  phone: string;
  direction: 'in' | 'out';
  state: OperatorLiveCallState;
  name?: string;
}

export type CallAlert = 'modal' | 'banner' | null;

const STATE_ORDER: Record<OperatorLiveCallState, number> = {
  active: 0,
  ringing: 1,
  waiting: 2,
  ended: 3,
};

/** Cache/dedupe key: Uzbek national digits, otherwise every digit. */
export function phoneKey(phone: string): string {
  return getUzNationalDigits(phone) || String(phone ?? '').replace(/\D/g, '');
}

export function isOperatorRole(value: unknown): value is OperatorRole {
  return value === 'operator' || value === 'cashier';
}

/** No phone (or any operator phone) means operator; cashier only when every phone says so. */
export function effectiveRole(roles: OperatorRole[]): OperatorRole {
  return roles.length > 0 && roles.every((role) => role === 'cashier') ? 'cashier' : 'operator';
}

/** Current calls, active first, then ringing, then waiting; newest first within a state. */
export function sortCurrentCalls(calls: OperatorLiveCall[]): OperatorLiveCall[] {
  return calls
    .filter((call) => call.state !== 'ended')
    .sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || b.since - a.since);
}

export function pruneRecentCalls(list: RecentCall[], now: number): RecentCall[] {
  const fresh = list.filter(
    (call) => now - call.endedAt <= RECENT_CALL_TTL_MS && call.endedAt <= now + RECENT_CALL_TTL_MS,
  );
  return fresh.length === list.length && list.length <= RECENT_CALL_LIMIT
    ? list
    : fresh.slice(0, RECENT_CALL_LIMIT);
}

/** Newest first, one entry per number, at most 5 entries of the last 10 minutes. */
export function rememberRecentCall(
  list: RecentCall[],
  entry: RecentCall,
  now: number,
): RecentCall[] {
  if (!entry.key) return pruneRecentCalls(list, now);
  const next: RecentCall = {
    key: entry.key,
    phone: entry.phone,
    direction: entry.direction,
    endedAt: entry.endedAt,
  };
  const name = entry.name || list.find((call) => call.key === entry.key)?.name;
  if (name) next.name = name;
  return pruneRecentCalls([next, ...list.filter((call) => call.key !== entry.key)], now);
}

/** Quick-fill chips: current calls first, then recent ones; Uzbek numbers only. */
export function buildQuickFill(
  current: OperatorLiveCall[],
  recent: RecentCall[],
  names: Record<string, string>,
): QuickFillCall[] {
  const result: QuickFillCall[] = [];
  const seen = new Set<string>();
  const add = (
    phone: string,
    direction: 'in' | 'out',
    state: OperatorLiveCallState,
    name: string | undefined,
  ): void => {
    const digits = getUzNationalDigits(phone);
    if (!digits || seen.has(digits)) return;
    seen.add(digits);
    const known = name || names[digits];
    result.push({
      key: `${state}:${digits}`,
      digits,
      phone,
      direction,
      state,
      ...(known ? { name: known } : {}),
    });
  };
  for (const call of sortCurrentCalls(current)) {
    add(call.phone, call.direction, call.state, call.customerName);
  }
  for (const call of recent) add(call.phone, call.direction, 'ended', call.name);
  return result;
}

/**
 * What a newly seen call should show. Cashier POS: nothing. Operator POS: a
 * waiting call only gets the banner; a new ringing incoming (or started
 * outgoing) call gets the modal unless an order is being entered.
 */
export function callAlert(
  call: OperatorLiveCall,
  role: OperatorRole,
  orderEntry: boolean,
): CallAlert {
  if (role !== 'operator' || !call.phone) return null;
  if (call.state === 'waiting') return 'banner';
  const started =
    call.direction === 'in'
      ? call.state === 'ringing'
      : call.state === 'ringing' || call.state === 'active';
  if (!started) return null;
  return orderEntry ? 'banner' : 'modal';
}
