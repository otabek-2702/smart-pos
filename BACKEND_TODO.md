# Backend tasks for `alpha_pos_local` (smart-pos POS frontend)

What the **smart-pos** Electron POS still needs from the `alpha_pos_local` Django
backend (the in-store local edition — the backend of record). The frontend side
of each task degrades gracefully until the backend lands.

Verified against the local backend source on 2026-07-18 (`alpha_pos_local` `c82287b`). Paths are relative to the
`alpha_pos_local` repo root (models/services live in the `alpha_pos_core`
submodule) unless noted.

## Open — courier dispatch must use the new courier account model end-to-end

- The mobile-courier backend provides `GET /api/couriers/` and
  `POST /api/couriers/assign`, but both are `@manager_required`. The assignment
  picker is part of cashier checkout, so allow authenticated POS staff to list
  and assign courier accounts; keep create/regenerate manager-only.
- `Courier` / `DeliveryAssignment` is a different model from the old
  `DeliveryPerson` used by `GET /couriers` and `POST /orders/{id}/courier`.
  Expose the new assignment on `GET /orders` and `GET /orders/{id}` as a stable
  `{id, code, name, phone, step}` object, and support clearing it safely.

## Open — source contract for Telegram online-order receipt printing

- The local edition has no Telegram webhook/online-order route, no durable
  order origin field, and no `GET /orders/stream` (3-second polling is the
  agreed desktop refresh path).
- Add a synced and serialized `order_origin` / `source` enum at least covering
  `POS`, `QR`, and `TELEGRAM`; set `TELEGRAM` where the server customer bot
  creates its order and carry it to the till through sync.
- Include it in `GET /orders` and `GET /orders/{id}` and confirm the server-to-
  till creation path. The desktop will use that durable value to print a new
  Telegram order once, without treating ordinary POS orders as online orders.

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
