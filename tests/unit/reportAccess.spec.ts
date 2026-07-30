import { describe, expect, it } from 'vitest';
import { assertReportManagerPayload } from '../../src-electron/reporting/report-access';

describe('authoritative report settings access', () => {
  it.each(['MANAGER', 'ADMIN'])('accepts an active %s session', (role) => {
    expect(() =>
      assertReportManagerPayload({
        success: true,
        data: { role, status: 'ACTIVE', permissions: [] },
      }),
    ).not.toThrow();
  });

  it('accepts an explicitly granted Telegram permission', () => {
    expect(() =>
      assertReportManagerPayload({
        data: {
          role: 'CASHIER',
          status: 'ACTIVE',
          permissions: ['telegram.manage'],
        },
      }),
    ).not.toThrow();
  });

  it.each([
    null,
    {},
    { data: { role: 'CASHIER', status: 'ACTIVE', permissions: [] } },
    { data: { role: 'MANAGER', status: 'INACTIVE', permissions: ['*'] } },
  ])('rejects an untrusted or unauthorized response %#', (payload) => {
    expect(() => assertReportManagerPayload(payload)).toThrow();
  });
});
