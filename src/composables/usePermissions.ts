// Reads the cached auth_user from kv-store and answers permission checks.
// Backend ships `permissions: string[]` on the user; `'*'` means "all".
//
// Role tiers (matches backend role gating):
//   ADMIN    — full access. (Note: admins can't actually log into the POS;
//              they use the backend panel. Kept for completeness/safety.)
//   MANAGER  — the in-app settings tier. Has every granular permission
//              EXCEPT the superuser-only `'*'` gate (e.g. the Roles editor,
//              which stays admin-only). Mirrors backend role_required('MANAGER').
//   others   — only what's in their explicit `permissions` array.
//
// Used by the router guard and any UI that hides actions the user can't do.

import { read } from 'src/utils/storage';

// CHEF = kitchen staff (KDS only). WAITER exists on the backend (mobile app)
// though it isn't in the desktop login picker — keep it for type-safety.
export type UserRole = 'ADMIN' | 'CASHIER' | 'MANAGER' | 'CHEF' | 'WAITER';

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
  if (perms.includes('*')) return true;
  // Manager: everything except the superuser-only `'*'` gate.
  if (user.role === 'MANAGER') return key !== '*';
  if (user.role === 'CASHIER') return key !== '*';
  return perms.includes(key);
  
}

export function hasAllPermissions(keys: ReadonlyArray<string>): boolean {
  if (keys.length === 0) return true;
  const user = getAuthUser();
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  const perms = user.permissions ?? [];
  if (perms.includes('*')) return true;
  // Manager passes everything except a superuser-only (`'*'`) requirement.
  if (user.role === 'MANAGER') return keys.every((k) => k !== '*');
  return keys.every((k) => perms.includes(k));
}
