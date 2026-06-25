# Backend tasks for `alpha_pos_local` (smart-pos POS frontend)

What the **smart-pos** Electron POS still needs from the `alpha_pos_local` Django
backend (the in-store local edition — the backend of record). The frontend side
of each task degrades gracefully until the backend lands.

Verified against the live backend on 2026-06-25. Paths are relative to the
`alpha_pos_local` repo root (models/services live in the `alpha_pos_core`
submodule) unless noted.

---

## 🟢 1. SSE order stream — `GET /orders/stream` (optional; polling works today)

**Why:** Push order changes so the cashier/KDS update instantly instead of on the
3s poll. **Not urgent** — the FE already runs fine on polling; the EventSource
just 404s and backs off.

**Change:** Add an SSE endpoint authenticated by a `?token=<bearer>` query param
(EventSource can't set the `Authorization` header). Return a
`StreamingHttpResponse` with `Content-Type: text/event-stream` emitting **named**
events the FE listens for: `order.created`, `order.updated`,
`order.status_changed`, `order.paid`, `order.cancelled`. Send a periodic
heartbeat comment to keep the connection open; support many concurrent clients.

- Endpoint: `GET /orders/stream?token=<bearer>` (no body).
- Response frame: `event: order.status_changed\ndata: {"order_id": 42, "status": "ready"}\n\n`. `data` must be valid JSON; payload is only a refresh trigger (the FE re-fetches the list as source of truth), so `{order_id, status}` is enough.
- FE consumer (already complete): `smart-pos-main/src/composables/useOrderStream.ts` (URL build, listeners, JSON.parse, error backoff).

---

## Verified shipped — do **not** re-add
- **Shift close per-tender count**: `POST /shifts/end` (pos_staff) accepts `{counted:{CASH,UZCARD,HUMO,PAYME}, notes}`; core `end_active_for_user` threads `counted` → `end_shift` → `ShiftPaymentTotal` reconciliation. FE: `closeShift` posts to `/shifts/end` (no `/api/admins`). *(shipped 2026-06-25, core 7fc0853 / local 1.0.14)*
- **CHEF (kitchen) role**: `User.RoleChoices.CHEF` exists; `get_pos_staff` returns CASHIER+MANAGER+CHEF so chefs appear in `GET /cashiers`. FE: PinPage routes CHEF→`/kds`; router guard bounces CHEF off cashier pages. *(shipped 2026-06-25, core b627af4)*
- **Client-display excludes all-instant orders**: `get_client_display_orders` annotates non-instant item count on both processing + finished, keeps only `>0` (same rule as chef-display). No FE change. *(shipped 2026-06-25)*
- **Courier list + assign**: `GET /couriers` → `{data:{items:[{id,name,phone}]}}`; `POST /orders/{id}/courier {delivery_person_id}` assign/replace/clear; order serializers include `delivery_person {id,name,phone}|null`. *(shipped — see BACKEND_TODO_DELIVERY.md)*
- **Staff order edits**: `POST|PATCH /orders/{id}/details {phone_number?, description?, delivery_person_id?}` (pos_staff). *(shipped — FE wiring pending, see BACKEND_TODO_DELIVERY.md)*
- **Instant products**: `Product.is_instant` — instant items born ready, all-instant orders created `READY`, `GET /orders/chef-display` strips instant items / hides all-instant orders.
- **Expenses**: hr + cashbox expense endpoints are `@pos_staff_required` (cashier/manager get no 403).
- **Shared-till ownership**: `_check_cashier_ownership` returns early for ADMIN/MANAGER/CASHIER — any staff can ready/pay/status/add-item on any order.
- **create-user**: `email` required only when `role==MANAGER`; PIN enforced to exactly 4 digits.
- Payment-methods catalog, split/multi-payment + percent discount, roles/permissions CRUD, manual shifts, MANAGER role/access, PATCH `/orders/{id}/type`.
