# Smart POS — Architecture Overview

A touch-screen restaurant POS built with **Quasar (Vue 3) + Electron**, deployed
as a fullscreen kiosk on a 15" monoblock (and usable on tablets). The renderer is
a hash-routed SPA; the Electron main process owns the windows, persistent storage,
OS integration, and printing. The backend (`alpha_pos`, Django) runs on the
kitchen "main computer" on the LAN and is treated as **read-only** — the frontend
adapts to it.

## Processes & windows

The main process (`src-electron/electron-main.ts`):

- Enforces a **single instance** (`requestSingleInstanceLock`). Multiple processes
  would race on the same persisted store and silently lose settings (e.g. the
  saved server IP), so a second launch just focuses the existing window.
- Creates the **main window**: fullscreen `kiosk: true`, `contextIsolation: true`,
  loads the preload bundle.
- Optionally creates the **client display window** (second customer-facing
  monitor) routed to `#/client-display`. It auto-opens only when (1) a second
  monitor is connected, (2) no client window exists, and (3)
  `display.clientDisplayEnabled` is on. Plugging/unplugging a monitor
  (`screen.on('display-added' | 'display-removed')`) re-runs setup. With no second
  monitor it can open as a windowed **preview** instead.
- `webSecurity: false` is intentional — it bypasses CORS for the closed-LAN kiosk
  because the backend's CORS headers weren't reliably present. Safe only because
  this is a trusted kiosk on a closed LAN. Revisit if the deployment model changes.

## Renderer ↔ main IPC surface

All IPC is exposed through a **typed, channel-specific bridge** in
`src-electron/electron-preload.ts` (`contextBridge.exposeInMainWorld`). There is
**no generic `ipcRenderer.invoke(anyChannel)` passthrough** — the renderer can only
reach the channels enumerated below, so a compromised renderer can't call arbitrary
main-process handlers. Types live in `src/types/electron.d.ts`.

`window.electron`:

| Namespace | Methods | Main handler |
|---|---|---|
| `kv` | `get / set / delete / clear / getAll` | `kv-store.ts` |
| `system` | `openWifi · openNetwork · openPrinters · getLocalIps · probeTcp · scanForServers · cancelScan` | `system-handler.ts` |
| `settings` | `getDisplay/saveDisplay · getReceipt/saveReceipt · getPrinter/savePrinter` | `settings-handler.ts` |
| `clientDisplay` | `status · open · onSettingsUpdated(cb)` | `electron-main.ts` (`client-display:*`) + settings broadcast |
| `printer` | `test · printReceipt(data)` | `print-handler.ts` (`print-test`, `print-receipt`) |

`window.backend`: `onError(cb)` / `onLog(cb)` — backend log/error events pushed from
main (`backend-error`, `backend-log`).

When adding a feature that needs main-process access: add a method to the relevant
namespace in the preload, declare it in `electron.d.ts`, and register the handler in
main. Do **not** reintroduce a generic channel passthrough.

## Persistent storage (kv-store)

`src-electron/kv-store.ts` wraps **`electron-store`** in a single file at
`<userData>/kv-store.json`. It is schema-less by design — the renderer owns the
value shapes. Atomic writes (write-file-atomic) make it safe across power loss and
across windows, which is why it replaced `localStorage` (Chromium LevelDB raced
between instances).

The renderer accesses it through `src/utils/storage.ts`, which keeps a synchronous
in-memory cache hydrated once at boot (`initStorage()` → single `kv:getAll` IPC) so
that code like the axios request interceptor can `read()` synchronously. `write()`
updates the cache and persists via `kv:set`.

Known keys (renderer-owned):

- `pos:IpAdress` — backend host/IP. Resolved into `baseURL` at boot.
- `auth_token` — bearer token.
- `auth_user` — `{ role: 'ADMIN' | 'CASHIER' | 'MANAGER', ... }`. Read by the router guard.
- `pos:cachedUsers` — user-picker grid cache (backend has no public user-list pre-auth).
- `pos:supportPhone` — support number shown in network diagnostics.

## Auth & offline policy

- **A reachable local backend is required.** There is **no offline login** — if the
  backend doesn't answer, login is blocked with a clear message
  ("Server bilan aloqa yo'q. Lokal serverni tekshiring."). There is no cached
  PIN-hash fallback.
- Login flow: `IndexPage` (user picker, or admin manual login on a fresh terminal)
  → `PinPage` (4-digit PIN → `POST /auth-login`) → on success writes `auth_token` +
  `auth_user`, caches the user for the picker, routes to `orders`.
- `src/boot/axios.ts`: `baseURL = http://<pos:IpAdress>:8000` (falls back to
  `http://127.0.0.1:8000` on first boot). A request interceptor attaches the bearer
  token; a response interceptor on **401** clears `auth_token` and redirects to the
  user picker.
- **Network awareness:** `useNetworkStatus` polls the backend; `NetworkDiagnostics`
  is a fullscreen overlay that helps a non-technical worker find/repair the LAN
  connection (local-IP detection + `/24` TCP scan via `system-handler.ts`). It
  silently tries `127.0.0.1` once before bothering the user.

## Routing & access control

Hash-routed (`vueRouterMode: 'hash'`). Routes in `src/router/routes.ts`; the guard
in `src/router/index.ts`. Settings routes carry `meta.requiresAdmin: true`, and
`router.beforeEach` reads `auth_user.role` from the kv cache and redirects non-admins
(to `orders` if logged in, else the user picker). The guard is shaped to later swap
`requiresAdmin` for a `meta.permissions[]` model.

Key routes: `users` (`/`), `pin`, `orders`, `create-order`, `kds`,
`client-display`, `cash-box`, and the admin-only `settings/*` tree
(receipt · printer · display · categories · users · products).

## Settings & printing

`src-electron/settings-handler.ts` persists `AppSettings` (`receipt`, `printer`,
`display`) to `<userData>/app-settings.json`, merged over defaults on load and cached
in memory. Per-section get/save channels are exposed. Saving **display** settings
broadcasts `display-settings-updated` to all windows (live update on the customer
display) and toggles the client-display window open/closed immediately when
`clientDisplayEnabled` flips — no app restart.

Printing (`print-handler.ts`): `print-receipt` (from `CreateOrderPage`) and
`print-test` (from receipt/printer settings). Printer config: IP, port (default
9100), paper width (58/80 mm).

## Polling

The cashier `OrdersPage` and the kitchen `KDSPage` both poll every **3s**
(`POLL_INTERVAL_MS`). Orders polling suspends while a dialog is open (so the list
doesn't reshuffle under a finger mid-payment) and background polls don't show a
spinner or clear the list on transient failure. Real-time push (WebSocket/SSE) is a
future item, blocked on the backend exposing a channel.

## Deployment

- **Build:** `quasar build -m electron` → `dist/electron/`. Packaged with
  `electron-builder` (NSIS installer, `appId: com.smartpos.app`).
- **Kiosk:** main window is fullscreen kiosk on the primary display. Optional
  customer display on a second monitor.
- **First run on a new terminal:** the picker is empty (no public user-list
  endpoint), so an admin logs in once via "manual login" to seed `pos:cachedUsers`;
  afterwards cashiers just tap their face + PIN.
- **Server IP:** set in the home-page settings modal or inline from the network
  diagnostics panel; persisted to `pos:IpAdress` and applied via a full
  `window.location.reload()` (re-runs the axios boot so the new `baseURL` is
  resolved and the kv migration re-checks).
- See the auto-memory note "Windows host setup for backend" for the kitchen PC's
  firewall / network-profile / Django bind / antivirus / router requirements.
