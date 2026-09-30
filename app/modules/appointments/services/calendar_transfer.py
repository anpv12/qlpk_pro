"""Durable Google Calendar transfer work, executed only after clinical commit."""
import logging
import threading
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import uuid4

from sqlalchemy import select

from app.core.database import SessionLocal
from app.models.appointment import Appointment, AppointmentStatus
from app.models.google_calendar import GoogleCalendarConnection, GoogleCalendarEvent, GoogleCalendarTransferJob
from app.services.google_calendar_service import CalendarEventRetired, GoogleCalendarService

logger = logging.getLogger(__name__)


class CalendarTransferRetry(Exception):
    pass


def enqueue_calendar_transfer(db, appointment, old_doctor_id):
    if appointment.doctor_id == old_doctor_id:
        return False
    db.add(GoogleCalendarTransferJob(
        appointment_id=appointment.id, old_user_id=old_doctor_id,
        target_user_id=appointment.doctor_id, event_id='qlpk' + uuid4().hex,
    ))
    return True


def _connection(db, user_id):
    return db.query(GoogleCalendarConnection).filter(
        GoogleCalendarConnection.user_id == user_id,
        GoogleCalendarConnection.is_active.is_(True),
    ).first()


def _delete_event(event, connection, provider):
    if not provider.delete_event(event, connection):
        raise CalendarTransferRetry('delete_pending')


def _retire_old_owner_events(db, job, events, provider):
    old_events = [event for event in events if event.user_id == job.old_user_id]
    if not old_events:
        return None
    connection = _connection(db, job.old_user_id)
    if not connection:
        return 'old_calendar_disconnected'
    for event in old_events:
        _delete_event(event, connection, provider)
        db.delete(event)
    return None


def _reconcile_live_target_events(appointment, connection, db, job, provider, target_events):
    live_events = []
    for event in target_events:
        updated = provider.update_event(appointment, event, connection, report_missing=True)
        if updated is None:
            db.delete(event)
        elif updated is True:
            live_events.append(event)
        else:
            raise CalendarTransferRetry('update_pending')
    if live_events:
        if not any(event.event_id == job.event_id for event in live_events):
            _delete_event(SimpleNamespace(event_id=job.event_id), connection, provider)
    else:
        if not provider.upsert_transfer_event(appointment, connection, job.event_id):
            raise CalendarTransferRetry('create_pending')
        db.add(GoogleCalendarEvent(appointment_id=appointment.id,
                                  user_id=job.target_user_id, event_id=job.event_id))


def _reconcile(db, job, appointment, provider):
    events = db.query(GoogleCalendarEvent).filter(
        GoogleCalendarEvent.appointment_id == appointment.id,
    ).order_by(GoogleCalendarEvent.id).all()
    if any(event.user_id is None for event in events):
        raise CalendarTransferRetry('legacy_event_owner_unknown')
    current_target = not appointment.is_deleted and appointment.status != AppointmentStatus.CANCELLED
    current_target = current_target and appointment.doctor_id == job.target_user_id
    note = None
    if job.old_user_id and job.old_user_id != appointment.doctor_id:
        note = _retire_old_owner_events(db, job, events, provider)
    connection = _connection(db, job.target_user_id)
    if not current_target:
        if not connection:
            return note or 'target_calendar_disconnected'
        _delete_event(SimpleNamespace(event_id=job.event_id), connection, provider)
        for event in events:
            if event.event_id == job.event_id and event.user_id == job.target_user_id:
                db.delete(event)
        return note
    if not connection:
        return note or 'target_calendar_disconnected'
    target_events = [event for event in events if event.user_id == job.target_user_id]
    _reconcile_live_target_events(appointment, connection, db, job, provider, target_events)
    return note


def process_calendar_transfer(job_id, session_factory=SessionLocal, provider=GoogleCalendarService):
    with session_factory() as db:
        appointment_id = db.scalar(select(GoogleCalendarTransferJob.appointment_id).where(
            GoogleCalendarTransferJob.id == job_id))
        if appointment_id is None:
            return False
        appointment = db.query(Appointment).filter(Appointment.id == appointment_id).with_for_update().first()
        job = db.query(GoogleCalendarTransferJob).filter(GoogleCalendarTransferJob.id == job_id).with_for_update().first()
        now = datetime.now(timezone.utc)
        if not appointment or not job or job.completed_at or job.next_attempt_at > now:
            return False
        try:
            with db.begin_nested():
                note = _reconcile(db, job, appointment, provider)
            job.completed_at = now
            job.last_error = note
        except Exception as error:
            job.attempts += 1
            if isinstance(error, CalendarEventRetired):
                job.event_id = 'qlpk' + uuid4().hex
                job.last_error = 'event_identity_retired'
            else:
                job.last_error = str(error) if isinstance(error, CalendarTransferRetry) else 'provider_or_database_failure'
            job.next_attempt_at = now + timedelta(seconds=min(3600, 30 * 2 ** min(job.attempts - 1, 7)))
            logger.warning('Calendar transfer job %s pending: %s', job.id, job.last_error, exc_info=True)
        db.commit()
        return job.completed_at is not None


def drain_calendar_transfers(appointment_ids=None, limit=100, session_factory=SessionLocal, provider=GoogleCalendarService):
    with session_factory() as db:
        query = db.query(GoogleCalendarTransferJob.id).filter(
            GoogleCalendarTransferJob.completed_at.is_(None),
            GoogleCalendarTransferJob.next_attempt_at <= datetime.now(timezone.utc),
        )
        if appointment_ids is not None:
            query = query.filter(GoogleCalendarTransferJob.appointment_id.in_(appointment_ids))
        job_ids = [row.id for row in query.order_by(GoogleCalendarTransferJob.id).limit(limit).all()]
    completed = 0
    for job_id in job_ids:
        try:
            completed += bool(process_calendar_transfer(job_id, session_factory, provider))
        except Exception:
            logger.warning('Calendar transfer job %s remains pending after transaction failure', job_id, exc_info=True)
    return {'selected': len(job_ids), 'completed': completed}


def schedule_calendar_transfer_drain(appointment_ids):
    """Try committed jobs right away; the supervised worker still owns retries."""
    identities = sorted({identity for identity in appointment_ids or [] if type(identity) is int})
    if not identities:
        return None

    def run():
        try:
            drain_calendar_transfers(appointment_ids=identities)
        except Exception as error:
            logger.warning('Immediate calendar transfer drain deferred to worker: %s', type(error).__name__, exc_info=True)

    thread = threading.Thread(target=run, name='calendar-transfer-drain', daemon=True)
    thread.start()
    return thread
