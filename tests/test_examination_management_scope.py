from datetime import datetime
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from flask import Flask
from werkzeug.datastructures import MultiDict

from app.api import auth as auth_api, examination_management as api
from app.models.appointment import Appointment
from app.models.examination import Examination, ExaminationStatus
from app.models.patient import Patient
from app.models.user import User, UserRole
from app.models.service_category import ServiceCategory
from app.models.service import Service
from app.models.package import Package
from app.modules.examinations.services import management_query as query
from test_account_session_lifecycle import isolated_postgres
from test_browser_sessions import setup as cookie_setup, login


def actor(role='doctor', user_id=7, **values):
    return SimpleNamespace(id=user_id, role=role, is_active=True, can_view_all_patients=False, **values)


@pytest.mark.parametrize('args', [
    {'page': '0'}, {'page': '-1'}, {'page': 'abc'}, {'per_page': '0'}, {'per_page': '101'},
    {'doctor_id': 'no'}, {'doctor_id': '-1'}, {'status': 'unknown'},
    {'from_date': 'bad'}, {'to_date': '2026-02-30'}, {'to_date': '9999-12-31'},
    {'from_date': '2026-09-28', 'to_date': '2026-09-27'},
])
def test_invalid_filters_reject_without_executing_query(args):
    database = MagicMock()
    with pytest.raises(query.InvalidManagementFilter):
        query.get_examination_management_list_result(database, MultiDict(args), actor())
    database.commit.assert_not_called()


def test_real_postgres_management_scope_filters_reads_and_writes(isolated_postgres, monkeypatch):
    factory, engine = isolated_postgres
    for model in [Patient, ServiceCategory, Service, Package, Appointment, Examination]:
        model.__table__.create(engine)
    day = datetime(2026, 9, 28)
    with factory.begin() as database:
        database.add_all([User(id=8, username='other', full_name='Khác', hashed_password='qa', role='doctor'),
                          User(id=9, username='psych', full_name='Tâm lý', hashed_password='qa', role=UserRole.PSYCHOLOGIST)])
        database.add(Patient(id=1, patient_code='QA-P', full_name='Bệnh nhân QA'))
        database.flush()
        for identity, doctor, psychologist, deleted, active, date, status in [
            (1, 7, None, False, True, day, ExaminationStatus.DOCTOR_EXAM),
            (2, 8, None, False, True, day, ExaminationStatus.DOCTOR_EXAM),
            (3, 8, 9, False, True, day, ExaminationStatus.PSYCHOLOGIST_EXAM),
            (4, 9, None, False, True, day, ExaminationStatus.CONCLUSION),
            (5, 7, None, True, True, day, ExaminationStatus.DOCTOR_EXAM),
            (6, 7, None, False, False, day, ExaminationStatus.DOCTOR_EXAM),
            (7, 7, None, False, True, datetime(2026, 9, 27), ExaminationStatus.DOCTOR_EXAM),
            (8, 7, None, False, True, datetime(2026, 9, 29), ExaminationStatus.DOCTOR_EXAM),
            (9, 7, None, False, True, day, ExaminationStatus.PAID),
        ]:
            database.add(Appointment(id=identity, appointment_code=f'QA-A{identity}', patient_id=1,
                doctor_id=doctor, psychologist_id=psychologist, is_deleted=deleted, appointment_date=date))
            database.flush()
            database.add(Examination(id=identity, examination_code=f'QA-E{identity}', appointment_id=identity,
                patient_id=1, doctor_id=doctor, is_active=active, examination_date=date, status=status))

    current = [actor()]
    application = Flask(__name__)
    application.register_blueprint(api.examination_management_bp)
    monkeypatch.setattr(auth_api, 'get_current_user', lambda token: current[0])
    monkeypatch.setattr(auth_api, 'get_db', lambda: iter([factory()]))
    monkeypatch.setattr(api, 'get_db', lambda: iter([factory()]))
    emitted = MagicMock()
    monkeypatch.setattr(api, 'emit_examination_changed', emitted)
    client = application.test_client()
    headers = {'Authorization': 'Bearer isolated-guard-test'}
    filters = '?from_date=2026-09-28&to_date=2026-09-28'

    for user, expected in [(actor(), {1, 9}), (actor('psychologist', 9), {3, 4}),
                           (actor('admin'), {1, 2, 3, 4, 9}), (actor('staff'), {1, 2, 3, 4, 9}),
                           (actor('cashier'), set()), (actor('unknown'), set())]:
        current[0] = user
        response = client.get('/examinations' + filters, headers=headers)
        assert response.status_code == 200, response.json
        assert {row['id'] for row in response.json['examinations']} == expected
        stats = client.get('/examinations/stats' + filters, headers=headers)
        assert stats.status_code == 200
        assert 'PAID' not in stats.json
        assert sum(stats.json.values()) == len(expected - {9})
    current[0] = actor()
    for identity in [2, 5, 6, 999]:
        assert client.get(f'/examinations/{identity}', headers=headers).status_code == 404
        assert client.put(f'/examinations/{identity}/status', headers=headers,
                          json={'status': 'COMPLETED'}).status_code == 404
    emitted.assert_not_called()
    current[0] = actor('cashier')
    assert client.get('/examinations/1', headers=headers).status_code == 404
    assert client.put('/examinations/1/status', headers=headers, json={'status': 'COMPLETED'}).status_code == 404
    current[0] = actor()
    allowed = client.get('/examinations/1', headers=headers)
    assert allowed.status_code == 200, allowed.json
    assert allowed.json['patient_name'] == 'Bệnh nhân QA'
    for payload in [None, [], 'invalid', {}, {'status': 'bogus'}, {'status': []}]:
        result = client.put('/examinations/1/status', headers=headers, json=payload)
        assert result.status_code == 400, (payload, result.json)
    emitted.assert_not_called()
    changed = client.put('/examinations/1/status', headers=headers, json={'status': 'COMPLETED'})
    assert changed.status_code == 200
    emitted.assert_called_once()
    with factory() as database:
        assert database.get(Examination, 1).status == ExaminationStatus.COMPLETED
        assert database.get(Examination, 2).status == ExaminationStatus.DOCTOR_EXAM
        assert database.get(Examination, 5).status == ExaminationStatus.DOCTOR_EXAM

    for filters_extra, expected in [('&doctor_id=8', set()), ('&search=benh nhan', {1, 9}),
                                    ('&search=QA-E1', {1}), ('&search=no-match', set())]:
        result = client.get('/examinations' + filters + filters_extra, headers=headers)
        assert result.status_code == 200, result.json
        assert {row['id'] for row in result.json['examinations']} == expected
        stats = client.get('/examinations/stats' + filters + filters_extra, headers=headers)
        assert stats.status_code == 200, stats.json
        assert sum(stats.json.values()) == len(expected - {9})
    for suffix in ['?from_date=bad', '?doctor_id=no', '?from_date=2026-09-29&to_date=2026-09-28']:
        assert client.get('/examinations' + suffix, headers=headers).status_code == 400
        assert client.get('/examinations/stats' + suffix, headers=headers).status_code == 400
    filtered = client.get('/examinations' + filters + '&status=COMPLETED', headers=headers)
    assert {row['id'] for row in filtered.json['examinations']} == {1}
    badges = client.get('/examinations/stats' + filters + '&status=DOCTOR_EXAM', headers=headers)
    assert badges.json['COMPLETED'] == 1
    assert badges.json['DOCTOR_EXAM'] == 0
    current[0].can_view_all_patients = True
    result = client.get('/examinations' + filters + '&per_page=2', headers=headers)
    assert result.json['total'] == 5
    assert result.json['total_pages'] == 3
    assert len(result.json['examinations']) == 2
    assert client.get('/examinations/2', headers=headers).status_code == 200
    current[0].is_active = False
    assert client.get('/examinations', headers=headers).status_code == 401


def test_stats_cookie_transport_uses_authenticated_actor(cookie_setup, monkeypatch):
    cookie_setup.app.register_blueprint(api.examination_management_bp)
    monkeypatch.setattr(api, 'get_db', lambda: iter([cookie_setup.database]))
    stats = MagicMock(return_value={'DOCTOR_EXAM': 0})
    monkeypatch.setattr(api, 'get_examination_stats_result', stats)
    assert login(cookie_setup).status_code == 200
    result = cookie_setup.client.get('/examinations/stats', headers={'Origin': 'http://localhost'})
    assert result.status_code == 200
    assert stats.call_args.args[2].id == cookie_setup.account.id


@pytest.mark.parametrize('path,method', [('/examinations', 'GET'), ('/examinations/1', 'GET'),
                                       ('/examinations/stats', 'GET'), ('/examinations/1/status', 'PUT')])
def test_unavailable_database_returns_controlled_error(cookie_setup, monkeypatch, path, method):
    cookie_setup.app.register_blueprint(api.examination_management_bp)
    monkeypatch.setattr(api, 'get_db', MagicMock(side_effect=RuntimeError('isolated QA outage')))
    signed_in = login(cookie_setup)
    response = cookie_setup.client.open(path, method=method, headers={'Origin': 'http://localhost',
        'X-CSRF-Token': signed_in.json['csrf_token']}, json={'status': 'COMPLETED'})
    assert response.status_code == 500
    assert 'detail' in response.json


@pytest.mark.parametrize('user', [None, SimpleNamespace(id=7, role='admin', is_active=False)])
def test_scope_sql_fails_closed_for_absent_or_inactive_actor(user):
    from sqlalchemy.dialects import postgresql
    from sqlalchemy.orm import Session
    with Session() as database:
        statement = query.management_examination_query(database, user).statement
        sql = str(statement.compile(dialect=postgresql.dialect(), compile_kwargs={'literal_binds': True}))
        assert 'WHERE false' in sql
