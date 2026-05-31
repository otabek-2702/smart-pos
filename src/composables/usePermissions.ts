// Reads the cached auth_user from kv-store and answers permission checks.
// Backend now ships `permissions: string[]` on the user (per backend BE-4);
// `'*'` means "all", and role === 'ADMIN' also grants everything.
//
// Used by the router guard and any UI that needs to hide actions the
// current user can't perform (e.g. the settings sidebar filtering).

import { read } from 'src/utils/storage';

export type UserRole = 'ADMIN' | 'CASHIER' | 'MANAGER';

export interface AuthUser {
  id?: number;
  email?: string;
  first_name?: string;
  last_name?: string;
  role: UserRole;
  status?: 'ACTIVE' | 'INACTIVE';
  permissions?: string[];
}

export function getAuthUser(): AuthUser | null {
  return read<AuthUser>('auth_user');
}

export function hasPermission(key: string): boolean {
  const user = getAuthUser();
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  const perms = user.permissions ?? [];
  return perms.includes('*') || perms.includes(key);
}

export function hasAllPermissions(keys: ReadonlyArray<string>): boolean {
  if (keys.length === 0) return true;
  const user = getAuthUser();
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  const perms = user.permissions ?? [];
  if (perms.includes('*')) return true;
  return keys.every((k) => perms.includes(k));
}
