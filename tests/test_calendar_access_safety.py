from concurrent.futures import ThreadPoolExecutor
from threading import Event
from unittest.mock import MagicMock
import inspect

import pytest
from flask import Flask
from sqlalchemy import text

from app.api import calendar as api, auth as auth_api
from app.models.appointment import Appointment, AppointmentStatus
from app.models.user import User
from app.models.google_calendar import GoogleCalendarConnection, GoogleCalendarEvent
from app.modules.appointments.services import calendar_access as access
from app.services import google_calendar_service as google
from test_calendar_transfer_jobs import calendar_db
from test_transfer_access_safety import transfer_db, actor
from test_account_session_lifecycle import isolated_postgres, wait_for_database_lock
from module_parts import setattr_all


@pytest.fixture
def calendar_api(calendar_db, monkeypatch):
    state = calendar_db
    setattr_all(monkeypatch,api, 'get_db', lambda: iter([state.factory()]))
    state.emitted = MagicMock()
    setattr_all(monkeypatch,api, 'emit_appointment_changed', state.emitted)
    state.verify = MagicMock(return_value=True)
    state.create = MagicMock(return_value='qa-created')
    monkeypatch.setattr(google.GoogleCalendarService, 'verify_event', state.verify)
    monkeypatch.setattr(google.GoogleCalendarService, 'create_event', state.create)
    return state


def call(function, user, data=None, method='POST', query=''):
    with Flask(__name__).test_request_context('/calendar' + query, method=method, json=data):
        result = inspect.unwrap(function)(user)
        return (result[1], result[0].json) if isinstance(result, tuple) else (200, result.json)


@pytest.mark.parametrize('data', [None, [], {}, {'appointment_ids': []}, {'appointment_ids': [True]},
    {'appointment_ids': [1.0]}, {'appointment_ids': [' 1']}, {'appointment_ids': [0]},
    {'appointment_ids': [2147483648]}, {'appointment_ids': ['9' * 5000]}, {'appointment_ids': [1] * 101}])
def test_invalid_batch_ids_fail_without_database(data):
    with pytest.raises(access.CalendarAccessError) as failure:
        access.parse_calendar_ids(data)
    assert failure.value.status_code == 400


@pytest.mark.parametrize('start,end', [(None, None), ('2026-09-28', None), ('bad', 'bad'),
    ('2026-9-1', '2026-09-28'), ('2026-09-28', '2026-09-27'), ('2025-01-01', '2026-09-28')])
def test_invalid_or_unbounded_dates_rejected(start, end):
    with pytest.raises(access.CalendarAccessError):
        access.calendar_date_range(start, end)


@pytest.mark.parametrize('function', [api.sync_appointments, api.verify_events])
def test_mixed_forbidden_batch_never_contacts_google(calendar_api, function):
    state = calendar_api
    status, body = call(function, actor(8, 'admin'), {'appointment_ids': [1, 2]})
    assert status == 403
    state.verify.assert_not_called()
    state.create.assert_not_called()
    state.emitted.assert_not_called()


def test_write_rejects_view_all_historical_owner_cancelled_and_missing(calendar_api):
    state = calendar_api
    with state.factory.begin() as database:
        database.get(User, 8).can_view_all_patients = True
        database.get(Appointment, 2).psychologist_id = 10
    for user, ids, expected in [(actor(8), [2], 403), (actor(10), [2], 403),
                                 (actor(11), [1], 403), (actor(999), [1], 403),
                                 (actor(7), [1, 999], 404)]:
        assert call(api.sync_appointments, user, {'appointment_ids': ids})[0] == expected
    with state.factory.begin() as database:
        database.get(Appointment, 3).status = AppointmentStatus.CANCELLED
    assert call(api.sync_appointments, actor(7), {'appointment_ids': [1, 3]})[0] == 409
    state.verify.assert_not_called()
    state.create.assert_not_called()


def test_read_scope_and_write_scope_are_distinct(calendar_api):
    state = calendar_api
    query = '?from=2026-09-28&to=2026-09-28'
    status, body = call(api.get_sync_status, actor(8), method='GET', query=query)
    assert status == 200 and {row['id'] for row in body['appointments']} == {1, 3}
    with state.factory.begin() as database:
        database.get(User, 8).can_view_all_patients = True
        database.get(Appointment, 2).psychologist_id = 10
    assert len(call(api.get_sync_status, actor(8), method='GET', query=query)[1]['appointments']) == 3
    assert call(api.verify_events, actor(10), {'appointment_ids': [2]})[0] == 200
    assert call(api.sync_appointments, actor(10), {'appointment_ids': [2]})[0] == 403


def test_doctor_sync_deduplicates_batch_and_never_mutates_staff_calendar(calendar_api):
    state = calendar_api
    status, body = call(api.sync_appointments, actor(8), {'appointment_ids': ['1', 1]})
    assert status == 200 and body['synced_ids'] == [1]
    assert all(record.args[1].user_id == 8 for record in state.verify.call_args_list)
    state.create.assert_not_called()
    state.emitted.assert_called_once()


def test_staff_sync_still_covers_clinician_and_staff(calendar_api):
    state = calendar_api
    assert call(api.sync_appointments, actor(7), {'appointment_ids': [1]})[0] == 200
    assert {record.args[1].user_id for record in state.verify.call_args_list} == {7, 8}


def test_bulk_delete_requires_dates_and_only_deletes_own_calendar(calendar_api, monkeypatch):
    state = calendar_api
    client = MagicMock()
    monkeypatch.setattr('googleapiclient.discovery.build', lambda *args, **kwargs: client)
    with state.factory.begin() as database:
        for connection in database.query(GoogleCalendarConnection):
            connection.access_token = 'qa-only'
        database.add(GoogleCalendarEvent(appointment_id=2, user_id=9, event_id='other-owner'))
    assert call(api.delete_all_calendar_events, actor(8), {}, method='DELETE')[0] == 400
    client.events.assert_not_called()
    status, body = call(api.delete_all_calendar_events, actor(8),
                        {'from_date': '2026-09-28', 'to_date': '2026-09-28'}, method='DELETE')
    assert status == 200 and body['deleted_count'] == 1
    with state.factory() as database:
        assert {row.event_id for row in database.query(GoogleCalendarEvent)} == {'staff-event', 'other-owner'}


def test_validate_connections_only_touches_own_connection_for_doctor(calendar_api, monkeypatch):
    state = calendar_api
    credentials = MagicMock(return_value=None)
    monkeypatch.setattr(google.GoogleCalendarService, 'get_valid_credentials', credentials)
    assert call(api.validate_connections, actor(8))[0] == 200
    assert [record.args[0].user_id for record in credentials.call_args_list] == [8]


@pytest.mark.parametrize('change', ['reassign', 'cancel'])
def test_sync_rechecks_owner_and_status_after_real_lock(calendar_api, change):
    state = calendar_api
    ready = Event()
    process_ids = []
    def run():
        with state.factory() as database:
            current = access.calendar_actor(database, actor(8))
            process_ids.append(database.execute(text('SELECT pg_backend_pid()')).scalar())
            ready.set()
            with pytest.raises(access.CalendarAccessError) as failure:
                access.prepare_calendar_batch(database, current, [1], write=True)
            return failure.value.status_code
    with state.factory() as first, ThreadPoolExecutor(max_workers=1) as pool:
        try:
            appointment = first.query(Appointment).filter_by(id=1).with_for_update().one()
            if change == 'reassign':
                appointment.doctor_id = 9
            else:
                appointment.status = AppointmentStatus.CANCELLED
            first.flush()
            future = pool.submit(run)
            assert ready.wait(5)
            wait_for_database_lock(state.engine, process_ids[0])
            first.commit()
            assert future.result(timeout=5) == (403 if change == 'reassign' else 409)
        finally:
            first.rollback()


def test_real_http_auth_and_validation(calendar_api, monkeypatch):
    state = calendar_api
    application = Flask(__name__)
    application.register_blueprint(api.calendar_bp)
    monkeypatch.setattr(auth_api, 'get_current_user', lambda token: actor(8, 'admin'))
    monkeypatch.setattr(auth_api, 'get_db', lambda: iter([state.factory()]))
    client = application.test_client()
    assert client.post('/api/calendar/sync', json={'appointment_ids': [1]}).status_code == 401
    headers = {'Authorization': 'Bearer qa'}
    assert client.post('/api/calendar/sync', data='{', content_type='application/json', headers=headers).status_code == 400
    assert client.post('/api/calendar/sync', json={'appointment_ids': [1, 2]}, headers=headers).status_code == 403
    assert client.post('/api/calendar/sync', json={'appointment_ids': [1]}, headers=headers).status_code == 200


def test_actor_disable_rechecked_after_real_user_lock(calendar_api):
    state = calendar_api
    ready = Event()
    process_ids = []
    def run():
        with state.factory() as database:
            process_ids.append(database.execute(text('SELECT pg_backend_pid()')).scalar())
            ready.set()
            with pytest.raises(access.CalendarAccessError) as failure:
                access.calendar_actor(database, actor(8))
            return failure.value.status_code
    with state.factory() as first, ThreadPoolExecutor(max_workers=1) as pool:
        try:
            first.query(User).filter_by(id=8).with_for_update().one().is_active = False
            first.flush()
            future = pool.submit(run)
            assert ready.wait(5)
            wait_for_database_lock(state.engine, process_ids[0])
            first.commit()
            assert future.result(timeout=5) == 403
        finally:
            first.rollback()


def test_bulk_delete_rechecks_ownership_when_transfer_commits(calendar_api, monkeypatch):
    state = calendar_api
    ready = Event()
    process_ids = []
    def get_database():
        database = state.factory()
        process_ids.append(database.execute(text('SELECT pg_backend_pid()')).scalar())
        ready.set()
        return iter([database])
    setattr_all(monkeypatch,api, 'get_db', get_database)
    client = MagicMock()
    monkeypatch.setattr('googleapiclient.discovery.build', lambda *args, **kwargs: client)
    with state.factory() as first, ThreadPoolExecutor(max_workers=1) as pool:
        try:
            first.query(Appointment).filter_by(id=1).with_for_update().one().doctor_id = 9
            first.flush()
            future = pool.submit(call, api.delete_all_calendar_events, actor(8),
                                 {'from_date': '2026-09-28', 'to_date': '2026-09-28'}, 'DELETE')
            assert ready.wait(5)
            wait_for_database_lock(state.engine, process_ids[0])
            first.commit()
            status, body = future.result(timeout=5)
            assert status == 200 and body['deleted_count'] == 0
        finally:
            first.rollback()
    client.events.assert_not_called()
    with state.factory() as database:
        assert database.query(GoogleCalendarEvent).count() == 2
