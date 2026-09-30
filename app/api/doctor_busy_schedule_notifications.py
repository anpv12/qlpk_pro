"""doctor_busy_schedule helpers split out by topic (notifications); re-exported by app.api.doctor_busy_schedule."""

import logging
from flask import jsonify
from app.core.database import get_db
from app.realtime.events import emit_notification_changed
from app.modules.appointments.services.scheduling_conflict import find_appointment_overlap, find_busy_schedule_overlap

logger = logging.getLogger('app.api.doctor_busy_schedule')


def _notify_staff_of_busy_schedule(busy_schedule):
    from app.models.notification import Notification
    from app.models.user import User

    # Tạo session mới cho notification
    notification_db = next(get_db())

    # Lấy danh sách lễ tân (role = 'staff' trong database)
    receptionists = notification_db.query(User).filter(User.role == 'staff').all()

    for receptionist in receptionists:
        notification = Notification(
            user_id=receptionist.id,
            title='Bác sĩ báo lịch bận',
            message=f'Bác sĩ {busy_schedule.doctor.full_name} đã báo lịch bận từ {busy_schedule.start_datetime.strftime("%d/%m/%Y %H:%M")} đến {busy_schedule.end_datetime.strftime("%d/%m/%Y %H:%M")}',
            type='doctor_busy_schedule',
            data={
                'busy_schedule_id': busy_schedule.id,
                'doctor_id': busy_schedule.doctor_id,
                'doctor_name': busy_schedule.doctor.full_name,
                'start_datetime': busy_schedule.start_datetime.isoformat(),
                'end_datetime': busy_schedule.end_datetime.isoformat(),
                'reason': busy_schedule.reason
            }
        )
        notification_db.add(notification)

    notification_db.commit()
    notification_db.close()
    emit_notification_changed('created', role='staff', extra={
        'type': 'doctor_busy_schedule',
        'busy_schedule_id': busy_schedule.id,
        'doctor_id': busy_schedule.doctor_id,
    })
    logger.info("Successfully created notifications")


def _busy_schedule_conflict_response(data, db, end_datetime, start_datetime):
    # Kiểm tra xung đột với lịch hẹn hiện có
    conflict_appointment = find_appointment_overlap(
        db,
        data['doctor_id'],
        start_datetime,
        end_datetime,
    )

    if conflict_appointment:
        return jsonify({
            'error': 'Xung đột với lịch hẹn hiện có',
            'conflicts': [{
                'id': conflict_appointment.id,
                'patient_name': conflict_appointment.patient.full_name if conflict_appointment.patient else 'N/A',
                'appointment_date': conflict_appointment.appointment_date.isoformat(),
                'status': conflict_appointment.status.value if hasattr(conflict_appointment.status, 'value') else conflict_appointment.status
            }]
        }), 409

    # Kiểm tra xung đột với lịch bận khác
    existing_busy = find_busy_schedule_overlap(
        db,
        data['doctor_id'],
        start_datetime,
        end_datetime,
    )

    if existing_busy:
        return jsonify({
            'error': 'Xung đột với lịch bận khác',
            'conflict_schedule': existing_busy.to_dict()
        }), 409
    return None
