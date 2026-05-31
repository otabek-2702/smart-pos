# Backend Requirements — open POS items

> **No outstanding backend tasks** as of 2026-05-31. Everything previously spec'd
> here (cancel order, status lifecycle, order push, permissions, data alignment)
> has shipped and the frontend is wired against it — see closed issues
> `#15 #17 #21 #23 #24 #25` and commit history.
>
> The conventions section below stays as a quick reference for the next thing
> we ship. New tasks get appended under it.

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
  on exactly this string — `CANCELED` will silently not match.

### Order object shape the frontend expects

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
| GET | `/orders/stream?token=<bearer>` (SSE) | push: order.* events |
| POST | `/orders/create` | CreateOrderPage |
| POST | `/orders/:id/pay` | PaymentConfirmationDialog |
| POST | `/orders/:id/ready` | KDS (mark ready, idempotent) |
| POST | `/orders/:id/cancel` | PaymentConfirmationDialog (cancel-from-cashier) |
| PATCH | `/orders/:id/status` `{ "status": "PREPARING" }` | KDS (back to preparing) |

### Permissions in use (frontend route gates + role editor)

`settings.view`, `receipt.manage`, `printer.manage`, `display.manage`,
`categories.manage`, `users.manage`, `products.manage`, `inkassa.manage`.
ADMIN role and `'*'` permission both bypass every check.
