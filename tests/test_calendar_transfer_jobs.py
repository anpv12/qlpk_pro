from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock
from concurrent.futures import ThreadPoolExecutor
from threading import Event
import importlib.util
from pathlib import Path
import inspect

import pytest
from flask import Flask
from googleapiclient.errors import HttpError
from httplib2 import Response
from sqlalchemy import event, text, inspect as inspect_database
from alembic.migration import MigrationContext
from alembic.operations import Operations

from app.api import appointment as api
from app.models.appointment import Appointment, AppointmentStatus
from app.models.google_calendar import GoogleCalendarConnection, GoogleCalendarEvent, GoogleCalendarSyncJob, GoogleCalendarTransferJob
from app.modules.appointments.services import calendar_transfer as worker, transfer_service
from app.modules.appointments.services.side_effects import sync_transferred_appointment_calendar
from app.services import google_calendar_service as google
from test_transfer_access_safety import transfer_db, actor, payload
from test_account_session_lifecycle import isolated_postgres, wait_for_database_lock
from module_parts import setattr_all


@pytest.fixture
def calendar_db(transfer_db, monkeypatch):
    state = transfer_db
    for model in [GoogleCalendarConnection, GoogleCalendarEvent, GoogleCalendarTransferJob, GoogleCalendarSyncJob]:
        model.__table__.create(state.engine)
    with state.factory.begin() as database:
        for user_id in [7, 8, 9, 10]:
            database.add(GoogleCalendarConnection(user_id=user_id, is_active=True))
        database.add(GoogleCalendarEvent(appointment_id=1, user_id=8, event_id='old-doctor'))
        database.add(GoogleCalendarEvent(appointment_id=1, user_id=7, event_id='staff-event'))
    monkeypatch.setattr(transfer_service, 'sync_transferred_appointment_calendar', sync_transferred_appointment_calendar)
    state.drain = MagicMock()
    setattr_all(monkeypatch,api, 'schedule_calendar_transfer_drain', state.drain)
    state.provider = MagicMock()
    state.provider.delete_event.return_value = True
    state.provider.update_event.return_value = True
    state.provider.upsert_transfer_event.return_value = True
    return state


def transfer(state, user=None, data=None):
    with state.factory.begin() as database:
        transfer_service.transfer_appointments_between_roles(database, user or actor(), data or payload())
    with state.factory() as database:
        return database.query(GoogleCalendarTransferJob.id).order_by(GoogleCalendarTransferJob.id.desc()).first().id


def process(state, job_id):
    return worker.process_calendar_transfer(job_id, state.factory, state.provider)


def make_due(state, job_id):
    with state.factory.begin() as database:
        database.get(GoogleCalendarTransferJob, job_id).next_attempt_at = datetime.now(timezone.utc) - timedelta(seconds=1)


def test_rollback_and_uncommitted_jobs_never_call_provider(calendar_db):
    state = calendar_db
    with state.factory() as database:
        transfer_service.transfer_appointments_between_roles(database, actor(), payload())
        database.flush()
        assert worker.drain_calendar_transfers(session_factory=state.factory, provider=state.provider)['selected'] == 0
        database.rollback()
    with state.factory() as database:
        assert database.query(GoogleCalendarTransferJob).count() == 0
        assert database.get(Appointment, 1).doctor_id == 8
    assert state.provider.mock_calls == []


def test_committed_transfer_preserves_staff_event_and_retries_are_noop(calendar_db):
    state = calendar_db
    job_id = transfer(state)
    assert process(state, job_id)
    assert not process(state, job_id)
    state.provider.delete_event.assert_called_once()
    assert state.provider.delete_event.call_args.args[0].event_id == 'old-doctor'
    state.provider.upsert_transfer_event.assert_called_once()
    with state.factory() as database:
        assert {row.user_id for row in database.query(GoogleCalendarEvent)} == {7, 9}
        assert database.get(GoogleCalendarTransferJob, job_id).completed_at


def test_failed_delete_keeps_mapping_and_job_for_retry(calendar_db):
    state = calendar_db
    job_id = transfer(state)
    state.provider.delete_event.return_value = False
    assert not process(state, job_id)
    state.provider.upsert_transfer_event.assert_not_called()
    with state.factory() as database:
        assert database.query(GoogleCalendarEvent).filter_by(event_id='old-doctor').count() == 1
        job = database.get(GoogleCalendarTransferJob, job_id)
        assert job.attempts == 1 and job.last_error == 'delete_pending'
    state.provider.delete_event.return_value = True
    make_due(state, job_id)
    assert process(state, job_id)


def test_lost_create_response_retries_same_event_identity(calendar_db):
    state = calendar_db
    job_id = transfer(state)
    state.provider.upsert_transfer_event.side_effect = [False, True]
    assert not process(state, job_id)
    make_due(state, job_id)
    assert process(state, job_id)
    identities = [call.args[2] for call in state.provider.upsert_transfer_event.call_args_list]
    assert len(identities) == 2 and len(set(identities)) == 1


def test_worker_commit_failure_does_not_lose_durable_job(calendar_db):
    state = calendar_db
    job_id = transfer(state)
    database = state.factory()
    def reject_commit(session):
        if not session.in_nested_transaction():
            raise RuntimeError('commit unavailable')
    event.listen(database, 'before_commit', reject_commit)
    with pytest.raises(RuntimeError, match='commit unavailable'):
        worker.process_calendar_transfer(job_id, lambda: database, state.provider)
    with state.factory() as verification:
        assert verification.get(GoogleCalendarTransferJob, job_id).completed_at is None
    assert process(state, job_id)
    identities = [call.args[2] for call in state.provider.upsert_transfer_event.call_args_list]
    assert len(identities) == 2 and len(set(identities)) == 1


def test_out_of_order_transfers_do_not_restore_previous_owner(calendar_db):
    state = calendar_db
    first = transfer(state)
    second = transfer(state, actor(9), payload(role='psychologist', recipient=10))
    assert process(state, second)
    assert process(state, first)
    state.provider.upsert_transfer_event.assert_called_once()
    with state.factory() as database:
        assert database.get(Appointment, 1).doctor_id == 10
        assert {row.user_id for row in database.query(GoogleCalendarEvent)} == {7, 10}


def test_disconnected_target_completes_after_retiring_old_owner_event(calendar_db):
    state = calendar_db
    job_id = transfer(state)
    with state.factory.begin() as database:
        database.query(GoogleCalendarConnection).filter_by(user_id=9).one().is_active = False
    assert process(state, job_id)
    state.provider.upsert_transfer_event.assert_not_called()
    with state.factory() as database:
        assert database.get(GoogleCalendarTransferJob, job_id).last_error == 'target_calendar_disconnected'
        assert database.query(GoogleCalendarEvent).filter_by(event_id='old-doctor').count() == 0


def test_disconnected_old_owner_keeps_mapping_and_still_creates_target_event(calendar_db):
    state = calendar_db
    job_id = transfer(state)
    with state.factory.begin() as database:
        database.query(GoogleCalendarConnection).filter_by(user_id=8).one().is_active = False
    assert process(state, job_id)
    state.provider.delete_event.assert_not_called()
    state.provider.upsert_transfer_event.assert_called_once()
    with state.factory() as database:
        assert database.get(GoogleCalendarTransferJob, job_id).last_error == 'old_calendar_disconnected'
        assert {row.user_id for row in database.query(GoogleCalendarEvent)} == {7, 8, 9}


def test_unknown_legacy_owner_never_deleted_or_marked_complete(calendar_db):
    state = calendar_db
    with state.factory.begin() as database:
        database.add(GoogleCalendarEvent(appointment_id=1, user_id=None, event_id='unknown'))
    job_id = transfer(state)
    assert not process(state, job_id)
    assert state.provider.mock_calls == []
    with state.factory() as database:
        assert database.get(GoogleCalendarTransferJob, job_id).last_error == 'legacy_event_owner_unknown'
        assert database.query(GoogleCalendarEvent).filter_by(event_id='unknown').count() == 1


def test_transfer_route_commit_failure_rolls_back_outbox(calendar_db, monkeypatch):
    state = calendar_db
    database = state.factory()
    setattr_all(monkeypatch,api, 'get_db', lambda: iter([database]))
    monkeypatch.setattr(database, 'commit', MagicMock(side_effect=RuntimeError('commit unavailable')))
    emitted = MagicMock()
    setattr_all(monkeypatch,api, 'emit_appointment_changed', emitted)
    with Flask(__name__).test_request_context('/transfer', method='POST', json=payload()):
        assert inspect.unwrap(api.transfer_appointments)(actor())[1] == 500
    with state.factory() as verification:
        assert verification.query(GoogleCalendarTransferJob).count() == 0
        assert verification.get(Appointment, 1).doctor_id == 8
    emitted.assert_not_called()
    assert state.provider.mock_calls == []


def test_parallel_workers_recheck_completion_after_row_lock(calendar_db):
    state = calendar_db
    job_id = transfer(state)
    entered, release, second_started = Event(), Event(), Event()
    second_pid = []
    def create(*args):
        entered.set()
        assert release.wait(8)
        return True
    def second_factory():
        database = state.factory()
        second_pid.append(database.execute(text('SELECT pg_backend_pid()')).scalar())
        second_started.set()
        return database
    state.provider.upsert_transfer_event.side_effect = create
    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(process, state, job_id)
        try:
            assert entered.wait(5)
            second = pool.submit(worker.process_calendar_transfer, job_id, second_factory, state.provider)
            assert second_started.wait(5)
            wait_for_database_lock(state.engine, second_pid[0])
            release.set()
            assert first.result(timeout=5)
            assert not second.result(timeout=5)
        finally:
            release.set()
    state.provider.upsert_transfer_event.assert_called_once()


def test_worker_reloads_owner_after_transfer_lock(calendar_db):
    state = calendar_db
    first_job = transfer(state)
    ready = Event()
    process_ids = []
    def factory():
        database = state.factory()
        process_ids.append(database.execute(text('SELECT pg_backend_pid()')).scalar())
        ready.set()
        return database
    with state.factory() as transfer_database, ThreadPoolExecutor(max_workers=1) as pool:
        try:
            transfer_service.transfer_appointments_between_roles(
                transfer_database, actor(9), payload(role='psychologist', recipient=10))
            transfer_database.flush()
            future = pool.submit(worker.process_calendar_transfer, first_job, factory, state.provider)
            assert ready.wait(5)
            wait_for_database_lock(state.engine, process_ids[0])
            transfer_database.commit()
            assert future.result(timeout=5)
        finally:
            transfer_database.rollback()
    state.provider.upsert_transfer_event.assert_not_called()


@pytest.mark.parametrize('cancelled', [False, True])
def test_no_prior_mapping_creates_only_for_current_live_appointment(calendar_db, cancelled):
    state = calendar_db
    job_id = transfer(state, data=payload([3]))
    if cancelled:
        with state.factory.begin() as database:
            database.get(Appointment, 3).status = AppointmentStatus.CANCELLED
    assert process(state, job_id)
    assert state.provider.upsert_transfer_event.call_count == int(not cancelled)


def test_backoff_survives_restart_and_drain_only_reads_due_jobs(calendar_db):
    state = calendar_db
    job_id = transfer(state)
    state.provider.delete_event.return_value = False
    assert not process(state, job_id)
    state.provider.reset_mock()
    assert worker.drain_calendar_transfers(session_factory=state.factory, provider=state.provider) == {
        'selected': 0, 'completed': 0}
    assert state.provider.mock_calls == []
    make_due(state, job_id)
    state.provider.delete_event.return_value = True
    assert worker.drain_calendar_transfers(session_factory=state.factory, provider=state.provider) == {
        'selected': 1, 'completed': 1}


def test_migration_upgrade_and_downgrade_in_isolated_database(transfer_db):
    path = Path(__file__).resolve().parents[1] / 'alembic/versions/20260928_calendar_transfer_jobs.py'
    spec = importlib.util.spec_from_file_location('calendar_transfer_migration', path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    with transfer_db.engine.begin() as connection:
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
            schema = inspect_database(connection)
            columns = {column['name'] for column in schema.get_columns('google_calendar_transfer_jobs')}
            assert columns == set(GoogleCalendarTransferJob.__table__.columns.keys())
            assert len(schema.get_unique_constraints('google_calendar_transfer_jobs')) == 1
            assert len(schema.get_indexes('google_calendar_transfer_jobs')) >= 2
            migration.downgrade()
            assert not inspect_database(connection).has_table('google_calendar_transfer_jobs')


def load_migration():
    path = Path(__file__).resolve().parents[1] / 'alembic/versions/20260928_calendar_transfer_jobs.py'
    spec = importlib.util.spec_from_file_location('calendar_transfer_migration_existing', path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    return migration


def test_migration_adopts_table_created_by_debug_create_all(transfer_db):
    GoogleCalendarTransferJob.__table__.create(transfer_db.engine)
    with transfer_db.engine.begin() as connection:
        with Operations.context(MigrationContext.configure(connection)):
            load_migration().upgrade()
        names = {index['name'] for index in inspect_database(connection).get_indexes('google_calendar_transfer_jobs')}
        assert set(load_migration().INDEXES) <= names


def test_migration_refuses_unexpected_existing_table(transfer_db):
    with transfer_db.engine.begin() as connection:
        connection.execute(text('CREATE TABLE google_calendar_transfer_jobs (id integer primary key)'))
        with Operations.context(MigrationContext.configure(connection)):
            with pytest.raises(RuntimeError, match='unexpected schema'):
                load_migration().upgrade()


def test_route_drains_only_committed_calendar_jobs(calendar_db, monkeypatch):
    state = calendar_db
    setattr_all(monkeypatch,api, 'get_db', lambda: iter([state.factory()]))
    setattr_all(monkeypatch,api, 'emit_appointment_changed', MagicMock())
    monkeypatch.setattr(api.notification_service, 'create_transfer_notifications', MagicMock())
    endpoint = inspect.unwrap(api.transfer_appointments)
    with Flask(__name__).test_request_context('/transfer', method='POST', json=payload([1, 3])):
        assert endpoint(actor())[1] == 200
    state.drain.assert_called_once_with([1, 3])
    with state.factory() as database:
        assert database.query(GoogleCalendarTransferJob).count() == 2
    state.drain.reset_mock()
    with Flask(__name__).test_request_context('/transfer', method='POST', json=payload([1, 3])):
        assert endpoint(actor(7, 'staff'))[1] == 200
    state.drain.assert_called_once_with([])
    with Flask(__name__).test_request_context('/transfer', method='POST', json=payload([2])):
        assert endpoint(actor())[1] == 403
    assert state.drain.call_count == 1


def test_immediate_drain_processes_committed_job_and_swallows_failures(calendar_db, monkeypatch):
    state = calendar_db
    job_id = transfer(state)
    monkeypatch.setattr(worker, 'drain_calendar_transfers',
                        lambda appointment_ids: worker.process_calendar_transfer(job_id, state.factory, state.provider))
    worker.schedule_calendar_transfer_drain([1, 1, True, 'x']).join(5)
    with state.factory() as database:
        assert database.get(GoogleCalendarTransferJob, job_id).completed_at is not None
    def fail(appointment_ids):
        raise RuntimeError('database unavailable')
    monkeypatch.setattr(worker, 'drain_calendar_transfers', fail)
    worker.schedule_calendar_transfer_drain([1]).join(5)
    assert worker.schedule_calendar_transfer_drain([]) is None


@pytest.mark.parametrize('status,owned,expected', [(409, True, True), (409, False, False), (503, True, False)])
def test_google_retry_verifies_marker_before_patching(monkeypatch, status, owned, expected):
    client = MagicMock()
    monkeypatch.setattr(google, 'build', lambda *args, **kwargs: client)
    monkeypatch.setattr(google.GoogleCalendarService, 'get_valid_credentials', lambda connection: MagicMock())
    monkeypatch.setattr(google.GoogleCalendarService, 'build_event_payload', lambda appointment: {'summary': 'QA'})
    events = client.events.return_value
    events.insert.return_value.execute.side_effect = HttpError(Response({'status': status}), b'{}')
    marker = {'qlpk_transfer_event': 'qlpk123', 'qlpk_appointment_id': '1'} if owned else {}
    events.get.return_value.execute.return_value = {'extendedProperties': {'private': marker}}
    assert google.GoogleCalendarService.upsert_transfer_event(SimpleNamespace(id=1), SimpleNamespace(), 'qlpk123') is expected
    assert events.insert.call_args.kwargs['body']['id'] == 'qlpk123'
    assert events.patch.call_count == int(expected)


@pytest.mark.parametrize('result', [None, False])
def test_missing_target_mapping_recreated_only_after_positive_provider_evidence(calendar_db, result):
    state = calendar_db
    with state.factory.begin() as database:
        database.add(GoogleCalendarEvent(appointment_id=1, user_id=9, event_id='missing-target'))
    job_id = transfer(state)
    state.provider.update_event.return_value = result
    assert process(state, job_id) is (result is None)
    assert state.provider.upsert_transfer_event.call_count == int(result is None)
    with state.factory() as database:
        assert bool(database.query(GoogleCalendarEvent).filter_by(event_id='missing-target').count()) is (result is False)
        if result is False:
            assert database.get(GoogleCalendarTransferJob, job_id).last_error == 'update_pending'


def test_return_to_old_owner_recovers_mapping_deleted_remotely_before_rollback(calendar_db):
    state = calendar_db
    remote = {(8, 'old-doctor'), (7, 'staff-event')}
    def delete(calendar_event, connection):
        remote.discard((connection.user_id, calendar_event.event_id))
        return True
    def update(appointment, calendar_event, connection, **kwargs):
        return True if (connection.user_id, calendar_event.event_id) in remote else None
    def create(appointment, connection, event_id):
        remote.add((connection.user_id, event_id))
        return True
    state.provider.delete_event.side_effect = delete
    state.provider.update_event.side_effect = update
    state.provider.upsert_transfer_event.return_value = False
    first = transfer(state)
    assert not process(state, first)
    assert (8, 'old-doctor') not in remote
    with state.factory() as database:
        assert database.query(GoogleCalendarEvent).filter_by(event_id='old-doctor').count() == 1
    second = transfer(state, actor(9), payload(recipient=8))
    state.provider.upsert_transfer_event.side_effect = create
    assert process(state, second)
    make_due(state, first)
    assert process(state, first)
    with state.factory() as database:
        mappings = {(row.user_id, row.event_id) for row in database.query(GoogleCalendarEvent)}
        assert mappings == remote
        assert {user_id for user_id, event_id in mappings} == {7, 8}


def test_confirmed_retired_event_rotates_identity_durably_before_retry(calendar_db):
    state = calendar_db
    job_id = transfer(state)
    with state.factory() as database:
        original = database.get(GoogleCalendarTransferJob, job_id).event_id
    state.provider.upsert_transfer_event.side_effect = google.CalendarEventRetired()
    assert not process(state, job_id)
    with state.factory() as database:
        job = database.get(GoogleCalendarTransferJob, job_id)
        replacement = job.event_id
        assert replacement != original
        assert job.last_error == 'event_identity_retired' and job.completed_at is None
    state.provider.upsert_transfer_event.side_effect = None
    make_due(state, job_id)
    assert process(state, job_id)
    assert state.provider.upsert_transfer_event.call_args.args[2] == replacement


def test_rotation_commit_failure_never_uses_uncommitted_replacement(calendar_db):
    state = calendar_db
    job_id = transfer(state)
    with state.factory() as verification:
        original = verification.get(GoogleCalendarTransferJob, job_id).event_id
    database = state.factory()
    def fail_commit(session):
        if not session.in_nested_transaction():
            raise RuntimeError('rotation commit failure')
    event.listen(database, 'before_commit', fail_commit)
    state.provider.upsert_transfer_event.side_effect = google.CalendarEventRetired()
    with pytest.raises(RuntimeError, match='rotation commit failure'):
        worker.process_calendar_transfer(job_id, lambda: database, state.provider)
    with state.factory() as verification:
        assert verification.get(GoogleCalendarTransferJob, job_id).event_id == original
    assert not process(state, job_id)
    assert {call.args[2] for call in state.provider.upsert_transfer_event.call_args_list} == {original}


def test_missing_duplicate_mapping_does_not_create_when_live_target_exists(calendar_db):
    state = calendar_db
    with state.factory.begin() as database:
        database.add(GoogleCalendarEvent(appointment_id=1, user_id=9, event_id='missing'))
        database.add(GoogleCalendarEvent(appointment_id=1, user_id=9, event_id='live'))
    job_id = transfer(state)
    state.provider.update_event.side_effect = [None, True]
    assert process(state, job_id)
    state.provider.upsert_transfer_event.assert_not_called()
    with state.factory() as database:
        assert {row.event_id for row in database.query(GoogleCalendarEvent)} == {'staff-event', 'live'}


@pytest.mark.parametrize('status', [404, 410, 403, 429, 503, 'cancelled', 'timeout'])
def test_update_missing_is_distinct_from_provider_failure(monkeypatch, status):
    client = MagicMock()
    monkeypatch.setattr(google, 'build', lambda *args, **kwargs: client)
    monkeypatch.setattr(google.GoogleCalendarService, 'get_valid_credentials', lambda connection: MagicMock())
    getter = client.events.return_value.get.return_value.execute
    if status == 'cancelled':
        getter.return_value = {'status': 'cancelled'}
    elif status == 'timeout':
        getter.side_effect = TimeoutError()
    else:
        getter.side_effect = HttpError(Response({'status': status}), b'{}')
    expected = None if status in (404, 410, 'cancelled') else False
    appointment, mapping, connection = SimpleNamespace(id=1), SimpleNamespace(event_id='qa'), SimpleNamespace()
    assert google.GoogleCalendarService.update_event(appointment, mapping, connection, report_missing=True) is expected
    assert google.GoogleCalendarService.update_event(appointment, mapping, connection) is False
    client.events.return_value.update.assert_not_called()


@pytest.mark.parametrize('status', [410, 'cancelled', 404, 403, 503])
def test_upsert_rotates_only_confirmed_retired_identity(monkeypatch, status):
    client = MagicMock()
    monkeypatch.setattr(google, 'build', lambda *args, **kwargs: client)
    monkeypatch.setattr(google.GoogleCalendarService, 'get_valid_credentials', lambda connection: MagicMock())
    monkeypatch.setattr(google.GoogleCalendarService, 'build_event_payload', lambda appointment: {'summary': 'QA'})
    events = client.events.return_value
    events.insert.return_value.execute.side_effect = HttpError(Response({'status': 409}), b'{}')
    if status == 'cancelled':
        events.get.return_value.execute.return_value = {'status': 'cancelled'}
    else:
        events.get.return_value.execute.side_effect = HttpError(Response({'status': status}), b'{}')
    args = (SimpleNamespace(id=1), SimpleNamespace(), 'qlpk123')
    if status in (410, 'cancelled'):
        with pytest.raises(google.CalendarEventRetired):
            google.GoogleCalendarService.upsert_transfer_event(*args)
    else:
        assert google.GoogleCalendarService.upsert_transfer_event(*args) is False
    events.patch.assert_not_called()
