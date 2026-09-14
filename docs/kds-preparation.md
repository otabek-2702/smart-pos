# KDS preparation timers and item readiness

The ticket clock shows elapsed time from `order.created_at`. It updates once a
second, without restarting on polling, tab changes, or item preparation. A READY
ticket freezes at the backend `order.ready_at`. Missing/invalid timestamps render
an em dash.

For a PREPARING ticket, the target is the longest preparation target among its
unfinished kitchen items. Preparing or undoing a meal immediately recalculates
that target from the confirmed backend state. READY tickets show the historical
target across their meals. Quantities do not multiply the target: this follows
the backend's parallel preparation rules.

Meal rules in `src/utils/kdsPreparation.ts` mirror
`alpha_pos_server/alpha_pos_core/notifications/preparation.py`. Unknown meal names
have no invented default. Timers are green through the target, amber through
150% of the target, then red. The displayed range, where provided by those rules,
uses its upper bound for classification. The API's `preparation_time_seconds`
describes actual completed preparation, not a target.

## Existing local backend contracts

- `GET /orders?statuses=PREPARING|READY&per_page=100&page=N` loads each item's
  nullable `ready_at`. All pages load before replacing the board. This endpoint
  preserves order type, cashier, Telegram enrichment, and item notes; the
  chef-display feed omits that metadata and only serves PREPARING orders.
- `POST /orders/{order}/items/{item}/ready` prepares one line. The response's
  `items_status` and `order` are authoritative. The backend completes the order
  when its final active line becomes ready.
- `POST /orders/{order}/items/{item}/unready` undoes a line and reopens a READY
  order. It returns `item_id` and `order_status`.
- `POST /orders/{order}/ready` prepares every remaining active line. The bulk
  button retains this atomic backend action.
- Returning a whole order to preparation undoes its cooked lines sequentially.
  `GET /products/{product}` resolves `is_instant` before any undo writes, so
  drinks retain their automatic readiness. Missing metadata blocks undo with a
  visible error. Confirmed product flags are cached for the page session.
  PATCHing order status alone does not reset item readiness, so it is only used
  for a legacy READY order whose items are already confirmed unready.

Item actions keep the existing double-click shortcut and add a keyboard/touch
button. Requests are locked per order through reconciliation. No local-only
completion set remains. Polling stays at three seconds because partial item
updates do not reliably trigger order stream events. Concurrent reads coalesce;
stale reads cannot overwrite mutations or another tab's results. Failed reads
retain the last successful board; save errors remain visible until retried or
acknowledged using the refresh control.

## Verification (2026-09-15)

- 59 timer tests and 25 API/state tests; full suite: 199 passed, 4 skipped.
- Full TypeScript check, scoped ESLint, and SPA production build passed.
- Browser fixture using the actual KDS page: dynamic target, keyboard item
  preparation, final-item completion, frozen READY clock, whole-order reopen,
  save failure/retry, long Uzbek/Russian labels, desktop/mobile, and light,
  dark, and blue themes.
- Backend contracts were reviewed from source. No live orders were mutated,
  backend code changed, installer packaged, or release published.
