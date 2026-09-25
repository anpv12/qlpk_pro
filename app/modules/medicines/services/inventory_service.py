"""Canonical write paths for clinic inventory.

``Medicine.stock_quantity`` is a materialized aggregate.  This module is the
only owner used by medicine/batch APIs when a lot changes the aggregate and
when an import or verified opening movement is recorded.
"""

from __future__ import annotations

from decimal import Decimal, InvalidOperation
from datetime import date
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
    balance_after: Optional[Decimal] = None,
    stock_balance_after: Optional[Decimal] = None,
) -> MedicineTransaction:
    """Append one immutable movement row after the balance mutation."""

    movement = MedicineTransaction(
        medicine_id=medicine_id,
        batch_id=batch_id,
        type=movement_type,
        quantity=quantity,
        price=price,
        balance_after=balance_after,
        stock_balance_after=stock_balance_after,
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
    if quantity_decimal > Decimal('9999999.99'):
        raise InventoryValidationError('Số lượng nhập vượt giới hạn của một lần nhập')
    price_decimal = parse_quantity(import_price, "Đơn giá nhập")
    if price_decimal > Decimal('99999999.99'):
        raise InventoryValidationError('Đơn giá nhập vượt giới hạn cho phép')
    if not isinstance(batch_number, str) or not batch_number.strip() or len(batch_number.strip()) > 50:
        raise InventoryValidationError('Số lô thực tế là bắt buộc (tối đa 50 ký tự)')
    batch_number = batch_number.strip()
    if import_date > date.today() or expiry_date < import_date:
        raise InventoryValidationError('Ngày nhập không được ở tương lai; hạn dùng không được trước ngày nhập')
    medicine = lock_medicine(db, medicine_id)
    if not medicine:
        raise LookupError("Không tìm thấy thuốc")
    if medicine.category_type != 'DRUG':
        raise InventoryValidationError('Bản ghi cũ cần đối chiếu DAV trước khi nhập thêm thuốc.')
    existing = db.query(MedicineBatch.id).filter(
        MedicineBatch.medicine_id == medicine_id,
        MedicineBatch.batch_number == batch_number,
        MedicineBatch.expiry_date != expiry_date,
    ).first()
    if existing:
        raise InventoryValidationError('Cùng thuốc và số lô phải có cùng hạn dùng; hãy kiểm tra lại bao bì')

    batch = MedicineBatch(
        medicine_id=medicine_id,
        batch_number=batch_number,
        import_date=import_date,
        expiry_date=expiry_date,
        quantity=quantity_decimal,
        # A newly imported lot is always fully available.  The balance cannot
        # be supplied independently of the import quantity.
        remaining_quantity=quantity_decimal,
        import_price=price_decimal,
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
        price=price_decimal,
        balance_after=quantity_decimal,
        stock_balance_after=medicine.stock_quantity,
        note=notes or "Nhập lô thuốc",
        created_by=created_by,
    )
    return medicine, batch, movement


def plan_existing_stock_batches(db, *, medicine_id, expected_stock, source_document, batches, lock=False):
    """Validate a verified opening allocation. Never infer historical lots."""
    medicine = lock_medicine(db, medicine_id) if lock else db.query(Medicine).filter_by(id=medicine_id).first()
    if not medicine:
        raise InventoryValidationError("Không tìm thấy thuốc")
    expected = parse_quantity(expected_stock, "Tồn đã đối chiếu", allow_zero=False)
    current = Decimal(str(medicine.stock_quantity or 0))
    if expected != current:
        raise InventoryValidationError("Tồn đã thay đổi; cần đối chiếu lại trước khi gán lô")
    if db.query(MedicineBatch.id).filter_by(medicine_id=medicine_id).first():
        raise InventoryValidationError("Thuốc đã có lô; không được gán tồn ban đầu lần nữa")
    if not isinstance(source_document, str) or not source_document.strip() or len(source_document.strip()) > 300:
        raise InventoryValidationError("Cần chứng từ/biên bản đối chiếu thực tế (tối đa 300 ký tự)")
    if not isinstance(batches, list) or not batches:
        raise InventoryValidationError("Cần danh sách lô đã xác nhận")
    prepared, numbers = [], set()
    for item in batches:
        if not isinstance(item, dict):
            raise InventoryValidationError("Thông tin lô không hợp lệ")
        number = item.get('batch_number')
        if not isinstance(number, str) or not number.strip() or len(number.strip()) > 50:
            raise InventoryValidationError("Số lô thực tế là bắt buộc (tối đa 50 ký tự)")
        number = number.strip()
        if number in numbers or db.query(MedicineBatch.id).filter_by(medicine_id=medicine_id, batch_number=number).first():
            raise InventoryValidationError(f"Số lô {number} bị trùng; cần kiểm tra lại chứng từ")
        numbers.add(number)
        try:
            imported = date.fromisoformat(item['import_date'])
            expiry = date.fromisoformat(item['expiry_date'])
        except (KeyError, TypeError, ValueError):
            raise InventoryValidationError("Cần ngày nhập và hạn dùng thực tế theo YYYY-MM-DD") from None
        if imported > date.today() or expiry < imported:
            raise InventoryValidationError("Ngày nhập/hạn dùng của lô không hợp lệ")
        prepared.append({'batch_number': number, 'import_date': imported, 'expiry_date': expiry,
                         'quantity': parse_quantity(item.get('quantity'), 'Số lượng thực tế của lô', allow_zero=False)})
    if sum((item['quantity'] for item in prepared), ZERO) != current:
        raise InventoryValidationError("Tổng số lượng các lô phải bằng tồn hiện hữu; không cộng thêm hoặc bỏ bớt tồn")
    return medicine, prepared


def register_existing_stock_batches(db, *, medicine_id, expected_stock, source_document, batches, created_by):
    """Register verified opening balances without importing inventory twice.

    The caller owns commit/rollback. Quantity is the verified opening balance,
    not a claim about the historical import. Zero-delta adjustment events keep
    aggregate stock and stock-movement totals unchanged and retain provenance.
    """
    medicine, prepared = plan_existing_stock_batches(
        db, medicine_id=medicine_id, expected_stock=expected_stock,
        source_document=source_document, batches=batches, lock=True)
    created = []
    for item in prepared:
        note = (f"Gán tồn hiện hữu vào lô: {item['quantity']} {medicine.unit}; "
                f"không thay đổi tồn tổng. Chứng từ: {source_document.strip()}")
        batch = MedicineBatch(medicine_id=medicine.id, **item,
                              remaining_quantity=item['quantity'], created_by=created_by, notes=note)
        db.add(batch)
        db.flush()
        add_movement(db, medicine_id=medicine.id, batch_id=batch.id,
                     movement_type='adjustment', quantity=ZERO, price=None,
                     balance_after=item['quantity'],
                     stock_balance_after=medicine.stock_quantity,
                     note=note, created_by=created_by)
        created.append(batch)
    return created
