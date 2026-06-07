# Money & Shift Logic — Design Spec

> Target spec for three consumers: **Admin panel** (manager-facing), **Desktop app** (cashier-facing), and **Backend** (partner's Claude implements/corrects).
> This document describes the *desired* behavior and the delta from what exists today. It does not change any code.

### DECISIONS LOCKED (owner-confirmed)
1. **Cashbox is per-shift.** The global `CashRegister` is replaced by a per-shift drawer.
2. **Shift-close is the only settlement.** The standalone **inkassa flow is removed** — `Inkassa` model + `inkassa_perform` + inkassa endpoints retired. Money enters SAFE/BANK only at manager shift-confirm.
3. **One SAFE for now, branches soon.** Keep a single SAFE/BANK, but design with `branch_id` so per-branch vaults drop in later without a rewrite.
4. **Card posts to BANK at close.** On manager confirm, card totals (UZCARD/HUMO/PAYME) immediately credit BANK. Settlement delay + bank commission reconciled manually later (acceptable for launch).
5. **Cashbox expense is its own model** (`CashboxExpense`), independent of HR.
6. **Salary is a monthly table** with an editable base per month + itemized bonuses/penalties (see §7).

---

## 0. Glossary / core money objects

| Object | What it is | Today | Target |
|---|---|---|---|
| **Cashbox (drawer)** | Money held by *one cashier during one shift* | Single **global** `CashRegister.current_balance`, cash-only | **Per-shift, per-payment-type** balances; global `CashRegister` retired |
| **Branch SAFE** | Branch cash vault. Cash lands here at shift-close confirm | `TreasuryAccount(kind=SAFE)`, global single row | Single now, `branch_id`-ready for later |
| **Branch BANK** | Electronic money (card/Payme settlements) | `TreasuryAccount(kind=BANK)` | Same; receives non-cash shift totals |
| **Treasury ledger** | Append-only log of every SAFE/BANK movement | `TreasuryTransaction` (has `delta`, `fee`, `counterparty`, `reference_*`) | Reuse; add supplier + salary references |
| **Supplier balance** | What we owe / pre-paid a supplier | `Supplier.current_balance` field only | Add **ledger** + auto-moves |
| **Payment types** | CASH, UZCARD, HUMO, PAYME | `Order.PaymentMethod` enum + `OrderPayment` rows | Reuse; treat UZCARD/HUMO/PAYME as "card/bank", CASH as drawer |

**Key principle to enforce everywhere:** *only CASH ever moves the physical drawer.* Card/Payme amounts are recorded but settle into BANK, never the cash drawer. (Backend already does this in pay/cancel/unpay — keep it.)

---

## 1. SHIFT LIFECYCLE

### 1.1 Desired flow
1. Cashier logs into desktop app → **shift auto-starts** (status `ACTIVE`). One open shift per cashier.
2. During shift, every paid order pushes income into the **shift cashbox**, split by payment type.
3. Cashier can record **expenses out of cash** (see §4).
4. Cancelled orders / returns reverse the cash portion (already correct).
5. Cashier **closes shift**: counts and enters the actual amount **for each payment type** (cash + each card type, one by one).
6. System freezes per-type **expected** totals and stores the cashier's **counted** totals + per-type **difference**.
7. Manager (admin panel) reviews differences, then **confirms the received amount** per type → confirmed money posts to the **branch SAFE (cash) / BANK (cards)**.

### 1.2 Current state (gap)
- Shift start is **manual** (`POST /api/shifts/start` and admin equivalent). Login no longer auto-opens — comment in `customers/views/shift_views.py` confirms.
- Shift stores only `total_orders`, `total_revenue`, `cash_collected` (cash only). **No per-type breakdown.**
- `CashReconciliation` captures only `expected_cash` / `actual_cash` / `difference` — **cash only**.
- Reconcile sets shift `COMPLETED` but **posts nothing to treasury**.

### 1.3 Backend changes
**A. Auto-start on login.** In the cashier login path (`customers/views/auth_views.login` → service), after successful auth for a CASHIER, if no `ACTIVE` shift exists for the user, call `ShiftService.start_shift(user.id)`. Make it idempotent (return existing active shift if present). *Decision: keep a manual start endpoint too for managers opening a shift on a cashier's behalf.*

**B. Per-type shift totals.** Replace the single `cash_collected` with a per-type breakdown. Two options:
- **B1 (recommended):** Don't store derived columns at all — compute per-type expected from `OrderPayment` rows in the shift window at close time, and store a small JSON/related rows of `{type: expected_amount}`. Add a `ShiftPaymentTotal` child table: `(shift, method, expected_amount, counted_amount, difference)`.
- **B2:** Add columns `expected_cash, expected_uzcard, expected_humo, expected_payme` + `counted_*` on `Shift`. Simpler but rigid if payment types change. **B1 preferred** because `PaymentMethodConfig` is editable.

> Expected per type = `SUM(OrderPayment.amount)` for `method=T` where the parent order's `paid_at ∈ [shift.start, shift.end]` **minus** cash expenses paid out of the drawer (for CASH only). Returns/cancels already netted because they reverse `OrderPayment`-driven drawer math.

**C. Close = enter all types.** `end_shift` (or a new `submit_count` step) accepts `counted = {CASH: n, UZCARD: n, HUMO: n, PAYME: n}`. Store counted + difference per type. Status → `ENDED`.

**D. Manager confirm → post to treasury.** Extend `reconcile` to accept `confirmed = {type: amount}` (manager's final numbers, defaults to cashier counts via the "copy" UX). On confirm:
- For CASH confirmed amount → `TreasuryService.deposit` to SAFE, `reference_type='Shift'`, `reference_id=shift.id`.
- For each card type confirmed → deposit to BANK (or keep card types already in BANK via inkassa; see §3 decision).
- Store per-type `expected / counted / confirmed / difference` on the reconciliation record.
- Status → `COMPLETED`.

### 1.4 Status model (target)
`ACTIVE` → cashier working → `ENDED` (cashier counted, awaiting manager) → `COMPLETED` (manager confirmed + posted to safe). Keep `ABANDONED` for void.

### 1.5 Desktop app UI (cashier)
- Auto shift banner ("Shift open since HH:MM").
- Live running totals per payment type.
- "Close shift" screen: one input per active payment type (from `PaymentMethodConfig`), pre-fills nothing — cashier counts blind. Submit → read-only summary.

### 1.6 Admin panel UI (manager)
- Shift list → shift detail.
- Reconcile panel: table `Payment type | Expected (system) | Cashier counted | Difference | Confirm`.
- **"Copy" button** per row to copy cashier's counted into the Confirm field; manager can override.
- Difference colored (green = match, red = short, amber = over). Short on CASH after returns within a small tolerance is "ok day"; large/persistent card shortfall flags terminal misuse.
- Confirm → posts to SAFE/BANK, shift `COMPLETED`.

---

## 2. SHIFT STATISTICS (close report)

The current shift-detail blob mixes useful and junk. Target report (computed, served by `GET /api/admins/analytics/shifts/<id>/report`, partly exists in `shift_analytics_service.py`):

**Money**
- Per payment type: expected / counted / confirmed / difference.
- Total revenue, total discounts given (sum + %), refunds/cancels count + value.
- Cash expenses out of drawer (count + sum, by category).
- Net cash that should remain = opening + cash sales − cash expenses − returns.

**Orders / sales**
- Order count, completed vs cancelled, by type (hall/delivery/pickup).
- Items sold (units + line items).
- **Average check, min check, max check.**
- Most-sold and least-sold products (top N).
- Revenue by category.

**Timing**
- Orders-per-hour histogram → **peak hours**.
- Average prep time (created → ready) and average serve time (created → paid).
- Orders/hour, revenue/hour.

**Staff**
- Punctuality (scheduled shift template vs actual start; ties to HR attendance later).

**Remove** from current detail: any field not in the above (dead/duplicated live-vs-frozen aggregations; consolidate `_live_totals` and `end_shift` into one shared helper — they duplicate queries today).

> Brainstorm additions (flag for later): void reason breakdown, discount-by-reason, secret-word usage count, re-print/re-fiscalize count, tip handling (if tips ever added), per-table turnover.

---

## 3. CASHBOX ↔ TREASURY (LOCKED: per-shift drawer, shift-close settlement, no inkassa)

**Decided.** Shift-close → manager confirm is the *only* moment money enters SAFE/BANK. The inkassa flow is **removed**.

Backend work:
- **Per-shift drawer.** Retire the global `CashRegister`. The cashier's live cash is derived from / stored on the open `Shift` (cash sales − cash expenses − cash returns, since shift start). Two cashiers on overlapping shifts must never share a drawer.
- **Remove inkassa.** Delete/retire `Inkassa` model usage, `AdminInkassaService.perform`, `InkassaService.add_to_register`, and the `/api/admins/inkassa/*` endpoints. Replace `add_to_register` call sites (order pay/cancel/unpay) with per-shift drawer updates. *Keep the data migration in mind — historical Inkassa rows may need archiving, not hard-delete.*
- **Settlement at confirm only.** On manager confirm (§1.3-D): CASH confirmed → SAFE `+`; each card type confirmed → BANK `+`. One shift = one settlement, written to `TreasuryTransaction` with `reference_type='Shift'`.

> This is the single biggest structural change — do it first (build order §10.1).

---

## 4. CASHBOX EXPENSES (cashier, out of cash)

### 4.1 Desired
- Cashier records an expense **from cash only**.
- Fields: **category**, **comment**, **recipient** (searchable).
- Recipient search spans **users** (managers, chefs, workers) **and suppliers**.
- If recipient is a **supplier** → also create a **supplier ledger transaction** (supplier got money from the drawer). Suppliers otherwise handled in §6.
- Expense immediately reduces the shift cash drawer and shows in the shift report.

### 4.2 Current state (gap)
- `hr.Expense` exists but is **auto-approved on create**, has categories + payment method, deducts `CashRegister` if CASH — but has **no recipient field** and **no supplier linkage**.
- A separate "cashbox expense" concept isn't cleanly defined.

### 4.3 Backend changes (LOCKED: new `CashboxExpense` model, not HR)
- **New model `CashboxExpense`**: `shift` (FK), `category` (FK to a cashbox expense-category catalog), `comment`, `amount`, `recipient_user` (FK User, null), `recipient_supplier` (FK Supplier, null), `created_by`, `created_at`. Exactly one recipient kind, or none. Do **not** reuse `hr.Expense` — expenses here are POS/drawer, not HR.
- On create (cash only): deduct from the **shift drawer**, write the expense, and **if `recipient_supplier` set**, create a `SupplierTransaction` (type `PAYMENT`, `source_account=DRAWER`) reducing what we owe.
- `shift_id` link → appears in §2 report (cash expenses by category).
- Its own category catalog (don't share `hr.ExpenseCategory`).

### 4.4 UI
- Desktop (cashier): expense form — category dropdown, comment, recipient autocomplete (one search box querying both users and suppliers, grouped results). Amount. Confirm.
- Admin: expense list per shift, filter by category/recipient.

---

## 5. TREASURY: SAFE / BANK / transfers / expenses / commission

### 5.1 Desired
- Branch holds money in types: **cash (SAFE), bank (BANK), others if needed**.
- Expenses can come from **SAFE**, **BANK**, or the **shift cash drawer** (§4).
- **Bank expense** has a **commission** input.
- **Bank → cash transfer** with exact commission.
- Money shown per type on the branch treasury page.

### 5.2 Current state (mostly exists ✓)
- `TreasuryService.transfer(source, dest, amount, fee)` — fee deducted from destination credit, two ledger rows, counterparty linked. **Bank→cash transfer with commission already works.**
- `TreasuryService.record_expense(account, amount, category, description)` for SAFE/BANK. **No commission field on expense** though.
- Balances guarded against peer sync overwrite (`SYNC_WRITE_DENYLIST`).

### 5.3 Backend changes
- Add optional `fee`/`commission` to `record_expense` (bank expense with commission) — record the fee on the `TreasuryTransaction` (already has a `fee` column).
- Confirm `TreasuryTransaction.Type` covers all cases; add `SUPPLIER_PAYMENT` and `SALARY_PAYMENT` types (today both bypass treasury — see §6, §7).
- *Decision:* multi-branch — SAFE/BANK are currently single global rows. If you need per-branch vaults, key accounts by `branch_id`. For single-branch launch, leave as-is.

### 5.4 UI
- Admin treasury page: cards per account (SAFE / BANK) with balance; ledger table (filter by type); actions: Transfer (with commission), Expense (with optional commission for bank).

---

## 6. SUPPLIERS (balance + ledger + receiving + payment)

### 6.1 Desired
- Supplier has a **balance** (plus/minus).
- When stock is **received** (e.g. 50,000 sums of product), create a **supplier transaction** → balance moves (we now owe them).
- **Pay a supplier**: choose **source balance** (SAFE/BANK/drawer); if from **bank**, optional **commission**. This is the inverse of receiving and reduces what we owe.
- If a **cashbox expense recipient is a supplier**, that too creates a supplier transaction (§4).

### 6.2 Current state (big gaps)
- `Supplier.current_balance` exists but **no ledger / audit trail**.
- Receiving completes stock + cost, but **creates no supplier debt** — the 50,000 owed is never recorded.
- `PurchaseOrderService.record_payment()` exists, calls `update_balance`, **but is wired to no URL → dead code**.
- **No treasury integration**: paying a supplier never debits SAFE/BANK.
- No commission logic for supplier payments.

### 6.3 Backend changes
- **New model `SupplierTransaction`** (ledger): `supplier`, `type` (`PURCHASE` debt+, `PAYMENT` debt−, `ADJUSTMENT`, `RETURN`), `amount`, `balance_before`, `balance_after`, `source_account` (SAFE/BANK/DRAWER, for payments), `fee`/`commission`, `reference_type`/`reference_id` (PurchaseOrder / Receiving / CashboxExpense), `performed_by`, `created_at`. Mirror the treasury ledger pattern + `SYNC_WRITE_DENYLIST` on amounts.
- **On receiving complete:** create a `SupplierTransaction(type=PURCHASE, amount=received_value)` and move `current_balance` (recompute from ledger, don't blind-write). Received value = Σ(`unit_cost × qty`).
- **Pay-supplier endpoint (new + wired):** `POST /api/admins/stock/suppliers/<id>/pay` with `{amount, source_account, commission?, note}`:
  - Debit the chosen treasury account (`TreasuryService.record_expense` or a dedicated `pay_supplier` that writes a `SUPPLIER_PAYMENT` treasury txn) including commission if bank.
  - Create `SupplierTransaction(type=PAYMENT, source_account, fee=commission)`.
  - Update supplier balance from ledger.
- **Supplier balance = derived from ledger** (or mutated under lock with every change written to the ledger). Never a blind `UPDATE`.

### 6.4 UI
- Admin supplier page: balance (owe / credit), ledger table, "Pay supplier" action → choose **source account**, amount, commission (shown only when source = bank), note. Receiving auto-appears as a debt line.

---

## 7. SALARIES (fixed + itemized bonuses + itemized penalties)

### 7.1 Desired (LOCKED — monthly table)
- Salary is shown to the manager as a **monthly table** (one row per employee per month).
- Each month's **fixed base pre-fills from last month's value** but is **editable for that month** (manager can change the fixed salary going forward / for this month only).
- Manager adds **bonuses one by one** (amount + reason) and **penalties one by one** (amount + reason) on that month's row.
- Net = base(this month) + Σbonuses − Σpenalties.

### 7.2 Current state (gap)
- `SalaryPayment` has single scalar `bonus` and single scalar `deduction`. **Not itemized.**
- `generate_payroll` copies `employee.base_salary` (no per-month editable base; changing it changes all future months).
- Pay flow deducts from `CashRegister` if CASH but **no treasury link**; client supplies payment method.

### 7.3 Backend changes
- **Per-month salary row** keyed `(employee, year, month)`. On open/generate, `base_amount` seeds from the **previous month's `base_amount`** (fallback `employee.base_salary` for first month). `base_amount` is editable on the row and does **not** mutate `employee.base_salary` — it's the snapshot for that month. *Optionally* a "set as new default" action writes back to the employee.
- **New child tables** `SalaryBonus(salary, amount, reason, created_at)` and `SalaryDeduction(salary, amount, reason, created_at)`. (One signed `SalaryAdjustment` is the alternative, but separate tables match the two-list UI better — go with separate.)
- `net_amount = base_amount + Σ bonuses − Σ deductions`, recomputed whenever base or any child row changes.
- Pay flow: route through treasury (`SALARY_PAYMENT` txn against SAFE/BANK by method) instead of touching `CashRegister` directly — unify with §3/§5.

### 7.4 UI
- Admin **monthly salary table**: columns `Employee | Base (editable) | Bonuses Σ | Penalties Σ | Net | Status`. Month selector at top; base pre-filled from last month.
- Row expand → **Bonuses** list (add: amount + reason) and **Penalties** list (add: amount + reason), live net. Approve → Pay (choose method/source).

---

## 8. ATTENDANCE
Out of scope for now (user will detail later). Note the hook: shift punctuality already references shift templates + HR attendance in `shift_analytics_service.py`. Keep `Employee.user` 1:1 link in mind — a cashier User may or may not have an Employee profile.

---

## 9. DECISIONS (all resolved — see top block)

1. Cashbox → **per-shift** (global `CashRegister` retired). ✓
2. **Shift-close only**; inkassa flow **removed**. ✓
3. **Single SAFE/BANK now**, `branch_id`-ready for later. ✓
4. Card totals **post to BANK at shift confirm**; settlement/commission reconciled manually later. ✓
5. **New `CashboxExpense` model**, independent of HR. ✓
6. Salary → **monthly per-(employee,month) row, editable base + separate bonus/penalty child tables**. ✓

No open blockers. Attendance (§8) still to be specified by owner.

---

## 10. BUILD ORDER (suggested)
1. Per-shift cashbox + per-type shift totals (§1, §3) — foundation.
2. Shift close (cashier per-type count) + manager confirm → SAFE/BANK posting (§1).
3. Shift report consolidation (§2).
4. Cashbox expenses with recipient + supplier link (§4).
5. Supplier ledger + receiving debt + pay-supplier w/ source+commission (§6).
6. Treasury expense commission (§5).
7. Salary itemization (§7).
8. Attendance (later).

---

## Appendix — key existing code anchors (for backend Claude)
- Shift: `base/models.py` `Shift` (1241), `CashReconciliation` (1280), `ShiftTemplate` (1224); `admins/services/shift_service.py` (`start_shift` 141, `end_shift` 162, `reconcile` 234); analytics `admins/services/shift_analytics_service.py`.
- Cashbox/treasury: `base/models.py` `CashRegister` (1009), `Inkassa` (1022), `TreasuryAccount` (1118), `TreasuryTransaction` (1143); `base/services/treasury_service.py` (`transfer` 145, `record_expense` 205); `admins/services/inkassa_service.py` (`perform` 126).
- Payments: `base/models.py` `OrderPayment` (1502), `PaymentMethodConfig` (1531); `customers/services/order_service.py` `mark_as_paid` (813); `admins/services/order_service.py` `mark_as_paid` (641), `mark_as_unpaid` (709).
- Suppliers: `stock/models/suppliers.py` `Supplier` (`current_balance` 31); `stock/services/purchase_service.py` `record_payment` (433, **dead**), `PurchaseReceivingService.complete` (689); `stock/services/supplier_service.py` `update_balance` (313).
- Salary: `hr/models.py` `SalaryPayment` (205); `hr/services/salary_service.py` `generate_payroll` (161), `pay` (345); cash `hr/models.py` `CashTransaction` (274).
