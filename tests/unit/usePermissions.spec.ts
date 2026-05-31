import { vi, describe, it, expect, beforeEach } from 'vitest';

// usePermissions reads the cached auth_user via src/utils/storage.read.
// Mocking that module gives clean control over the "logged-in user" per test.
vi.mock('src/utils/storage', () => ({
  read: vi.fn(),
}));

import { read } from 'src/utils/storage';
import {
  hasPermission,
  hasAllPermissions,
  getAuthUser,
} from 'src/composables/usePermissions';

const mockRead = vi.mocked(read);

describe('usePermissions', () => {
  beforeEach(() => {
    mockRead.mockReset();
  });

  describe('getAuthUser', () => {
    it('returns null when no user is cached', () => {
      mockRead.mockReturnValue(null);
      expect(getAuthUser()).toBeNull();
    });

    it('returns the cached user', () => {
      const user = { role: 'CASHIER', permissions: ['orders.view'] };
      mockRead.mockReturnValue(user);
      expect(getAuthUser()).toEqual(user);
    });
  });

  describe('hasPermission', () => {
    it('returns false when no user is cached', () => {
      mockRead.mockReturnValue(null);
      expect(hasPermission('users.manage')).toBe(false);
    });

    it('returns true for any key when role is ADMIN', () => {
      mockRead.mockReturnValue({ role: 'ADMIN' });
      expect(hasPermission('users.manage')).toBe(true);
      expect(hasPermission('orders.cancel')).toBe(true);
      expect(hasPermission('whatever.future.key')).toBe(true);
    });

    it("returns true for any key when permissions includes '*'", () => {
      mockRead.mockReturnValue({ role: 'CASHIER', permissions: ['*'] });
      expect(hasPermission('users.manage')).toBe(true);
      expect(hasPermission('orders.cancel')).toBe(true);
    });

    it('returns true only for keys the user explicitly has', () => {
      mockRead.mockReturnValue({
        role: 'CASHIER',
        permissions: ['orders.view', 'kds.view'],
      });
      expect(hasPermission('orders.view')).toBe(true);
      expect(hasPermission('kds.view')).toBe(true);
      expect(hasPermission('users.manage')).toBe(false);
    });

    it('treats a missing permissions array as empty', () => {
      mockRead.mockReturnValue({ role: 'CASHIER' });
      expect(hasPermission('orders.view')).toBe(false);
    });
  });

  describe('hasAllPermissions', () => {
    it('returns true for an empty requirements list', () => {
      mockRead.mockReturnValue(null);
      expect(hasAllPermissions([])).toBe(true);
    });

    it('returns false when no user is cached and keys are required', () => {
      mockRead.mockReturnValue(null);
      expect(hasAllPermissions(['a'])).toBe(false);
    });

    it('returns true for ADMIN regardless of keys', () => {
      mockRead.mockReturnValue({ role: 'ADMIN' });
      expect(hasAllPermissions(['a', 'b', 'c'])).toBe(true);
    });

    it("returns true when permissions includes '*'", () => {
      mockRead.mockReturnValue({ role: 'MANAGER', permissions: ['*'] });
      expect(hasAllPermissions(['x.y', 'p.q'])).toBe(true);
    });

    it('requires every key to be present (AND semantics)', () => {
      mockRead.mockReturnValue({
        role: 'CASHIER',
        permissions: ['orders.view', 'kds.view'],
      });
      expect(hasAllPermissions(['orders.view'])).toBe(true);
      expect(hasAllPermissions(['orders.view', 'kds.view'])).toBe(true);
      expect(hasAllPermissions(['orders.view', 'users.manage'])).toBe(false);
    });
  });
});
