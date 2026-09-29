from types import SimpleNamespace
from unittest.mock import MagicMock
import inspect

import pytest
from flask import Flask
from googleapiclient.errors import HttpError
from httplib2 import Response

from app.api import calendar as api
from app.models.appointment import Appointment
from app.models.google_calendar import GoogleCalendarConnection, GoogleCalendarEvent
from app.modules.appointments.services.side_effects import sync_calendar_for_appointment
from app.services import google_calendar_service as google
from test_calendar_transfer_jobs import calendar_db
from test_transfer_access_safety import transfer_db, actor
from test_account_session_lifecycle import isolated_postgres
from module_parts import setattr_all


def endpoint(state, monkeypatch, function, method='POST', data=None):
    setattr_all(monkeypatch,api, 'get_db', lambda: iter([state.factory()]))
    setattr_all(monkeypatch,api, 'emit_appointment_changed', MagicMock())
    default_data = {'from_date': '2026-09-28', 'to_date': '2026-09-28'} if method == 'DELETE' else {'appointment_ids': [1]}
    with Flask(__name__).test_request_context('/calendar', method=method, json=data or default_data):
        result = inspect.unwrap(function)(actor(7, 'staff'))
        return result[0].json if isinstance(result, tuple) else result.json


@pytest.mark.parametrize('status', [404, 410, 403, 429, 503, 'timeout', 'cancelled', 'active', 'credentials'])
def test_strict_verification_never_calls_unknown_absent(monkeypatch, status):
    client = MagicMock()
    monkeypatch.setattr(google, 'build', lambda *args, **kwargs: client)
    monkeypatch.setattr(google.GoogleCalendarService, 'get_valid_credentials',
                        lambda connection: None if status == 'credentials' else MagicMock())
    getter = client.events.return_value.get.return_value.execute
    if status in ('active', 'cancelled'):
        getter.return_value = {'status': 'confirmed' if status == 'active' else 'cancelled'}
    elif status == 'timeout':
        getter.side_effect = TimeoutError('upstream 404 bytes')
    else:
        getter.side_effect = HttpError(Response({'status': status if isinstance(status, int) else 401}), b'{}')
    if status in (404, 410, 'cancelled', 'active'):
        assert google.GoogleCalendarService.verify_event('event', SimpleNamespace(), strict=True) is (status == 'active')
    else:
        with pytest.raises(google.CalendarVerificationUnavailable):
            google.GoogleCalendarService.verify_event('event', SimpleNamespace(), strict=True)
    assert google.GoogleCalendarService.verify_event('event', SimpleNamespace()) is (status == 'active')


def test_manual_sync_network_failure_keeps_all_mappings_and_never_creates(calendar_db, monkeypatch):
    state = calendar_db
    verify = MagicMock(side_effect=google.CalendarVerificationUnavailable())
    create = MagicMock()
    monkeypatch.setattr(google.GoogleCalendarService, 'verify_event', verify)
    monkeypatch.setattr(google.GoogleCalendarService, 'create_event', create)
    result = endpoint(state, monkeypatch, api.sync_appointments)
    assert result['failed_ids'] == [1] and result['success_count'] == 0
    create.assert_not_called()
    assert all(call.kwargs['strict'] for call in verify.call_args_list)
    with state.factory() as database:
        assert database.query(GoogleCalendarEvent).count() == 2


@pytest.mark.parametrize('same_identity,deleted', [(False, False), (False, True), (True, False)])
def test_manual_sync_duplicate_does_not_orphan_remote_event(calendar_db, monkeypatch, same_identity, deleted):
    state = calendar_db
    with state.factory.begin() as database:
        database.add(GoogleCalendarEvent(appointment_id=1, user_id=8,
                                        event_id='old-doctor' if same_identity else 'duplicate'))
    remove = MagicMock(return_value=deleted)
    monkeypatch.setattr(google.GoogleCalendarService, 'verify_event', MagicMock(return_value=True))
    monkeypatch.setattr(google.GoogleCalendarService, 'delete_event', remove)
    create = MagicMock()
    monkeypatch.setattr(google.GoogleCalendarService, 'create_event', create)
    endpoint(state, monkeypatch, api.sync_appointments)
    create.assert_not_called()
    assert remove.call_count == int(not same_identity)
    with state.factory() as database:
        assert database.query(GoogleCalendarEvent).count() == (2 if same_identity or deleted else 3)


@pytest.mark.parametrize('missing', [False, True])
def test_update_failure_keeps_mapping_and_only_confirmed_missing_recreates(calendar_db, monkeypatch, missing):
    state = calendar_db
    monkeypatch.setattr(google.GoogleCalendarService, 'update_event', MagicMock(return_value=None if missing else False))
    create = MagicMock(return_value=None)
    monkeypatch.setattr(google.GoogleCalendarService, 'create_event', create)
    with state.factory() as database:
        assert not sync_calendar_for_appointment(database.get(Appointment, 1), database)
    assert create.call_count == (2 if missing else 0)
    with state.factory() as database:
        assert database.query(GoogleCalendarEvent).count() == 2


def test_cancel_only_removes_provider_confirmed_event(calendar_db, monkeypatch):
    state = calendar_db
    monkeypatch.setattr(google.GoogleCalendarService, 'delete_event', lambda mapping, connection: mapping.user_id == 7)
    with state.factory() as database:
        assert not sync_calendar_for_appointment(database.get(Appointment, 1), database, action='delete')
    with state.factory() as database:
        assert [row.event_id for row in database.query(GoogleCalendarEvent)] == ['old-doctor']


def test_cancel_retains_unknown_owner_and_disconnected_mapping(calendar_db, monkeypatch):
    state = calendar_db
    with state.factory.begin() as database:
        database.query(GoogleCalendarConnection).update({'is_active': False})
        database.add(GoogleCalendarEvent(appointment_id=1, user_id=None, event_id='legacy'))
    remove = MagicMock(return_value=True)
    monkeypatch.setattr(google.GoogleCalendarService, 'delete_event', remove)
    with state.factory() as database:
        assert not sync_calendar_for_appointment(database.get(Appointment, 1), database, action='delete')
    remove.assert_not_called()
    with state.factory() as database:
        assert database.query(GoogleCalendarEvent).count() == 3


def test_update_confirmed_missing_replaces_only_after_create_succeeds(calendar_db, monkeypatch):
    state = calendar_db
    monkeypatch.setattr(google.GoogleCalendarService, 'update_event', MagicMock(return_value=None))
    monkeypatch.setattr(google.GoogleCalendarService, 'create_event', lambda appointment, connection: f'new-{connection.user_id}')
    with state.factory() as database:
        assert sync_calendar_for_appointment(database.get(Appointment, 1), database)
    with state.factory() as database:
        assert {row.event_id for row in database.query(GoogleCalendarEvent)} == {'new-7', 'new-8'}


@pytest.mark.parametrize('status', [403, 429])
def test_delete_all_rate_limits_retry_without_erasing_failed_mapping(calendar_db, monkeypatch, status):
    state = calendar_db
    with state.factory.begin() as database:
        for connection in database.query(GoogleCalendarConnection):
            connection.access_token = 'qa-not-a-real-token'
    client = MagicMock()
    monkeypatch.setattr('googleapiclient.discovery.build', lambda *args, **kwargs: client)
    monkeypatch.setattr('time.sleep', lambda duration: None)
    delete = client.events.return_value.delete.return_value.execute
    delete.side_effect = HttpError(Response({'status': status}), b'{"error":{"message":"rateLimitExceeded"}}')
    result = endpoint(state, monkeypatch, api.delete_all_calendar_events, method='DELETE')
    assert result['deleted_count'] == 0 and result['failed_count'] == 2
    assert delete.call_count == 6
    with state.factory() as database:
        assert database.query(GoogleCalendarEvent).count() == 2


@pytest.mark.parametrize('status', ['no_connection', 'fake404', 404, 410, 503])
def test_delete_all_retains_unconfirmed_events(calendar_db, monkeypatch, status):
    state = calendar_db
    client = MagicMock()
    monkeypatch.setattr('googleapiclient.discovery.build', lambda *args, **kwargs: client)
    if status != 'no_connection':
        with state.factory.begin() as database:
            for connection in database.query(GoogleCalendarConnection):
                connection.access_token = 'qa-not-a-real-token'
        if status == 'fake404':
            client.events.return_value.delete.return_value.execute.side_effect = TimeoutError('request 404 lost')
        else:
            client.events.return_value.delete.return_value.execute.side_effect = HttpError(Response({'status': status}), b'{}')
    result = endpoint(state, monkeypatch, api.delete_all_calendar_events, method='DELETE')
    confirmed = status in (404, 410)
    assert result['deleted_count'] == (2 if confirmed else 0)
    assert result.get('failed_count', 0) == (0 if confirmed else 2)
    with state.factory() as database:
        assert database.query(GoogleCalendarEvent).count() == (0 if confirmed else 2)
