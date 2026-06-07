# Backend TODO for `alpha_pos` (current)

Outstanding backend work the smart-pos frontend needs. Branch: `prelaunch-fixes`.

## ✅ Shipped (commit 29fc07c "Backend (FE spec)…") — verified matching the FE
- **Payment-methods catalog** `GET /payment-methods` → `{code,label,icon(SVG),color,sort_order,is_active}`. FE reads it (cached at login).
- **Split / multi-payment** `POST /orders/{id}/pay` now accepts `payments:[{method,amount}]` + `discount_percent` (+ legacy `payment_method`). FE sends exactly this.
- **Roles & permissions CRUD** `GET /api/admins/permissions`, `GET /api/admins/roles`, `…/roles/<name>` (by name). FE RolesSettings matches.
- Also shipped: shifts now **manual** (no auto-start on login — commit 6699089); create-user = **4-digit PIN** (2ac7571); MANAGER role (4175166).

---

## ✅/🔴 1. MANAGER access to management endpoints
DONE for `admins/*`: categories, products, users, inkassa, app-settings, shifts(start/end/reconcile), analytics are now `manager_required` (ADMIN+MANAGER). Roles editor stays admin-only. ✅ Verified — FE settings work for managers.

🔴 **STILL admin-only: `hr/views/expense_views.py`** (`/api/admins/hr/expenses/*` + `/expense-categories/*`). The POS **Expenses page** uses these (desktop cashbox expense = `payment_method:'CASH'`, no category needed) but a logged-in MANAGER/CASHIER gets **403**. Switch these to **`manager_required`** (or `pos_staff_required` if cashiers should record too). The FE Expenses page sends `POST /hr/expenses/ { amount, expense_date, description, payment_method:'CASH' }` and lists `/hr/expenses/` — it shows a "not available" banner until this opens.

---

## 🟠 2. SSE order stream  (FE already degrades to 3s polling — not yet shipped)
`GET /orders/stream?token=<bearer>` — SSE pushing `order.created/updated/status_changed/paid/cancelled`. Auth via `?token=` (EventSource can't set headers). Missing → FE polls, no break.

---

## 🔴 3. Shift close with PER-PAYMENT-TYPE reconciliation (cashier-facing)
The cashier flow: start shift → sell + create expenses → at close, **count money per payment type separately** (cash, uzcard, humo, payme) and submit. Today this isn't possible:
- `CashReconciliation` is **CASH-ONLY** (`expected_cash`/`actual_cash`/`difference`) — no per-method breakdown.
- The cashier `POST /shifts/end` takes only `notes` (no counted amounts). `reconcile` (with `actual_cash`) is on the **admin** endpoint (`@admin_required` → cashier 403) and still cash-only.

**Needed (cashier-scoped, staff auth):**
1. `GET /shifts/current` → also return the per-method **expected** totals for the open shift (summed from this shift's order payments):
```
data: { id, start_time, total_orders, total_revenue, cash_collected,
        expected_by_method: { "CASH":"…", "UZCARD":"…", "HUMO":"…", "PAYME":"…" } }
```
2. `POST /shifts/end` accept a counted breakdown and **create the reconciliation as part of closing** (this is the live bug: a cashier-closed shift becomes `COMPLETED` with NO reconciliation row, so the admin panel shows "no data"):
```
body: { notes?, counted_by_method: { "CASH":n, "UZCARD":n, "HUMO":n, "PAYME":n } }
```
`end_active_for_user(user_id, notes, counted_by_method)` must: (a) run the existing `end_shift` (stats + COMPLETED), THEN (b) **create a `CashReconciliation`** from `counted_by_method` — don't make the cashier rely on the admin `reconcile` endpoint (it's `@admin_required` → cashier 403). Store per-method expected (summed from this shift's `OrderPayment`s) + counted + difference (extend `CashReconciliation` with per-method columns, or add a `ShiftReconciliationLine` table). Keep `notes`-only `end` working for back-compat.

The FE **already sends** `counted_by_method` on `/shifts/end` (`useShift.closeShift`) — it's currently dropped. Once (b) lands, the closed shift carries its reconciliation and the admin panel shows the data. (Also surface `reconciliation` + per-method in the shift serializer / admin so it renders.)

---

## 🟡 4b. Chef / kitchen shift
Cashier shift endpoints already work for staff (`/shifts/{current,start,end}`). For chefs: decide the kitchen role (reuse WAITER or add KITCHEN) and include it in `get_pos_staff()` so chefs appear in the picker. FE then routes a kitchen-role login to `/kds`; the chef starts the shift on login and finishes it from the KDS (re-enters their PIN → end shift). Confirm the role.

---

## 🔴 5. Cashier-ownership blocks legit actions (mark-ready / pay / status)
`POST /orders/<id>/ready` (and pay/status/add-item) run `_check_cashier_ownership`, which 403s when a cashier touches an order another cashier created:
> "You do not have permission to modify this order. Order #1 was created by another cashier."
On a shared monoblock that's wrong — any cashier on the till, and the kitchen (KDS) marking ready, must be able to act on ALL active orders. Relax it: allow MANAGER/ADMIN always, and allow cashiers to ready/serve any order (ownership should at most gate *deleting/refunding*, not normal flow). Seen live on `/orders/501/ready`.

---

## 🟠 7. User create: email required only for MANAGER
`POST` create-user (`admins/views/user_views.py`) should require `email` **only when** `role == 'MANAGER'`. For CASHIER (and any non-manager role), `email` must be optional — backend generates/fills it itself (e.g. a placeholder/derived address) so the record is valid without the FE sending one. FE will send `email` only on the manager form.

---

## 🟢 6. Housekeeping
- **CORS in the real run env**: responses to the renderer must carry `Access-Control-Allow-Origin`; until confirmed, `webSecurity:false` stays in the Electron windows.

## Notes from FE
- Login: PIN is 4 digits; non-managers don't need email (FE logs in cashiers/managers via the picker — `/auth-login` should accept the user id + 4-digit PIN without an email for non-managers).


password lenght can be 4 lenth and it does not require email if it is not a manager