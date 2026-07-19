# Backend tasks for `alpha_pos_local` (smart-pos POS frontend)

What the **smart-pos** Electron POS still needs from the `alpha_pos_local` Django
backend (the in-store local edition — the backend of record). The frontend side
of each task degrades gracefully until the backend lands.

Verified against the local backend source on 2026-07-19. The current deployed
`main` is `c82287b`; the completed delivery contracts are on
`origin/fix/frontend-backend-contracts-20260715` (`1051a80`, `094ebef`,
`78024a6`) and must be merged/deployed before the desktop can use them. Paths
are relative to the `alpha_pos_local` repo root (models/services live in the
`alpha_pos_core` submodule) unless noted.

## Implemented in backend branch — courier dispatch

- `GET /api/couriers/` and `POST /api/couriers/assign` are now available to
  authenticated POS staff; account creation and QR regeneration stay
  manager-only.
- The new `Courier` / `DeliveryAssignment` model is distinct from legacy
  `DeliveryPerson`. Orders return `courier_assignment` with stable courier
  identity plus numeric `pk`; explicit `courier_id: null` clears it safely.
- The QR contains a short-lived, one-time claim only. Courier login and refresh
  responses provide access and refresh expiry/token fields, and revocation
  invalidates the family at deliberate sign-out.

## Implemented in backend branch — durable Telegram online-order receipt printing

- Orders carry durable `order_origin`, including `TELEGRAM`, from server through
  local sync.
- The till claims a Telegram job through `POST /orders/print-jobs/claim`, prints
  it, then calls its claim-token `ack`; a printer failure calls `fail` so the
  backend can retry. Browser/dev preview leaves jobs unclaimed.

## Open — cashiers must be able to read cashbox expense categories

`GET /api/cashbox/categories/` currently shares a view decorated with
`@admin_required`, so CASHIER/MANAGER sessions receive 403. Allow POS staff to GET
the active category list, while keeping category creation restricted to the
appropriate management role. Add an authenticated cashier test for the GET route.

---

## Verified shipped — do **not** re-add
- **Structured delivery address + canonical phones**: `Order.delivery_address`
  is synced; `POST /orders/create` and `PATCH /orders/{id}/details` accept it
  with clean `order_note`; order/client lookup serializers return it; order and
  customer phones are canonicalized. *(local `0e193e7`, 2026-07-18 verified)*
- **Courier account + login QR provisioning**: manager endpoints
  `POST /api/couriers/create` and `POST /api/couriers/<pk>/regenerate` create or
  rotate a `Courier` credential and return `{server, token}` QR data. Rider QR
  login is `POST /auth/courier/login/ {qr}`. *(local `c82287b`, tests present in
  `couriers/tests/test_create_courier.py`)*
- **SSE order stream**: *dropped by choice* — polling (3s) is sufficient; no backend endpoint built.
- **Shift close per-tender count**: `POST /shifts/end` (pos_staff) accepts `{counted:{CASH,UZCARD,HUMO,PAYME}, notes}`; core `end_active_for_user` threads `counted` → `end_shift` → `ShiftPaymentTotal` reconciliation. FE: `closeShift` posts to `/shifts/end` (no `/api/admins`). *(shipped 2026-06-25, core 7fc0853 / local 1.0.14)*
- **CHEF (kitchen) role**: `User.RoleChoices.CHEF` exists; `get_pos_staff` returns CASHIER+MANAGER+CHEF so chefs appear in `GET /cashiers`. FE: PinPage routes CHEF→`/kds`; router guard bounces CHEF off cashier pages. *(shipped 2026-06-25, core b627af4)*
- **Client-display excludes all-instant orders**: `get_client_display_orders` annotates non-instant item count on both processing + finished, keeps only `>0` (same rule as chef-display). No FE change. *(shipped 2026-06-25)*
- **Legacy courier list + assign**: `GET /couriers` →
  `{data:{items:[{id,name,phone}]}}`; `POST /orders/{id}/courier
  {delivery_person_id}` assign/replace/clear. This remains a compatibility
  fallback only; it is not the new mobile-courier account model.
- **Staff order edits**: `POST|PATCH /orders/{id}/details {phone_number?, description?, delivery_person_id?}` (pos_staff). *(shipped — FE wiring pending, see BACKEND_TODO_DELIVERY.md)*
- **Instant products**: `Product.is_instant` — instant items born ready, all-instant orders created `READY`, `GET /orders/chef-display` strips instant items / hides all-instant orders.
- **Expenses**: cashbox expense create/list and recipient search are
  `@pos_staff_required`. Category-list access is tracked above.
- **Shared-till ownership**: `_check_cashier_ownership` returns early for ADMIN/MANAGER/CASHIER — any staff can ready/pay/status/add-item on any order.
- **create-user**: `email` required only when `role==MANAGER`; PIN enforced to exactly 4 digits.
- Payment-methods catalog, split/multi-payment + percent discount, roles/permissions CRUD, manual shifts, MANAGER role/access, PATCH `/orders/{id}/type`.
