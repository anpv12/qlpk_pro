"""Batch-aware inventory owner for prescription dispensing.

The service deliberately uses only existing inventory tables:
- ``medicine_batches.remaining_quantity`` owns the current balance per batch.
- ``medicines.stock_quantity`` remains the aggregate balance used elsewhere.
- ``medicine_transactions`` records append-only movements with explicit visit,
  receipt and price evidence; exact legacy notes remain a read fallback.

No legacy movement is inferred from display text or medicine names.
"""

from datetime import date
from uuid import uuid4


from app.models.medicine import Medicine
from app.models.medicine_batch import MedicineBatch
from app.modules.prescriptions.services.ledger_service import (
    append_dispensing_movement, reprice_open_exports,
)
from app.modules.prescriptions.services.stock_service_allocation import INVENTORY_PRECISION, ZERO_QUANTITY, _allocation_status, _batch_sort_key, _inventory_quantity, _load_net_batch_allocations, _medicine_allocation_state, as_quantity_decimal, build_prescription_batch_allocation_states  # noqa: F401 — re-exported for callers of this module


PRESCRIPTION_STOCK_EXPORT_NOTE = "Xuất theo đơn thuốc - Lịch hẹn ID: {appointment_id}"
PRESCRIPTION_STOCK_REFUND_NOTE = "Hoàn lại tồn kho - Lịch hẹn ID: {appointment_id}"


class PrescriptionStockValidationError(Exception):
    """Expose user-correctable inventory errors without committing partial state."""

    def __init__(self, errors, *, code="inventory.insufficient", shortage=None):
        self.errors = list(errors or [])
        self.code = code
        self.shortage = shortage
        super().__init__("; ".join(self.errors))


def format_quantity(value):
    if value is None:
        return "0"
    parsed = as_quantity_decimal(value)
    if parsed == parsed.to_integral_value():
        return str(int(parsed))
    return f"{parsed:.3f}".rstrip("0").rstrip(".")


def prescription_stock_movement_notes(appointment_id):
    """Return the two existing ledger notes owned by one appointment."""
    return (
        PRESCRIPTION_STOCK_EXPORT_NOTE.format(appointment_id=appointment_id),
        PRESCRIPTION_STOCK_REFUND_NOTE.format(appointment_id=appointment_id),
    )


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
    stock_balance_after,
    unit_cost=None,
    balance_after=None,
    operation_id=None,
    sale_unit_price=None,
):
    append_dispensing_movement(db,
        medicine_id=medicine_id,
        appointment_id=appointment_id,
        batch_id=batch_id,
        quantity=quantity,
        is_export=is_export,
        unit_cost=unit_cost,
        balance_after=balance_after,
        stock_balance_after=stock_balance_after,
        note=(
            PRESCRIPTION_STOCK_EXPORT_NOTE if is_export
            else PRESCRIPTION_STOCK_REFUND_NOTE
        ).format(appointment_id=appointment_id),
        user_id=user_id,
        operation_id=operation_id,
        sale_unit_price=sale_unit_price,
    )


def _refund_prescription_delta(allocated_total, appointment_id, batch_map, current_allocations, db, delta, medicine, medicine_id, medicine_name, movements, operation_id, running_stock, user_id):
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
        running_stock += quantity
        current_allocations[batch.id] = allocated - quantity
        _append_stock_transaction(
            db,
            medicine_id=medicine_id,
            appointment_id=appointment_id,
            batch_id=batch.id,
            quantity=quantity,
            is_export=False,
            stock_balance_after=running_stock,
            user_id=user_id,
            unit_cost=batch.import_price,
            balance_after=batch.remaining_quantity,
            operation_id=operation_id,
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
            stock_balance_after=running_stock + legacy_refund_quantity,
            quantity=legacy_refund_quantity,
            is_export=False,
            user_id=user_id,
            operation_id=operation_id,
        )
    medicine.stock_quantity = as_quantity_decimal(medicine.stock_quantity) + refund_quantity


def _dispense_prescription_delta(allocations, appointment_id, batches, db, delta, medicine, medicine_id, medicine_name, movements, new_quantity, old_quantity, operation_id, running_stock, sale_unit_price, unit, user_id):
    today = date.today()
    if not batches and as_quantity_decimal(medicine.stock_quantity) > ZERO_QUANTITY:
        raise PrescriptionStockValidationError([
            f"{medicine_name}: chưa có lô để cấp {format_quantity(delta)} {unit}. "
            "Cần bổ sung lô cho tồn hiện hữu."
        ], code="inventory.batch_missing")
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
    if not valid_batches and aggregate_stock > ZERO_QUANTITY and any(
        batch.expiry_date and batch.expiry_date < today
        and as_quantity_decimal(batch.remaining_quantity) > ZERO_QUANTITY
        for batch in batches
    ):
        raise PrescriptionStockValidationError([
            f"{medicine_name}: các lô còn số lượng đã hết hạn, không thể cấp thuốc. "
            "Cần kiểm tra kho và bổ sung lô còn hạn."
        ], code="inventory.batch_expired")
    available_to_dispense = min(aggregate_stock, available_batch_stock)
    if available_to_dispense < delta:
        missing = delta - available_to_dispense
        raise PrescriptionStockValidationError([
            f"{medicine_name}: cần cấp thêm {format_quantity(delta)} {unit}, "
            f"tồn khả dụng {format_quantity(available_to_dispense)} {unit}, "
            f"thiếu {format_quantity(missing)} {unit}. Đơn chưa được lưu."
        ], shortage={
            "medicine_name": medicine_name,
            "unit": unit,
            "requested_quantity": str(new_quantity),
            "stock_quantity": str(aggregate_stock),
            "additional_quantity": str(delta),
            "available_quantity": str(available_to_dispense),
            "previous_quantity": str(old_quantity),
        })

    remaining = delta
    for batch in valid_batches:
        if remaining <= ZERO_QUANTITY:
            break
        quantity = min(as_quantity_decimal(batch.remaining_quantity), remaining)
        batch.remaining_quantity = as_quantity_decimal(batch.remaining_quantity) - quantity
        running_stock -= quantity
        allocations[medicine_id][batch.id] = allocations[medicine_id].get(batch.id, ZERO_QUANTITY) + quantity
        _append_stock_transaction(
            db,
            medicine_id=medicine_id,
            appointment_id=appointment_id,
            batch_id=batch.id,
            quantity=quantity,
            is_export=True,
            stock_balance_after=running_stock,
            user_id=user_id,
            unit_cost=batch.import_price,
            balance_after=batch.remaining_quantity,
            operation_id=operation_id,
            sale_unit_price=sale_unit_price,
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
    return running_stock


def _checked_batch_allocations(appointment_id, batches, db, medicine, medicine_id, medicine_name, old_quantity, unit):
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
    return allocated_total, allocations, batch_map, current_allocations


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
    operation_id = uuid4()
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
        sale_unit_price = totals_data.get('sale_unit_price')
        medicine, batches = _lock_inventory(db, medicine_id)
        if delta == ZERO_QUANTITY:
            reprice_open_exports(db, appointment_id=appointment_id, medicine_id=medicine_id,
                sale_unit_price=sale_unit_price, operation_id=operation_id, user_id=user_id,
                stock_balance_after=medicine.stock_quantity if medicine else None,
                batch_balances={batch.id: batch.remaining_quantity for batch in batches})
            continue

        allocated_total, allocations, batch_map, current_allocations = _checked_batch_allocations(appointment_id, batches, db, medicine, medicine_id, medicine_name, old_quantity, unit)

        movements = []
        running_stock = as_quantity_decimal(medicine.stock_quantity)
        if delta > ZERO_QUANTITY:
            running_stock = _dispense_prescription_delta(allocations, appointment_id, batches, db, delta, medicine, medicine_id, medicine_name, movements, new_quantity, old_quantity, operation_id, running_stock, sale_unit_price, unit, user_id)
        else:
            _refund_prescription_delta(allocated_total, appointment_id, batch_map, current_allocations, db, delta, medicine, medicine_id, medicine_name, movements, operation_id, running_stock, user_id)

        reprice_open_exports(db, appointment_id=appointment_id, medicine_id=medicine_id,
            sale_unit_price=sale_unit_price, operation_id=operation_id, user_id=user_id,
            stock_balance_after=medicine.stock_quantity,
            batch_balances={batch.id: batch.remaining_quantity for batch in batches})
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
