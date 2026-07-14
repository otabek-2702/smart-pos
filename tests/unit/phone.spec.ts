import { describe, expect, it } from 'vitest';
import { formatUzPhone, getUzNationalDigits, normalizeUzPhone } from 'src/utils/phone';

describe('Uzbek phone normalization', () => {
  it.each([
    ['90 123 45 67', '998901234567'],
    ['0901234567', '998901234567'],
    ['+998 (90) 123-45-67', '998901234567'],
    ['998901234567', '998901234567'],
  ])('normalizes %s to one API value', (raw, expected) => {
    expect(normalizeUzPhone(raw)).toBe(expected);
  });

  it.each(['', '90123', '+1 202 555 0100', '9989012345678'])(
    'rejects incomplete or non-UZ input: %s',
    (raw) => {
      expect(normalizeUzPhone(raw)).toBe('');
      expect(getUzNationalDigits(raw)).toBe('');
    },
  );

  it('formats only a valid complete number', () => {
    expect(formatUzPhone('998901234567')).toBe('+998 90 123 45 67');
    expect(formatUzPhone('90123')).toBe('');
  });
});
