# Courier / delivery ecosystem — backend asks (alpha_pos_local)

**Status 2026-07-05:** ✅ **Courier backend BUILT + DEPLOYED** on the SERVER edition
(`alpha_pos_server` `couriers` app, live at pos.78.111.90.65.nip.io): `/auth/courier/login`,
`/courier/me|orders/active|completed|stats/today|balance|notifications|shift/*`,
`/orders/{id}/accept|decline|status`, `/payments/*`, WS `/ws/courier/`. Its `presenters.py`
matches the app's zod schemas exactly (camelCase). **App wired live** (`alpha-pos-deliver`
commit 568eda2): client + WS use the QR-paired server (serverConfig, env fallback), start-up
hydrates serverConfig + session, real expo-camera QR scanner → pair → login. Remaining: run
`npx expo install expo-camera` + rebuild the dev client; create couriers + login QR from the
admin panel. — historical planning below.

**Status 2026-07-01:** Abrorbek confirmed the courier app is feasible but net-new
(DeliveryPerson has no credentials; no payment endpoints on local — mirror the
server couriers app's record-only payments). The **exact per-endpoint contract**
(request/response shapes the app parses, from its zod schemas) was **sent to him**
(dev-bot msgs 60/61) — see §"Exact contract" below. He'll scope + build; then FE
flips `USE_MOCK` off + wires the QR pairing. Telegram-order auto-print: **awaiting
his exact source/channel field on the local Order + the print trigger** before FE
wiring. Shift-close bug: **resolved** (was the unpaid-open-orders 400 guard the FE
was hiding; FE now surfaces it — confirmed working on the latest release).

---

## Exact contract (sent to dev, msgs 60/61) — money = integer so'm; timestamps ISO; `Authorization: Token <token>`

- **Auth**: `POST /auth/courier/login {phone?,password? | qr?}` → `{token, expires_at}` (+ refresh). `qr` = one-time claim from the login QR.
- **Self**: `GET /courier/me` → `{first,last,phone,vehicle,plate,id,branch,rating,online}`
- `GET /courier/orders/active` → `[{id,step,payment,total,fee,placedAt,etaReady,customer:{name,phone},address:{text,landmark?,coords:{lat,lng}|null,distanceKm?},lines:[{name,qty,price}]}]` — step=ASSIGNED|READY|PICKED_UP|ON_WAY|DELIVERED; payment=PAID|UNPAID
- `GET /courier/orders/completed` → `[{id,total,fee,payment,deliveredAt,minutes,customer:{name},area}]`
- `GET /courier/stats/today` → `{deliveries,earnings,cashCollected,avgMinutes,activeHours,distanceKm,byHour:[{h,n}]}`
- `GET /courier/balance` → `{balance,held,ledger:[{at,kind:hold|settle|cancel,order,amount,label}]}`
- `GET /courier/notifications` → `[{id,icon,tone,title,body,at,unread,order}]`
- `GET /courier/shift/reconciliation` → `{collected_cash,qr_collected,delivery_fees,bonuses,tips,cash_orders,qr_orders,shift_start,handover_code,net_payout,cash_in_hand}` (snake_case)
- **Actions**: `POST /orders/{id}/accept` · `/decline {reason?}` · `/status {step:PICKED_UP|ON_WAY|DELIVERED}` · `POST /courier/shift/online {online:bool}` · `/courier/shift/settle` · `/courier/push-token {token,platform}`
- **Payments** (record-only): `POST /payments/create {order,provider,amount}` → `{payment_id,status(PAID|PENDING|REFUNDED|FAILED),link?,qr_png?}` · `POST /payments/{id}/refund`
- **Realtime** `WS /ws/courier/?token=` → events `order.assigned` (data + `expires_in`), `order.ready`, `order.status`, `order.cancelled`, `payment.paid`, `payment.refunded`; frame `{event, data:{order_id,...}}`
- **Create courier + QR** (till, manager): `POST /couriers {first_name,last_name,phone}` → creates DeliveryPerson + credential; returns QR payload `{server, token}` + a regenerate endpoint; token expiry/refresh.

---

Goal: a working courier flow. Cashier creates a courier in the POS → gets a login
QR → courier scans it on the phone (smart-pos-deliver app) → app saves the server
base URL + logs in (token WITH expiry) → courier sees assigned deliveries, updates
status, collects payment. Plus a reworked delivery-data entry on the till (one
phone, structured address, returning-customer's saved places).

State (surveyed 2026-06-26):
- **Courier app** `smart-pos-deliver` (React Native/Expo): UI complete, runs on MOCK
  data. Expects a courier API + WS that DOES NOT exist on the local edition. QR scan
  is a stub (no camera, no base-URL extraction). Token has no expiry/refresh.
- **Backend** local edition: NO courier login, NO `COURIER` role, `DeliveryPerson`
  has no credentials, NO courier-self endpoints, NO create-courier, NO delivery
  address model/history. Only `GET /couriers` (list) + `POST /orders/{id}/courier`
  (assign) + client lookup by phone (name + order history + frequent_products, NO
  addresses).

⇒ Almost everything below is **backend work for Abrorbek**. The FE (desktop rework +
finishing the courier app's QR/real-API plumbing) follows once the contract lands.

---

## 🔴 1. Courier auth + token (with expiry)
`DeliveryPerson` has no credentials and there's no `COURIER` login. The app calls:
- `POST /auth/courier/login` body `{ phone?, password?, qr? }` → `{ token, expires_at }`
  (+ a refresh path, since the user wants token **expiration**).
- All courier calls send `Authorization: Token <token>`.
Decide: give `DeliveryPerson` credentials, or back couriers with a `User(role=COURIER)`.

## 🔴 2. Courier-self API (what the app calls)
- `GET /courier/me` — profile + shift/online state.
- `GET /courier/orders/active` · `GET /courier/orders/completed` — this courier's deliveries.
- `GET /courier/stats/today` — deliveries / earnings / distance.
- `GET /courier/balance` — cash balance, held total, ledger.
- `GET /courier/notifications`.
- `GET /courier/shift/reconciliation` — collected/qr/tips + handover code.
- `POST /orders/{id}/accept` · `/decline {reason?}` · `/status {step: PICKED_UP|ON_WAY|DELIVERED}`.
- `POST /courier/shift/online {online: bool}` · `/courier/shift/settle`.
- `POST /courier/push-token {token, platform}`.

## 🔴 3. Realtime — `WS /ws/courier/?token=<token>`
Events the app listens for: `order.assigned`, `order.ready`, `order.status`,
`order.cancelled`, `payment.paid`, `payment.refunded`. (InMemory channel layer on
local; the app auto-reconnects.)

## 🔴 4. Create courier from the till + login QR
- `POST /couriers {first_name, last_name, phone}` (manager-gated) → creates the
  `DeliveryPerson` + its login credential, returns what the QR needs.
- QR encodes **{ server base URL, login/claim token }** so the app, on scan, saves
  the base URL and exchanges the token for a courier token. Add **regenerate QR**
  for an existing courier (and token expiry/rotation).

## 🟠 5. Delivery address (structured) + customer address history
Today an order has only `description` (free text); customers store no addresses.
- Add a structured **`address`** field on the order (separate from `description`).
- Store **address history per customer**; include `addresses: [{id, label, address, ...}]`
  in `GET /clients?phone=` so the till can show a returning customer's previous
  delivery places ("old delivered places") to pick from.

## 🟠 6. Payments the app calls (confirm / build)
- `POST /payments/create {order, provider, amount}` → pay-link.
- `POST /payments/{id}/refund`.
Confirm whether these exist on the local edition or need building.

---

## Already shipped (FE wired, do not re-ask)
- `GET /couriers` list, `POST /orders/{id}/courier` assign, `delivery_person` on order serializers, `POST|PATCH /orders/{id}/details`, `PATCH /orders/{id}/type`. FE: courier picker in OrderInfoDialog + PaymentConfirmationDialog; client lookup `GET /clients?phone=` returns name + history + frequent_products.

## FE follow-ups (after the backend lands)
- Desktop: full-screen delivery-data entry — one phone, phone→client name lookup
  (new ⇒ ask a name to save; returning ⇒ show name + previous places), structured
  address field (needs §5), description separate.
- Courier app: real QR camera scan → parse base URL + token → save → login (§1,§4);
  flip `USE_MOCK` off; wire token-expiry handling; GPS + push (later).
