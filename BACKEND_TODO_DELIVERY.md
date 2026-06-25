# Courier / delivery & in-dialog order edits

Backend for the delivery features is **shipped** on `alpha_pos_local` (verified
2026-06-25). What's left is one FE wiring task.

---

## ⬜ FE-ONLY: edit phone + description on an existing order

Backend ready: `POST|PATCH /orders/{id}/details {phone_number?, description?, delivery_person_id?}`
(pos_staff, only the provided fields change). The courier half of this is already
wired (picker in `OrderInfoDialog`). Still to do on the FE: let the cashier edit
the **phone** and **description** of an existing order (esp. after switching a
HALL order to DELIVERY, which has no phone yet).

- Needs a text input → the virtual keyboard must mount inside the modal (VK is
  opt-in per component, not global). That's the only reason this wasn't shipped
  with the courier picker.
- Save via the same `/orders/{id}/details` endpoint; emit a refresh like
  `courier-changed` so `OrdersPage` re-fetches.

---

## Verified shipped — backend (do **not** re-add)
- **List couriers**: `GET /couriers` → `{ data: { items: [{id, name, phone}] } }` (pos_staff, active only). FE: `src/composables/useCouriers.ts`.
- **Assign / change / clear courier**: `POST /orders/{id}/courier { delivery_person_id }` (pos_staff; any status except CANCELED; null clears). FE: `OrderInfoDialog` courier picker (delivery orders).
- **Courier on serializers**: order list + detail include `delivery_person { id, name, phone } | null`.
- **Change order type (staff)**: `PATCH /orders/{id}/type { order_type }`. FE: type picker in `OrderInfoDialog` + `PaymentConfirmationDialog`.
- **Edit phone/description/courier (staff)**: `POST|PATCH /orders/{id}/details`.
- **Creator on detail**: `_serialize_order_detail` sends `user {id,name}` (powers receipt name + cross-cashier warning).
