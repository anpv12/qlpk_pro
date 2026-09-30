"""Query service for clinical indication management screens."""

from dataclasses import dataclass
from datetime import datetime
import logging

from sqlalchemy import func, or_
from sqlalchemy.orm import joinedload

from app.models.appointment import Appointment
from app.models.chi_dinh import ChiDinh
from app.models.patient import Patient
from app.models.survey_template import SurveyTemplate
from app.models.user import User
from app.utils.search_normalization import normalized_contains


@dataclass
class ChiDinhListResult:
    items: list
    total: int
    page: int
    per_page: int
    total_pages: int
    group_counts: dict
    next_expiry_at: str | None


class InvalidPagination(ValueError):
    """Raised when list pagination values are not positive integers."""


def get_survey_templates_for_order_result(db):
    """Return active survey templates that can be used as an indication."""
    return (
        db.query(SurveyTemplate)
        .options(joinedload(SurveyTemplate.default_performer))
        .filter(
            SurveyTemplate.is_active.is_(True),
            SurveyTemplate.content.isnot(None),
        )
        .order_by(SurveyTemplate.name)
        .all()
    )


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


def _apply_chi_dinh_list_filters(appointment_joined, doctor_name, from_date, location_type, logger, patient_name, query, to_date):
    if doctor_name or patient_name:
        if not appointment_joined:
            query = query.join(Appointment, ChiDinh.appointment_id == Appointment.id)
            appointment_joined = True
        if doctor_name:
            query = query.join(User, Appointment.doctor_id == User.id)
            query = query.filter(
                or_(
                    normalized_contains(User.full_name, doctor_name),
                    normalized_contains(User.name, doctor_name),
                )
            )
        if patient_name:
            query = query.join(Patient, Appointment.patient_id == Patient.id)
            query = query.filter(
                or_(
                    normalized_contains(Patient.full_name, patient_name),
                    normalized_contains(Patient.nickname, patient_name),
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

    if location_type:
        query = query.filter(ChiDinh.location_type == location_type.lower())
    return query


def get_chi_dinh_list_result(db, user, args, logger=None) -> ChiDinhListResult:
    """Return filtered ChiDinh models and legacy pagination metadata."""
    logger = logger or logging.getLogger(__name__)

    doctor_name = args.get('doctor_name', '').strip()
    patient_name = args.get('patient_name', '').strip()
    from_date = args.get('from_date', '').strip()
    to_date = args.get('to_date', '').strip()
    status = args.get('status', '').strip()
    status_group = args.get('status_group', '').strip()
    if status_group not in ('', 'active', 'completed'):
        raise InvalidPagination('Nhóm trạng thái không hợp lệ')
    location_type = args.get('location_type', '').strip()
    page = _positive_int(args.get('page', 1), 'page')
    per_page = min(_positive_int(args.get('per_page', 50), 'per_page'), 100)

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

    query = _apply_chi_dinh_list_filters(appointment_joined, doctor_name, from_date, location_type, logger, patient_name, query, to_date)

    # Counts are over the same permission/name/date scope, before status/paging.
    completed_count = query.filter(ChiDinh.status == 'completed').count()
    active_count = query.filter(ChiDinh.status != 'completed').count()
    next_expiry = query.filter(ChiDinh.status != 'completed').with_entities(func.min(ChiDinh.survey_expires_at)).scalar()
    if status:
        query = query.filter(ChiDinh.status == status)
    if status_group == 'active':
        query = query.filter(ChiDinh.status != 'completed')
    elif status_group == 'completed':
        query = query.filter(ChiDinh.status == 'completed')
    total = query.count()
    total_pages = max(1, (total + per_page - 1) // per_page)
    page = min(page, total_pages)
    items = query.order_by(ChiDinh.created_at.desc(), ChiDinh.id.desc()).offset((page - 1) * per_page).limit(per_page).all()

    logger.info(f"Found {len(items)} chi_dinh records, total: {total}")

    return ChiDinhListResult(
        items=items,
        total=total,
        page=page,
        per_page=per_page,
        total_pages=total_pages,
        group_counts={'active': active_count, 'completed': completed_count},
        next_expiry_at=next_expiry.isoformat() if next_expiry else None,
    )


def _positive_int(value, field_name):
    try:
        normalized = int(value)
    except (TypeError, ValueError) as exc:
        raise InvalidPagination(f'{field_name} phải là số nguyên dương') from exc
    if normalized <= 0:
        raise InvalidPagination(f'{field_name} phải là số nguyên dương')
    return normalized
