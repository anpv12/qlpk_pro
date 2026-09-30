"""Side effects for appointment workflows."""

import logging
import threading

from app.core.database import get_db
from app.models.appointment import AppointmentStatus

logger = logging.getLogger(__name__)


def sync_calendar_for_appointment(appt, db, action='update', logger_override=None):
    """Queue a durable Google Calendar reconcile for the appointment; never call Google here.

    ``action`` is kept for legacy callers only: the worker (calendar_sync.py) derives
    create/update/delete from the appointment's current state. Commits the caller's session
    (callers invoke this after their clinical commit) and starts an immediate background try.
    """
    from app.modules.appointments.services.calendar_sync import enqueue_calendar_sync, schedule_calendar_sync_drain

    active_logger = logger_override or logger
    try:
        enqueue_calendar_sync(db, appt.id)
        db.commit()
    except Exception as e:
        db.rollback()
        active_logger.error('Không ghi được yêu cầu đồng bộ Calendar (%s) cho lịch hẹn %s: %s', action, appt.id, e, exc_info=True)
        return False
    schedule_calendar_sync_drain([appt.id])
    return True


def sync_re_examination_calendar_on_create(db, re_appointment, logger_override=None, **_legacy_messages):
    """Queue calendar sync for a newly created re-examination (doctor + connected staff)."""
    return sync_calendar_for_appointment(re_appointment, db, action='create', logger_override=logger_override)


def apply_appointment_update_side_effects(
    db,
    appointment,
    doctor_changed,
    appointment_date_updated,
    calendar_syncer,
    notification_service,
    logger_override=None,
):
    """Run non-DB-primary side effects after PUT appointment data is committed."""
    active_logger = logger_override or logger

    # One reconcile covers cancel, doctor change (old doctor's event is retired) and update.
    action = 'delete' if appointment.status == AppointmentStatus.CANCELLED else ('create' if doctor_changed else 'update')
    calendar_syncer(appointment, db, action=action)

    if appointment_date_updated:
        schedule_appointment_update_reminder(
            appointment.id,
            notification_service,
            logger_override=active_logger,
        )

def sync_transferred_appointment_calendar(db, appointment, old_doctor_id, logger_override=None):
    """Enqueue calendar work in the caller's transaction; never call Google here."""
    from app.modules.appointments.services.calendar_transfer import enqueue_calendar_transfer

    return enqueue_calendar_transfer(db, appointment, old_doctor_id)


def schedule_appointment_update_reminder(appointment_id, notification_service, logger_override=None):
    """Schedule the legacy 24-hour appointment reminder asynchronously."""
    schedule_appointment_reminder(
        appointment_id,
        notification_service,
        logger_override=logger_override,
        success_message="Appointment reminder sent after update for appointment ID: {appointment_id}",
        error_message="Error sending appointment reminder after update for appt ID {appointment_id}: {error}",
        scheduling_error_message="Error scheduling reminder creation for updated appt ID {appointment_id}: {error}",
    )


def schedule_appointment_reminder(
    appointment_id,
    notification_service,
    logger_override=None,
    success_message="Appointment reminder created for appointment ID: {appointment_id}",
    error_message="Error creating appointment reminder for appt ID {appointment_id}: {error}",
    scheduling_error_message="Error scheduling reminder creation for appt ID {appointment_id}: {error}",
):
    """Schedule the legacy 24-hour appointment reminder asynchronously."""
    active_logger = logger_override or logger

    try:
        def create_reminder_async(appt_id):
            thread_db = next(get_db())
            try:
                notification_service.create_appointment_reminder(appt_id, reminder_hours=24)
                active_logger.info(success_message.format(appointment_id=appt_id))
            except Exception as e:
                active_logger.info(error_message.format(appointment_id=appt_id, error=e), exc_info=True)
            finally:
                thread_db.close()

        reminder_thread = threading.Thread(target=create_reminder_async, args=(appointment_id,))
        reminder_thread.daemon = True
        reminder_thread.start()
    except Exception as e:
        active_logger.info(scheduling_error_message.format(appointment_id=appointment_id, error=e), exc_info=True)
