# Backend Requirements — open POS items

For the `alpha_pos` backend developer. Every remaining smart-pos issue that needs
backend work is specified below: endpoint, auth, request, response, behavior, and
the exact frontend code that will consume it. Implement these and the matching
frontend features ship with no further questions.

> The earlier `BACKEND_TASKS.md` (tasks 1–12) is **done**. This file covers what's
> left. GitHub issues referenced are in `otabek-2702/smart-pos`.

---

## 0. Conventions (already in use — match these)

- **Base URL:** `http://<server-ip>:8000`
- **Auth:** `Authorization: Bearer <token>` from `POST /auth-login`. Token is
  attached to every request by the frontend axios interceptor.
- **Response envelope (all endpoints):**
  ```json
  { "success": true, "message": "OK", "data": { } }
  ```
  Errors: `{ "success": false, "message": "<human readable>", "data": null }` with an
  appropriate HTTP status (400/401/403/404/409/422).
- **Permissions:** the existing `@permission_required` system — `user_perms` list,
  `'*'` or `role == 'ADMIN'` bypasses all (per `base/security/permissions.py`).
- **Order status enum (must be EXACT, uppercase):**
  `PREPARING`, `READY`, `CANCELLED`, `PAID`. Payment filter uses `payment_status`
  = `UNPAID` | `PAID`, plus the boolean `is_paid`.
  ⚠️ **Spelling is `CANCELLED` (double L).** The frontend filters and badges key
  on exactly this string — `CANCELED` will silently not match. (Issue #16.)

### Order object shape the frontend expects (already consumed in `OrdersPage.vue`, `KDSPage.vue`)

```json
{
  "id": 1024,
  "display_id": 42,
  "order_type": "HALL",            // HALL | PICKUP | DELIVERY
  "status": "PREPARING",           // PREPARING | READY | CANCELLED | PAID
  "total_amount": "84000.00",      // string
  "items_count": 3,
  "created_at": "2026-05-29T13:00:00Z",
  "description": "no onions",
  "phone_number": "+998901234567",
  "is_paid": false,
  "items": [
    {
      "id": 5,
      "product": { "id": 9, "category": "Burgers", "name": "Cheeseburger" },
      "quantity": 2,
      "price": "28000.00",
      "description": ""
    }
  ]
}
```

### Existing order endpoints (for reference — do not change shapes)

| Method | Path | Used by |
|---|---|---|
| GET | `/orders?payment_status=UNPAID&per_page=100` | OrdersPage (unpaid) |
| GET | `/orders?statuses=<STATUS>&per_page=100` | OrdersPage filters, KDS |
| GET | `/orders/:id` | order detail dialog |
| GET | `/orders/client-display` | customer display board |
| POST | `/orders/create` | CreateOrderPage |
| POST | `/orders/:id/pay` | PaymentConfirmationDialog |
| POST | `/orders/:id/ready` | KDS (mark ready) |
| PATCH | `/orders/:id/status` `{ "status": "PREPARING" }` | KDS (back to preparing) |

---

## BE-1 — Cancel an order from the cashier  (Issue #24 / F8)

**Unblocks:** a "cancel" action on `OrdersPage.vue`. The CANCELLED *filter* already
ships; this is the missing *mutation*.

```
POST /orders/:id/cancel
```

- **Auth:** Bearer token. **Permission:** `orders.cancel` (see BE-4). Cashiers
  should have it by default; if you prefer manager-only, say so and we'll gate the UI.
- **Request body:**
  ```json
  { "reason": "customer left" }   // optional, max 255 chars
  ```
- **Success (200):** the updated order object (same shape as above) with
  `status: "CANCELLED"`.
  ```json
  { "success": true, "message": "Order cancelled", "data": { "id": 1024, "status": "CANCELLED", ... } }
  ```
- **Rules / edge cases (please confirm each):**
  - Reject cancelling an order that is already `PAID` → **409** `{ success:false, message:"Paid orders cannot be cancelled" }`.
  - Cancelling an already-`CANCELLED` order → **idempotent 200** (return the order), not an error.
  - Should cancelling restore stock / void the kitchen ticket? State the behavior so we surface the right confirmation copy.
  - Record who cancelled (cashier id) and when, for the inkassa/stats reports.

---

## BE-2 — Order status lifecycle guarantees + KDS auto-advance  (Issue #23 / F7)

**Unblocks:** reliable KDS auto-advance. The KDS already calls `POST /orders/:id/ready`
(also fired automatically when the cook marks every line item done) and
`PATCH /orders/:id/status {status:"PREPARING"}`. We need the backend side solid:

1. **`POST /orders/:id/ready`** — set status `READY`. Must be **idempotent** (calling
   it on an already-`READY` order returns 200, not an error — the frontend may retry
   on flaky network). Return the updated order object.
2. **`PATCH /orders/:id/status { "status": "PREPARING" }`** — move `READY` → `PREPARING`.
   Validate the target is one of the allowed enum values; reject illegal transitions
   (e.g. `PAID` → `PREPARING`) with **422**.
3. **Allowed transitions — please confirm this is what the backend enforces:**
   ```
   PREPARING → READY        (POST /ready)
   READY     → PREPARING     (PATCH /status)
   (PAID and CANCELLED are terminal for the kitchen)
   ```
4. **Optional, the actual "auto-advance" ask:** if the product wants orders to move to
   `READY` automatically after a configurable prep time (no cook tap), expose:
   ```
   GET  /settings/kds            -> { "auto_ready_seconds": 0 }   // 0 = disabled
   ```
   and have the backend flip the status when the timer elapses (so every screen sees
   it). If you'd rather the frontend drive the timer, tell us and we'll do it client-side
   using `auto_ready_seconds`. Either way we need that one config value.

---

## BE-3 — Real-time order push (WebSocket or SSE)  (Issue #17 / F1)

**Unblocks:** removing the 3-second polling on `OrdersPage`, `KDSPage`, and the
client display. Today all three poll `/orders`. We want a push channel instead.

**Recommended (simplest for Django): Server-Sent Events.**
```
GET /orders/stream?token=<bearer-token>
Accept: text/event-stream
```
- Auth via `?token=` query param (browsers can't set headers on `EventSource`). Validate
  the same token as the `Authorization` header.
- Emit one event per order change. Event payload `data` is the **full order object**
  (shape from section 0):
  ```
  event: order.created
  data: { "id": 1024, "display_id": 42, "status": "PREPARING", ... }

  event: order.status_changed
  data: { "id": 1024, "status": "READY", ... }

  event: order.paid
  data: { "id": 1024, "is_paid": true, "status": "PAID", ... }

  event: order.cancelled
  data: { "id": 1024, "status": "CANCELLED", ... }
  ```
- Send a comment heartbeat (`: ping\n\n`) every ~25s so proxies don't drop the connection.
- **Alternative:** if you prefer Django Channels WebSockets, use `ws://<server-ip>:8000/ws/orders?token=<token>` with the same event names and JSON payloads — either is fine, just tell us which and the exact path.
- The frontend will keep polling as a fallback if the stream drops, so a partial
  rollout is safe.

---

## BE-4 — Per-role permissions: expose + manage  (Issue #21 / F5)

**Unblocks:** replacing the hard-coded `requiresAdmin` route guard with a
`meta.permissions[]` model, plus an admin UI to edit what each role can do. The backend
already HAS a permission system (`user_perms`, `'*'`, `@permission_required`); we need it
**exposed to the client** and **editable**.

**1. Include `permissions` on the user object** in BOTH `POST /auth-login` and
`GET /api/admins/users`:
```json
"user": {
  "id": 22, "first_name": "Drew", "last_name": "Thompson",
  "email": "drew@x.uz", "role": "CASHIER", "status": "ACTIVE",
  "permissions": ["orders.view", "orders.cancel", "kds.view"]
}
```
- Admins keep `["*"]` (already the case). The frontend treats `"*"` as "all".

**2. Permission catalog** — so the editor can render checkboxes:
```
GET /api/admins/permissions        (admin only)
-> data: {
     "permissions": [
       { "key": "settings.view",   "label": "Sozlamalarni ko'rish",  "group": "Settings" },
       { "key": "users.manage",    "label": "Foydalanuvchilar",       "group": "Settings" },
       { "key": "products.manage", "label": "Mahsulotlar",            "group": "Settings" },
       { "key": "orders.cancel",   "label": "Buyurtmani bekor qilish","group": "Orders" }
     ]
   }
```

**3. Role list + edit:**
```
GET   /api/admins/roles                      (admin only)
-> data: { "roles": [ { "name": "CASHIER", "permissions": ["orders.view","kds.view"] }, ... ] }

PATCH /api/admins/roles/:name                (admin only)
body:  { "permissions": ["orders.view","orders.cancel","kds.view"] }
-> data: { "name": "CASHIER", "permissions": [...] }   // the saved role
```

**Permission keys the frontend will map to routes** (define the canonical list; these are
our proposed keys — adjust names but keep them stable):

| Key | Gates (route / action) |
|---|---|
| `settings.view` | `/settings/*` tree |
| `users.manage` | settings → users (CRUD) |
| `products.manage` | settings → products |
| `categories.manage` | settings → categories |
| `printer.manage` / `display.manage` / `receipt.manage` | matching settings pages |
| `inkassa.manage` | `/cash-box` (inkassa) |
| `orders.view` / `orders.cancel` | OrdersPage / BE-1 |
| `kds.view` | `/kds` |

If a role lacks a key, the frontend hides the nav entry **and** the route guard
redirects — but the backend must still enforce on every endpoint (defense in depth).

---

## BE-5 — Integration data-contract alignment  (Issues #15 / T12, #25 / F9 — the umbrella)

These two are the integration epic; they're satisfied by BE-1…BE-4 **plus** the
following alignment items so the POS consumes the backend cleanly:

1. **`CANCELLED` spelling** is exactly `CANCELLED` everywhere (filters, order `status`,
   stream events). (Issue #16.)
2. **Order object always includes** every field in section 0 — especially
   `is_paid`, `phone_number`, `description`, `display_id`, and `items[].product.{id,name,category}`.
   Missing fields render as blanks in the cashier list and the receipt.
3. **Still-open from the old task file (re-confirm these shipped):**
   - **Public picker endpoint** `GET /auth/users-for-login?status=ACTIVE` (no auth, no
     `email` field) so a fresh terminal can show the user grid. (Detailed in
     `BACKEND_TASKS.md`.)
   - **Login by `user_id`**: `POST /auth-login` should accept `{ user_id, password }` in
     addition to `{ email, password }`, so the picker never exposes emails.
   - **CORS headers actually present** on `:8000` responses in the real run env, so we can
     drop `webSecurity:false` in Electron.
4. **Consistent error envelope** (section 0) so the frontend can show a real message
   instead of a generic toast.

---

## Not backend work (listed so nothing looks dropped)

- **#14 / T11** — mirror backlog into a GitHub Projects board (process/tooling).
- **#19 / F3** — expand E2E tests (frontend test infra; currently blocked by an
  Electron-39 / Playwright launch incompatibility).
- **#22 / F6** — "client display receipt total animation": the current client display is a
  kitchen status board (order numbers), it has no receipt/total — needs a product/design
  decision before any backend or frontend work.
