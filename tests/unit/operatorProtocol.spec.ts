import { describe, expect, it } from 'vitest';
import {
  MAX_LIVE_CALLS,
  parseOperatorMessage,
  parseOrderCreated,
} from '../../src-electron/operator-protocol';

const frame = (value: unknown) => Buffer.from(JSON.stringify(value));
const call = (overrides: Record<string, unknown> = {}) => ({
  id: 'call-1',
  phone: '+998901234567',
  direction: 'in',
  state: 'ringing',
  since: 1_758_000_000_000,
  ...overrides,
});

describe('operator protocol 3 parsing', () => {
  it('accepts operator_hello with a known role and keeps only the known fields', () => {
    expect(
      parseOperatorMessage(
        frame({ type: 'operator_hello', protocol: 3, role: 'cashier', app: '2.2.0', extra: 1 }),
      ),
    ).toEqual({ type: 'operator_hello', protocol: 3, role: 'cashier', app: '2.2.0' });
    expect(
      parseOperatorMessage(frame({ type: 'operator_hello', protocol: 4, role: 'operator' })),
    ).toEqual({ type: 'operator_hello', protocol: 4, role: 'operator', app: '' });
  });

  it.each([
    { protocol: 2, role: 'operator' },
    { protocol: '3', role: 'operator' },
    { protocol: 3.5, role: 'operator' },
    { protocol: 3, role: 'manager' },
    { protocol: 3 },
    { protocol: 3, role: 'operator', app: 42 },
    { protocol: 3, role: 'operator', app: 'x'.repeat(121) },
  ])('rejects an invalid hello %#', (hello) => {
    expect(parseOperatorMessage(frame({ type: 'operator_hello', ...hello }))).toBeNull();
  });

  it('accepts a call_state snapshot, trimming names and dropping unknown fields', () => {
    const parsed = parseOperatorMessage(
      frame({
        type: 'call_state',
        calls: [
          call({ customerName: '  Aziza ', secret: 'x' }),
          call({ id: 'call-2', phone: '', state: 'waiting', customerName: null }),
          call({ id: 'call-3', direction: 'out', state: 'ended', customerName: '' }),
        ],
      }),
    );
    expect(parsed).toEqual({
      type: 'call_state',
      calls: [
        { ...call(), customerName: 'Aziza' },
        { ...call({ id: 'call-2', phone: '', state: 'waiting' }) },
        { ...call({ id: 'call-3', direction: 'out', state: 'ended' }) },
      ],
    });
    expect(parseOperatorMessage(frame({ type: 'call_state', calls: [] }))).toEqual({
      type: 'call_state',
      calls: [],
    });
  });

  it.each([
    ['too many calls', Array.from({ length: MAX_LIVE_CALLS + 1 }, (_, i) => call({ id: `c${i}` }))],
    ['not a list', { 0: call() }],
    ['missing id', [call({ id: '' })]],
    ['long id', [call({ id: 'x'.repeat(161) })]],
    ['script in phone', [call({ phone: '<script>' })]],
    ['long phone', [call({ phone: '9'.repeat(41) })]],
    ['numeric phone', [call({ phone: 998901234567 })]],
    ['bad direction', [call({ direction: 'both' })]],
    ['bad state', [call({ state: 'held' })]],
    ['string since', [call({ since: '1758000000000' })]],
    ['zero since', [call({ since: 0 })]],
    ['object name', [call({ customerName: {} })]],
    ['long name', [call({ customerName: 'x'.repeat(241) })]],
    ['one bad entry among good ones', [call(), call({ id: 'c2', state: 'unknown' })]],
  ])('rejects a call_state with %s', (_label, calls) => {
    expect(parseOperatorMessage(frame({ type: 'call_state', calls }))).toBeNull();
  });

  it('keeps parsing the protocol 2 frames unchanged', () => {
    expect(
      parseOperatorMessage(frame({ type: 'call_start', phone: '+998901234567', direction: 'out' })),
    ).toEqual({ type: 'call_start', phone: '+998901234567', direction: 'out' });
    expect(parseOperatorMessage(frame({ type: 'call_end', phone: '+998901234567' }))).toEqual({
      type: 'call_end',
      phone: '+998901234567',
      record: null,
    });
    expect(parseOperatorMessage(Buffer.from('not json'))).toBeNull();
    expect(parseOperatorMessage(frame([1, 2]))).toBeNull();
    expect(
      parseOperatorMessage(frame({ type: 'call_start', phone: ' ', direction: 'in' })),
    ).toBeNull();
  });

  it('validates order_created before it is broadcast', () => {
    expect(parseOrderCreated('998901234567', 42, 1000)).toEqual({
      type: 'order_created',
      phone: '998901234567',
      orderId: 42,
      at: 1000,
    });
    for (const [phone, orderId] of [
      ['', 1],
      ['   ', 1],
      ['+', 1],
      ['<b>', 1],
      [998901234567, 1],
      ['998901234567', 0],
      ['998901234567', 1.5],
      ['998901234567', '42'],
    ] as const) {
      expect(parseOrderCreated(phone, orderId)).toBeNull();
    }
  });
});
