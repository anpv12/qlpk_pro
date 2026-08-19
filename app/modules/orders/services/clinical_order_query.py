"""Query service for clinical indication management screens."""

from dataclasses import dataclass
from datetime import datetime
import logging

from sqlalchemy import func, or_

from app.models.appointment import Appointment
from app.models.chi_dinh import ChiDinh
from app.models.patient import Patient
from app.models.user import User
from sqlalchemy.orm import joinedload

@dataclass
class ChiDinhListResult:
    items: list
    total: int
    page: int
    per_page: int
    total_pages: int


def get_chi_dinh_for_patient(db, patient_id, exclude_appointment_id=None, limit=100):
    """Return prior indication rows for one patient in reverse visit order."""
    query = (
        db.query(ChiDinh)
        .join(Appointment, ChiDinh.appointment_id == Appointment.id)
        .options(joinedload(ChiDinh.appointment))
        .filter(
            Appointment.patient_id == patient_id,
            Appointment.is_deleted == False,
        )
    )
    if exclude_appointment_id:
        query = query.filter(ChiDinh.appointment_id != exclude_appointment_id)
    return query.order_by(ChiDinh.created_at.desc()).limit(max(1, min(int(limit or 100), 200))).all()

def get_chi_dinh_list_result(db, user, args, logger=None) -> ChiDinhListResult:
    """Return filtered ChiDinh models and legacy pagination metadata."""
    logger = logger or logging.getLogger(__name__)

    doctor_name = args.get('doctor_name', '').strip()
    patient_name = args.get('patient_name', '').strip()
    from_date = args.get('from_date', '').strip()
    to_date = args.get('to_date', '').strip()
    status = args.get('status', '').strip()
    location_type = args.get('location_type', '').strip()
    page = int(args.get('page', 1))
    per_page = int(args.get('per_page', 50))

    # Query trực tiếp từ ChiDinh để giữ nguyên hành vi legacy với join tùy filter.
    query = db.query(ChiDinh)

    user_role = user.role.value if hasattr(user.role, 'value') else str(user.role)
    user_role_upper = user_role.upper()

    appointment_joined = False

    if user_role_upper in ['DOCTOR', 'PSYCHOLOGIST']:
        query = query.filter(ChiDinh.in_house_unit_id == user.id)
        logger.info(
            f"Filtering chi_dinh for {user_role_upper} user {user.id} ({user.full_name}) by in_house_unit_id"
        )

    if doctor_name or patient_name:
        if not appointment_joined:
            query = query.join(Appointment, ChiDinh.appointment_id == Appointment.id)
            appointment_joined = True
        if doctor_name:
            query = query.join(User, Appointment.doctor_id == User.id)
            query = query.filter(
                or_(
                    User.full_name.ilike(f'%{doctor_name}%'),
                    User.name.ilike(f'%{doctor_name}%')
                )
            )
        if patient_name:
            query = query.join(Patient, Appointment.patient_id == Patient.id)
            query = query.filter(
                or_(
                    Patient.full_name.ilike(f'%{patient_name}%'),
                    Patient.nickname.ilike(f'%{patient_name}%')
                )
            )

    if from_date:
        try:
            from_date_obj = datetime.strptime(from_date, '%Y-%m-%d').date()
            query = query.filter(func.date(ChiDinh.created_at) >= from_date_obj)
        except ValueError:
            logger.warning(f"Invalid from_date format: {from_date}")

    if to_date:
        try:
            to_date_obj = datetime.strptime(to_date, '%Y-%m-%d').date()
            query = query.filter(func.date(ChiDinh.created_at) <= to_date_obj)
        except ValueError:
            logger.warning(f"Invalid to_date format: {to_date}")

    if status:
        query = query.filter(ChiDinh.status == status)
    else:
        query = query.filter(ChiDinh.status != 'draft')

    if location_type:
        query = query.filter(ChiDinh.location_type == location_type.lower())

    total = query.count()
    items = query.order_by(ChiDinh.created_at.desc()).offset((page - 1) * per_page).limit(per_page).all()
    total_pages = (total + per_page - 1) // per_page

    logger.info(f"Found {len(items)} chi_dinh records, total: {total}")

    return ChiDinhListResult(
        items=items,
        total=total,
        page=page,
        per_page=per_page,
        total_pages=total_pages,
    )
