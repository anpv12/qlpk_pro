"""Re-examination policy, atomic writes, and post-commit integrations."""

from datetime import datetime
import threading

from app.realtime.events import emit_appointment_changed, emit_examination_changed
from app.services.notification_service import NotificationService

notification_service = NotificationService()

def _enum_value(value):
    return value.value if hasattr(value, 'value') else value


def new_re_examination_defaults(db, user_id, state):
    """Resolve the explicit product default from the live catalog, never a seeded ID."""
    from sqlalchemy import func
    from app.models.service import Service
    from app.models.user import User
    actor = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if not actor:
        raise ReExaminationValidationError('Không xác định được tài khoản đang đặt lịch tái khám.', schedule=state)
    services = db.query(Service).filter(
        Service.is_active == True,
        func.lower(func.trim(Service.name)) == 'khám tổng quát',
    ).limit(2).all()
    if not services:
        raise ReExaminationValidationError('Danh mục chưa có dịch vụ Khám tổng quát đang hoạt động.', schedule=state)
    if len(services) != 1:
        raise ReExaminationValidationError('Danh mục có nhiều dịch vụ Khám tổng quát; cần xác định lại dịch vụ mặc định.', schedule=state)
    service = services[0]
    return actor.id, {'examination_type': 'service', 'package_service_id': service.id,
                      'duration': service.duration_minutes}


def validate_re_examination_selection(db, selection, user_id, state):
    from app.models.service import Service
    from app.models.package import Package
    from app.models.user import User, UserRole
    if not isinstance(selection, dict):
        raise ReExaminationValidationError('Vui lòng chọn dịch vụ và bác sĩ tái khám.', schedule=state)
    doctor_id, service_id, package_id = (selection.get(k) for k in ('doctor_id', 'service_id', 'package_id'))
    ids = [doctor_id, service_id or package_id]
    if any(type(value) is not int or value <= 0 for value in ids) or bool(service_id) == bool(package_id):
        raise ReExaminationValidationError('Dịch vụ hoặc bác sĩ tái khám không hợp lệ.', schedule=state)
    doctor = db.get(User, doctor_id)
    if not doctor or not doctor.is_active or (doctor.role not in (UserRole.DOCTOR, UserRole.PSYCHOLOGIST) and doctor.id != user_id):
        raise ReExaminationValidationError('Bác sĩ được chọn không còn nhận lịch.', schedule=state)
    # Package selections are retained only for existing package appointments.
    if package_id and package_id != (state.get('selection') or {}).get('package_id'):
        raise ReExaminationValidationError('Vui lòng chọn dịch vụ tái khám.', schedule=state)
    target = db.get(Package if package_id else Service, package_id or service_id)
    if not target or not target.is_active:
        raise ReExaminationValidationError('Dịch vụ được chọn không còn hoạt động.', schedule=state)
    return doctor_id, {'examination_type': 'package' if package_id else 'service',
                       'package_service_id': target.id, 'duration': target.duration_minutes}


def _apply_re_examination_target_to_appointment(appointment, target, AppointmentType):
    if not appointment or not target:
        return
    if target['examination_type'] == 'package':
        appointment.appointment_type = AppointmentType.PACKAGE
        appointment.package_id = target['package_service_id']
        appointment.service_id = None
    else:
        appointment.appointment_type = AppointmentType.SERVICE
        appointment.service_id = target['package_service_id']
        appointment.package_id = None
    if target.get('duration'):
        appointment.duration_minutes = target['duration']

class ReExaminationValidationError(ValueError):
    def __init__(self, detail, *, code="re-examination-invalid", schedule=None):
        super().__init__(detail)
        self.code = code
        self.schedule = schedule


def latest_re_examination(db, appointment_id, *, lock=False):
    from app.models.appointment import Appointment, AppointmentCategory
    # Lifecycle identity follows creation order, not the editable appointment date.
    # Cancelled/deleted children remain history and must not look like "no schedule".
    query = db.query(Appointment).filter(
        Appointment.original_appointment_id == appointment_id,
        Appointment.appointment_category == AppointmentCategory.RE_EXAMINATION,
    ).order_by(Appointment.created_at.desc(), Appointment.id.desc())
    if lock:
        query = query.populate_existing().with_for_update()
    return query.first()


def show_re_examination_date_on_prescription(appointment):
    """Keep historical schedules, but do not present cancelled dates as a follow-up."""
    return appointment is None or (
        not appointment.is_deleted and _enum_value(appointment.status) != 'CANCELLED'
    )


def build_re_examination_calendar(db, user, original, args):
    from werkzeug.datastructures import MultiDict
    from app.models.service import Service
    from app.models.user import User
    from app.modules.appointments.services.query_service import get_appointment_list
    start = datetime.strptime(args.get('start', ''), '%Y-%m-%d')
    end = datetime.strptime(args.get('end', ''), '%Y-%m-%d')
    if not 0 < (end - start).days <= 43:
        raise ValueError('Khoảng xem lịch không hợp lệ.')
    child = latest_re_examination(db, original.id)
    if child:
        doctor = child.doctor
        service_name = child.service.name if child.service else (child.package.name if child.package else '')
    else:
        doctor_id, target = new_re_examination_defaults(db, user.id, schedule_state(None))
        doctor = db.get(User, doctor_id)
        service_name = db.get(Service, target['package_service_id']).name
    selection = schedule_state(child)['selection'] if child else {
        'doctor_id': doctor.id, 'service_id': target['package_service_id'], 'package_id': None}
    services = [{'id': item.id, 'name': item.name, 'kind': 'service'} for item in
                db.query(Service).filter(Service.is_active == True).order_by(Service.name).all()]
    from app.models.user import UserRole
    from sqlalchemy import or_
    doctors = [{'id': item.id, 'name': item.full_name, 'calendar_color': item.calendar_color} for item in db.query(User).filter(
        User.is_active == True, or_(User.role.in_([UserRole.DOCTOR, UserRole.PSYCHOLOGIST]), User.id == user.id)
    ).order_by(User.full_name).all()]
    if child and child.package:
        services.append({'id': child.package_id, 'name': child.package.name, 'kind': 'package'})
    if child and child.service and not any(item['kind'] == 'service' and item['id'] == child.service_id for item in services):
        services.append({'id': child.service_id, 'name': child.service.name, 'kind': 'service', 'disabled': True})
    if doctor and not any(item['id'] == doctor.id for item in doctors):
        doctors.append({'id': doctor.id, 'name': doctor.full_name, 'calendar_color': doctor.calendar_color, 'disabled': True})
    # Reuse the appointment list's actor scope; never widen a doctor's visibility.
    result = get_appointment_list(db, user, MultiDict({
        'date_from': start.strftime('%Y-%m-%d'), 'date_to': end.strftime('%Y-%m-%d'),
        'per_page': '10000', 'page': '1',
    }))
    if result.pagination['total_pages'] > 1:
        raise ValueError('Quá nhiều lịch trong khoảng này. Vui lòng chuyển sang xem tuần.')
    events = []
    for appointment in result.appointments:
        if appointment.appointment_date >= end:
            continue
        service = appointment.service or appointment.package
        events.append({
            'id': appointment.id,
            'start': appointment.appointment_date.strftime('%Y-%m-%dT%H:%M:%S'),
            'duration': appointment.duration_minutes or 60,
            'patient_name': appointment.patient.full_name if appointment.patient else '',
            'doctor_name': appointment.doctor.full_name if appointment.doctor else '',
            'doctor_id': appointment.doctor_id,
            'doctor_color': appointment.doctor.calendar_color if appointment.doctor else None,
            'service_name': service.name if service else '',
            'status': _enum_value(appointment.status),
        })
    return {'doctor_name': doctor.full_name if doctor else '', 'service_name': service_name,
            'selection': selection, 'services': services, 'doctors': doctors,
            'schedule': schedule_state(child), 'events': events}


def schedule_state(appointment):
    if not appointment:
        return {'appointment_id': None, 'datetime': '', 'status': None,
                'version': None, 'editable': True, 'lock_reason': '', 'selection': None}
    status = _enum_value(appointment.status)
    when = appointment.appointment_date
    editable = (not appointment.is_deleted and status == 'SCHEDULED'
                and when is not None and when > datetime.now())
    labels = {'CONFIRMED': 'đã xác nhận', 'NO_SHOW': 'không đến', 'CANCELLED': 'đã hủy'}
    reason = '' if editable else (
        f"Lịch tái khám {labels.get(status, 'đã đến hoặc quá giờ hẹn')}; không thể sửa hoặc hủy tại màn này."
    )
    return {'appointment_id': appointment.id,
            'datetime': when.strftime('%Y-%m-%d %H:%M') if when else '',
            'status': status,
            'version': appointment.updated_at.isoformat() if appointment.updated_at else None,
            'editable': editable, 'lock_reason': reason,
            'selection': {'doctor_id': appointment.doctor_id, 'service_id': appointment.service_id,
                          'package_id': appointment.package_id}}


def _guard_re_examination_change(current, requested, snapshot, state):
    if current and snapshot is None:
        raise ReExaminationValidationError('Tải lại lịch tái khám trước khi thay đổi.', code='re-examination-conflict', schedule=state)
    if snapshot is not None:
        expected = tuple(snapshot.get(key) for key in ('appointment_id', 'version', 'status'))
        actual = tuple(state.get(key) for key in ('appointment_id', 'version', 'status'))
        if expected != actual:
            raise ReExaminationValidationError('Lịch tái khám đã thay đổi ở nơi khác. Kiểm tra lịch mới trước khi lưu.',
                                               code='re-examination-conflict', schedule=state)
    if current and not state['editable']:
        raise ReExaminationValidationError(state['lock_reason'], code='re-examination-locked', schedule=state)
    if requested and requested <= datetime.now():
        raise ReExaminationValidationError('Ngày giờ tái khám mới phải nằm trong tương lai.', schedule=state)


def plan_re_examination(db, appointment_id, data, *, user_id=None):
    from app.models.appointment import Appointment
    from app.models.prescription import Prescription
    original = db.query(Appointment).filter_by(id=appointment_id).populate_existing().with_for_update().one()
    current = latest_re_examination(db, appointment_id, lock=True)
    state = schedule_state(current)
    fallback = db.query(Prescription).filter_by(appointment_id=appointment_id).order_by(Prescription.id.desc()).first()
    persisted_date = current.appointment_date.date() if current else (fallback.re_examination_date if fallback else None)
    plan = {'action': 'unchanged', 'original': original, 'appointment': current,
            'prescription_date': persisted_date, 'target': None, 'datetime': None}
    if 're_examination_date' not in data:
        return plan
    raw_date = data.get('re_examination_date') or ''
    raw_time = data.get('re_examination_time') or '09:00'
    try:
        requested = datetime.strptime(f'{raw_date} {raw_time}', '%Y-%m-%d %H:%M') if raw_date else None
    except (ValueError, TypeError) as exc:
        raise ReExaminationValidationError('Ngày giờ tái khám không hợp lệ.', schedule=state) from exc
    desired = requested.strftime('%Y-%m-%d %H:%M') if requested else ''
    snapshot = data.get('re_examination_snapshot')
    if snapshot is not None and not isinstance(snapshot, dict):
        raise ReExaminationValidationError('Thông tin lịch đã tải không hợp lệ.', schedule=state)
    selection = data.get('re_examination_selection')
    selection_changed = selection is not None and selection != state['selection']
    snapshot_selection_unchanged = selection is None or (snapshot is not None and selection == snapshot.get('selection'))
    # No user scheduling intent: retain current server schedule even if another
    # workstation changed it after this editor loaded. Never copy stale dates back.
    if snapshot is not None and desired == (snapshot.get('datetime') or '') and snapshot_selection_unchanged:
        return plan
    if (desired == state['datetime'] and (not desired or not selection_changed)) or (current and state['status'] == 'CANCELLED' and not desired):
        return plan  # retry of a successful create/update/cancel
    _guard_re_examination_change(current, requested, snapshot, state)
    plan.update(action='update' if current and requested else 'cancel' if current else 'create',
                datetime=requested, prescription_date=requested.date() if requested else None)
    if requested and selection is not None and (selection_changed or not current):
        plan['doctor_id'], plan['target'] = validate_re_examination_selection(db, selection, user_id, state)
    elif plan['action'] == 'create':
        plan['doctor_id'], plan['target'] = new_re_examination_defaults(db, user_id, state)
    return plan


def apply_re_examination_plan(db, plan):
    """Flush scheduling and examination changes; prescription owner commits once."""
    from uuid import uuid4
    from app.models.appointment import Appointment, AppointmentStatus, AppointmentCategory, AppointmentType
    from app.models.examination import Examination, ExaminationStatus, ExaminationType
    action, appointment = plan['action'], plan['appointment']
    if action == 'unchanged':
        state = schedule_state(appointment)
        if appointment is None and plan['prescription_date']:
            state['datetime'] = f"{plan['prescription_date'].isoformat()} 09:00"
        return {'ok': True, 'action': action, **state}
    original, target = plan['original'], plan['target']
    if action == 'create':
        appointment = Appointment(appointment_code='APT'+uuid4().hex,
            patient_id=original.patient_id, doctor_id=plan['doctor_id'],
            appointment_date=plan['datetime'], status=AppointmentStatus.SCHEDULED,
            appointment_category=AppointmentCategory.RE_EXAMINATION,
            original_appointment_id=original.id, target_type=original.target_type,
            target_name=original.target_name,
            notes=f"Lịch hẹn tái khám từ lịch hẹn ngày {original.appointment_date:%d/%m/%Y}")
        _apply_re_examination_target_to_appointment(appointment, target, AppointmentType)
        db.add(appointment)
        db.flush()
        db.add(Examination(appointment_id=appointment.id, patient_id=original.patient_id,
            doctor_id=plan['doctor_id'], examination_date=plan['datetime'],
            examination_code='LK'+uuid4().hex, status=ExaminationStatus.WAITING_TRANSFER,
            examination_type=ExaminationType.SERVICE if target['examination_type']=='service' else ExaminationType.PACKAGE,
            service_id=appointment.service_id, package_id=appointment.package_id,
            main_reason='Tái khám'))
    elif action == 'update':
        appointment.appointment_date = plan['datetime']
        if target:
            appointment.doctor_id = plan['doctor_id']
            _apply_re_examination_target_to_appointment(appointment, target, AppointmentType)
        # Date-only edits preserve identity; explicit dropdown changes update both owners.
        for exam in db.query(Examination).filter_by(appointment_id=appointment.id).all():
            exam.examination_date = plan['datetime']
            if target:
                exam.doctor_id = appointment.doctor_id
                exam.service_id, exam.package_id = appointment.service_id, appointment.package_id
                exam.examination_type = ExaminationType.SERVICE if target['examination_type'] == 'service' else ExaminationType.PACKAGE
    elif action == 'cancel':
        appointment.status = AppointmentStatus.CANCELLED
        appointment.is_deleted = True
        appointment.deleted_at = datetime.utcnow()
        for exam in db.query(Examination).filter_by(appointment_id=appointment.id).all():
            exam.is_active = False
    db.flush()
    return {'ok': True, 'action': action, **schedule_state(appointment)}


def sync_re_examination_after_prescription_save(db, result, logger):
    """Post-commit integrations only. Unchanged saves never trigger external effects."""
    if result['action'] == 'unchanged':
        return
    from app.models.appointment import Appointment
    from app.models.examination import Examination
    appointment = db.query(Appointment).filter_by(id=result['appointment_id']).one()
    event = {'create': 're_examination_created', 'update': 're_examination_updated',
             'cancel': 're_examination_cancelled'}[result['action']]
    emit_appointment_changed(event, appointment=appointment)
    for exam in db.query(Examination).filter_by(appointment_id=appointment.id).all():
        emit_examination_changed(event, examination=exam)
    # Preserve existing Calendar/reminder integration, strictly after the atomic
    # clinical transaction. A delivery failure cannot turn it into a failed save.
    try:
        from app.modules.appointments.services.side_effects import sync_calendar_for_appointment
        sync_calendar_for_appointment(appointment, db,
            action='delete' if result['action'] == 'cancel' else result['action'], logger_override=logger)
    except Exception:
        db.rollback()
        logger.exception('Không đồng bộ được Calendar cho lịch tái khám %s', appointment.id)
    if result['action'] != 'cancel':
        def remind(appointment_id):
            try:
                notification_service.create_appointment_reminder(appointment_id, reminder_hours=24)
            except Exception:
                logger.exception('Không gửi được nhắc lịch tái khám %s', appointment_id)
        threading.Thread(target=remind, args=(appointment.id,), daemon=True).start()
