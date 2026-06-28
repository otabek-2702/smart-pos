// Reads the cached auth_user from kv-store and answers permission checks.
//
// The local edition's backend does NOT reliably ship a per-user
// `permissions: string[]` array, so access is decided by ROLE on the client:
//   ADMIN    — full access. (Admins can't actually log into the POS; they use
//              the backend panel. Kept for completeness/safety.)
//   MANAGER  — full in-app access EXCEPT the superuser-only `'*'` gate (e.g. the
//              Roles editor, which stays admin-only).
//   CASHIER  — day-to-day till work + can write cashbox expenses, but CANNOT
//              open Settings. Limited to CASHIER_ALLOWED below.
//   CHEF     — KDS only (enforced by the router guard, not here).
// If the backend DOES send a permissions[] (or '*'), it still grants extra.
//
// Used by the router guard and any UI that hides actions the user can't do.

import { read } from 'src/utils/storage';

// What a CASHIER may reach beyond the always-open till pages (orders, create
// order, KDS, payment, client display — those carry no permission meta). They
// can record drawer expenses but not touch any Settings screen.
const CASHIER_ALLOWED: ReadonlySet<string> = new Set(['expenses.manage', 'expenses.view']);

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
  // Cashier: only the explicit allowlist (+ anything the backend granted).
  if (user.role === 'CASHIER') return CASHIER_ALLOWED.has(key) || perms.includes(key);
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
  // Cashier: every required key must be in the allowlist (or backend-granted).
  if (user.role === 'CASHIER') {
    return keys.every((k) => CASHIER_ALLOWED.has(k) || perms.includes(k));
  }
  return keys.every((k) => perms.includes(k));
}
