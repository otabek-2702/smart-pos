# Operator phone link

The Operator button saves its enabled state for this computer. A short press
turns receiving on or off; holding the button for 650 ms opens the pairing QR.
Holding Space or Enter also opens the QR. Opening or closing the QR does not
change the enabled state. A phone scans each participating POS once and can
send the same call to each saved POS.

The Electron process restores the saved receiving state when the POS app
starts, including before cashier login. Logging out only dismisses cashier
call dialogs; it does not stop the receiver or delete pairing. Caller lookup
and customer dialogs run only during a logged-in cashier session. This change
does not add Windows auto-launch; the POS application must be running.

`operator-link.json` lives in the existing machine persistence directory,
normally `%PROGRAMDATA%/AlphaPOS`, separate from authentication storage. Its
UUID, random token, and enabled flag use atomic electron-store writes.
Stopping the receiver, closing the app, rebooting, logging out, and changing
LAN address do not rotate or expire the credential. The existing persistence
helper falls back to the current user's app-data directory when ProgramData
is unavailable. Do not delete this file unless intentionally resetting pairing.

## Pairing and address changes

New QR payload:

```json
{
  "version": 2,
  "id": "persistent-device-uuid",
  "name": "COUNTER-1",
  "url": "ws://192.168.1.10:8765?token=persistent-random-token",
  "discoveryPort": 8766
}
```

The WebSocket endpoint still accepts the original raw URL protocol. Each
enabled desktop listens on TCP 8765 and UDP 8766. When a saved IP becomes
unreachable, the phone can broadcast this UDP request on the local subnet:

```json
{ "type": "operator_discover", "id": "persistent-device-uuid", "nonce": "random-request-nonce" }
```

Only the matching, enabled machine replies to the requester's address/port:

```json
{
  "type": "operator_discovered",
  "id": "persistent-device-uuid",
  "nonce": "random-request-nonce",
  "port": 8765
}
```

The phone verifies the ID and nonce and uses the reply's source address with
its saved token. Discovery does not disclose the token. The phone and POS
must share a reachable LAN; Windows firewall and Wi-Fi client isolation must
allow these ports. A persisted mode with a listener error appears with a
warning outline, and bind failures retry every five seconds.

## Live events and durable call records

Existing `call_start` and `call_end` frames remain supported. After finding a
customer with `GET /clients/lookup` (cached per number for 5 minutes), the desktop sends
`{"type":"customer_name","phone":"+998901234567","name":"Aziza"}` to
connected paired phones. Cached names can also be returned immediately on a
subsequent call. Unmatched callers are not given an invented name.

The phone additionally sends `{"type":"call_record","record":{...}}`.
An optional `record` on `call_end` is accepted too. A record requires:

- Stable string `id`, string `phone` (empty for a hidden number), `direction`
  of `in` or `out`.
- Numeric `startedAt`; `endedAt` is a timestamp at or after start, or `null`
  when the phone did not observe the exact end.
- Optional nonnegative integer `revision`, incremented for callback updates.

Fields such as `answeredAt`, `ringSeconds`, `talkSeconds`, `outcome`,
`missedWhileBusy`, `callbackAttemptAt`, `callbackConnectedAt`,
`callbackDelaySeconds`, `callbackForIds`, `source`, and `timingSource` are retained as supplied, including unknown/null timing values. The
desktop does not infer a successful connection from a dialing attempt, an
answer time from ringing, or a cause for an unanswered call. Unknown future
fields are retained as well.

Each stable ID is upserted into a separate file under
`AlphaPOS/operator-calls/records`, using a SHA-256 filename, a flushed temporary
file and atomic rename. Lower revisions cannot overwrite newer revisions.
The desktop returns `{"type":"call_record_ack","id":"call-id","revision":2}`
only after persistence; on disk errors it leaves the record unacknowledged
for phone retry. Repeated records do not create duplicates. Customer names
are also retained separately in `operator-calls/customer-names.json`, and are
included when reading archived calls.

These archives persist independently of cashier authentication. There is no
new desktop analytics screen in this change; phone/Telegram reporting uses
the same measured call records.

## Protocol 3 (desktop 0.0.17)

Phone to POS, in addition to the frames above:

```json
{ "type": "operator_hello", "protocol": 3, "role": "operator", "app": "2.2.0" }
{ "type": "call_state", "calls": [
  { "id": "c1", "phone": "+998901234567", "direction": "in",
    "state": "ringing", "since": 1758000000000, "customerName": "Aziza" } ] }
```

`role` is `operator` or `cashier`; `state` is `ringing`, `active`, `waiting` or
`ended`. A snapshot lists at most 10 calls; one invalid entry drops the whole
frame. Once a connection has said hello, its legacy `call_start`/`call_end`
frames only store the attached record. A connection without hello is a
protocol 2 operator phone and behaves as before. Cached customer names are
sent once per listed call.

POS to phone, after an order with a customer phone is saved:
`{"type":"order_created","phone":"998901234567","orderId":42,"at":1758000000000}`
(sent to every connected phone; older phones ignore unknown types).

Main to renderer on `operator:call-event`: `call_start`/`call_end` (with
`source`), `phone_role {source, role}`, `call_state {source, role, calls}` and
`phone_gone {source}`. Renderer to main: `operator:order-created (phone, orderId)`.

On the desktop, a cashier role never opens the call dialog or looks up the
customer. An operator role opens it for a new ringing incoming or started
outgoing call, unless the create-order page or the customer panel is open;
then, and for a call waiting behind another, a non-blocking banner appears.
Protocol 2 `call_start` still always opens the dialog. The customer panel
offers current and recent (10 minutes, up to 5) caller numbers as quick-fill
chips for both roles.

## Validation

`tests/unit/operatorLink.spec.ts` exercises real local TCP/UDP sockets,
authentication, stable pairing across restart, record persistence and revision
ACKs. `tests/unit/operatorStore.spec.ts` covers restored mode, separate QR
display, logout/login behavior, and early customer-name replies, plus the
protocol 3 modal/banner/quick-fill rules and the lookup cache;
`operatorProtocol.spec.ts` and `operatorCalls.spec.ts` cover frame validation
and the call-list rules. Physical
phone pairing and firewall behavior still require a device/LAN smoke test.
