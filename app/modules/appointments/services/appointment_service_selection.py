"""Canonical mutation helpers for selected appointment services."""

from decimal import Decimal, InvalidOperation
from typing import Any

from sqlalchemy.orm import Session

from app.models.appointment_service import AppointmentService
from app.models.examination import Examination, ExaminationStatus
from app.models.service import Service


_MISSING = object()


class AppointmentServiceValidationError(ValueError):
    """Raised when a selected service payload violates its business contract."""


class AppointmentServiceLockedError(RuntimeError):
    """Raised when a paid examination must no longer change selected services."""


def to_decimal(value: Any, default: Decimal = Decimal("0")) -> Decimal:
    if value is None:
        return default
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return default


def item_value(item: Any, field: str, default=None):
    if isinstance(item, dict):
        return item.get(field, default)
    provided_fields = getattr(item, "model_fields_set", None)
    if provided_fields is None:
        provided_fields = getattr(item, "__fields_set__", None)
    if provided_fields is not None and field not in provided_fields:
        return default
    return getattr(item, field, default)


def is_appointment_service_locked(db: Session, appointment_id: int) -> bool:
    """Paid examinations are immutable at the appointment-service boundary."""
    return db.query(Examination.id).filter(
        Examination.appointment_id == appointment_id,
        (
            (Examination.payment_status == "PAID")
            | (Examination.status == ExaminationStatus.PAID)
        ),
    ).first() is not None


def ensure_appointment_service_mutable(db: Session, appointment_id: int) -> None:
    if is_appointment_service_locked(db, appointment_id):
        raise AppointmentServiceLockedError("Ca khám đã thanh toán, không thể thay đổi dịch vụ.")


def can_override_appointment_service_finance(current_user) -> bool:
    """Pricing controls belong to finance-facing staff or administrators."""
    role = getattr(current_user, "role", None)
    role_value = getattr(role, "value", role)
    return str(role_value or "").lower() in {"admin", "staff"}


def resolve_catalog_service(
    db: Session,
    service_id: Any,
    *,
    allow_inactive: bool = False,
) -> Service:
    try:
        normalized_id = int(service_id)
    except (TypeError, ValueError):
        raise AppointmentServiceValidationError("service_id là bắt buộc.")

    service = db.query(Service).filter(Service.id == normalized_id).first()
    if not service:
        raise AppointmentServiceValidationError(f"Không tìm thấy dịch vụ id {normalized_id}.")
    if not allow_inactive and not service.is_active:
        raise AppointmentServiceValidationError("Dịch vụ đã ngừng hoạt động, không thể thêm mới.")
    return service


def _percentage(value: Any, field_label: str) -> Decimal:
    percent = to_decimal(value)
    if percent < 0 or percent > 100:
        raise AppointmentServiceValidationError(f"{field_label} phải trong khoảng 0-100%.")
    return percent


def _quantity(value: Any) -> int:
    try:
        quantity = int(value)
    except (TypeError, ValueError):
        raise AppointmentServiceValidationError("Số lượng dịch vụ phải là số nguyên dương.")
    if quantity < 1:
        raise AppointmentServiceValidationError("Số lượng dịch vụ phải lớn hơn hoặc bằng 1.")
    return quantity


def calculate_appointment_service_amounts(
    unit_price: Any,
    quantity: Any,
    discount_percent: Any = Decimal("0"),
    tax_percent: Any = Decimal("0"),
) -> dict[str, Decimal]:
    price = to_decimal(unit_price)
    count = _quantity(quantity)
    discount = _percentage(discount_percent, "Chiết khấu")
    tax = _percentage(tax_percent, "Thuế")
    if price < 0:
        raise AppointmentServiceValidationError("Đơn giá không được âm.")

    subtotal = price * count
    discount_amount = subtotal * discount / Decimal("100")
    taxable_amount = subtotal - discount_amount
    tax_amount = taxable_amount * tax / Decimal("100")
    return {
        "unit_price": price,
        "quantity": Decimal(count),
        "discount_percent": discount,
        "tax_percent": tax,
        "subtotal": subtotal,
        "discount_amount": discount_amount,
        "tax_amount": tax_amount,
        "total_amount": taxable_amount + tax_amount,
    }


def apply_appointment_service_selection(
    record: AppointmentService,
    item: Any,
    service: Service,
    *,
    allow_financial_override: bool = False,
) -> AppointmentService:
    """Apply one selected catalog service while keeping finance server-owned."""
    is_existing_record = record.id is not None
    quantity_value = item_value(item, "quantity", _MISSING)
    if quantity_value is _MISSING and is_existing_record:
        quantity_value = record.quantity
    quantity = _quantity(1 if quantity_value is _MISSING else quantity_value)

    if allow_financial_override:
        unit_price = item_value(item, "unit_price")
        if unit_price is None:
            unit_price = item_value(item, "price")
        if unit_price is None:
            unit_price = item_value(item, "amount")
        if unit_price is None:
            unit_price = record.unit_price if is_existing_record else service.default_price
        discount_percent = item_value(item, "discount_percent")
        if discount_percent is None:
            discount_percent = record.discount_percent if is_existing_record else Decimal("0")
        tax_percent = item_value(item, "tax_percent")
        if tax_percent is None:
            tax_percent = record.tax_percent if is_existing_record else Decimal("0")
    elif is_existing_record:
        # A Doctor/reception sync may change quantity or note, never financial snapshots.
        unit_price = record.unit_price if record.unit_price is not None else record.price
        discount_percent = record.discount_percent
        tax_percent = record.tax_percent
    else:
        unit_price = service.default_price
        discount_percent = Decimal("0")
        tax_percent = Decimal("0")

    amounts = calculate_appointment_service_amounts(
        unit_price,
        quantity,
        discount_percent,
        tax_percent,
    )
    record.service_id = service.id
    record.service_name = service.name
    record.unit_price = amounts["unit_price"]
    record.price = amounts["unit_price"]
    record.quantity = int(amounts["quantity"])
    note = item_value(item, "note", _MISSING)
    record.description = record.description if note is _MISSING else str(note or "")
    record.discount_percent = amounts["discount_percent"]
    record.tax_percent = amounts["tax_percent"]
    record.duration_minutes = service.duration_minutes
    record.total_amount = amounts["total_amount"]
    return record
