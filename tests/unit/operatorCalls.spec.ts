import { describe, expect, it } from 'vitest';
import {
  RECENT_CALL_LIMIT,
  RECENT_CALL_TTL_MS,
  buildQuickFill,
  callAlert,
  effectiveRole,
  phoneKey,
  pruneRecentCalls,
  rememberRecentCall,
  sortCurrentCalls,
  type RecentCall,
} from 'src/utils/operatorCalls';
import type { OperatorLiveCall } from 'src/types/operator';

const live = (overrides: Partial<OperatorLiveCall>): OperatorLiveCall => ({
  id: 'c',
  phone: '+998901234567',
  direction: 'in',
  state: 'ringing',
  since: 1000,
  ...overrides,
});
const recent = (phone: string, endedAt: number, name?: string): RecentCall => ({
  key: phoneKey(phone),
  phone,
  direction: 'in',
  endedAt,
  ...(name ? { name } : {}),
});

describe('operator call rules', () => {
  it('uses the Uzbek national number as the key and falls back to all digits', () => {
    expect(phoneKey('+998 90 123-45-67')).toBe('901234567');
    expect(phoneKey('0901234567')).toBe('901234567');
    expect(phoneKey('+7 (495) 123-45-67')).toBe('74951234567');
    expect(phoneKey('')).toBe('');
  });

  it('is cashier only when every connected phone says so', () => {
    expect(effectiveRole([])).toBe('operator');
    expect(effectiveRole(['cashier'])).toBe('cashier');
    expect(effectiveRole(['cashier', 'operator'])).toBe('operator');
  });

  it('decides modal, banner or nothing for a newly seen call', () => {
    const ringing = live({ state: 'ringing' });
    expect(callAlert(ringing, 'operator', false)).toBe('modal');
    expect(callAlert(ringing, 'operator', true)).toBe('banner');
    expect(callAlert(ringing, 'cashier', false)).toBeNull();
    expect(callAlert(live({ state: 'waiting' }), 'operator', false)).toBe('banner');
    expect(callAlert(live({ state: 'waiting' }), 'cashier', true)).toBeNull();
    // Connected mid-call or already over: nothing pops up.
    expect(callAlert(live({ state: 'active' }), 'operator', false)).toBeNull();
    expect(callAlert(live({ state: 'ended' }), 'operator', false)).toBeNull();
    // A started outgoing call opens the modal as before.
    expect(callAlert(live({ direction: 'out', state: 'active' }), 'operator', false)).toBe('modal');
    expect(callAlert(live({ direction: 'out', state: 'ringing' }), 'operator', true)).toBe(
      'banner',
    );
    expect(callAlert(live({ phone: '' }), 'operator', false)).toBeNull();
  });

  it('orders current calls active, ringing, waiting and hides ended ones', () => {
    const sorted = sortCurrentCalls([
      live({ id: 'w', state: 'waiting', since: 5 }),
      live({ id: 'r1', state: 'ringing', since: 1 }),
      live({ id: 'e', state: 'ended', since: 9 }),
      live({ id: 'a', state: 'active', since: 2 }),
      live({ id: 'r2', state: 'ringing', since: 3 }),
    ]);
    expect(sorted.map((call) => call.id)).toEqual(['a', 'r2', 'r1', 'w']);
  });

  it('keeps at most five distinct recent numbers from the last ten minutes', () => {
    const now = 100 * RECENT_CALL_TTL_MS;
    let list: RecentCall[] = [];
    for (let i = 0; i < 7; i += 1) {
      list = rememberRecentCall(list, recent(`+99890123450${i}`, now - i, `N${i}`), now);
    }
    expect(list).toHaveLength(RECENT_CALL_LIMIT);
    expect(list[0]!.phone).toBe('+998901234506');
    // Same number again moves to the top once and keeps its known name.
    list = rememberRecentCall(list, recent('998901234504', now), now);
    expect(list.filter((call) => call.key === '901234504')).toHaveLength(1);
    expect(list[0]).toMatchObject({ phone: '998901234504', name: 'N4' });
    expect(pruneRecentCalls(list, now + RECENT_CALL_TTL_MS + 10)).toEqual([]);
    expect(pruneRecentCalls([recent('901234567', now - RECENT_CALL_TTL_MS - 1)], now)).toEqual([]);
  });

  it('builds quick-fill chips: current first, then recent, one per number, names attached', () => {
    const chips = buildQuickFill(
      [
        live({ id: 'w', phone: '+998931112233', state: 'waiting', since: 9 }),
        live({ id: 'a', phone: '+998901234567', state: 'active', customerName: 'Aziza' }),
        live({ id: 'x', phone: '+74951234567', state: 'ringing' }),
      ],
      [recent('+998901234567', 1), recent('998995556677', 2)],
      { '995556677': 'Bobur', '931112233': 'Dilnoza' },
    );
    expect(chips).toEqual([
      {
        key: 'active:901234567',
        digits: '901234567',
        phone: '+998901234567',
        direction: 'in',
        state: 'active',
        name: 'Aziza',
      },
      {
        key: 'waiting:931112233',
        digits: '931112233',
        phone: '+998931112233',
        direction: 'in',
        state: 'waiting',
        name: 'Dilnoza',
      },
      {
        key: 'ended:995556677',
        digits: '995556677',
        phone: '998995556677',
        direction: 'in',
        state: 'ended',
        name: 'Bobur',
      },
    ]);
  });
});
