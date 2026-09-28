"""Side effects for appointment workflows."""

import logging
import threading
from datetime import datetime

from app.core.database import get_db
from app.models.appointment import AppointmentStatus

logger = logging.getLogger(__name__)


def sync_calendar_for_appointment(appt, db, action='update', logger_override=None):
    """
    Sync Google Calendar for an appointment.

    Legacy behavior: sync the assigned doctor and every staff user with an
    active calendar connection. Calendar errors remain non-fatal.
    """
    active_logger = logger_override or logger

    from app.models.google_calendar import GoogleCalendarConnection, GoogleCalendarEvent
    from app.services.google_calendar_service import GoogleCalendarService
    from app.models.user import User, UserRole

    try:
        all_succeeded = True
        users_to_sync = set()

        users_to_sync.add(appt.doctor_id)

        staff_with_connection = db.query(User.id).join(
            GoogleCalendarConnection,
            GoogleCalendarConnection.user_id == User.id
        ).filter(
            User.role == UserRole.STAFF,
            GoogleCalendarConnection.is_active == True
        ).all()

        for staff in staff_with_connection:
            users_to_sync.add(staff.id)

        active_logger.info(f"Calendar sync ({action}) for appointment {appt.id}: users={users_to_sync}")

        if action == 'delete':
            calendar_events = db.query(GoogleCalendarEvent).filter(
                GoogleCalendarEvent.appointment_id == appt.id
            ).all()

            for event in calendar_events:
                deleted = False
                if event.user_id:
                    conn = db.query(GoogleCalendarConnection).filter(
                        GoogleCalendarConnection.user_id == event.user_id,
                        GoogleCalendarConnection.is_active == True
                    ).first()
                    if conn:
                        try:
                            deleted = GoogleCalendarService.delete_event(event, conn) is True
                        except Exception as e:
                            active_logger.warning(f"Could not delete event on Google: {e}")
                if deleted:
                    db.delete(event)
                else:
                    all_succeeded = False

        else:
            for user_id in users_to_sync:
                conn = db.query(GoogleCalendarConnection).filter(
                    GoogleCalendarConnection.user_id == user_id,
                    GoogleCalendarConnection.is_active == True
                ).first()

                if not conn:
                    all_succeeded = False
                    continue

                existing_event = db.query(GoogleCalendarEvent).filter(
                    GoogleCalendarEvent.appointment_id == appt.id,
                    GoogleCalendarEvent.user_id == user_id
                ).first()

                if existing_event:
                    if action == 'update':
                        update_success = GoogleCalendarService.update_event(appt, existing_event, conn, report_missing=True)
                        if update_success is True:
                            existing_event.updated_at = datetime.now()
                            active_logger.info(f"Updated event {existing_event.event_id} for user {user_id}")
                        elif update_success is None:
                            event_id = GoogleCalendarService.create_event(appt, conn)
                            if event_id:
                                db.delete(existing_event)
                                new_event = GoogleCalendarEvent(
                                    appointment_id=appt.id,
                                    user_id=user_id,
                                    event_id=event_id,
                                    updated_at=datetime.now()
                                )
                                db.add(new_event)
                                active_logger.info(f"Recreated event {event_id} for user {user_id}")
                            else:
                                all_succeeded = False
                        else:
                            all_succeeded = False
                else:
                    event_id = GoogleCalendarService.create_event(appt, conn)
                    if event_id:
                        new_event = GoogleCalendarEvent(
                            appointment_id=appt.id,
                            user_id=user_id,
                            event_id=event_id,
                            updated_at=datetime.now()
                        )
                        db.add(new_event)
                        active_logger.info(f"Created event {event_id} for user {user_id}")
                    else:
                        all_succeeded = False

        db.commit()
        return all_succeeded

    except Exception as e:
        active_logger.error(f"Error in sync_calendar_for_appointment: {e}")
        return False


def sync_re_examination_calendar_on_create(
    db,
    re_appointment,
    logger_override=None,
    doctor_success_message="Created Google Calendar event {event_id} for re-examination appointment {appointment_id}",
    receptionist_success_message="Created Google Calendar event {event_id} for receptionist {user_id} for re-examination {appointment_id}",
    outer_error_message="Error syncing re-examination to Google Calendar: {error}",
):
    """Sync calendar events for legacy re-examination creation flows."""
    active_logger = logger_override or logger

    try:
        from app.models.google_calendar import GoogleCalendarConnection, GoogleCalendarEvent
        from app.services.google_calendar_service import GoogleCalendarService

        calendar_connection = db.query(GoogleCalendarConnection).filter(
            GoogleCalendarConnection.user_id == re_appointment.doctor_id,
            GoogleCalendarConnection.is_active == True
        ).first()

        if calendar_connection:
            event_id = GoogleCalendarService.create_event(re_appointment, calendar_connection)
            if event_id:
                calendar_event = GoogleCalendarEvent(
                    appointment_id=re_appointment.id,
                    user_id=re_appointment.doctor_id,
                    event_id=event_id
                )
                db.add(calendar_event)
                db.commit()
                active_logger.info(doctor_success_message.format(
                    event_id=event_id,
                    appointment_id=re_appointment.id,
                    user_id=re_appointment.doctor_id,
                ))

        from app.models.user import User, UserRole
        receptionist_connections = db.query(GoogleCalendarConnection).join(
            User, GoogleCalendarConnection.user_id == User.id
        ).filter(
            User.role == UserRole.STAFF,
            GoogleCalendarConnection.is_active == True
        ).all()

        active_logger.debug("Found %s receptionist(s) with Google Calendar connection", len(receptionist_connections))

        for receptionist_conn in receptionist_connections:
            try:
                active_logger.debug("Attempting to create event for receptionist %s", receptionist_conn.user_id)
                receptionist_event_id = GoogleCalendarService.create_event(re_appointment, receptionist_conn)
                active_logger.debug("Receptionist sync result: %s", receptionist_event_id)
                if receptionist_event_id:
                    receptionist_calendar_event = GoogleCalendarEvent(
                        appointment_id=re_appointment.id,
                        user_id=receptionist_conn.user_id,
                        event_id=receptionist_event_id
                    )
                    db.add(receptionist_calendar_event)
                    db.commit()
                    active_logger.info(receptionist_success_message.format(
                        event_id=receptionist_event_id,
                        appointment_id=re_appointment.id,
                        user_id=receptionist_conn.user_id,
                    ))
            except Exception as e:
                active_logger.error(f"Error creating event for receptionist {receptionist_conn.user_id}: {e}")
    except Exception as e:
        active_logger.error(outer_error_message.format(error=e))
        try:
            db.commit()
        except Exception as commit_exc:
            active_logger.error(f"Commit sau lỗi side-effect thất bại: {commit_exc}")


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

    if appointment.status == AppointmentStatus.CANCELLED:
        calendar_syncer(appointment, db, action='delete')
    elif doctor_changed:
        calendar_syncer(appointment, db, action='delete')
        calendar_syncer(appointment, db, action='create')
    else:
        calendar_syncer(appointment, db, action='update')

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
                active_logger.info(error_message.format(appointment_id=appt_id, error=e))
            finally:
                thread_db.close()

        reminder_thread = threading.Thread(target=create_reminder_async, args=(appointment_id,))
        reminder_thread.daemon = True
        reminder_thread.start()
    except Exception as e:
        active_logger.info(scheduling_error_message.format(appointment_id=appointment_id, error=e))
