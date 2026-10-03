from datetime import date

from flask import Blueprint, jsonify, request
from sqlalchemy import func, or_
from sqlalchemy.orm import joinedload

from app.api.auth import require_auth
from app.core.database import get_db
from app.models.appointment import Appointment
from app.models.examination import Examination, ExaminationStatus
from app.models.patient import Patient
from app.utils.clinical_access import scoped_patient_ids
from app.utils.search_normalization import normalized_contains

router = Blueprint('global_search', __name__, url_prefix='/api/global-search')

MIN_QUERY_LENGTH = 2
DEFAULT_LIMIT = 5
MAX_LIMIT = 10


def normalize_role(role) -> str:
    value = getattr(role, 'value', role) or ''
    value = str(value).replace('UserRole.', '').strip().lower()
    return 'psychologist' if value == 'psychologist' else value


def safe_limit(value) -> int:
    try:
        parsed = int(value or DEFAULT_LIMIT)
    except (TypeError, ValueError):
        parsed = DEFAULT_LIMIT
    return max(1, min(parsed, MAX_LIMIT))


def safe_int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def datetime_to_text(value) -> str:
    if not value:
        return ''
    try:
        return value.strftime('%d/%m/%Y %H:%M')
    except (AttributeError, TypeError, ValueError):
        return str(value)


def enum_value(value):
    return getattr(value, 'value', value)


def labeled_meta(label: str, value) -> str:
    text = str(value or '').strip()
    return f'{label}: {text}' if text else ''


def gender_to_text(value) -> str:
    text = str(value or '').strip()
    normalized = text.lower()
    if normalized in ('male', 'm', 'nam'):
        return 'Nam'
    if normalized in ('female', 'f', 'nu', 'nữ'):
        return 'Nữ'
    if normalized in ('other', 'o', 'khac', 'khác'):
        return 'Khác'
    return text


def age_to_text(patient: Patient, reference_date=None) -> str:
    if patient.date_of_birth:
        target_date = reference_date.date() if hasattr(reference_date, 'date') else reference_date
        target_date = target_date or date.today()
        age = target_date.year - patient.date_of_birth.year
        birthday_passed = (target_date.month, target_date.day) >= (patient.date_of_birth.month, patient.date_of_birth.day)
        computed_age = age if birthday_passed else age - 1
        return str(computed_age) if computed_age >= 0 else ''
    if patient.age is not None:
        return str(patient.age)
    return ''


def is_clinical_role(role: str) -> bool:
    return role in ('doctor', 'psychologist')


def user_full_name(user) -> str:
    return str(getattr(user, 'full_name', '') or '').strip()


def user_role_value(user) -> str:
    role = getattr(user, 'role', '') if user else ''
    return str(getattr(role, 'value', role) or '').replace('UserRole.', '').strip().lower()


def is_psychologist_user(user) -> bool:
    return user_role_value(user) == 'psychologist'


def history_clinician_name(examination: Examination) -> str:
    appointment = examination.appointment if examination else None
    return (
        user_full_name(getattr(appointment, 'psychologist', None))
        or user_full_name(getattr(examination, 'doctor', None))
        or user_full_name(getattr(appointment, 'doctor', None))
    )


def patient_subtitle(patient: Patient, role: str, latest_examination_time=None) -> str:
    if is_clinical_role(role):
        parts = [
            labeled_meta('Ngày khám', datetime_to_text(latest_examination_time)),
            labeled_meta('Tuổi', age_to_text(patient)),
            labeled_meta('Giới tính', gender_to_text(patient.gender)),
        ]
    else:
        parts = [
            labeled_meta('SĐT', patient.phone),
            labeled_meta('Tuổi', age_to_text(patient)),
            labeled_meta('Giới tính', gender_to_text(patient.gender)),
        ]
    return ' · '.join(str(part) for part in parts if part)


def patient_target_page(role: str) -> str:
    if role == 'doctor':
        return '/doctor-examination.html'
    if role == 'psychologist':
        return '/psychologist-examination.html'
    return '/receptionist-new.html'


def patient_actions(patient: Patient, role: str):
    if role in ('admin', 'staff'):
        return [{
            'key': 'copy_patient_to_receptionist_form',
            'label': 'Sao chép vào form',
            'kind': 'copy_patient_to_receptionist_form',
            'target_page': '/receptionist-new.html',
            'payload': {'patient_id': patient.id},
        }]
    return []


def history_actions(examination: Examination, target_page: str):
    appointment = examination.appointment if examination else None
    if not appointment:
        return []
    return [{
        'key': 'open_appointment_history',
        'label': 'Xem lịch sử',
        'kind': 'open_appointment',
        'target_page': target_page,
        'payload': {
            'appointment_id': appointment.id,
            'patient_id': examination.patient_id,
            'examination_id': examination.id,
        },
    }]


def serialize_patient(patient: Patient, role: str, selected_patient_id=None, latest_examination_time=None) -> dict:
    actions = patient_actions(patient, role)
    return {
        'id': f'patient:{patient.id}',
        'type': 'patient',
        'title': patient.full_name or 'Bệnh nhân',
        'subtitle': patient_subtitle(patient, role, latest_examination_time),
        'badge': patient.patient_code or '',
        'icon': 'bi bi-person-vcard',
        'target_url': f'{patient_target_page(role)}?patient_id={patient.id}',
        'primary_action': actions[0] if actions else None,
        'actions': actions,
        'is_selected': patient.id == selected_patient_id,
        'payload': {
            'patient_id': patient.id,
            'patient_code': patient.patient_code,
            'full_name': patient.full_name,
            'phone': patient.phone,
        },
    }


def history_target_page(examination: Examination, role: str) -> str:
    appointment = examination.appointment if examination else None
    status = enum_value(examination.status) if examination else ''
    if status == enum_value(ExaminationStatus.PSYCHOLOGIST_EXAM):
        return '/psychologist-examination.html'
    if status == enum_value(ExaminationStatus.DOCTOR_EXAM):
        return '/doctor-examination.html'
    if appointment and (getattr(appointment, 'psychologist_id', None) or is_psychologist_user(getattr(appointment, 'psychologist', None))):
        return '/psychologist-examination.html'
    if is_psychologist_user(getattr(examination, 'doctor', None)) or is_psychologist_user(getattr(appointment, 'doctor', None)):
        return '/psychologist-examination.html'
    if role == 'psychologist':
        return '/psychologist-examination.html'
    return '/doctor-examination.html'


def serialize_history(examination: Examination, role: str, is_latest=False) -> dict:
    appointment = examination.appointment
    target_page = history_target_page(examination, role)
    actions = history_actions(examination, target_page)
    service_name = examination.service.name if examination.service else ''
    package_name = examination.package.name if examination.package else ''
    examination_time = appointment.appointment_date if appointment else examination.examination_date
    title = service_name or package_name or examination.examination_code or 'Lượt khám'
    examination_time_text = labeled_meta('Ngày khám', datetime_to_text(examination_time))
    subtitle_parts = [
        labeled_meta('Tuổi', age_to_text(examination.patient, examination_time) if examination.patient else ''),
        history_clinician_name(examination),
    ]
    return {
        'id': f'history:{examination.id}',
        'type': 'history',
        'title': title,
        'subtitle': ' · '.join(str(part) for part in subtitle_parts if part),
        'badge': 'Lịch sử',
        'highlight_badge': 'Gần nhất' if is_latest else '',
        'highlight_text': examination_time_text,
        'is_latest': bool(is_latest),
        'icon': 'bi bi-calendar2-check',
        'target_url': f'{target_page}?appointment_id={appointment.id}' if appointment else target_page,
        'primary_action': actions[0] if actions else None,
        'actions': actions,
        'payload': {
            'appointment_id': appointment.id if appointment else None,
            'patient_id': examination.patient_id,
            'examination_id': examination.id,
        },
    }


def empty_message(query: str, label: str) -> str:
    return f'Không tìm thấy dữ liệu cho “{query}” trong nhóm {label.lower()}.'


def make_group(key, label, items, query, empty_text=None):
    return {
        'key': key,
        'label': label,
        'items': items,
        'count': len(items),
        'empty_message': '' if items else (empty_text or empty_message(query, label)),
    }


def search_patients(db, query, limit, role, selected_patient_id=None, scoped_ids=None):
    patient_query = db.query(Patient).filter(
        Patient.is_active.is_(True),
        or_(
            normalized_contains(Patient.full_name, query),
            normalized_contains(Patient.patient_code, query),
            normalized_contains(Patient.phone, query),
            normalized_contains(Patient.id_number, query),
            normalized_contains(Patient.nickname, query),
        )
    )
    if scoped_ids is not None:
        patient_query = patient_query.filter(Patient.id.in_(scoped_ids or {-1}))
    rows = patient_query.order_by(Patient.updated_at.desc().nullslast(), Patient.id.desc()).limit(limit).all()
    latest_examination_times = latest_examination_times_by_patient(db, [row.id for row in rows]) if is_clinical_role(role) else {}
    return [
        serialize_patient(row, role, selected_patient_id, latest_examination_times.get(row.id))
        for row in rows
    ]


def latest_examination_times_by_patient(db, patient_ids):
    if not patient_ids:
        return {}
    rows = db.query(
        Examination.patient_id,
        func.max(Appointment.appointment_date).label('latest_examination_time'),
    ).join(Appointment, Examination.appointment_id == Appointment.id).filter(
        Examination.patient_id.in_(patient_ids),
        Examination.is_active.is_(True),
        Appointment.is_deleted.is_(False),
        Appointment.status != 'SCHEDULED',
    ).group_by(Examination.patient_id).all()
    return {patient_id: latest_examination_time for patient_id, latest_examination_time in rows}


def search_patient_history(db, patient_id, limit, role, scoped_ids=None):
    if not patient_id:
        return []
    if scoped_ids is not None and patient_id not in scoped_ids:
        return []
    history_query = db.query(Examination).options(
        joinedload(Examination.appointment).joinedload(Appointment.doctor),
        joinedload(Examination.appointment).joinedload(Appointment.psychologist),
        joinedload(Examination.patient),
        joinedload(Examination.doctor),
        joinedload(Examination.service),
        joinedload(Examination.package),
    ).join(Appointment, Examination.appointment_id == Appointment.id).filter(
        Examination.patient_id == patient_id,
        Examination.is_active.is_(True),
        Appointment.is_deleted.is_(False),
        Appointment.status != 'SCHEDULED',
    )
    rows = history_query.order_by(Appointment.appointment_date.desc(), Examination.id.desc()).limit(limit).all()
    return [serialize_history(row, role, is_latest=index == 0) for index, row in enumerate(rows)]


@router.route('', methods=['GET'])
@router.route('/', methods=['GET'])
@require_auth
def global_search(user):
    query = (request.args.get('q') or '').strip()
    scope = (request.args.get('scope') or 'all').strip().lower()
    limit = safe_limit(request.args.get('limit'))
    selected_patient_id = safe_int(request.args.get('patient_id'))
    role = normalize_role(user.role)

    if len(query) < MIN_QUERY_LENGTH:
        return jsonify({
            'query': query,
            'scope': scope,
            'role': role,
            'selected_patient_id': selected_patient_id,
            'min_query_length': MIN_QUERY_LENGTH,
            'groups': [],
        }), 200

    db = next(get_db())
    try:
        scoped_ids = scoped_patient_ids(db, user)
        patients = search_patients(db, query, limit, role, selected_patient_id, scoped_ids)
        history = search_patient_history(db, selected_patient_id, limit, role, scoped_ids)
        history_empty = 'Chọn một bệnh nhân để xem lịch sử khám.' if not selected_patient_id else 'Bệnh nhân này chưa có lịch sử khám.'
        groups = [
            make_group('patients', 'Bệnh nhân', patients, query),
            make_group('history', 'Lịch sử khám', history, query, history_empty),
        ]

        return jsonify({
            'query': query,
            'scope': scope,
            'role': role,
            'selected_patient_id': selected_patient_id,
            'min_query_length': MIN_QUERY_LENGTH,
            'groups': groups,
        }), 200
    finally:
        db.close()
