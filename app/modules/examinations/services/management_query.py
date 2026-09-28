"""Read/query services for examination management APIs."""

from datetime import datetime, timedelta

from sqlalchemy import or_, false, func

from app.models.appointment import Appointment
from app.models.examination import Examination, ExaminationStatus
from app.models.patient import Patient
from app.models.user import User
from app.modules.examinations.view_models.management import (
    build_examination_management_detail_response,
    build_examination_management_list_item,
)
from app.utils.search_normalization import normalized_contains
from app.utils.clinical_access import has_full_patient_scope, user_role_value

class ManagementExaminationNotFound(Exception):
    """Raised when an active management examination row does not exist."""

class InvalidManagementFilter(ValueError):
    pass


def management_examination_query(db, user):
    appointment_scope = [Appointment.is_deleted.is_(False)]
    if not user or getattr(user, 'is_active', False) is not True:
        appointment_scope.append(false())
    elif not has_full_patient_scope(user):
        role = user_role_value(user)
        if role == 'doctor':
            appointment_scope.append(Appointment.doctor_id == user.id)
        elif role == 'psychologist':
            appointment_scope.append(or_(Appointment.doctor_id == user.id, Appointment.psychologist_id == user.id))
        else:
            appointment_scope.append(false())
    appointments = db.query(Appointment.id).filter(*appointment_scope)
    return db.query(Examination).filter(Examination.is_active.is_(True), Examination.appointment_id.in_(appointments))


def positive_integer(args, name, default=None, maximum=None):
    raw = args.get(name)
    if raw is None:
        return default
    try:
        value = int(raw)
        if value < 1 or (maximum is not None and value > maximum):
            raise ValueError()
        return value
    except (TypeError, ValueError):
        raise InvalidManagementFilter(f'{name} không hợp lệ.') from None


def date_bounds(args):
    try:
        start = datetime.strptime(args['from_date'], '%Y-%m-%d') if args.get('from_date') else None
        end = datetime.strptime(args['to_date'], '%Y-%m-%d') if args.get('to_date') else None
        if start and end and start > end:
            raise ValueError()
        return start, end + timedelta(days=1) if end else None
    except (ValueError, OverflowError):
        raise InvalidManagementFilter('Khoảng ngày không hợp lệ.') from None


def filtered_management_query(db, args, user):
    query = management_examination_query(db, user)
    doctor_id = positive_integer(args, 'doctor_id')
    if doctor_id is not None:
        query = query.filter(Examination.doctor_id == doctor_id)
    start, end = date_bounds(args)
    if start:
        query = query.filter(Examination.examination_date >= start)
    if end:
        query = query.filter(Examination.examination_date < end)

    search = args.get('search', '').strip()
    if search:
        query = query.join(Patient).join(User, User.id == Examination.doctor_id)
        query = query.filter(
            or_(
                normalized_contains(Examination.examination_code, search),
                normalized_contains(Patient.full_name, search),
                normalized_contains(User.full_name, search),
            )
        )

    return query


def get_examination_management_list_result(db, args, user):
    """Build the scoped payload for GET /examinations."""
    page = positive_integer(args, 'page', 1)
    per_page = positive_integer(args, 'per_page', 10, 100)
    query = filtered_management_query(db, args, user)
    status = args.get('status')
    if status:
        try:
            query = query.filter(Examination.status == ExaminationStatus(status))
        except ValueError:
            raise InvalidManagementFilter('Trạng thái không hợp lệ.') from None
    query = query.order_by(Examination.examination_date.desc(), Examination.id.desc())
    total = query.count()
    examinations = query.offset((page - 1) * per_page).limit(per_page).all()

    return {
        'examinations': [build_examination_management_list_item(db, exam) for exam in examinations],
        'total': total,
        'page': page,
        'per_page': per_page,
        'total_pages': (total + per_page - 1) // per_page,
    }

def get_examination_management_detail_result(db, examination_id, user):
    """Build the legacy payload for GET /examinations/<id>."""
    examination = get_active_management_examination(db, examination_id, user)
    return build_examination_management_detail_response(db, examination)

def get_active_management_examination(db, examination_id, user, *, for_update=False):
    query = management_examination_query(db, user).filter(Examination.id == examination_id)
    if for_update:
        query = query.with_for_update(of=Examination)
    examination = query.first()
    if not examination:
        raise ManagementExaminationNotFound()
    return examination

def get_examination_stats_result(db, args, user):
    """Count status badges within the same actor/date/search scope as the list."""
    query = filtered_management_query(db, args, user)
    rows = query.with_entities(Examination.status, func.count(Examination.id)).group_by(Examination.status).all()
    counts = dict(rows)
    return {status.value: counts.get(status, 0) for status in ExaminationStatus if status != ExaminationStatus.PAID}
