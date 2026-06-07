# Smart POS frontend (`smart-pos`) — technical questionnaire

This questionnaire is meant to help the team **see where things stand** and to **open discussions** about scope, risk, and next steps. It is a planning aid, not a scorecard. **Suggestions about this process** (how we run reviews or this form) are welcome. **Please add to this document** any **features or issues** you know about that are **not mentioned** in the questions below (short bullets are fine).

**Scope:** `smart-pos` only.

**Owner name:** Otabek (smart-pos frontend)

> Timeline answers in this document are intended as **rough commitments**. They will be re-entered in our **work management tool** once that workflow is integrated; this form is the starting point, not the system of record.

**Q0 (documentation)** Beyond `smart-pos/README.md` (install/build only), there is no feature or architecture overview in this package. Will you add a short overview (for example `smart-pos/docs/overview.md`)? If yes, target date; if no, where does that information live?  
→ Yes — will add `docs/overview.md` covering: (1) renderer ↔ Electron main IPC surface, (2) auth + offline-login flow, (3) kv-store layout, (4) print/settings handlers, (5) deployment shape (kiosk on 15" POS + optional second monitor for client display). Target: end of next sprint, alongside the cleanup work in Q11/Q12.

---

## Executive summary


| Topic                  | Notes                                                                                                                                                                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Application**        | Quasar + Vue 3 + TypeScript POS client: user pick → PIN → orders; routes also include KDS, client display, cash box, and settings (`src/router/routes.ts`).                                                                        |
| **Strengths observed** | Strict TS and lint/typecheck in dev (`quasar.config.ts`, `package.json`); single Axios instance with bearer token and 401 handling (`src/boot/axios.ts`); Electron main uses `contextIsolation` (`src-electron/electron-main.ts`). |
| **Areas to confirm**   | Server `baseURL` behavior, admin access to settings routes, Electron IPC surface, orders refresh expectations, test strategy.                                                                                                      |
| **Documentation**      | Feature and deployment intent are not written down in this package beyond the README.                                                                                                                                              |


**Ship readiness:** Record the decision after **Q13–Q15**.

---

## Instructions

Answer each **→** inline, or paste answers under each **Q**. Omit sections that do not apply.

---

## 1) Server connection & API client

**Implemented:** Backend host in `localStorage` (`pos:IpAdress`), Axios `baseURL`, bearer token, 401 redirect — `src/boot/axios.ts`, `src/pages/IndexPage.vue`.

**Q1** With no IP stored yet, should default `baseURL` and the post-“Save” value both follow one agreed shape (for example `http://<host>:8000`)?  
→ Agreed shape: `http://<host>:8000`. Already enforced in `src/boot/axios.ts` (boot resolves `read('pos:IpAdress') → http://${ip}:8000`, fallback `http://127.0.0.1:8000`). The kv-store stores only the raw host string — the URL shape is built on read.

**Q2** Today, “Save” sets `api.defaults.baseURL` to the raw IP string while first-load logic can differ. Confirm intended behavior or planned change + target date.  
→ **Done.** `IndexPage.saveSettings` now sets `api.defaults.baseURL = `http://${ip}:8000`` to match the shape resolved by `axios.ts` at boot. The kv-store still holds only the raw host string. (Was: in-memory baseURL was the raw IP for ~50ms before the reload re-resolved it — harmless, but inconsistent.)

---

## 2) User selection & PIN login

**Implemented:** Active users list, navigation to PIN with query params, `POST /auth-login`, token and user stored — `IndexPage.vue`, `PinPage.vue`.

**Q3** Email (and name) in the URL for the PIN step: keep as-is, change later, or change by (date)?  
→ Keep for now. The whole app runs in a single Electron renderer with hash-router URLs that aren't logged or shared anywhere; passing `email` and `name` as query params is the simplest hand-off between `IndexPage` and `PinPage`. If we ever expose the renderer to a browser session, we'll move it to a Pinia store (`stores/pendingLogin.ts`) — not urgent. No target date set.

**Q4** Token and user JSON in `localStorage`: acceptable for the deployment model, or planned change + target date?  
→ Already changed. Both `auth_token` and `auth_user` now live in `electron-store` (atomic disk writes, single source of truth across windows) via `src/utils/storage.ts` + `src-electron/kv-store.ts`. The boot flow in `axios.ts` calls `initStorage()` which one-shot migrates any pre-refactor `localStorage` keys (`auth_token`, `auth_user`, `pos:IpAdress`, `pos:cachedUsers`) into kv-store and wipes the old localStorage entries. Synchronous reads work because the whole store is hot-cached at boot.

---

## 3) Orders board & payments

**Implemented:** Filters, list, order detail fetch, payment and info dialogs — `OrdersPage.vue` and related components.

**Q5** Orders load on page mount only (no automatic refresh). Confirm whether that is sufficient or specify polling/push and target date.  
→ **Done.** Polls every **3 seconds** on the Orders page. Suspended while a payment / info dialog is open (avoids reshuffling the list under the cashier's finger). Background polls don't show a spinner or wipe the list on a transient failure — the UI only flips to "loading…" on the very first fetch and on explicit filter changes. Push (WebSocket / SSE) is out of scope for this milestone — backend doesn't expose one yet and we treat the local backend as read-only on the frontend side.

**Q6** Any mismatch between UI status handling and backend values (for example canceled / cancelled): seen in production, tracked as a bug, or not applicable for now?  
→ Not a live bug. `getStatusClass` (`OrdersPage.vue:245`) accepts both `cancelled` and `cancel`, and `STATUS_LABELS` only translates `PREPARING` and `READY` — anything else falls through to the raw backend value, so no broken render. The `CANCELLED` filter chip is intentionally commented out (`STATUSES`, line ~199) until the cancel-from-cashier flow is designed; that's tracked as a feature, not a bug.

---

## 4) KDS, client display, cash box

**Implemented:** `KDSPage`, `ClientDisplayPage`, `CashBoxPage` routes and pages.

**Q7** For the current milestone: must-have, nice-to-have, or deferred? List known gaps or ticket IDs.  
→ 
- **KDS** — must-have. Renders prep queue from `/orders?status=PREPARING`. Gaps: same no-polling issue as Q5; auto-advance to READY relies on backend mutation flow that isn't fully wired.  
- **Client display** — must-have. Auto-opens on a second monitor when `clientDisplayEnabled` is set (toggle in IndexPage settings). Main-process side closes/opens the window on toggle. Gap: receipt total animation polish.  
- **Cash box** — deferred. Route exists (`/cash-box`) but the entry button in `OrdersPage` footer is commented out. No design committed yet.

---

## 5) Admin settings

**Implemented:** Nested settings (receipt, printer, display, categories, users, products), `meta.requiresAdmin` on settings route, admin entry from `AdminSettingsButton` using `localStorage` role — `src/router/routes.ts`, `src/router/index.ts`, `AdminSettingsButton.vue`, `SettingsLayout.vue`.

**Q8** Is non-admin access to `#/settings` acceptable if APIs enforce roles, or should a router guard (or equivalent) be added? If adding a guard, target date?  
→ Real gap. The `meta: { requiresAdmin: true }` is set on the settings parent route (`src/router/routes.ts:51`) but **no `router.beforeEach` reads it** — `src/router/index.ts` only configures history and routes. Today the only thing that hides settings from non-admins is `AdminSettingsButton.vue` checking the cached `auth_user.role`, which is presentation, not enforcement. Backend role checks would catch a malicious request, but the page would still render and the cashier would see admin UI.

Short-term: **done.** `router/index.ts` now has a `beforeEach` guard that walks `to.matched`, looks for `meta.requiresAdmin`, reads `auth_user` from kv-store, and redirects non-admins to `orders` (or `users` if not logged in). `AdminSettingsButton` keeps the role check for presentation; the guard is the actual enforcement.

Longer-term direction: this `requiresAdmin` boolean is a placeholder. We're moving to a **full per-role permission system** (admin can edit a role's permissions from the settings UI), so route guards will eventually check `meta.permissions: ['settings.users.edit', ...]` against a `permissions` array on the cached user instead of a hard-coded role string. The short-term guard is shaped so it can be swapped out without changing the route declarations — the `meta` key just upgrades from `requiresAdmin: true` to `permissions: [...]` later.

---

## 6) Electron shell, printing, backend signals

**Implemented:** Main and preload, print/settings handlers, `window.backend` for errors/logs — `src-electron/`, `src/boot/backend-listener.ts`.

**Q9** Preload exposes generic `ipcRenderer.invoke/send/on` for arbitrary channels. Keep, replace with an allowlisted API, or defer? If replacing, target date?  
→ Replace. The `electron.ipcRenderer.{invoke,send,on}` passthrough in `src-electron/electron-preload.ts` lets renderer code call any channel — `kv:*`, `settings:*`, `system:*`, `printer:*`, plus any future ones. We already added a typed `electron.kv` namespace beside it; the plan is to give `system`, `settings`, and `printer` the same treatment and delete the generic methods. Concrete channels in use today: `kv:get/set/delete/clear/getAll`, `system:openWifi`, `system:openNetwork`, `settings:getDisplay`, `settings:saveDisplay`, plus print handlers. Target: paired with the router guard (Q8), so we have one IPC-surface PR.

**Q10** Primary deployment: Electron kiosk, browser, or both—and does that affect the answers for Q8–Q9?  
→ Electron kiosk on a 15" POS monoblock (Windows) is primary; tablet is the secondary form factor (still Electron via touch shell on the same hardware footprint). Browser is dev-only (`quasar dev` in a tab) — the storage layer falls back to `localStorage` in that mode. So yes, Q8/Q9 still matter even though the kiosk is "trusted": multiple non-admin users (cashiers) share one device, and the renderer can be opened by anyone walking up. The IPC allowlist also matters because misbehaving renderer code (e.g., a future plugin) shouldn't be able to invoke arbitrary channels.

---

## 7) Quality, tests, and delivery

**Implemented:** Lint, format, typecheck in dev. `npm test` is currently a no-op (`package.json`).

**Q11** Minimum automated check before the next release (smoke script, E2E path, CI lint-only, none): what and by when?  
→ Two-step minimum: (1) wire `lint` + `vue-tsc --noEmit` into CI on every push (the scripts already exist, `npm test` is currently `exit 0`); (2) one Playwright smoke that boots Electron, loads the user picker, types a PIN, lands on Orders. Anything beyond that is post-release. Target: before the next tagged release.

**Q12** Template leftovers (`example-store`, `ExampleComponent`, full-page reload on refresh in `IndexPage.vue`): remove, keep, or defer? If remove, by when?  
→ Mixed:
- **Removed.** `src/stores/example-store.ts` and `src/components/ExampleComponent.vue` deleted — verified no imports anywhere in `src/`.
- **Kept** `window.location.reload()` in `IndexPage.vue` (the IP-change path *and* the manual refresh button) and added a one-line comment explaining why: changing the server IP requires re-running the axios boot to re-resolve `baseURL`, and the kv migration check also runs at boot.

---

## 8) Release alignment

**Q13** In scope vs explicitly deferred for this milestone (short lists).  
→ 
**In scope**
- Router guard for `requiresAdmin` — short-term role check, designed to swap to a per-permission check once the role/permission editor lands (Q8)
- Allowlisted preload IPC API: `kv` (done), `system`, `settings`, `printer` (Q9)
- Orders polling at 3s, suspended in offline mode and while a dialog is open (Q5)
- Remove `example-store` / `ExampleComponent`; document `window.location.reload()` (Q12)
- Align `saveSettings` with `axios.ts` baseURL shape (Q2)
- CI: lint + typecheck + one Playwright smoke (Q11)
- `docs/overview.md` (Q0)

**Deferred**
- WebSocket / push for orders
- Cash-box flow (route exists, no UI commitment)
- Full E2E suite beyond the one smoke
- Replacing URL query params in PIN handoff with a Pinia store (Q3)
- **Full per-role permission system** — admin editor for granular permissions per role, plus `meta.permissions` on routes and a `permissions[]` array on `auth_user` (Q8). Lands after the short-term guard.

**Q14** Criteria for "good enough to ship" the frontend for this phase.  
→ 
1. **Local backend reachability is a hard requirement** — the POS does not work without the kitchen's local backend. The local backend itself runs offline-capable: it serves the frontend over the kitchen LAN with no internet, and syncs with the global backend whenever internet becomes available. So "offline" in this app means *no internet*, **not** *no backend*. The cashier always logs in against the local backend; if the local backend is unreachable, the lock screen blocks login — there is no cached-hash fallback. (The current `PinPage.tryOfflineLogin` path will be removed in cleanup; tracked as a TODO.)
2. Non-admin users cannot reach `/settings/*` even by typing the URL into devtools.
3. Orders page reflects new orders within ~3s without manual refresh, and "Oflayn" badge is honest about send/sync.
4. Client display window opens automatically on a second monitor when the toggle is on; closes when toggled off.
5. Receipts print without manual driver fiddling on the supported printer.
6. Lint + typecheck green in CI; smoke E2E green.
7. Renderer cannot invoke arbitrary IPC channels (allowlist enforced in preload).

**Q15** Notes for turning answers into tickets (e.g. tracker links, priorities); completion date for this questionnaire.  
→ No tracker linked yet — once we pick one (Linear or GitHub Projects), the in-scope list above maps 1:1 to tickets in this priority order: **P0** Q8 (admin guard), Q9 (IPC allowlist); **P1** Q5 (polling), Q11 (CI + smoke); **P2** Q12 (cleanup), Q2 (baseURL alignment), Q0 (overview doc). Questionnaire completed: 2026-05-03.

---

## Additional features & issues (not covered above)

_Add bullets here or elsewhere in this file._

- **Architecture clarification:** the frontend always talks to a **local backend running in the kitchen** over the LAN — *not* directly to a cloud / global backend. The local backend operates without internet and syncs upstream to the global backend whenever internet is available. POS terminals do **not** require internet; they require the local backend to be reachable on the LAN. Internet is only needed for the local backend to sync upstream — losing it does not disrupt POS operation.
- **PIN login flow:** PIN is checked against the local backend (`POST /auth-login`); the token + user are persisted to kv-store. If the local backend is unreachable, the lock screen blocks login — by design, since the system can't operate without it. The current `PinPage.tryOfflineLogin` cached-hash fallback is being removed (along with the "Oflayn" badge on Orders that depended on it) — tracked as a cleanup TODO.
- **kv-store layer** (`src/utils/storage.ts` + `src-electron/kv-store.ts`) replaced direct `localStorage` use across the app. Hot in-memory cache populated at boot so the axios request interceptor can read the auth token synchronously. One-shot migration runs once on first boot after the upgrade (legacy keys: `pos:IpAdress`, `pos:cachedUsers`, `auth_token`, `auth_user`).
- **Network diagnostics overlay** (`src/components/NetworkDiagnostics.vue`) auto-shows full-screen when the configured server IP / LAN is unreachable, with shortcuts to OS Wi-Fi panel and network settings (via `system:openWifi` / `system:openNetwork` IPC). Dismissable when there are cached users (so offline PIN login still works).
- **Virtual keyboard** is now wired on every focusable input project-wide (toggleable in settings; default on for tablet). Multi-layout (EN / UZ-Latin / UZ-Cyrillic / RU), shift double-tap = caps, dedicated symbols page, persisted language. Driven by `src/composables/` + `src/components/virtual-keyboard/`.
- **Settings pages** built out behind the admin route: receipt, printer, display, categories, users, products. Display settings drive `clientDisplayEnabled`, brand/header colors, and font size for the second-monitor view.
- **Form factor reminder for reviewers:** the device target is a 15" POS monoblock + tablet, both touch-first. Modal forms feel cramped on these — when a flow has a virtual keyboard or multiple fields we use a full-page takeover instead (e.g. the manual-login screen on `IndexPage`).