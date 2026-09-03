import { describe, expect, it } from 'vitest';
import { resolvePrintAfter } from '../../src/composables/usePrintPolicy';

describe('receipt auto-print policy', () => {
  it('prints after payment only when after is enabled and before is disabled', () => {
    expect(resolvePrintAfter(false, true)).toBe(true);
    expect(resolvePrintAfter(false, false)).toBe(false);
  });

  it('gives before-payment printing precedence over a legacy after flag', () => {
    expect(resolvePrintAfter(true, true)).toBe(false);
    expect(resolvePrintAfter(true, false)).toBe(false);
  });
});
