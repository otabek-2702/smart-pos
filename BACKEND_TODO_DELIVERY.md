# Backend tasks — Courier / delivery & in-dialog order edits

What the smart-pos cashier POS needs from `alpha_pos` to finish the delivery
features. The FE pieces that DON'T need backend already shipped (print-check
button, cross-cashier payment warning, receipt shows the order creator). The
items below are blocked until these endpoints exist.

Backend repo: `c:/Users/Jason/Desktop/Projects/alpha_pos`. The POS uses the
**customer** API (staff-authed: `@pos_staff_required` = ADMIN/MANAGER/CASHIER) —
NOT the admin API. That's the crux: the needed actions only exist on the
**admin** API today (`@admin_required` → cashier/manager get 403).

---

## 🔴 1. List couriers (for the picker)

The `DeliveryPerson` model exists (`base/models.py:760-771`: `first_name`,
`last_name`, `phone_number`, `is_active`) and a repo (`base/repositories/delivery_person.py` → `get_active()`), but **no API lists them**.

**Add:** `GET /couriers` (or `/delivery-persons`) on the customer API,
`@pos_staff_required`, returning active couriers:
```json
{ "success": true, "data": { "couriers": [
  { "id": 5, "first_name": "Olim", "last_name": "K.", "name": "Olim K.", "phone_number": "+998..." }
] } }
```
- View: new in `customers/views/` + route in `customers/urls.py`.
- Source: `DeliveryPersonRepository.get_active()`.

---

## 🔴 2. Assign / change the courier on an EXISTING order ("Deliver" button)

Today a courier can only be set at **creation** (`POST /orders/create` accepts
`delivery_person_id` — `customers/services/order_service.py:357`). There is **no
way to assign or change it afterwards** (the admin update's allowed fields are
only `{phone_number, description, order_type}` — `admins/services/order_service.py:453` — `delivery_person_id` is excluded).

**Add:** a staff endpoint to set/replace the courier on an existing order, e.g.
`POST /orders/{id}/courier`  `{ "delivery_person_id": 5 }`, `@pos_staff_required`.
- Sets `order.delivery_person_id` (FK already on the Order model, `base/models.py:864-870`).
- Allowed for **any status except CANCELLED** (PREPARING, READY, and PAID delivery orders — the cashier assigns the driver after payment too). Confirm whether assigning to a PAID order is OK (we want yes).
- Return the updated order (or at least the assigned courier) so the FE can show it.

**Also:** include the assigned courier on the order serializers so the FE can
show who's assigned —
`customers/services/order_service.py` `_serialize_order_list` (~L56-99) and
`_serialize_order_detail` (~L102-157): add
`"delivery_person": { "id", "name", "phone_number" } | null`.

---

## 🔴 3. Change order type + edit delivery data from the POS (staff, not admin)

The payment/info dialogs let the cashier change an order's **type**
(HALL/PICKUP/DELIVERY) and, when it becomes DELIVERY, edit the **phone** +
**description** (delivery data). Today this is admin-only
(`PATCH /api/admins/orders/{id}`, `@admin_required` → cashier 403).

**Add:** a staff-accessible update on the customer API, e.g.
`PATCH /orders/{id}`  `@pos_staff_required`, allowed fields
`{ order_type, phone_number, description, delivery_person_id }`, only while the
order is editable (PREPARING/READY; reject CANCELLED). Mirror the admin
`update_order` logic (`admins/services/order_service.py:448-459`) but staff-gated.

---

## 🟡 4. (Optional) Creator on the order LIST

The FE shows the **order creator** as the receipt's cashier and powers the
cross-cashier warning. Detail already sends `user {id,name}`
(`_serialize_order_detail` ~L131-135), and the FE reads it from the detail
fetch — so this works. To avoid the extra detail round-trip, optionally add
`user {id,name}` to `_serialize_order_list` (it currently sends only `cashier`,
which can be null until payment).

---

## Note — cashbox attribution (confirm, no change expected)

The FE cross-cashier warning tells the cashier "the money goes to YOUR cashbox."
That assumes `POST /orders/{id}/pay` attributes the payment to the **confirming**
cashier's open shift (the `OrderPayment` falls in their shift window →
`ShiftPaymentTotal`). Pay also sets `order.cashier_id = request.user` only if it
was null (`customers/services/order_service.py:902-910`). Please confirm a
cross-cashier payment indeed lands in the confirming cashier's shift
reconciliation — if not, that's a separate fix.
