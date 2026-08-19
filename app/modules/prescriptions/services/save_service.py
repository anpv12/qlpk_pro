"""Atomic persistence owner for the internal prescription save workflow."""

from datetime import date, datetime
from decimal import Decimal, InvalidOperation
import math

from sqlalchemy import func

from app.models.appointment import Appointment
from app.models.medicine import Medicine
from app.models.prescription import Prescription, PrescriptionItem
from app.modules.prescriptions.services.stock_service import (
    PrescriptionStockValidationError,
    ZERO_QUANTITY,
    apply_prescription_batch_stock_deltas,
    build_prescription_batch_allocation_states,
)


class PrescriptionSaveError(Exception):
    """Base error raised by the atomic prescription save owner."""


class PrescriptionAppointmentNotFound(PrescriptionSaveError):
    """Raised when the aggregate row disappears before it can be locked."""


def _parse_medicine_id(value):
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


def _is_external_medicine(value):
    if isinstance(value, str):
        return value.strip().lower() in {'true', '1', 'yes', 'y'}
    return bool(value)


def _medicine_display_name(medicine_data, medicine=None):
    name = (medicine_data.get('name') or '').strip()
    if name:
        return name
    if medicine and medicine.name:
        return medicine.name.strip()
    return ''


def _as_quantity_decimal(value):
    try:
        parsed = Decimal(str(value or 0))
    except (InvalidOperation, TypeError, ValueError):
        return ZERO_QUANTITY
    return parsed if parsed.is_finite() else ZERO_QUANTITY


def normalize_prescription_quantity(value):
    """Return the whole dispensing quantity while keeping dose fractions in usage."""
    try:
        parsed = float(value or 0)
    except (TypeError, ValueError):
        return 0
    if not math.isfinite(parsed):
        return 0
    return math.ceil(max(0.0, parsed))


def normalize_prescription_medicines(medicines):
    """Normalize every incoming prescription row before price/stock/item writes."""
    normalized = []
    for medicine_data in medicines or []:
        item = dict(medicine_data or {})
        item['quantity'] = normalize_prescription_quantity(item.get('quantity'))
        normalized.append(item)
    return normalized


def collect_old_prescription_item_totals(db, appointment_id):
    """Read the currently saved stock state from its single canonical owner."""
    unmapped_names = [
        row[0]
        for row in db.query(PrescriptionItem.medicine_name)
        .join(Prescription, Prescription.id == PrescriptionItem.prescription_id)
        .filter(
            Prescription.appointment_id == appointment_id,
            PrescriptionItem.is_external.is_(False),
            PrescriptionItem.medicine_id.is_(None),
            PrescriptionItem.quantity > 0,
        )
        .all()
    ]
    if unmapped_names:
        labels = ", ".join(name or "Thuốc chưa có tên" for name in unmapped_names[:5])
        raise PrescriptionStockValidationError([
            "Đơn hiện tại có thuốc phòng khám chưa gắn medicine_id; "
            f"cần chọn lại thuốc kho trước khi lưu: {labels}"
        ])

    rows = (
        db.query(
            PrescriptionItem.medicine_id,
            func.sum(PrescriptionItem.quantity).label("saved_quantity"),
        )
        .join(Prescription, Prescription.id == PrescriptionItem.prescription_id)
        .filter(
            Prescription.appointment_id == appointment_id,
            PrescriptionItem.is_external.is_(False),
            PrescriptionItem.medicine_id.isnot(None),
        )
        .group_by(PrescriptionItem.medicine_id)
        .all()
    )
    return {
        int(medicine_id): _as_quantity_decimal(saved_quantity)
        for medicine_id, saved_quantity in rows
        if _as_quantity_decimal(saved_quantity) > ZERO_QUANTITY
    }


def collect_new_in_clinic_totals(medicines):
    """Aggregate the normalized request by selected medicine id without DB inference."""
    totals = {}
    errors = []
    for medicine_data in medicines:
        quantity = normalize_prescription_quantity(medicine_data.get('quantity'))
        if _is_external_medicine(medicine_data.get('is_external', False)) or quantity <= 0:
            continue

        medicine_name = _medicine_display_name(medicine_data)
        medicine_id = _parse_medicine_id(medicine_data.get('medicine_id'))
        if not medicine_id:
            errors.append(f"Vui lòng chọn thuốc từ kho: {medicine_name or 'Chưa có tên thuốc'}")
            continue

        if medicine_id not in totals:
            totals[medicine_id] = {
                'medicine_name': medicine_name,
                'total_in_clinic_qty': ZERO_QUANTITY,
            }
        totals[medicine_id]['total_in_clinic_qty'] += Decimal(quantity)
    return totals, errors


def load_medicine_catalog(db, medicine_ids):
    """Load immutable catalog metadata needed by one save attempt."""
    if not medicine_ids:
        return {}
    rows = db.query(
        Medicine.id,
        Medicine.name,
        Medicine.unit,
        Medicine.prescription_type,
    ).filter(Medicine.id.in_(sorted(medicine_ids))).all()
    return {
        row.id: {
            'id': row.id,
            'name': (row.name or '').strip(),
            'unit': row.unit or 'viên',
            'prescription_type': row.prescription_type or 'BASIC',
        }
        for row in rows
    }


def group_medicines_by_prescription_type(medicines, medicine_catalog):
    """Group medicine payload rows by prescription type using the medicine catalog."""
    medicines_by_type = {}
    for medicine_data in medicines:
        medicine_name = _medicine_display_name(medicine_data)
        if not medicine_name:
            continue
        medicine_id = _parse_medicine_id(medicine_data.get('medicine_id'))
        medicine_obj = medicine_catalog.get(medicine_id)
        med_type = (
            medicine_obj.get('prescription_type') if medicine_obj
            else medicine_data.get('prescription_type') or 'BASIC'
        ) or 'BASIC'
        if med_type not in medicines_by_type:
            medicines_by_type[med_type] = []
        medicines_by_type[med_type].append(medicine_data)

    if not medicines_by_type:
        medicines_by_type['BASIC'] = []
    return medicines_by_type

def generate_prescription_code(db_session, prescription_type_char, exclude_ids=None):
    """Generate a unique prescription code using the legacy sequence logic."""
    today = date.today()
    count = db_session.query(Prescription).filter(
        Prescription.created_at >= datetime.combine(today, datetime.min.time()),
        Prescription.created_at < datetime.combine(today, datetime.max.time())
    ).count()
    next_seq = count + 1
    facility_code = '79836'
    date_code = f"{today.day:02d}{today.month:02d}"
    for _ in range(100):
        seq_code = f"{next_seq:03d}"
        candidate = f"{facility_code}{date_code}{seq_code}-{prescription_type_char}"
        q = db_session.query(Prescription).filter(Prescription.prescription_code == candidate)
        if exclude_ids:
            q = q.filter(Prescription.id.notin_(exclude_ids))
        if not q.first():
            return candidate
        next_seq += 1
    return None

def sync_prescriptions_by_type(
    db,
    appointment_id,
    existing_prescriptions_by_type,
    medicines_by_type,
    usage_instructions,
    re_examination_date,
):
    """Create, update, or delete prescription headers by BASIC/H/N type."""
    type_char_map = {'BASIC': 'C', 'H': 'H', 'N': 'N'}
    prescription_ids_by_type = {}

    for p_type in ['BASIC', 'H', 'N']:
        type_medicines = medicines_by_type.get(p_type, [])
        type_has_valid = any(
            m.get('name', '').strip() and normalize_prescription_quantity(m.get('quantity')) > 0
            for m in type_medicines
        )
        type_char = type_char_map.get(p_type, 'C')
        existing_p = existing_prescriptions_by_type.get(p_type)

        if existing_p:
            if type_has_valid:
                existing_p.total_amount = sum(
                    float(m.get('unit_price', 0)) * normalize_prescription_quantity(m.get('quantity'))
                    for m in type_medicines
                )
                existing_p.usage_instructions = usage_instructions
                existing_p.re_examination_date = re_examination_date
                existing_p.updated_at = datetime.now()
                if not existing_p.prescription_code:
                    existing_p.prescription_code = generate_prescription_code(db, type_char, [existing_p.id])
                    db.flush()
                else:
                    seq_part = existing_p.prescription_code.rsplit('-', 1)[0]
                    duplicate_count = db.query(Prescription).filter(
                        Prescription.prescription_code.like(seq_part + '-%'),
                        Prescription.id != existing_p.id
                    ).count()
                    if duplicate_count > 0:
                        existing_p.prescription_code = generate_prescription_code(db, type_char, [existing_p.id])
                        db.flush()
                prescription_ids_by_type[p_type] = existing_p.id
            else:
                existing_p.prescription_code = None
                db.delete(existing_p)
                db.flush()
        else:
            if type_has_valid:
                p_code = generate_prescription_code(db, type_char)
                new_p = Prescription(
                    appointment_id=appointment_id,
                    prescription_code=p_code,
                    prescription_type=p_type,
                    total_amount=sum(
                        float(m.get('unit_price', 0)) * normalize_prescription_quantity(m.get('quantity'))
                        for m in type_medicines
                    ),
                    usage_instructions=usage_instructions,
                    re_examination_date=re_examination_date,
                    created_at=datetime.now(),
                    updated_at=datetime.now()
                )
                db.add(new_p)
                db.flush()
                prescription_ids_by_type[p_type] = new_p.id

    return prescription_ids_by_type

def get_primary_prescription_id(prescription_ids_by_type, existing_prescriptions):
    """Return the legacy preferred prescription_id for the save response."""
    return (
        prescription_ids_by_type.get('BASIC') or
        prescription_ids_by_type.get('H') or
        prescription_ids_by_type.get('N') or
        (existing_prescriptions[0].id if existing_prescriptions else None)
    )

def create_prescription_items(db, medicines_by_type, prescription_ids_by_type, medicine_catalog):
    """Create prescription items for each synced prescription type."""
    for p_type, type_medicines in medicines_by_type.items():
        target_prescription_id = prescription_ids_by_type.get(p_type)
        if not target_prescription_id:
            continue
        for medicine_data in type_medicines:
            quantity = normalize_prescription_quantity(medicine_data.get('quantity'))
            is_external = _is_external_medicine(medicine_data.get('is_external', False))
            medicine_id = _parse_medicine_id(medicine_data.get('medicine_id'))
            medicine = medicine_catalog.get(medicine_id) if not is_external else None
            medicine_name = _medicine_display_name(medicine_data) or (medicine or {}).get('name', '')

            if not medicine_name or quantity <= 0:
                continue

            if not medicine and not is_external:
                continue

            prescription_item = PrescriptionItem(
                prescription_id=target_prescription_id,
                medicine_id=medicine['id'] if medicine else None,
                medicine_name=medicine_name,
                unit_price=medicine_data.get('unit_price', 0),
                quantity=quantity,
                unit=medicine_data.get('unit', ''),
                strength=medicine_data.get('strength', ''),
                route=medicine_data.get('route', ''),
                usage=medicine_data.get('usage', ''),
                is_external=is_external,
                created_at=datetime.now()
            )
            db.add(prescription_item)


def _persist_prescription_transaction(
    db,
    *,
    appointment_id,
    user_id,
    medicines,
    usage_instructions,
    re_examination_date,
):
    """Build one appointment prescription and inventory delta before commit.

    The appointment row serializes concurrent saves of the same aggregate.
    Deterministically ordered medicine and batch row locks protect shared stock
    across different appointments.
    """
    locked_appointment_id = (
        db.query(Appointment.id)
        .filter(Appointment.id == appointment_id)
        .with_for_update()
        .scalar()
    )
    if not locked_appointment_id:
        raise PrescriptionAppointmentNotFound(f"Appointment {appointment_id} not found")

    existing_prescriptions = db.query(Prescription).filter(
        Prescription.appointment_id == appointment_id
    ).all()
    existing_prescriptions_by_type = {
        prescription.prescription_type or 'BASIC': prescription
        for prescription in existing_prescriptions
    }

    old_totals_by_medicine = collect_old_prescription_item_totals(db, appointment_id)
    new_totals_by_medicine, stock_errors = collect_new_in_clinic_totals(medicines)
    medicine_ids = set(old_totals_by_medicine) | set(new_totals_by_medicine)
    medicine_catalog = load_medicine_catalog(db, medicine_ids)

    for medicine_id, totals in new_totals_by_medicine.items():
        medicine = medicine_catalog.get(medicine_id)
        if not medicine:
            stock_errors.append(
                f"Không tìm thấy thuốc trong kho: {totals.get('medicine_name') or medicine_id}"
            )
        elif not totals.get('medicine_name'):
            totals['medicine_name'] = medicine['name']
    for medicine_data in medicines:
        if _is_external_medicine(medicine_data.get('is_external', False)):
            continue
        medicine_id = _parse_medicine_id(medicine_data.get('medicine_id'))
        medicine = medicine_catalog.get(medicine_id)
        if medicine and not _medicine_display_name(medicine_data):
            medicine_data['name'] = medicine['name']
    missing_old_ids = sorted(set(old_totals_by_medicine) - set(medicine_catalog))
    if missing_old_ids:
        stock_errors.append(
            "Đơn hiện tại tham chiếu thuốc kho không còn tồn tại: "
            + ", ".join(str(item) for item in missing_old_ids)
        )
    if stock_errors:
        raise PrescriptionStockValidationError(stock_errors)

    medicines_by_type = group_medicines_by_prescription_type(medicines, medicine_catalog)
    for existing_prescription in existing_prescriptions:
        db.query(PrescriptionItem).filter(
            PrescriptionItem.prescription_id == existing_prescription.id
        ).delete(synchronize_session=False)

    prescription_ids_by_type = sync_prescriptions_by_type(
        db,
        appointment_id,
        existing_prescriptions_by_type,
        medicines_by_type,
        usage_instructions,
        re_examination_date,
    )
    prescription_id = get_primary_prescription_id(
        prescription_ids_by_type,
        existing_prescriptions,
    )
    stock_updates = apply_prescription_batch_stock_deltas(
        db,
        user_id=user_id,
        appointment_id=appointment_id,
        new_totals_by_medicine=new_totals_by_medicine,
        old_totals_by_medicine=old_totals_by_medicine,
        medicine_catalog=medicine_catalog,
    )
    create_prescription_items(
        db,
        medicines_by_type,
        prescription_ids_by_type,
        medicine_catalog,
    )
    db.flush()

    allocation_states = build_prescription_batch_allocation_states(
        db,
        appointment_id,
        {
            medicine_id: totals.get('total_in_clinic_qty', ZERO_QUANTITY)
            for medicine_id, totals in new_totals_by_medicine.items()
        },
    )

    prescription_codes_by_type = {
        prescription.prescription_type or 'BASIC': prescription.prescription_code
        for prescription in db.query(Prescription).filter(
            Prescription.appointment_id == appointment_id,
            Prescription.prescription_code.isnot(None),
        ).all()
    }
    return {
        'prescription_id': prescription_id,
        'stock_updates': stock_updates,
        'stock_allocation_states': list(allocation_states.values()),
        'prescription_codes_by_type': prescription_codes_by_type,
    }


def save_prescription_transaction(
    db,
    *,
    appointment_id,
    user_id,
    medicines,
    usage_instructions,
    re_examination_date,
):
    """Own commit/rollback for one atomic prescription aggregate save."""
    try:
        result = _persist_prescription_transaction(
            db,
            appointment_id=appointment_id,
            user_id=user_id,
            medicines=medicines,
            usage_instructions=usage_instructions,
            re_examination_date=re_examination_date,
        )
        db.commit()
        return result
    except Exception:
        db.rollback()
        raise
