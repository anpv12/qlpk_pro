"""chi_dinh helpers split out by topic (access); re-exported by app.modules.orders.api.chi_dinh."""

import logging
from app.models.appointment import Appointment
from app.modules.orders.services.clinical_order_mutation import AppointmentNotFound, get_chi_dinh_by_id
from app.utils.clinical_access import appointment_access_error
from app.services.notification_service import NotificationService

logger = logging.getLogger('app.modules.orders.api.chi_dinh')


notification_service = NotificationService()


def _emit_order_assignment_notifications(
    db,
    appointment,
    assignments,
    actor_user,
):
    """Persist assignment notifications after the order mutation is committed."""
    if not assignments:
        return
    try:
        notifications = notification_service.create_clinical_order_assignment_notifications(
            db,
            appointment,
            assignments,
            actor_user=actor_user,
        )
        payloads = notification_service.build_realtime_payloads(db, notifications)
        db.commit()
        notification_service.emit_realtime_payloads(payloads)
    except Exception:
        # A notification failure must not undo a successful clinical order save.
        db.rollback()
        logger.exception('Không thể tạo thông báo giao chỉ định')


def _get_accessible_appointment(db, user, appointment_id):
    appointment = db.query(Appointment).filter(Appointment.id == appointment_id).first()
    if not appointment:
        raise AppointmentNotFound()
    access_error = appointment_access_error(user, appointment)
    if access_error:
        return None, access_error
    return appointment, None


def _get_accessible_chi_dinh(db, user, chi_dinh_id):
    chi_dinh = get_chi_dinh_by_id(db, chi_dinh_id)
    appointment = chi_dinh.appointment
    if not appointment:
        return None, 'Không tìm thấy lịch hẹn của chỉ định này.'
    access_error = appointment_access_error(user, appointment)
    if access_error and chi_dinh.in_house_unit_id != user.id:
        return None, access_error
    return chi_dinh, None
