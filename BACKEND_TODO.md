# Backend tasks for `alpha_pos` (smart-pos POS frontend)

What the **smart-pos** Electron POS still needs from the `alpha_pos` Django backend.
The frontend side of each task is already done and degrades gracefully until the
backend lands. Each task below is self-contained: endpoint, today's behavior, the
exact change, the request/response shape, and the file to edit.

Verified against the live backend on 2026-06-13. Paths are relative to the
`alpha_pos` repo root unless noted.

---

## 🔴 1. `GET /orders/client-display` — exclude all-instant orders

**Why:** A product can be `is_instant` (drink / packaged good, no kitchen prep).
An order whose items are **all** instant is created with status `READY` instantly.
It then appears on the customer lobby screen **and rings the ready-chime** for an
order that was handed over on the spot — noise the cashier never wanted on screen.

**Today:** `get_client_display_orders` builds the `processing` and `finished`
querysets with **no** instant filter, so all-instant orders show + chime.

**Change:** On **both** the `processing` and `finished` querysets, annotate the
count of **non-instant** items and keep only orders with `> 0`. Mirror the rule
already used by `get_chef_display_orders` (which excludes instant items / hides
all-instant orders).

- Endpoint: `GET /orders/client-display` (request + response shapes unchanged).
- Edit: `customers/services/order_service.py` → `get_client_display_orders` (~L1029–1040). Pattern to copy: `get_chef_display_orders` (~L1078–1131).
- FE consumer: `smart-pos-main/src/pages/ClientDisplayPage.vue` (~L412–421). No FE change — it only renders what the endpoint returns, so it can't filter this itself (the endpoint sends order numbers, no items).

---

## 🟠 2. KITCHEN role — so chefs show in the picker and route to `/kds`

**Why:** Kitchen staff should log in from the lock-screen picker and land on the
KDS. There is **no** kitchen/chef role today, so they can't appear in the picker.

**Today:** `User.RoleChoices` = USER, ADMIN, CASHIER, MANAGER, WAITER (no chef).
`get_pos_staff()` returns only `role__in=(CASHIER, MANAGER)`, so a kitchen user is
never in `GET /cashiers`.

**Change (minimal):**
1. Add a kitchen role to `User.RoleChoices` (e.g. `KITCHEN = "KITCHEN", "Kitchen"`) + a migration.
2. Add `KITCHEN` to the `role__in` tuple in `get_pos_staff()` so chefs appear in the picker.
3. *(optional)* add an `is_kitchen` flag to the staff serializer (mirrors `is_manager`) so the FE can branch explicitly instead of on the role string.
4. *(only if chefs call it)* add `KITCHEN` to `STAFF_ROLES` so `GET /orders/chef-display` admits them.

- Endpoint affected: `GET /cashiers` (adds kitchen users to the list).
- Response: each staff entry already has `role`; add `"is_kitchen": true` if doing step 3.
- Edit: `base/models.py` (~L467–475 RoleChoices) + migration; `base/repositories/user.py` (~L38–42 `get_pos_staff`); `customers/services/staff_service.py` (~L5–22 serializer, optional flag); `customers/views/order_views.py` (~L17 `STAFF_ROLES`, only for chef-display).
- FE follow-up (separate, no backend dep): route `/kds` when `role === 'KITCHEN'` in `PinPage.vue`, widen the role union, add a kitchen route guard.

---

## 🟢 3. SSE order stream — `GET /orders/stream` (optional; polling works today)

**Why:** Push order changes so the cashier/KDS update instantly instead of on the
3s poll. **Not urgent** — the FE already runs fine on polling; the EventSource
just 404s and backs off.

**Change:** Add an SSE endpoint authenticated by a `?token=<bearer>` query param
(EventSource can't set the `Authorization` header). Return a
`StreamingHttpResponse` with `Content-Type: text/event-stream` emitting **named**
events the FE listens for: `order.created`, `order.updated`,
`order.status_changed`, `order.paid`, `order.cancelled`. Send a periodic
heartbeat comment to keep the connection open; support many concurrent clients.

- Endpoint: `GET /api/customers/orders/stream?token=<bearer>` (no body).
- Response frame: `event: order.status_changed\ndata: {"order_id": 42, "status": "ready"}\n\n`. `data` must be valid JSON; payload is only a refresh trigger (the FE re-fetches the list as source of truth), so `{order_id, status}` is enough.
- Edit: add route in `customers/urls.py` (~L36–51); new view in `customers/views/order_views.py` (alongside `client_display`/`chef_display`, ~L274–285) using `StreamingHttpResponse` + token-from-query auth.
- FE consumer (already complete): `smart-pos-main/src/composables/useOrderStream.ts` (URL build ~L51–57, listeners ~L33–39, JSON.parse ~L114–121, error backoff ~L125–135).

---

## Verified shipped — do **not** re-add
- Per-payment-type **shift close**: `POST /shifts/end` accepts `{counted:{CASH,UZCARD,HUMO,PAYME}, notes}`, writes `ShiftPaymentTotal` per method, surfaced on shift detail. `@pos_staff_required` (cashier can close). Fully working.
- **Expenses**: hr + cashbox expense endpoints are `@pos_staff_required` — cashier/manager get no 403. (POS page uses the cashbox API `POST /api/admins/cashbox/shifts/{id}/expenses/ {amount, comment}`.)
- **Shared-till ownership**: `_check_cashier_ownership` returns early for ADMIN/MANAGER/CASHIER — any staff can ready/pay/status/add-item on any order.
- **create-user**: `email` required only when `role==MANAGER` (auto-derived otherwise); PIN enforced to exactly 4 digits.
- **CORS**: `CORS_ALLOW_ALL_ORIGINS=True` unconditionally; CORS middleware before the license kill-switch, so even 503s carry the header.
- **Instant products**: `Product.is_instant` shipped — instant items born ready, all-instant orders created `READY`, `GET /orders/chef-display` strips instant items / hides all-instant orders.
- Payment-methods catalog, split/multi-payment + percent discount, roles/permissions CRUD, manual shifts, MANAGER role/access.
