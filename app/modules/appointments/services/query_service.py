"""Query service for appointment list/search screens."""

from dataclasses import dataclass
from datetime import datetime
import logging
import urllib.parse

import pytz

from sqlalchemy import case, func, or_
from sqlalchemy.orm import joinedload

from app.models.appointment import Appointment, AppointmentStatus
from app.models.examination import Examination
from app.models.patient import Patient
from app.realtime.events import emit_appointment_changed
from app.utils.search_normalization import normalized_contains


@dataclass
class AppointmentListResult:
    appointments: list
    pagination: dict
    latest_edited_id: int | None = None


def _paginate_appointments(args, page, per_page, query):
    is_receptionist_page = args.get('receptionist', 'false').lower() == 'true'
    latest_activity_id = None
    latest_edited_id = None
    if is_receptionist_page:
        latest_activity = query.with_entities(Appointment.id).order_by(
            func.coalesce(Appointment.updated_at, Appointment.created_at).desc().nulls_last(),
            Appointment.id.desc(),
        ).first()
        latest_activity_id = latest_activity[0] if latest_activity else None
        latest_edit = query.with_entities(Appointment.id, Appointment.updated_at).filter(
            Appointment.updated_at.isnot(None),
        ).order_by(Appointment.updated_at.desc(), Appointment.id.desc()).first()
        timezone = pytz.timezone('Asia/Ho_Chi_Minh')
        if latest_edit and latest_edit.updated_at.astimezone(timezone).date() == datetime.now(timezone).date():
            latest_edited_id = latest_edit.id

    offset = (page - 1) * per_page
    if is_receptionist_page and latest_activity_id is not None:
        order_columns = (
            case((Appointment.id == latest_activity_id, 0), else_=1),
            Appointment.appointment_date.asc(),
            Appointment.id.desc(),
        )
    elif args.get('doctor', 'false').lower() == 'true':
        order_columns = (Appointment.doctor_queue_entered_at.desc().nulls_last(), Appointment.id.desc())
    else:
        order_columns = (Appointment.id.desc(),)

    appointments = (
        query.options(joinedload(Appointment.examinations))
        .order_by(*order_columns)
        .offset(offset)
        .limit(per_page)
        .all()
    )
    return appointments, latest_edited_id


def _appointment_status_counts(logger, query, user, user_role_upper):
    no_show_count = query.filter(Appointment.status == AppointmentStatus.NO_SHOW).count()
    confirmed_count = query.filter(Appointment.status == AppointmentStatus.CONFIRMED).count()
    scheduled_count = query.filter(Appointment.status == AppointmentStatus.SCHEDULED).count()
    cancelled_count = query.filter(Appointment.status == AppointmentStatus.CANCELLED).count()
    logger.debug(
        f"Appointments count for user {user.id} (role: {user_role_upper}) - "
        f"NO_SHOW: {no_show_count}, CONFIRMED: {confirmed_count}, "
        f"SCHEDULED: {scheduled_count}, CANCELLED: {cancelled_count}"
    )


def get_appointment_list(db, user, args, logger=None) -> AppointmentListResult:
    """Return appointment models and legacy pagination metadata for GET /api/appointments/."""
    logger = logger or logging.getLogger(__name__)

    search = args.get('search') or args.get('patient_name')
    if search:
        search = urllib.parse.unquote(search)

    logger.debug("Received search term: %r", search)
    logger.debug("Search term type: %s", type(search))
    logger.debug("Search term bytes: %s", search.encode('utf-8') if search else None)

    doctor_id = args.get('doctor_id')
    psychologist_id = args.get('psychologist_id')
    patient_id = args.get('patient_id')
    appointment_date = args.get('appointment_date')
    date_from = args.get('date_from') or appointment_date
    date_to = args.get('date_to') or appointment_date
    status = args.get('status')

    page = args.get('page', 1, type=int)
    per_page = args.get('per_page', 10, type=int)
    if per_page > 10000:
        per_page = 10000
    elif per_page < 1:
        per_page = 10

    if str(args.get('auto_mark_no_show', 'false')).lower() == 'true':
        _mark_expired_scheduled_appointments_no_show(db, logger)

    query = db.query(Appointment).filter(Appointment.is_deleted == False)

    user_role = user.role.value if hasattr(user.role, 'value') else str(user.role)
    user_role_upper = user_role.upper()

    if user_role_upper == 'DOCTOR':
        query = query.filter(Appointment.doctor_id == user.id)
        logger.info(f"Filtering appointments for DOCTOR user {user.id} ({user.full_name})")
    elif user_role_upper == 'PSYCHOLOGIST':
        query = query.filter(or_(
            Appointment.psychologist_id == user.id,
            Appointment.doctor_id == user.id
        ))
        logger.info(
            f"Filtering appointments for PSYCHOLOGIST user {user.id} ({user.full_name}) - includes both psychologist_id and doctor_id"
        )

    logger.debug("Initial appointment query count: %s", query.count())

    query = _apply_search_filter(db, query, search, logger)
    query = _apply_actor_filters(query, doctor_id, psychologist_id, patient_id, user_role_upper, logger)
    query = _apply_date_filters(query, date_from, date_to, logger)
    query = _apply_status_or_screen_filter(query, status, args, user, logger)

    total_count = query.count()
    logger.debug("Final appointment query count before pagination: %s", total_count)

    _appointment_status_counts(logger, query, user, user_role_upper)

    appointments, latest_edited_id = _paginate_appointments(args, page, per_page, query)

    total_pages = (total_count + per_page - 1) // per_page
    has_next = page < total_pages
    has_prev = page > 1

    return AppointmentListResult(
        appointments=appointments,
        latest_edited_id=latest_edited_id,
        pagination={
            'page': page,
            'per_page': per_page,
            'total_count': total_count,
            'total_pages': total_pages,
            'has_next': has_next,
            'has_prev': has_prev,
            'next_page': page + 1 if has_next else None,
            'prev_page': page - 1 if has_prev else None,
        }
    )


def get_appointment_stats(db, user, args, logger=None) -> dict:
    """Return legacy appointment stats grouped by examination status."""
    is_receptionist_page = args.get('receptionist', 'false').lower() == 'true'
    is_doctor_page = args.get('doctor', 'false').lower() == 'true'
    is_psychologist_page = args.get('psychologist', 'false').lower() == 'true'

    query = db.query(Appointment)

    if is_doctor_page or is_psychologist_page:
        if user:
            if is_doctor_page:
                query = query.filter(Appointment.doctor_id == user.id)
            elif is_psychologist_page:
                query = query.filter(Appointment.psychologist_id == user.id)

    stats = {}

    if is_receptionist_page or is_doctor_page or is_psychologist_page:
        examination_statuses = [
            'WAITING_TRANSFER',
            'DOCTOR_EXAM',
            'PSYCHOLOGIST_EXAM',
            'CONCLUSION',
            'COMPLETED',
            'WAITING_PAYMENT',
        ]

        for status in examination_statuses:
            # Dùng EXISTS thay vì JOIN để không đếm phồng khi 1 appointment có nhiều examination
            count = query.filter(Appointment.examinations.any(Examination.status == status)).count()

            status_map = {
                'WAITING_TRANSFER': 'waiting_transfer',
                'DOCTOR_EXAM': 'examining',
                'PSYCHOLOGIST_EXAM': 'examining',
                'CONCLUSION': 'examining',
                'COMPLETED': 'completed',
                'WAITING_PAYMENT': 'waiting_payment',
            }

            mapped_status = status_map.get(status, status.lower())

            if mapped_status not in stats:
                stats[mapped_status] = 0
            stats[mapped_status] += count

    return stats


def _mark_expired_scheduled_appointments_no_show(db, logger):
    try:
        # appointment_date là timestamp KHÔNG timezone, lưu theo giờ VN (wall-clock).
        # Tính mốc đầu ngày theo giờ VN để so sánh đúng frame, không phụ thuộc tz của server.
        now_vn = datetime.now(pytz.timezone('Asia/Ho_Chi_Minh'))
        today_start = datetime.combine(now_vn.date(), datetime.min.time())
        expired_appointments = db.query(Appointment).filter(
            Appointment.is_deleted == False,
            Appointment.status == AppointmentStatus.SCHEDULED,
            Appointment.appointment_date < today_start
        ).all()

        if expired_appointments:
            expired_ids = [appt.id for appt in expired_appointments]
            for appt in expired_appointments:
                appt.status = AppointmentStatus.NO_SHOW
                logger.info(
                    f"Auto-updated appointment {appt.id} from SCHEDULED to NO_SHOW "
                    f"(appointment_date: {appt.appointment_date}, today_start: {today_start})"
                )
            db.commit()
            emit_appointment_changed('expired_marked_no_show', extra={
                'appointment_ids': expired_ids,
                'count': len(expired_ids),
            })
            logger.info(f"Auto-updated {len(expired_appointments)} expired appointments to NO_SHOW")
    except Exception as exc:
        logger.error(f"Error auto-updating expired appointments: {str(exc)}")
        db.rollback()


def _apply_search_filter(db, query, search, logger):
    if not search:
        return query

    search_term = str(search).strip()
    logger.debug("Normalized appointment search term: %r", search_term)

    query = query.join(Appointment.patient).filter(
        or_(
            normalized_contains(Patient.full_name, search_term),
            normalized_contains(Patient.phone, search_term),
            normalized_contains(Patient.id_number, search_term),
        )
    )
    logger.debug("Appointment query count after search filter: %s", query.count())
    return query


def _apply_actor_filters(query, doctor_id, psychologist_id, patient_id, user_role_upper, logger):
    if doctor_id and user_role_upper != 'DOCTOR':
        try:
            query = query.filter(Appointment.doctor_id == int(doctor_id))
        except ValueError:
            logger.warning(f"Invalid doctor_id format received: {doctor_id}")

    if psychologist_id and user_role_upper != 'PSYCHOLOGIST':
        try:
            query = query.filter(Appointment.psychologist_id == int(psychologist_id))
        except ValueError:
            logger.warning(f"Invalid psychologist_id format received: {psychologist_id}")

    if patient_id:
        try:
            query = query.filter(Appointment.patient_id == int(patient_id))
            logger.debug("Filtering appointments by patient_id: %s", patient_id)
        except ValueError:
            logger.warning(f"Invalid patient_id format received: {patient_id}")

    return query


def _apply_date_filters(query, date_from, date_to, logger):
    if date_from:
        try:
            dt_from = datetime.strptime(date_from, '%Y-%m-%d')
            query = query.filter(Appointment.appointment_date >= dt_from)
        except ValueError:
            logger.warning(f"Invalid date_from format received: {date_from}")

    if date_to:
        try:
            dt_to = datetime.strptime(date_to, '%Y-%m-%d')
            dt_to = dt_to.replace(hour=23, minute=59, second=59)
            query = query.filter(Appointment.appointment_date <= dt_to)
        except ValueError:
            logger.warning(f"Invalid date_to format received: {date_to}")

    return query


def _apply_status_or_screen_filter(query, status, args, user, logger):
    if status:
        if status.upper() in AppointmentStatus.__members__:
            return query.filter(Appointment.status == AppointmentStatus[status.upper()])
        logger.warning(f"Invalid appointment status received: {status}")
        return query

    is_receptionist_page = args.get('receptionist', 'false').lower() == 'true'
    is_doctor_page = args.get('doctor', 'false').lower() == 'true'
    is_psychologist_page = args.get('psychologist', 'false').lower() == 'true'
    examination_status = args.get('examination_status')

    if is_receptionist_page:
        return _apply_receptionist_screen_filter(query, examination_status)
    if is_doctor_page:
        return _apply_doctor_screen_filter(query, examination_status, user)
    if is_psychologist_page:
        return _apply_psychologist_screen_filter(query, examination_status, user)
    return query


def _apply_receptionist_screen_filter(query, examination_status):
    query = query.filter(Appointment.status == AppointmentStatus.CONFIRMED)

    # Dùng EXISTS (.any) thay vì JOIN để không trả về appointment trùng dòng (sai phân trang)
    if examination_status == 'examining':
        return query.filter(Appointment.examinations.any(
            Examination.status.in_(['DOCTOR_EXAM', 'PSYCHOLOGIST_EXAM', 'CONCLUSION'])
        ))
    if examination_status == 'doctor_exam':
        return query.filter(Appointment.examinations.any(Examination.status == 'DOCTOR_EXAM'))
    if examination_status == 'conclusion':
        return query.filter(Appointment.examinations.any(Examination.status == 'CONCLUSION'))
    if examination_status == 'waiting_transfer':
        return query.filter(Appointment.examinations.any(Examination.status == 'WAITING_TRANSFER'))
    if examination_status == 'waiting_payment':
        return query.filter(Appointment.examinations.any(Examination.status == 'WAITING_PAYMENT'))
    if examination_status == 'completed':
        return query.filter(Appointment.examinations.any(Examination.status == 'COMPLETED'))
    if examination_status == 'scheduled':
        return query.filter(~Appointment.examinations.any())

    return query.filter(Appointment.examinations.any(Examination.status == 'WAITING_TRANSFER'))


def _apply_doctor_screen_filter(query, examination_status, user):
    if not user:
        return query.filter(False)

    status_map = {
        'doctor_queue': ['DOCTOR_EXAM', 'CONCLUSION'],
        'examining': ['DOCTOR_EXAM', 'PSYCHOLOGIST_EXAM', 'CONCLUSION'],
        'doctor_exam': 'DOCTOR_EXAM',
        'conclusion': 'CONCLUSION',
        'waiting_transfer': 'WAITING_TRANSFER',
        'waiting_payment': 'WAITING_PAYMENT',
        'completed': 'COMPLETED',
    }
    status_filter = status_map.get(examination_status, ['DOCTOR_EXAM', 'CONCLUSION'])
    query = query.filter(Appointment.doctor_id == user.id)
    if isinstance(status_filter, list):
        return query.filter(Appointment.examinations.any(Examination.status.in_(status_filter)))
    return query.filter(Appointment.examinations.any(Examination.status == status_filter))


def _apply_psychologist_screen_filter(query, examination_status, user):
    if not user:
        return query.filter(False)

    status_map = {
        'examining': ['DOCTOR_EXAM', 'PSYCHOLOGIST_EXAM', 'CONCLUSION'],
        'waiting_transfer': 'WAITING_TRANSFER',
        'waiting_payment': 'WAITING_PAYMENT',
        'completed': 'COMPLETED',
    }
    status_filter = status_map.get(examination_status, 'PSYCHOLOGIST_EXAM')
    query = query.filter(Appointment.psychologist_id == user.id)
    if isinstance(status_filter, list):
        return query.filter(Appointment.examinations.any(Examination.status.in_(status_filter)))
    return query.filter(Appointment.examinations.any(Examination.status == status_filter))
