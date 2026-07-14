# Backend tasks for `alpha_pos_local` (smart-pos POS frontend)

What the **smart-pos** Electron POS still needs from the `alpha_pos_local` Django
backend (the in-store local edition — the backend of record). The frontend side
of each task degrades gracefully until the backend lands.

Verified against the local backend source on 2026-07-15. Paths are relative to the
`alpha_pos_local` repo root (models/services live in the `alpha_pos_core`
submodule) unless noted.

## Open — structured delivery address + canonical customer phone

- Add a structured `delivery_address` field to `Order` (migration + sync config).
- Accept it in `POST /orders/create` and `PATCH /orders/<id>/details`.
- For zero-downtime compatibility, accept optional `order_note` as the clean note
  value and prefer it over the legacy combined `description` when present.
- Return it in order list/detail serializers and in the orders returned by
  `GET /clients/lookup?phone=...`.
- Keep `description` as the order note; do not combine address and note in the backend.
- Canonicalize customer/order phones before resolve/save to digits-only
  `998XXXXXXXXX`, while retaining normalized matching for existing formatted rows.
- Keep the current behavior that a supplied name backfills an empty customer name.
- Add request/service tests for structured address history and phone convergence.

Frontend compatibility: `CreateOrderPage.vue` sends `delivery_address` and clean
`order_note`, but also continues composing the legacy `description` for older backends.

## Open — cashiers must be able to read cashbox expense categories

`GET /api/cashbox/categories/` currently shares a view decorated with
`@admin_required`, so CASHIER/MANAGER sessions receive 403. Allow POS staff to GET
the active category list, while keeping category creation restricted to the
appropriate management role. Add an authenticated cashier test for the GET route.

---

## Verified shipped — do **not** re-add
- **SSE order stream**: *dropped by choice* — polling (3s) is sufficient; no backend endpoint built.
- **Shift close per-tender count**: `POST /shifts/end` (pos_staff) accepts `{counted:{CASH,UZCARD,HUMO,PAYME}, notes}`; core `end_active_for_user` threads `counted` → `end_shift` → `ShiftPaymentTotal` reconciliation. FE: `closeShift` posts to `/shifts/end` (no `/api/admins`). *(shipped 2026-06-25, core 7fc0853 / local 1.0.14)*
- **CHEF (kitchen) role**: `User.RoleChoices.CHEF` exists; `get_pos_staff` returns CASHIER+MANAGER+CHEF so chefs appear in `GET /cashiers`. FE: PinPage routes CHEF→`/kds`; router guard bounces CHEF off cashier pages. *(shipped 2026-06-25, core b627af4)*
- **Client-display excludes all-instant orders**: `get_client_display_orders` annotates non-instant item count on both processing + finished, keeps only `>0` (same rule as chef-display). No FE change. *(shipped 2026-06-25)*
- **Courier list + assign**: `GET /couriers` → `{data:{items:[{id,name,phone}]}}`; `POST /orders/{id}/courier {delivery_person_id}` assign/replace/clear; order serializers include `delivery_person {id,name,phone}|null`. *(shipped — see BACKEND_TODO_DELIVERY.md)*
- **Staff order edits**: `POST|PATCH /orders/{id}/details {phone_number?, description?, delivery_person_id?}` (pos_staff). *(shipped — FE wiring pending, see BACKEND_TODO_DELIVERY.md)*
- **Instant products**: `Product.is_instant` — instant items born ready, all-instant orders created `READY`, `GET /orders/chef-display` strips instant items / hides all-instant orders.
- **Expenses**: cashbox expense create/list and recipient search are
  `@pos_staff_required`. Category-list access is tracked above.
- **Shared-till ownership**: `_check_cashier_ownership` returns early for ADMIN/MANAGER/CASHIER — any staff can ready/pay/status/add-item on any order.
- **create-user**: `email` required only when `role==MANAGER`; PIN enforced to exactly 4 digits.
- Payment-methods catalog, split/multi-payment + percent discount, roles/permissions CRUD, manual shifts, MANAGER role/access, PATCH `/orders/{id}/type`.
