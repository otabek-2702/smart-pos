# CTI Operator Mode

Lets an operator pair a phone to this POS over the LAN; the phone streams caller
numbers and the app reacts on each call. **No backend changes** — customer/order
lookups use the existing `/orders` endpoint only.

## Flow
1. Operator taps **"Operator rejimi"** (Orders-page footer). The app starts a
   LAN WebSocket server and shows a **QR** (`ws://<lan-ip>:8765?token=<token>`).
2. The operator's phone scans it and connects (the `?token` must match or the
   connection is rejected).
3. On each call the phone sends a JSON frame. The app either:
   - **pops the incoming-call dialog** with the caller's open orders, or
   - if the operator is already on the **create-order** page, **silently fills**
     the caller number into the phone field (no dialog).

## Wire protocol (phone → app)
```json
{ "type": "call_start", "phone": "<raw number>", "direction": "in" | "out" }
{ "type": "call_end",   "phone": "<raw number>" }
```
Numbers are normalised for lookup by stripping non-digits and taking the **last
9 digits** (Uzbek national mobile).

## What changed
**Electron main** — `src-electron/operator-handler.ts` (new): `ws` server on
`0.0.0.0:8765`, random hex token, `?token` auth, forwards each JSON message to
the renderer as `operator:call-event`. IPC `operator:start` (returns
`{ url }` with the LAN IPv4) / `operator:stop`. Registered in
`src-electron/electron-main.ts`.

**Preload** — `src-electron/electron-preload.ts`: exposes
`window.operator = { start(), stop(), onCallEvent(cb) }` (typed in
`src/types/electron.d.ts`).

**Store** — `src/stores/operator.ts` (Pinia `operator`): state
`operatorMode / qrDataUrl / activeCall / popup`; actions `toggle()` (start/stop +
`QRCode.toDataURL`), `init(router)` (registers the single call-event listener),
`onCallEvent`, `dismissPopup`, `goToOrder`, `createOrder`. On `call_start` it
sets `activeCall`; off the create-order page it looks up the caller and sets
`popup`.

**UI** — `OperatorModeButton.vue` (footer toggle, green when ON),
`OperatorQrDialog.vue` (QR pairing), `IncomingCallDialog.vue` (caller + open
orders + "Create new order"). The two dialogs are mounted **once** in
`src/layouts/MainLayout.vue`, which also calls `operator.init(router)` on mount.

**Create-order** — `src/pages/CreateOrderPage.vue` pre-fills the phone field
from `route.query.phone` (navigated in from the dialog) **or** `activeCall.phone`
(live call while already on the page, via a watcher).
`src/components/OrderDetailsDialog.vue` now accepts a `phone` prop and seeds its
editable digits from it.

## "Open orders" definition
Not yet closed = **NOT paid OR NOT prepared (READY)**, excluding `CANCELLED`.
Derived client-side from the `/orders` list (it has no phone filter, so a recent
page is fetched and matched by normalised phone).

## Assumed names (constants at the top of `src/stores/operator.ts`)
- `ORDERS_ENDPOINT = '/orders'`, fetch params `{ per_page: 200, order_by: '-created_at' }`
- `CREATE_ORDER_ROUTE = 'create-order'`, `ORDERS_ROUTE = 'orders'`

Notes: there is **no per-order detail route** in this app, so an open-order row
navigates to the orders list. The toggle lives in the Orders footer because
`MainLayout` has no toolbar. The QR can be dismissed locally after pairing while
operator mode stays on. `ws` is a main-process runtime dependency; `qrcode`
renders the QR in the renderer.
