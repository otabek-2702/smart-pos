// Manual shifts (backend stopped auto-starting on login). The till opens the
// cashier's shift on login (resuming if one's already open) and closes it
// explicitly from the logout dialog. Staff-scoped endpoints:
//   GET  /shifts/current  -> my open shift, or null
//   POST /shifts/start    -> open my shift (resume if already open)
//   POST /shifts/end      -> close my active shift
//
// All calls swallow errors / non-200s (validateStatus) so a missing-or-busy
// shift backend never blocks login or logout.

import { api } from 'boot/axios';

/** Open the current user's shift if none is open yet. Fire-and-forget. */
export async function ensureShiftStarted(): Promise<void> {
  try {
    const cur = await api.get('/shifts/current', { validateStatus: () => true });
    const shift = cur.status === 200 ? (cur.data?.data ?? null) : null;
    const isOpen = !!(shift && (shift.id ?? shift.shift?.id));
    if (!isOpen) {
      await api.post('/shifts/start', {}, { validateStatus: () => true });
    }
  } catch (e) {
    console.warn('[shift] ensureShiftStarted failed:', e);
  }
}

/** Close the current user's active shift (no count). Returns true on success. */
export async function endShift(): Promise<boolean> {
  try {
    const r = await api.post('/shifts/end', {}, { validateStatus: () => true });
    return r.status === 200;
  } catch (e) {
    console.warn('[shift] endShift failed:', e);
    return false;
  }
}

export interface ShiftCurrent {
  id?: number;
  start_time?: string;
  total_orders?: number;
  total_revenue?: string;
  cash_collected?: string;
  // Per-method expected totals — present once the backend ships them (BACKEND_TODO #3).
  expected_by_method?: Record<string, string>;
}

/** The user's open shift, or null. */
export async function getCurrentShift(): Promise<ShiftCurrent | null> {
  try {
    const r = await api.get('/shifts/current', { validateStatus: () => true });
    if (r.status === 200) return (r.data?.data as ShiftCurrent) ?? null;
    return null;
  } catch (e) {
    console.warn('[shift] getCurrentShift failed:', e);
    return null;
  }
}

/**
 * Settle (end) a shift with the cashier's per-payment-type blind count.
 * Hits the management endpoint (pos_staff-allowed) which freezes the per-type
 * expected/counted/difference and sets status ENDED. The plain staff
 * `/shifts/end` ignores counts, so we must use this one with the shift id.
 *   POST /api/admins/shifts/<id>/end  { counted: {CASH,UZCARD,HUMO,PAYME}, notes }
 */
export async function closeShift(
  shiftId: number,
  counted: Record<string, number>,
  notes: string,
): Promise<boolean> {
  try {
    const r = await api.post(
      `/api/admins/shifts/${shiftId}/end`,
      { counted, notes },
      { validateStatus: () => true },
    );
    return r.status === 200 || r.status === 201;
  } catch (e) {
    console.warn('[shift] closeShift failed:', e);
    return false;
  }
}
