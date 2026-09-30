"""Durable Google Calendar sync (outbox) for appointment create/update/cancel/re-examination.

Callers only enqueue a job in their own transaction. The worker locks the appointment,
reads its *current* state and reconciles every mapped Google event with it: the doctor
and every staff user with an active connection get one event while the appointment is
active; cancelled or soft-deleted appointments lose their events. Provider-side event IDs
are derived from the job token, so a lost response or DB commit retries idempotently.
"""
import hashlib
import logging
import threading
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy import select

from app.core.database import SessionLocal
from app.models.appointment import Appointment, AppointmentStatus
from app.models.google_calendar import GoogleCalendarConnection, GoogleCalendarEvent, GoogleCalendarSyncJob
from app.models.user import User, UserRole
from app.services.google_calendar_service import CalendarEventRetired, GoogleCalendarService

logger = logging.getLogger(__name__)


def enqueue_calendar_sync(db, appointment_id):
    """Add (or wake) the pending sync job for an appointment; the caller commits."""
    pending = db.query(GoogleCalendarSyncJob).filter(
        GoogleCalendarSyncJob.appointment_id == appointment_id,
        GoogleCalendarSyncJob.completed_at.is_(None),
    ).order_by(GoogleCalendarSyncJob.id).first()
    if pending:
        pending.next_attempt_at = datetime.now(timezone.utc)
        return pending
    job = GoogleCalendarSyncJob(appointment_id=appointment_id, token=uuid4().hex)
    db.add(job)
    return job


def calendar_sync_event_id(token, user_id):
    return 'qlpk' + hashlib.sha256(f'{token}:{user_id}'.encode()).hexdigest()[:40]


def _connection(db, user_id):
    return db.query(GoogleCalendarConnection).filter(
        GoogleCalendarConnection.user_id == user_id,
        GoogleCalendarConnection.is_active.is_(True),
    ).first()


def _targets(db, appointment):
    if appointment.is_deleted or appointment.status == AppointmentStatus.CANCELLED:
        return set()
    staff = db.query(User.id).join(GoogleCalendarConnection, GoogleCalendarConnection.user_id == User.id).filter(
        User.role == UserRole.STAFF, GoogleCalendarConnection.is_active.is_(True)).all()
    return {user_id for user_id in [appointment.doctor_id, *(row.id for row in staff)] if user_id}


def _retire_untargeted(db, events, targets, provider, outcome):
    for event in events:
        if event.user_id is None or event.user_id in targets:
            continue
        connection = _connection(db, event.user_id)
        if not connection:
            outcome['notes'].append('calendar_disconnected')
        elif provider.delete_event(event, connection) is True:
            db.delete(event)
        else:
            outcome['pending'].append('delete_pending')


def _sync_user(db, job, appointment, user_id, user_events, provider, outcome):
    connection = _connection(db, user_id)
    if not connection:
        return
    live = None
    for event in user_events:
        if live is None:
            updated = provider.update_event(appointment, event, connection, report_missing=True)
            if updated is True:
                live = event
            elif updated is None:
                db.delete(event)
            else:
                outcome['pending'].append('update_pending')
                return
        elif event.event_id == live.event_id or provider.delete_event(event, connection) is True:
            db.delete(event)
        else:
            outcome['pending'].append('delete_pending')
    if live is None:
        event_id = calendar_sync_event_id(job.token, user_id)
        if provider.upsert_transfer_event(appointment, connection, event_id):
            db.add(GoogleCalendarEvent(appointment_id=appointment.id, user_id=user_id, event_id=event_id))
        else:
            outcome['pending'].append('create_pending')


def reconcile_appointment_calendar(db, job, appointment, provider=GoogleCalendarService):
    """Apply every confirmable change; return notes and the reasons work is still pending."""
    events = db.query(GoogleCalendarEvent).filter(
        GoogleCalendarEvent.appointment_id == appointment.id,
    ).order_by(GoogleCalendarEvent.id).all()
    outcome = {'notes': ['legacy_event_owner_unknown'] if any(event.user_id is None for event in events) else [],
               'pending': []}
    targets = _targets(db, appointment)
    _retire_untargeted(db, events, targets, provider, outcome)
    for user_id in sorted(targets):
        _sync_user(db, job, appointment, user_id, [event for event in events if event.user_id == user_id], provider, outcome)
    return outcome


def _schedule_retry(job, reason, now):
    job.attempts += 1
    job.last_error = reason
    job.next_attempt_at = now + timedelta(seconds=min(3600, 30 * 2 ** min(job.attempts - 1, 7)))
    logger.warning('Calendar sync job %s pending: %s', job.id, reason)


def process_calendar_sync(job_id, session_factory=SessionLocal, provider=GoogleCalendarService):
    with session_factory() as db:
        appointment_id = db.scalar(select(GoogleCalendarSyncJob.appointment_id).where(GoogleCalendarSyncJob.id == job_id))
        if appointment_id is None:
            return False
        appointment = db.query(Appointment).filter(Appointment.id == appointment_id).with_for_update().first()
        job = db.query(GoogleCalendarSyncJob).filter(GoogleCalendarSyncJob.id == job_id).with_for_update().first()
        now = datetime.now(timezone.utc)
        if not appointment or not job or job.completed_at or job.next_attempt_at > now:
            return False
        try:
            with db.begin_nested():
                outcome = reconcile_appointment_calendar(db, job, appointment, provider)
        except CalendarEventRetired:
            job.token = uuid4().hex
            _schedule_retry(job, 'event_identity_retired', now)
        except Exception:
            logger.warning('Calendar sync job %s failed; retry scheduled', job_id, exc_info=True)
            _schedule_retry(job, 'provider_or_database_failure', now)
        else:
            # Confirmed provider changes are kept even when another part is still pending.
            if outcome['pending']:
                _schedule_retry(job, outcome['pending'][0], now)
            else:
                job.completed_at = now
                job.last_error = outcome['notes'][0] if outcome['notes'] else None
        db.commit()
        return job.completed_at is not None


def drain_calendar_syncs(appointment_ids=None, limit=100, session_factory=SessionLocal, provider=GoogleCalendarService):
    with session_factory() as db:
        query = db.query(GoogleCalendarSyncJob.id).filter(
            GoogleCalendarSyncJob.completed_at.is_(None),
            GoogleCalendarSyncJob.next_attempt_at <= datetime.now(timezone.utc),
        )
        if appointment_ids is not None:
            query = query.filter(GoogleCalendarSyncJob.appointment_id.in_(appointment_ids))
        job_ids = [row.id for row in query.order_by(GoogleCalendarSyncJob.id).limit(limit).all()]
    completed = 0
    for job_id in job_ids:
        try:
            completed += bool(process_calendar_sync(job_id, session_factory, provider))
        except Exception:
            logger.warning('Calendar sync job %s remains pending after transaction failure', job_id, exc_info=True)
    return {'selected': len(job_ids), 'completed': completed}


def schedule_calendar_sync_drain(appointment_ids):
    """Try committed jobs right away in the background; the worker CLI still owns retries."""
    identities = sorted({identity for identity in appointment_ids or [] if type(identity) is int})
    if not identities:
        return None

    def run():
        try:
            drain_calendar_syncs(appointment_ids=identities)
        except Exception as error:
            logger.warning('Immediate calendar sync drain deferred to worker: %s', type(error).__name__, exc_info=True)

    thread = threading.Thread(target=run, name='calendar-sync-drain', daemon=True)
    thread.start()
    return thread


def retire_calendar_events_before_hard_delete(appointment, db, action='delete', logger_override=None,
                                              provider=GoogleCalendarService):
    """Hard delete cascades mappings and jobs, so retire Google events inline first (best effort)."""
    active_logger = logger_override or logger
    events = db.query(GoogleCalendarEvent).filter(GoogleCalendarEvent.appointment_id == appointment.id).all()
    retained = 0
    for event in events:
        connection = _connection(db, event.user_id) if event.user_id else None
        try:
            removed = bool(connection) and provider.delete_event(event, connection) is True
        except Exception:
            logger.warning('Calendar event %s could not be removed from the provider', event.id, exc_info=True)
            removed = False
        retained += not removed
        # The appointment row is going away; its mappings cannot outlive it (FK is NOT NULL).
        db.delete(event)
    if retained:
        active_logger.warning('Hard delete appointment %s: %s Google event(s) could not be removed', appointment.id, retained)
    db.flush()
    return retained == 0
