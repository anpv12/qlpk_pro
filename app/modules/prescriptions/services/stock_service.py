"""Batch-aware inventory owner for prescription dispensing.

The service deliberately uses only existing inventory tables:

- ``medicine_batches.remaining_quantity`` owns the current balance per batch.
- ``medicines.stock_quantity`` remains the aggregate balance used elsewhere.
- ``medicine_transactions`` records append-only movements. New prescription
  movements use the existing ``note`` contract for the appointment identity
  and ``batch_id`` for the exact lot identity.

No legacy movement is inferred from display text or medicine names.
"""

from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from sqlalchemy import func

from app.models.medicine import Medicine
from app.models.medicine_batch import MedicineBatch
from app.models.medicine_transaction import MedicineTransaction


ZERO_QUANTITY = Decimal("0")
INVENTORY_PRECISION = Decimal("0.01")
PRESCRIPTION_STOCK_EXPORT_NOTE = "Xuất theo đơn thuốc - Lịch hẹn ID: {appointment_id}"
PRESCRIPTION_STOCK_REFUND_NOTE = "Hoàn lại tồn kho - Lịch hẹn ID: {appointment_id}"


class PrescriptionStockValidationError(Exception):
    """Expose user-correctable inventory errors without committing partial state."""

    def __init__(self, errors):
        self.errors = list(errors or [])
        super().__init__("; ".join(self.errors))


def as_quantity_decimal(value):
    try:
        parsed = Decimal(str(value or 0))
    except (InvalidOperation, TypeError, ValueError):
        return ZERO_QUANTITY
    return parsed if parsed.is_finite() else ZERO_QUANTITY


def format_quantity(value):
    if value is None:
        return "0"
    parsed = as_quantity_decimal(value)
    if parsed == parsed.to_integral_value():
        return str(int(parsed))
    return f"{parsed:.3f}".rstrip("0").rstrip(".")


def _inventory_quantity(value):
    return as_quantity_decimal(value).quantize(INVENTORY_PRECISION, rounding=ROUND_HALF_UP)


def _batch_sort_key(batch):
    return (
        batch.expiry_date or date.max,
        batch.import_date or date.max,
        batch.id,
    )


def prescription_stock_movement_notes(appointment_id):
    """Return the two existing ledger notes owned by one appointment."""
    return (
        PRESCRIPTION_STOCK_EXPORT_NOTE.format(appointment_id=appointment_id),
        PRESCRIPTION_STOCK_REFUND_NOTE.format(appointment_id=appointment_id),
    )


def _load_net_batch_allocations(db, appointment_id, medicine_ids):
    """Return allocations derived only from appointment notes with a batch."""
    allocations = defaultdict(dict)
    invalid = defaultdict(list)
    if not medicine_ids:
        return allocations, invalid

    rows = (
        db.query(
            MedicineTransaction.medicine_id,
            MedicineTransaction.batch_id,
            func.sum(MedicineTransaction.quantity).label("net_quantity"),
        )
        .filter(
            MedicineTransaction.medicine_id.in_(sorted(medicine_ids)),
            MedicineTransaction.batch_id.isnot(None),
            MedicineTransaction.note.in_(
                prescription_stock_movement_notes(appointment_id)
            ),
        )
        .group_by(MedicineTransaction.medicine_id, MedicineTransaction.batch_id)
        .all()
    )
    for medicine_id, batch_id, net_quantity in rows:
        allocated_quantity = -as_quantity_decimal(net_quantity)
        if allocated_quantity > ZERO_QUANTITY:
            allocations[int(medicine_id)][int(batch_id)] = allocated_quantity
        elif allocated_quantity < ZERO_QUANTITY:
            invalid[int(medicine_id)].append(int(batch_id))
    return allocations, invalid


def _allocation_status(prescribed_quantity, allocated_quantity, integrity_ok):
    if not integrity_ok or allocated_quantity > prescribed_quantity:
        return "inconsistent"
    if prescribed_quantity <= ZERO_QUANTITY:
        return "not_required"
    if allocated_quantity == prescribed_quantity:
        return "allocated"
    if allocated_quantity <= ZERO_QUANTITY:
        return "legacy_untracked"
    return "partially_tracked"


def build_prescription_batch_allocation_states(
    db,
    appointment_id,
    prescribed_totals_by_medicine,
):
    """Build display/read state for current prescription-to-batch allocations."""
    prescribed_totals = {
        int(medicine_id): as_quantity_decimal(quantity)
        for medicine_id, quantity in (prescribed_totals_by_medicine or {}).items()
        if medicine_id and as_quantity_decimal(quantity) > ZERO_QUANTITY
    }
    medicine_ids = sorted(prescribed_totals)
    if not medicine_ids:
        return {}

    medicines = {
        medicine.id: medicine
        for medicine in db.query(Medicine).filter(Medicine.id.in_(medicine_ids)).all()
    }
    batches_by_medicine = defaultdict(list)
    for batch in (
        db.query(MedicineBatch)
        .filter(MedicineBatch.medicine_id.in_(medicine_ids))
        .order_by(
            MedicineBatch.medicine_id.asc(),
            MedicineBatch.expiry_date.asc(),
            MedicineBatch.import_date.asc(),
            MedicineBatch.id.asc(),
        )
        .all()
    ):
        batches_by_medicine[batch.medicine_id].append(batch)

    allocations, invalid_allocations = _load_net_batch_allocations(
        db,
        appointment_id,
        medicine_ids,
    )
    today = date.today()
    result = {}
    for medicine_id in medicine_ids:
        medicine = medicines.get(medicine_id)
        batches = batches_by_medicine.get(medicine_id, [])
        batch_map = {batch.id: batch for batch in batches}
        batch_allocations = []
        allocated_quantity = ZERO_QUANTITY
        integrity_ok = not invalid_allocations.get(medicine_id)
        for batch_id, quantity in sorted(
            allocations.get(medicine_id, {}).items(),
            key=lambda item: _batch_sort_key(batch_map[item[0]]) if item[0] in batch_map else (date.max, date.max, item[0]),
        ):
            batch = batch_map.get(batch_id)
            if not batch:
                integrity_ok = False
                continue
            allocated_quantity += quantity
            batch_allocations.append({
                "batch_id": batch.id,
                "batch_number": batch.batch_number,
                "import_date": batch.import_date.isoformat() if batch.import_date else None,
                "expiry_date": batch.expiry_date.isoformat() if batch.expiry_date else None,
                "quantity": float(quantity),
                "remaining_quantity": float(as_quantity_decimal(batch.remaining_quantity)),
            })

        prescribed_quantity = prescribed_totals[medicine_id]
        batch_total = sum(
            (as_quantity_decimal(batch.remaining_quantity) for batch in batches),
            ZERO_QUANTITY,
        )
        available_total = sum(
            (
                as_quantity_decimal(batch.remaining_quantity)
                for batch in batches
                if batch.expiry_date and batch.expiry_date >= today
                and as_quantity_decimal(batch.remaining_quantity) > ZERO_QUANTITY
            ),
            ZERO_QUANTITY,
        )
        aggregate_stock = as_quantity_decimal(medicine.stock_quantity if medicine else 0)
        inventory_consistent = bool(medicine) and _inventory_quantity(aggregate_stock) == _inventory_quantity(batch_total)
        status = _allocation_status(prescribed_quantity, allocated_quantity, integrity_ok)
        result[medicine_id] = {
            "medicine_id": medicine_id,
            "medicine_name": medicine.name if medicine else None,
            "unit": medicine.unit if medicine else None,
            "prescribed_quantity": float(prescribed_quantity),
            "allocated_quantity": float(allocated_quantity),
            "batch_allocations": batch_allocations,
            "batch_count": len(batch_allocations),
            "batch_allocation_complete": status == "allocated",
            "batch_allocation_status": status,
            "allocation_integrity_ok": integrity_ok,
            "aggregate_stock": float(aggregate_stock),
            "batch_total_stock": float(batch_total),
            "available_batch_stock": float(available_total),
            "inventory_consistent": inventory_consistent,
        }
    return result


def _lock_inventory(db, medicine_id):
    medicine = (
        db.query(Medicine)
        .filter(Medicine.id == medicine_id)
        .with_for_update()
        .one_or_none()
    )
    batches = (
        db.query(MedicineBatch)
        .filter(MedicineBatch.medicine_id == medicine_id)
        .order_by(
            MedicineBatch.expiry_date.asc(),
            MedicineBatch.import_date.asc(),
            MedicineBatch.id.asc(),
        )
        .with_for_update()
        .all()
    )
    return medicine, batches


def _validate_inventory_contract(medicine, batches, medicine_name, unit):
    if not medicine:
        raise PrescriptionStockValidationError([
            f"Không tìm thấy thuốc trong kho: {medicine_name}"
        ])
    negative_batches = [batch.batch_number for batch in batches if as_quantity_decimal(batch.remaining_quantity) < ZERO_QUANTITY]
    if negative_batches:
        raise PrescriptionStockValidationError([
            f"{medicine_name}: lô có tồn âm ({', '.join(negative_batches[:5])}). "
            "Cần đối soát kho trước khi lưu đơn."
        ])

    aggregate_stock = as_quantity_decimal(medicine.stock_quantity)
    if aggregate_stock < ZERO_QUANTITY:
        raise PrescriptionStockValidationError([
            f"{medicine_name}: tồn tổng đang âm "
            f"({format_quantity(aggregate_stock)} {unit}). "
            "Cần kiểm tra kho trước khi lưu đơn."
        ])


def _append_stock_transaction(
    db,
    *,
    medicine_id,
    appointment_id,
    batch_id,
    quantity,
    is_export,
    user_id,
):
    db.add(MedicineTransaction(
        medicine_id=medicine_id,
        batch_id=batch_id,
        type="export" if is_export else "import",
        quantity=-quantity if is_export else quantity,
        price=0,
        note=(
            PRESCRIPTION_STOCK_EXPORT_NOTE if is_export
            else PRESCRIPTION_STOCK_REFUND_NOTE
        ).format(appointment_id=appointment_id),
        created_by=user_id,
        created_at=datetime.now(),
    ))


def apply_prescription_batch_stock_deltas(
    db,
    *,
    user_id,
    appointment_id,
    new_totals_by_medicine,
    old_totals_by_medicine,
    medicine_catalog,
):
    """Apply the exact prescription delta using FEFO batches, atomically."""
    updates = []
    medicine_ids = sorted(set(old_totals_by_medicine) | set(new_totals_by_medicine))
    for medicine_id in medicine_ids:
        totals_data = new_totals_by_medicine.get(medicine_id) or {}
        catalog_medicine = medicine_catalog.get(medicine_id)
        medicine_name = (
            totals_data.get("medicine_name")
            or (catalog_medicine or {}).get("name")
            or str(medicine_id)
        )
        unit = (catalog_medicine or {}).get("unit") or "đơn vị"
        new_quantity = as_quantity_decimal(totals_data.get("total_in_clinic_qty"))
        old_quantity = as_quantity_decimal(old_totals_by_medicine.get(medicine_id))
        delta = new_quantity - old_quantity
        if delta == ZERO_QUANTITY:
            continue

        medicine, batches = _lock_inventory(db, medicine_id)
        _validate_inventory_contract(medicine, batches, medicine_name, unit)
        batch_map = {batch.id: batch for batch in batches}
        allocations, invalid_allocations = _load_net_batch_allocations(
            db,
            appointment_id,
            [medicine_id],
        )
        if invalid_allocations.get(medicine_id):
            raise PrescriptionStockValidationError([
                f"{medicine_name}: dấu vết cấp/hoàn theo lô không hợp lệ. "
                "Cần đối soát đơn trước khi thay đổi số lượng."
            ])

        current_allocations = allocations.get(medicine_id, {})
        allocated_total = sum(current_allocations.values(), ZERO_QUANTITY)
        if allocated_total > old_quantity:
            raise PrescriptionStockValidationError([
                f"{medicine_name}: số thuốc đang gắn với lô lớn hơn số lượng đã lưu trong đơn. "
                "Cần kiểm tra lại dữ liệu cấp thuốc trước khi thay đổi số lượng."
            ])
        missing_batch_ids = {
            batch_id for batch_id, quantity in current_allocations.items()
            if quantity > ZERO_QUANTITY and batch_id not in batch_map
        }
        if missing_batch_ids:
            raise PrescriptionStockValidationError([
                f"{medicine_name}: không còn tìm thấy lô đã cấp cho đơn. "
                "Cần kiểm tra lại dữ liệu cấp thuốc trước khi thay đổi số lượng."
            ])

        movements = []
        if delta > ZERO_QUANTITY:
            today = date.today()
            valid_batches = [
                batch for batch in batches
                if batch.expiry_date and batch.expiry_date >= today
                and as_quantity_decimal(batch.remaining_quantity) > ZERO_QUANTITY
            ]
            available_batch_stock = sum(
                (as_quantity_decimal(batch.remaining_quantity) for batch in valid_batches),
                ZERO_QUANTITY,
            )
            aggregate_stock = as_quantity_decimal(medicine.stock_quantity)
            available_to_dispense = min(aggregate_stock, available_batch_stock)
            if available_to_dispense < delta:
                missing = delta - available_to_dispense
                raise PrescriptionStockValidationError([
                    f"{medicine_name}: cần cấp thêm {format_quantity(delta)} {unit}, "
                    f"tồn khả dụng {format_quantity(available_to_dispense)} {unit}, "
                    f"thiếu {format_quantity(missing)} {unit}. Đơn chưa được lưu."
                ])

            remaining = delta
            for batch in valid_batches:
                if remaining <= ZERO_QUANTITY:
                    break
                quantity = min(as_quantity_decimal(batch.remaining_quantity), remaining)
                batch.remaining_quantity = as_quantity_decimal(batch.remaining_quantity) - quantity
                allocations[medicine_id][batch.id] = allocations[medicine_id].get(batch.id, ZERO_QUANTITY) + quantity
                _append_stock_transaction(
                    db,
                    medicine_id=medicine_id,
                    appointment_id=appointment_id,
                    batch_id=batch.id,
                    quantity=quantity,
                    is_export=True,
                    user_id=user_id,
                )
                movements.append({
                    "batch_id": batch.id,
                    "batch_number": batch.batch_number,
                    "expiry_date": batch.expiry_date.isoformat() if batch.expiry_date else None,
                    "quantity_deducted": float(quantity),
                    "remaining_quantity": float(as_quantity_decimal(batch.remaining_quantity)),
                })
                remaining -= quantity
            medicine.stock_quantity = as_quantity_decimal(medicine.stock_quantity) - delta
        else:
            refund_quantity = abs(delta)
            refund_batches = sorted(
                (
                    batch_map[batch_id]
                    for batch_id, quantity in current_allocations.items()
                    if quantity > ZERO_QUANTITY and batch_id in batch_map
                ),
                key=_batch_sort_key,
                reverse=True,
            )
            tracked_refund_quantity = min(refund_quantity, allocated_total)
            legacy_refund_quantity = refund_quantity - tracked_refund_quantity
            remaining = tracked_refund_quantity
            for batch in refund_batches:
                if remaining <= ZERO_QUANTITY:
                    break
                allocated = current_allocations[batch.id]
                quantity = min(allocated, remaining)
                batch.remaining_quantity = as_quantity_decimal(batch.remaining_quantity) + quantity
                current_allocations[batch.id] = allocated - quantity
                _append_stock_transaction(
                    db,
                    medicine_id=medicine_id,
                    appointment_id=appointment_id,
                    batch_id=batch.id,
                    quantity=quantity,
                    is_export=False,
                    user_id=user_id,
                )
                movements.append({
                    "batch_id": batch.id,
                    "batch_number": batch.batch_number,
                    "expiry_date": batch.expiry_date.isoformat() if batch.expiry_date else None,
                    "quantity_refunded": float(quantity),
                    "remaining_quantity": float(as_quantity_decimal(batch.remaining_quantity)),
                })
                remaining -= quantity
            if remaining > ZERO_QUANTITY:
                raise PrescriptionStockValidationError([
                    f"{medicine_name}: không thể hoàn đủ phần thuốc đã gắn với lô. "
                    "Cần kiểm tra lại dữ liệu cấp thuốc trước khi thay đổi số lượng."
                ])
            if legacy_refund_quantity > ZERO_QUANTITY:
                _append_stock_transaction(
                    db,
                    medicine_id=medicine_id,
                    appointment_id=appointment_id,
                    batch_id=None,
                    quantity=legacy_refund_quantity,
                    is_export=False,
                    user_id=user_id,
                )
            medicine.stock_quantity = as_quantity_decimal(medicine.stock_quantity) + refund_quantity

        updated_batch_total = sum(
            (as_quantity_decimal(batch.remaining_quantity) for batch in batches),
            ZERO_QUANTITY,
        )
        available_batch_total = sum(
            (
                as_quantity_decimal(batch.remaining_quantity)
                for batch in batches
                if batch.expiry_date and batch.expiry_date >= date.today()
                and as_quantity_decimal(batch.remaining_quantity) > ZERO_QUANTITY
            ),
            ZERO_QUANTITY,
        )
        payload = {
            "medicine_id": medicine_id,
            "medicine_name": medicine_name,
            "unit": unit,
            "remaining_stock": float(as_quantity_decimal(medicine.stock_quantity)),
            "batch_total_stock": float(updated_batch_total),
            "available_batch_stock": float(available_batch_total),
            "batch_movements": movements,
        }
        if delta > ZERO_QUANTITY:
            payload["quantity_deducted"] = float(delta)
        else:
            payload["quantity_refunded"] = float(abs(delta))
        updates.append(payload)
    return updates
