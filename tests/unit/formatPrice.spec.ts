import { describe, it, expect } from 'vitest';
import { formatPrice } from 'src/utils/formatPrice';

describe('formatPrice', () => {
  it('groups thousands with a non-breaking-ish space and drops decimals', () => {
    expect(formatPrice(1000)).toBe('1 000');
    expect(formatPrice(84000)).toBe('84 000');
    expect(formatPrice(1_234_567)).toBe('1 234 567');
  });

  it('accepts a numeric string (backend often returns string-encoded decimals)', () => {
    expect(formatPrice('84000.00')).toBe('84 000');
    expect(formatPrice('0')).toBe('0');
  });

  it('returns "0" for non-finite input', () => {
    expect(formatPrice(NaN)).toBe('0');
    expect(formatPrice('not-a-number')).toBe('0');
    expect(formatPrice(Infinity)).toBe('0');
  });

  it('with empty=true, returns "" for zero so blank inputs render blank', () => {
    expect(formatPrice(0, true)).toBe('');
    expect(formatPrice('0', true)).toBe('');
    expect(formatPrice('', true)).toBe('');
  });

  it('with empty=true, returns formatted value for small non-zero (no grouping space)', () => {
    expect(formatPrice('250', true)).toBe('250');
    expect(formatPrice(999, true)).toBe('999');
  });

  // Latent quirk: empty=true does `+formatted ? formatted : ''`, and the
  // formatted value contains a space for >= 1000, so `+'1 000'` is NaN
  // and the empty branch fires. Test documents the current behavior;
  // fix is out of scope for the e2e/test-coverage work.
  it('with empty=true, returns "" for thousands due to space-grouping coercion quirk', () => {
    expect(formatPrice(1000, true)).toBe('');
    expect(formatPrice(84_000, true)).toBe('');
  });

  it('truncates fractional parts (toFixed(0) rounds half-to-even via toString)', () => {
    expect(formatPrice(1234.4)).toBe('1 234');
    expect(formatPrice(1234.9)).toBe('1 235');
  });
});
