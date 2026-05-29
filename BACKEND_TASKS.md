# Backend Tasks for `alpha_pos`

**Status as of 2026-05-09: all 12 tasks shipped.** Verified against the live `alpha_pos` source. This file is kept for historical reference only — no outstanding backend work tracked here.

| # | Task | Status | Evidence |
|---|---|---|---|
| 1 | `Authorization: Bearer` header in `get_session_key` | ✅ DONE | `base/helpers/request.py:16-23` |
| 1b | Admin role bypasses `@permission_required` | ✅ DONE | `base/security/permissions.py:48` (`'*' in user_perms or role == 'ADMIN'`); seeded admin has `permissions=['*']` |
| 2 | `GET /api/admins/users` (list, paginate, filter) | ✅ DONE | `admins/views/user_views.py:16`, `admins/urls.py:72` |
| 3 | `POST /api/admins/users` (create) | ✅ DONE | `admins/views/user_views.py:29-41` |
| 4 | `PUT/PATCH /api/admins/users/<id>` (update) | ✅ DONE | `admins/views/user_views.py:52-58`, `admins/urls.py:73` |
| 5 | `DELETE /api/admins/users/<id>` (delete) | ✅ DONE | `admins/views/user_views.py:60-62` |
| 6 | `GET /inkassa/balance` | ✅ DONE | `admins/views/inkassa_views.py:15-17`, `admins/urls.py:75` |
| 7 | `GET /inkassa/stats` | ✅ DONE | `admins/views/inkassa_views.py:23-25`, `admins/urls.py:76` |
| 8 | `GET /inkassa/history` | ✅ DONE | `admins/views/inkassa_views.py:31-34`, `admins/urls.py:77` |
| 9 | `GET /inkassa/<id>` | ✅ DONE | `admins/views/inkassa_views.py:40-42`, `admins/urls.py:79` |
| 10 | `POST /inkassa/perform` | ✅ DONE | `admins/views/inkassa_views.py:48-54`, `admins/urls.py:78` |
| 11 | Django admin model registrations | ✅ DONE | `base/admin.py` (13 models), `discounts/admin.py` (4), `notifications/admin.py` (3), `hr/admin.py` (16), `stock/admin.py` (23). `admins/admin.py` and `customers/admin.py` are stub-only — these don't own models, so empty is correct. |
| 12 | `django-cors-headers` configured | ✅ DONE | `requirements.txt:9`, `settings.py:33` (INSTALLED_APPS), `:45` (MIDDLEWARE), `:285-291` (`CORS_ALLOW_ALL_ORIGINS=True` in DEBUG) |

## ⚠️ Open: CORS in real run env (2026-05-11)

Backend ships `django-cors-headers` per task #12, but the response observed in DevTools when the frontend talks to `:8000` does NOT include `Access-Control-Allow-Origin`. Renderer's axios call fails CORS even though the network tab shows the 401 response was returned.

Likely cause: the conditional in `settings.py:285-291` only enables `CORS_ALLOW_ALL_ORIGINS = True` when `DEBUG=True` AND no explicit `CORS_ALLOWED_ORIGINS` is set. The actual run env is probably either non-DEBUG or has an explicit `CORS_ALLOWED_ORIGINS` that doesn't include `http://localhost:9300` and `file://`.

**Fix on backend side:**
```python
# In the dev run config — pick ONE:

# A) Just set this in .env / Django settings for dev:
CORS_ALLOW_ALL_ORIGINS = True
CORS_ALLOW_CREDENTIALS = True

# B) Or explicitly list the renderer origins:
CORS_ALLOWED_ORIGINS = [
    "http://localhost:9300",
    "http://127.0.0.1:9300",
]
CORS_ALLOWED_ORIGIN_REGEXES = [r"^file://"]
CORS_ALLOW_CREDENTIALS = True
```

**Until this is fixed:** `webSecurity: false` stays in both `BrowserWindow` configs in `src-electron/electron-main.ts` (renderer CORS bypass). Once CORS headers actually arrive on responses, that flag can be deleted.

## ⚠️ Open: public user-list endpoint for the kiosk picker (2026-05-13)

**Why:** the smart-pos UX shows a grid of user avatars on the IndexPage so cashiers tap their own face and only have to enter a PIN — they should never have to type or even know their email. Today the only user-list endpoint (`GET /api/admins/users`) requires `@admin_required`, which can't work on a cashier's terminal that nobody is logged into yet. Result: a fresh terminal can't display anyone in the picker.

**Required endpoint (public, no auth):**

```
GET /auth/users-for-login?status=ACTIVE
```

Response:
```json
{
  "success": true,
  "data": {
    "users": [
      {
        "id": 21,
        "first_name": "Admin",
        "last_name": "User",
        "role": "ADMIN",
        "avatar_url": null
      },
      {
        "id": 22,
        "first_name": "Drew",
        "last_name": "Thompson",
        "role": "CASHIER",
        "avatar_url": null
      }
    ]
  },
  "message": "OK"
}
```

**Design constraints:**
- **No auth required** — endpoint must be callable by a terminal before any user has signed in.
- **No `email` field returned** — the frontend uses `id` to identify which user the cashier picked. Returning email would defeat the privacy goal.
- **Filter `?status=ACTIVE`** — terminated/inactive users shouldn't appear in the picker.
- Recommended cache headers: `Cache-Control: private, max-age=60` so a chatty refresh doesn't hammer the DB.

**Accompanying login change (small, important):**

The existing `POST /auth-login` accepts `{email, password}`. For the picker flow, we need it to also accept `{user_id, password}` so the frontend never sees the user's email:

```python
# customers/views/auth_views.py:login (or wherever)
def login(request):
    body = json.loads(request.body)
    if 'user_id' in body:
        user = User.objects.filter(id=body['user_id'], status='ACTIVE').first()
    else:
        user = User.objects.filter(email=body.get('email'), status='ACTIVE').first()
    # ... rest of the existing auth flow
```

Both code paths produce the same session token. The frontend will prefer `user_id` when available; `email` stays as a fallback for the rare admin-typing-email setup flow.

**Until this ships:** the picker on a fresh terminal will be empty. We've left a discreet "Birinchi marta sozlash" (first-time setup) link in the empty state that opens an admin email+password modal; the admin's session then populates the cache via `/api/admins/users` and the picker is usable for cashiers from that point on. Once the public endpoint exists, that setup link can be removed.

## Frontend follow-ups now unblocked

Now that all 12 are done, the frontend has these pending cleanups:

- [ ] **Frontend URL prefixes** — switch `/users/*` and `/inkassa/*` calls in `UsersSettings.vue`, `IndexPage.vue`, and `CashBoxPage.vue` to the real `/api/admins/users/*` and `/api/admins/inkassa/*` paths the backend exposes. Remove the "API not available" graceful-fallback banners from `UsersSettings.vue` and `CashBoxPage.vue` once the wires hit live endpoints.
- [ ] **Remove `webSecurity: false`** from both `BrowserWindow` configs in `src-electron/electron-main.ts` (CORS now handled by backend → renderer can enforce origin checks normally).
- [ ] **Re-test admin write actions** in the live app — settings pages should now POST/PUT/DELETE successfully (the 403s from before were the missing admin-permissions, now resolved).

These belong in the next implementation pass, not in this backend task file.
