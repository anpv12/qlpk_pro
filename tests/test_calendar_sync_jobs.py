"""Durable Google Calendar sync outbox for appointment create/update/cancel/re-examination."""
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

from app.models.appointment import Appointment, AppointmentStatus
from app.models.google_calendar import GoogleCalendarConnection, GoogleCalendarEvent, GoogleCalendarSyncJob
from app.modules.appointments.services import calendar_sync
from app.modules.appointments.services import side_effects
from app.services.google_calendar_service import CalendarEventRetired
from test_calendar_transfer_jobs import calendar_db  # noqa: F401
from test_transfer_access_safety import transfer_db  # noqa: F401
from test_account_session_lifecycle import isolated_postgres  # noqa: F401


def enqueue(state, appointment_id=1, **changes):
    with state.factory.begin() as database:
        appointment = database.get(Appointment, appointment_id)
        for name, value in changes.items():
            setattr(appointment, name, value)
        job = calendar_sync.enqueue_calendar_sync(database, appointment_id)
        database.flush()
        return job.id


def run(state, job_id):
    return calendar_sync.process_calendar_sync(job_id, state.factory, state.provider)


def make_due(state, job_id):
    with state.factory.begin() as database:
        database.get(GoogleCalendarSyncJob, job_id).next_attempt_at = datetime.now(timezone.utc) - timedelta(seconds=1)


def mappings(state):
    with state.factory() as database:
        return sorted((row.user_id, row.event_id) for row in database.query(GoogleCalendarEvent))


def test_rolled_back_request_never_reaches_provider(calendar_db):
    state = calendar_db
    with state.factory() as database:
        calendar_sync.enqueue_calendar_sync(database, 1)
        database.flush()
        database.rollback()
    assert calendar_sync.drain_calendar_syncs(session_factory=state.factory, provider=state.provider)['selected'] == 0
    state.provider.update_event.assert_not_called()


def test_pending_requests_for_one_appointment_collapse(calendar_db):
    state = calendar_db
    first, second = enqueue(state), enqueue(state)
    assert first == second
    with state.factory() as database:
        assert database.query(GoogleCalendarSyncJob).count() == 1


def test_update_touches_doctor_and_connected_staff_then_completes(calendar_db):
    state = calendar_db
    job_id = enqueue(state)
    assert run(state, job_id)
    assert {call.args[1].user_id for call in state.provider.update_event.call_args_list} == {7, 8}
    state.provider.upsert_transfer_event.assert_not_called()
    assert mappings(state) == [(7, 'staff-event'), (8, 'old-doctor')]
    assert not run(state, job_id), 'completed jobs are not processed twice'


def test_doctor_change_retires_old_owner_and_creates_for_new_doctor(calendar_db):
    state = calendar_db
    job_id = enqueue(state, doctor_id=9)
    assert run(state, job_id)
    deleted = [call.args[0].event_id for call in state.provider.delete_event.call_args_list]
    assert deleted == ['old-doctor']
    with state.factory() as database:
        token = database.get(GoogleCalendarSyncJob, job_id).token
    assert mappings(state) == [(7, 'staff-event'), (9, calendar_sync.calendar_sync_event_id(token, 9))]


def test_soft_deleted_or_cancelled_appointment_loses_every_confirmed_event(calendar_db):
    state = calendar_db
    job_id = enqueue(state, is_deleted=True)
    assert run(state, job_id)
    assert mappings(state) == []
    state.provider.upsert_transfer_event.assert_not_called()


def test_create_failure_retries_with_same_provider_identity(calendar_db):
    state = calendar_db
    with state.factory.begin() as database:
        database.query(GoogleCalendarEvent).delete()
    state.provider.upsert_transfer_event.return_value = False
    job_id = enqueue(state)
    assert not run(state, job_id)
    first_ids = [call.args[2] for call in state.provider.upsert_transfer_event.call_args_list]
    with state.factory() as database:
        job = database.get(GoogleCalendarSyncJob, job_id)
        assert job.attempts == 1 and job.last_error == 'create_pending' and job.next_attempt_at > datetime.now(timezone.utc)
    assert not run(state, job_id), 'backoff is respected'
    make_due(state, job_id)
    state.provider.upsert_transfer_event.reset_mock(return_value=True)
    state.provider.upsert_transfer_event.return_value = True
    assert run(state, job_id)
    assert [call.args[2] for call in state.provider.upsert_transfer_event.call_args_list] == first_ids
    assert sorted(event_id for _, event_id in mappings(state)) == sorted(first_ids)


def test_retired_identity_rotates_token_and_retries(calendar_db):
    state = calendar_db
    with state.factory.begin() as database:
        database.query(GoogleCalendarEvent).delete()
    state.provider.upsert_transfer_event.side_effect = CalendarEventRetired()
    job_id = enqueue(state)
    with state.factory() as database:
        token = database.get(GoogleCalendarSyncJob, job_id).token
    assert not run(state, job_id)
    with state.factory() as database:
        job = database.get(GoogleCalendarSyncJob, job_id)
        assert job.last_error == 'event_identity_retired' and job.token != token
    assert mappings(state) == []


def test_disconnected_target_is_skipped_and_job_completes(calendar_db):
    state = calendar_db
    with state.factory.begin() as database:
        database.query(GoogleCalendarConnection).filter(GoogleCalendarConnection.user_id == 7).update({'is_active': False})
    job_id = enqueue(state, status=AppointmentStatus.CANCELLED)
    assert run(state, job_id)
    assert mappings(state) == [(7, 'staff-event')]
    with state.factory() as database:
        assert database.get(GoogleCalendarSyncJob, job_id).last_error == 'calendar_disconnected'


def test_legacy_syncer_only_enqueues_and_schedules(calendar_db, monkeypatch):
    state = calendar_db
    drain = MagicMock()
    monkeypatch.setattr(calendar_sync, 'schedule_calendar_sync_drain', drain)
    with state.factory() as database:
        assert side_effects.sync_calendar_for_appointment(database.get(Appointment, 1), database, action='delete')
    drain.assert_called_once_with([1])
    state.provider.delete_event.assert_not_called()
    with state.factory() as database:
        assert database.query(GoogleCalendarSyncJob).filter_by(appointment_id=1, completed_at=None).count() == 1


def test_hard_delete_retires_confirmed_events_inline(calendar_db):
    state = calendar_db
    state.provider.delete_event.side_effect = lambda mapping, connection: mapping.user_id == 8
    with state.factory() as database:
        assert not calendar_sync.retire_calendar_events_before_hard_delete(
            database.get(Appointment, 1), database, provider=state.provider)
        database.commit()
    assert state.provider.delete_event.call_count == 2
    assert mappings(state) == []
