"""Read/query services for examination management APIs."""

from datetime import datetime, timedelta

from sqlalchemy import or_

from app.models.examination import Examination, ExaminationStatus
from app.models.patient import Patient
from app.models.user import User
from app.modules.examinations.view_models.management import (
    build_examination_management_detail_response,
    build_examination_management_list_item,
)
from app.utils.search_normalization import normalized_contains

class ManagementExaminationNotFound(Exception):
    """Raised when an active management examination row does not exist."""

def get_examination_management_list_result(db, args):
    """Build the legacy payload for GET /examinations."""
    page = args.get('page', 1, type=int)
    per_page = args.get('per_page', 10, type=int)
    status = args.get('status')
    doctor_id = args.get('doctor_id', type=int)
    from_date = args.get('from_date')
    to_date = args.get('to_date')
    search = args.get('search', '').strip()

    query = db.query(Examination).filter(Examination.is_active == True)

    if status:
        query = query.filter(Examination.status == status)

    if doctor_id:
        query = query.filter(Examination.doctor_id == doctor_id)

    if from_date:
        from_datetime = datetime.strptime(from_date, '%Y-%m-%d')
        query = query.filter(Examination.examination_date >= from_datetime)

    if to_date:
        to_datetime = datetime.strptime(to_date, '%Y-%m-%d') + timedelta(days=1)
        query = query.filter(Examination.examination_date < to_datetime)

    if search:
        query = query.join(Patient).join(User, User.id == Examination.doctor_id)
        query = query.filter(
            or_(
                normalized_contains(Examination.examination_code, search),
                normalized_contains(Patient.full_name, search),
                normalized_contains(User.full_name, search),
            )
        )

    query = query.order_by(Examination.examination_date.desc())
    total = query.count()
    examinations = query.offset((page - 1) * per_page).limit(per_page).all()

    return {
        'examinations': [build_examination_management_list_item(db, exam) for exam in examinations],
        'total': total,
        'page': page,
        'per_page': per_page,
        'total_pages': (total + per_page - 1) // per_page,
    }

def get_examination_management_detail_result(db, examination_id):
    """Build the legacy payload for GET /examinations/<id>."""
    examination = get_active_management_examination(db, examination_id)
    return build_examination_management_detail_response(db, examination)

def get_active_management_examination(db, examination_id):
    examination = db.query(Examination).filter(
        Examination.id == examination_id,
        Examination.is_active == True
    ).first()
    if not examination:
        raise ManagementExaminationNotFound()
    return examination

def get_examination_stats_result(db, args, auth_header=None, logger=None):
    """Build the legacy status badge counts for GET /examinations/stats."""
    from_date = args.get('from_date')
    to_date = args.get('to_date')

    filtered_query = db.query(Examination).filter(Examination.is_active == True)

    current_user = get_current_user_from_auth_header(auth_header, logger)
    if logger:
        if current_user:
            logger.info(
                f"Current user: {current_user.username} (ID: {current_user.id}) - Badge stats show all users"
            )
        else:
            logger.info("No current user found, showing all stats")

    # Keep legacy behavior: date filters are parsed/validated but badge counts stay global.
    if from_date:
        from_datetime = datetime.strptime(from_date, '%Y-%m-%d')
        filtered_query = filtered_query.filter(Examination.examination_date >= from_datetime)

    if to_date:
        to_datetime = datetime.strptime(to_date, '%Y-%m-%d') + timedelta(days=1)
        filtered_query = filtered_query.filter(Examination.examination_date < to_datetime)

    stats = {}
    for status in ExaminationStatus:
        if status != ExaminationStatus.PAID:
            count = db.query(Examination).filter(Examination.status == status).count()
            stats[status.value] = count
    return stats

def get_current_user_from_auth_header(auth_header, logger=None):
    try:
        if auth_header and auth_header.startswith('Bearer '):
            token = auth_header.split(' ')[1]
            from app.api.auth import get_current_user
            return get_current_user(token)
    except Exception as exc:
        if logger:
            logger.warning(f"Error getting current user from request: {exc}")
    return None
