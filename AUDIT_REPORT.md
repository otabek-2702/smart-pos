# Backend ↔ Frontend Audit Report

**Date:** 2026-04-28
**Frontend:** `c:\Users\Jason\Desktop\Projects\smart-pos-main` (Quasar/Vue 3 + Electron)
**Backend:** `C:\Users\Jason\Desktop\Projects\alpha_pos` (Django, custom session auth — NOT DRF)
**Backend running at:** http://127.0.0.1:8000

---

## TL;DR — Severity Summary

| Severity | Count | Examples |
|---|---|---|
| 🔴 **All admin writes blocked by perms** | global | Admin user `admin@example.com` has `permissions: []`. Every `POST`/`PUT`/`PATCH`/`DELETE` under `/api/admins/*` 403s with "You don't have permission to perform this action" — regardless of correct payload. `category.update`, `category.create`, `product.create`, etc. must be granted. **Reads work fine.** |
| 🔴 **Endpoint missing entirely** | 7 | `/users` CRUD (4 endpoints), `/inkassa/*` (5 endpoints) |
| 🟠 **URL pattern mismatch** | 14 | Frontend uses `/products/create`, backend uses `POST /api/admins/products`. Same for categories, plus all admin-prefix issues |
| ✅ **Auth header format** | n/a | Frontend sends `Authorization: Bearer <session_key>`. Backend's `get_session_key()` already accepts both cookie `session_key` AND `Authorization: Bearer <key>`. **Confirmed working** — see [base/helpers/request.py:16-23](C:/Users/Jason/Desktop/Projects/alpha_pos/base/helpers/request.py#L16-L23). |
| 🟡 **Different URL, same data** | 1 | `/display/client` → `/orders/client-display` |
| 🔴 **Admin panel empty** | all | Every `admin.py` is empty — no Django admin entries for any model |
| ✅ **Working as expected** | 0 | Nothing is wired correctly today |

**Bottom line: the frontend is not actually talking to this backend yet.** The frontend was built for a different (older?) backend with bare paths like `/products/create`. The new `alpha_pos` backend is REST-style (`POST /api/admins/products`) with multi-role prefixes (`/api/admins/`, `/api/waiters/`, `/`).

---

## 1. Auth — already working ✅

### What the frontend sends
- **Login:** `POST /auth-login` body `{email, password}`
- **All other requests:** `Authorization: Bearer <session_key>` (key from `localStorage.auth_token`)
- See [src/boot/axios.ts:20-28](src/boot/axios.ts#L20-L28) and [src/pages/PinPage.vue:194](src/pages/PinPage.vue#L194)

### What the backend reads
From `C:\Users\Jason\Desktop\Projects\alpha_pos\base\helpers\request.py:16-23`:
```python
def get_session_key(request):
    key = request.COOKIES.get('session_key')
    if key:
        return key
    auth = request.META.get('HTTP_AUTHORIZATION', '')
    if auth.startswith('Bearer '):
        return auth[7:]
    return None
```

The frontend's `Authorization: Bearer <session_key>` is read on the second branch and used to look up the `Session` row. **Auth works as-is — no changes needed on either side.**

### Login endpoints (3 role-scoped variants)
- `POST /auth-login` → cashier/customer (this is what the frontend uses today)
- `POST /api/admins/auth-login` → admin
- `POST /api/waiters/auth-login` → waiter

All return: `{ success: true, data: { token: "<session_key>", user: {...} }, message: "..." }`

The frontend stores the returned token as `localStorage.auth_token`. The custom `@login_required` decorator in `base/security/auth.py` validates it on every protected request.

⚠️ **One implication:** the cashier login at `/auth-login` returns a session that satisfies `@login_required`, but admin endpoints under `/api/admins/...` use `@admin_required` which probably also checks `request.user.role == 'ADMIN'`. So a user logging in via PinPage as a CASHIER will NOT be able to hit `/api/admins/categories`, `/api/admins/products`, `/api/admins/users`, etc. The settings pages (Products, Categories, Users) require an ADMIN-role login. This is expected — settings are admin-only — but the frontend currently has no admin-login flow distinct from cashier login. All login goes through the same `/auth-login`. As long as the user logging in HAS role=ADMIN, the same session key works on both `/orders` (cashier) and `/api/admins/*` (admin). The `requiresAdmin` route guard ([src/router/routes.ts:51](src/router/routes.ts#L51)) is presumably checking the local user's role.

---

## 2. URL Pattern Mismatches

The frontend uses verb-suffixed paths (`/create`, `/update`, `/delete`); the backend uses REST-style methods on the resource. Plus the frontend hits bare paths but admin actions live under `/api/admins/`.

### Categories

| Frontend call | Backend reality | Fix |
|---|---|---|
| `GET /categories?status=ACTIVE&per_page=100` | `GET /api/admins/categories?status=ACTIVE&per_page=100` ✅ exists with same params | Frontend: change URL prefix |
| `POST /categories/create` | `POST /api/admins/categories` | Frontend: change URL + drop `/create` |
| `PUT /categories/{id}/update` | `PUT/PATCH /api/admins/categories/{id}` | Frontend: change URL + drop `/update` |
| `DELETE /categories/{id}/delete` | `DELETE /api/admins/categories/{id}` | Frontend: change URL + drop `/delete` |
| `PUT /categories/{id}/update {sort_order}` (drag-reorder) | `POST /api/admins/categories/reorder {ids: [...]}` | Frontend: change to bulk reorder, send array of IDs in new order |

Frontend files: [src/pages/settings/CategoriesSettings.vue](src/pages/settings/CategoriesSettings.vue), [src/pages/CreateOrderPage.vue:374](src/pages/CreateOrderPage.vue#L374), [src/pages/settings/ProductsSettings.vue:343](src/pages/settings/ProductsSettings.vue#L343).

### Products

| Frontend call | Backend reality | Fix |
|---|---|---|
| `GET /products?search=&per_page=&category_ids=` | `GET /api/admins/products?...` ✅ same params | Frontend: change URL prefix |
| `GET /products?per_page=500` | `GET /api/admins/products?per_page=500` ✅ | Frontend: change URL prefix |
| `POST /products/create` | `POST /api/admins/products` | Frontend: change URL + drop `/create` |
| `PUT /products/{id}/update` | `PUT/PATCH /api/admins/products/{id}` | Frontend: change URL + drop `/update` |
| `DELETE /products/{id}/delete` | `DELETE /api/admins/products/{id}` | Frontend: change URL + drop `/delete` |

Frontend files: [src/pages/CreateOrderPage.vue:457](src/pages/CreateOrderPage.vue#L457), [src/pages/settings/ProductsSettings.vue](src/pages/settings/ProductsSettings.vue).

### Orders

Frontend hits bare paths; backend exposes them under `/orders` (cashier scope) AND `/api/admins/orders` (admin scope). The bare versions exist for cashiers, so most order endpoints work as-is — IF the cashier auth flow is working.

| Frontend call | Backend reality | Status |
|---|---|---|
| `POST /orders/create` | `POST /orders/create` (cashier) | ✅ URL match |
| `GET /orders?statuses=&per_page=` | `GET /orders?statuses=&per_page=` (cashier) | ✅ URL match |
| `GET /orders/{id}` | `GET /orders/{id}` (cashier) | ✅ URL match |
| `POST /orders/{id}/ready` | `POST /orders/{id}/ready` (cashier) | ✅ URL match |
| `PATCH /orders/{id}/status` | `PATCH /orders/{id}/status` (cashier) | ✅ URL match |
| `POST /orders/{id}/pay` | `POST /orders/{id}/pay` (cashier) | ✅ URL match |

Orders should work end-to-end ONCE auth is fixed.

### Client display

| Frontend call | Backend reality | Fix |
|---|---|---|
| `GET /display/client` | `GET /orders/client-display` (no auth required) | Frontend: rename URL |

Frontend file: [src/pages/ClientDisplayPage.vue:389](src/pages/ClientDisplayPage.vue#L389).

---

## 3. Missing Endpoints (need backend work)

### 🔴 User management — completely absent

The frontend has a full users CRUD UI ([src/pages/settings/UsersSettings.vue](src/pages/settings/UsersSettings.vue)) and lists users on the index ([src/pages/IndexPage.vue:73](src/pages/IndexPage.vue#L73)). The backend has the `User` model but exposes ZERO HTTP endpoints to manage it. Users can currently only be created via Django shell or admin panel — and the admin.py is empty too (see §4).

| Frontend call | Backend reality |
|---|---|
| `GET /users` (returns `{success, data: {users:[...]}}`) | ❌ does not exist |
| `POST /users/create` | ❌ does not exist |
| `PUT /users/{id}/update` | ❌ does not exist |
| `DELETE /users/{id}/delete` | ❌ does not exist |

→ Captured as Tasks #2–#5 in BACKEND_TASKS.md.

### 🔴 Inkassa (cash box) — completely absent

The `Inkassa` model exists in `base/models.py` and there's a service class — but **no HTTP routes wire it up**. The frontend's entire CashBoxPage feature is broken.

| Frontend call | Backend reality |
|---|---|
| `GET /inkassa/balance` | ❌ does not exist |
| `GET /inkassa/stats` | ❌ does not exist |
| `GET /inkassa/history?page=` | ❌ does not exist |
| `GET /inkassa/{id}` | ❌ does not exist |
| `POST /inkassa/perform {cash?, uzcard?, humo?, payme?}` | ❌ does not exist |

Frontend file: [src/pages/CashBoxPage.vue](src/pages/CashBoxPage.vue) (lines 654, 664, 674, 686, 714).

→ Captured as Tasks #6–#10 in BACKEND_TASKS.md.

---

## 4. Django Admin Panel — completely empty

Every `admin.py` is empty. No model is registered with `admin.site.register(...)`. This means the `/admin/` page only shows Django's built-in `auth.User` and `auth.Group` (which aren't even the real `User` model — that's `base.User`).

| App | admin.py status |
|---|---|
| `base/admin.py` | empty |
| `customers/admin.py` | empty |
| `admins/admin.py` | empty |
| `discounts/admin.py` | empty |
| `hr/admin.py` | empty |
| `notifications/admin.py` | empty |
| `stock/admin.py` | empty (assumed) |
| `waiters/admin.py` | empty (assumed) |

Models that need registration (at minimum, to satisfy "I need an admin panel"):
- `base.User` (custom auth model — the most important one)
- `base.Category`, `base.Product`
- `base.Order`, `base.OrderItem`
- `base.Place`, `base.Table`, `base.DeliveryPerson`
- `base.CashRegister`, `base.Inkassa`
- `base.Shift`, `base.ShiftTemplate`, `base.CashReconciliation`
- `base.AppSettings`
- `discounts.DiscountType`, `discounts.Discount`
- `notifications.NotificationSettings`, `NotificationTemplate`, `NotificationLog`

→ Captured as Task #11 in BACKEND_TASKS.md, with copy-pasteable snippets.

---

## 5. Response Envelope (good news)

Backend already returns the envelope shape the frontend expects:
```json
{
  "success": true,
  "data": { "<resource>": [...], "pagination": {...} },
  "message": "..."
}
```

Frontend code like [src/pages/IndexPage.vue:73-75](src/pages/IndexPage.vue#L73-L75) reads `response.data.data.users` — that matches. ✅

---

## 6. Settings the backend is missing

`alpha_pos/settings.py` lacks:
- ❌ `corsheaders` in INSTALLED_APPS (frontend served from a different origin during dev → CORS errors likely)
- ❌ `corsheaders.middleware.CorsMiddleware` in MIDDLEWARE
- ❌ `CORS_ALLOWED_ORIGINS` or `CORS_ALLOW_ALL_ORIGINS = True`
- ❌ `REST_FRAMEWORK` config — irrelevant since the app doesn't use DRF, but worth confirming

For a packaged Electron app this may not matter (Electron renderer can bypass CORS), but for `quasar dev` in the browser it will. → Captured as Task #12.

---

## 7. Full endpoint matrix

See the Static Survey output (already in this audit conversation) for the complete list of 200+ backend endpoints across 8 apps. The frontend currently uses 26 of them; the rest (stock, HR, discounts, notifications) are unused.

---

## Next Steps

1. **Read [BACKEND_TASKS.md](BACKEND_TASKS.md)** for the prioritized checklist of backend changes (with copy-pasteable snippets).
2. **Frontend wiring fixes** are applied in this same session — see commits / file diffs.
3. **Recommended order:**
   - Fix auth header reading (Task #1) ← blocks everything
   - Add `/users` CRUD (Tasks #2–5) ← unblocks login screen
   - Wire admin URLs in frontend (`/api/admins/...` prefix) ← unblocks settings pages
   - Add Inkassa endpoints (Tasks #6–10) ← unblocks CashBox
   - Register all models in Django admin (Task #11) ← gives you the admin panel you wanted
   - Add CORS (Task #12) ← needed for `quasar dev` in browser
