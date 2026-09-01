"""Canonical write paths for clinic inventory.

``Medicine.stock_quantity`` is a materialized aggregate.  This module is the
only owner used by medicine/batch APIs when a lot changes the aggregate and
when an inventory movement is recorded.
"""

from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.models.medicine import Medicine
from app.models.medicine_batch import MedicineBatch
from app.models.medicine_transaction import MedicineTransaction


ZERO = Decimal("0")


class InventoryValidationError(ValueError):
    """A user-correctable inventory input error."""


def parse_quantity(value: Any, field: str, *, allow_zero: bool = True) -> Decimal:
    """Parse a finite, non-negative quantity without using binary floats."""

    if value is None or value == "":
        raise InventoryValidationError(f"{field} là bắt buộc")
    try:
        quantity = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        raise InventoryValidationError(f"{field} không hợp lệ")
    if not quantity.is_finite() or quantity < ZERO or (not allow_zero and quantity == ZERO):
        comparator = "lớn hơn 0" if not allow_zero else "không được âm"
        raise InventoryValidationError(f"{field} {comparator}")
    if quantity.as_tuple().exponent < -2:
        raise InventoryValidationError(f"{field} chỉ hỗ trợ tối đa 2 chữ số thập phân")
    return quantity


def parse_delta(value: Any, field: str) -> Decimal:
    """Parse a signed finite delta for adjustment calls."""

    if value is None or value == "":
        raise InventoryValidationError(f"{field} là bắt buộc")
    try:
        delta = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        raise InventoryValidationError(f"{field} không hợp lệ")
    if not delta.is_finite():
        raise InventoryValidationError(f"{field} không hợp lệ")
    if delta.as_tuple().exponent < -2:
        raise InventoryValidationError(f"{field} chỉ hỗ trợ tối đa 2 chữ số thập phân")
    return delta


def lock_medicine(db: Session, medicine_id: int) -> Optional[Medicine]:
    """Lock the aggregate row before locking a related batch."""

    return (
        db.query(Medicine)
        .filter(Medicine.id == medicine_id)
        .with_for_update()
        .first()
    )


def add_movement(
    db: Session,
    *,
    medicine_id: int,
    batch_id: Optional[int],
    movement_type: str,
    quantity: Decimal,
    price: Optional[Any],
    note: str,
    created_by: Optional[int],
) -> MedicineTransaction:
    """Append one immutable movement row after the balance mutation."""

    movement = MedicineTransaction(
        medicine_id=medicine_id,
        batch_id=batch_id,
        type=movement_type,
        quantity=quantity,
        price=price,
        note=note,
        created_by=created_by,
    )
    db.add(movement)
    return movement


def import_batch(
    db: Session,
    *,
    medicine_id: int,
    batch_number: str,
    import_date,
    expiry_date,
    quantity: Any,
    import_price: Optional[Any],
    supplier_id: Optional[int],
    invoice_number: Optional[str],
    notes: Optional[str],
    created_by: Optional[int],
):
    """Create a lot and its import movement atomically in the current tx."""

    quantity_decimal = parse_quantity(quantity, "Số lượng nhập", allow_zero=False)
    medicine = lock_medicine(db, medicine_id)
    if not medicine:
        raise LookupError("Không tìm thấy thuốc")

    batch = MedicineBatch(
        medicine_id=medicine_id,
        batch_number=batch_number,
        import_date=import_date,
        expiry_date=expiry_date,
        quantity=quantity_decimal,
        # A newly imported lot is always fully available.  The balance cannot
        # be supplied independently of the import quantity.
        remaining_quantity=quantity_decimal,
        import_price=import_price,
        supplier_id=supplier_id,
        invoice_number=invoice_number,
        created_by=created_by,
        notes=notes,
    )
    db.add(batch)
    db.flush()

    current_stock = Decimal(str(medicine.stock_quantity or 0))
    medicine.stock_quantity = current_stock + quantity_decimal
    movement = add_movement(
        db,
        medicine_id=medicine_id,
        batch_id=batch.id,
        movement_type="import",
        quantity=quantity_decimal,
        price=import_price,
        note=notes or "Nhập lô thuốc",
        created_by=created_by,
    )
    return medicine, batch, movement


def adjust_batch(
    db: Session,
    *,
    batch_id: int,
    actual_quantity: Any = None,
    delta: Any = None,
    note: str,
    created_by: Optional[int],
):
    """Adjust one lot and the aggregate with one append-only ledger row."""

    if not note or not note.strip():
        raise InventoryValidationError("Lý do điều chỉnh là bắt buộc")
    if actual_quantity is None and delta is None:
        raise InventoryValidationError("Cần số lượng thực tế hoặc chênh lệch")
    if actual_quantity is not None and delta is not None:
        raise InventoryValidationError("Chỉ gửi một trong actual_quantity hoặc delta")

    batch_probe = db.query(MedicineBatch).filter(MedicineBatch.id == batch_id).first()
    if not batch_probe:
        raise LookupError("Không tìm thấy lô thuốc")
    medicine = lock_medicine(db, batch_probe.medicine_id)
    if not medicine:
        raise LookupError("Không tìm thấy thuốc của lô")
    batch = (
        db.query(MedicineBatch)
        .filter(MedicineBatch.id == batch_id)
        .with_for_update()
        .first()
    )
    if not batch:
        raise LookupError("Không tìm thấy lô thuốc")

    old_quantity = Decimal(str(batch.remaining_quantity or 0))
    if actual_quantity is not None:
        new_quantity = parse_quantity(actual_quantity, "Số lượng thực tế")
        movement_delta = new_quantity - old_quantity
    else:
        movement_delta = parse_delta(delta, "Chênh lệch")
        new_quantity = old_quantity + movement_delta
        if new_quantity < ZERO:
            raise InventoryValidationError("Số lượng sau điều chỉnh không được âm")

    if movement_delta == ZERO:
        return medicine, batch, None, old_quantity, new_quantity

    old_stock = Decimal(str(medicine.stock_quantity or 0))
    new_stock = old_stock + movement_delta
    if new_stock < ZERO:
        raise InventoryValidationError(
            "Tồn tổng hiện tại không đủ để ghi nhận chênh lệch giảm của lô"
        )

    batch.remaining_quantity = new_quantity
    medicine.stock_quantity = new_stock
    movement = add_movement(
        db,
        medicine_id=medicine.id,
        batch_id=batch.id,
        movement_type="adjustment",
        quantity=movement_delta,
        price=batch.import_price,
        note=note.strip(),
        created_by=created_by,
    )
    return medicine, batch, movement, old_quantity, new_quantity
