from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from threading import Event
from types import SimpleNamespace
from unittest.mock import MagicMock
import inspect

import pytest
from flask import Flask
from sqlalchemy import text

from app.api import appointment as api, auth as auth_api
from app.models.appointment import Appointment, AppointmentStatus
from app.models.examination import Examination, ExaminationStatus
from app.models.patient import Patient
from app.models.user import User
from app.models.service_category import ServiceCategory
from app.models.service import Service
from app.models.package import Package
from app.modules.appointments.services import transfer_service as service
from test_account_session_lifecycle import isolated_postgres, wait_for_database_lock
from module_parts import setattr_all


def payload(ids=None, role='doctor', recipient=9):
    return {'appointment_ids': ids or [1], 'to_role': role, 'to_person_id': recipient}


def actor(identity=8, role='doctor', **extra):
    return SimpleNamespace(id=identity, role=role, is_active=True, **extra)


@pytest.mark.parametrize('data', [None, [], 'bad', {},
    payload([True]), payload([1.9]), payload(['1.1']), payload(['-1']), payload([' 1']),
    payload([0]), payload([2147483648]), payload([1] * 101),
    payload(role=[]), payload(role='admin'), payload(recipient=True), payload(recipient=1.5),
    payload(recipient=0), payload(recipient='invalid')])
def test_invalid_payload_rejects_before_database(data):
    database = MagicMock()
    with pytest.raises(service.AppointmentTransferValidationError):
        service.transfer_appointments_between_roles(database, actor(), data)
    database.query.assert_not_called()


@pytest.fixture
def transfer_db(isolated_postgres, monkeypatch):
    factory, engine = isolated_postgres
    for model in [Patient, ServiceCategory, Service, Package, Appointment, Examination]:
        model.__table__.create(engine)
    with factory.begin() as database:
        for identity, role, active in [(8, 'doctor', True), (9, 'doctor', True), (10, 'PSYCHOLOGIST', True),
                                       (11, 'doctor', False), (12, 'admin', True), (13, 'staff', True)]:
            database.add(User(id=identity, username=f'qa-{identity}', full_name='QA', hashed_password='qa', role=role, is_active=active))
        database.add(Patient(id=1, patient_code='QA-P', full_name='QA patient'))
        database.flush()
        for identity, doctor in [(1, 8), (2, 9), (3, 8)]:
            database.add(Appointment(id=identity, appointment_code=f'QA-A{identity}', patient_id=1,
                doctor_id=doctor, appointment_date=datetime(2026, 9, 28), status=AppointmentStatus.CONFIRMED))
            database.flush()
            database.add(Examination(id=identity, examination_code=f'QA-E{identity}', patient_id=1,
                appointment_id=identity, doctor_id=doctor, examination_date=datetime(2026, 9, 28), status=ExaminationStatus.DOCTOR_EXAM))
    sync = MagicMock()
    monkeypatch.setattr(service, 'sync_transferred_appointment_calendar', sync)
    setattr_all(monkeypatch,api, 'schedule_calendar_transfer_drain', MagicMock())
    return SimpleNamespace(factory=factory, engine=engine, sync=sync)


def test_actor_target_and_batch_validation_leave_all_records_unchanged(transfer_db):
    state = transfer_db
    cases = [(actor(999), payload(), 403), (actor(11), payload(), 403),
        (actor(), payload(recipient=8), 400), (actor(), payload(recipient=999), 400),
        (actor(), payload(recipient=11), 400), (actor(), payload(recipient=10), 400),
        (actor(), payload(role='staff', recipient=9), 400),
        (actor(), payload([1, 2]), 403), (actor(can_view_all_patients=True), payload([2]), 403),
        (actor(8, 'admin'), payload([2]), 403), (actor(), payload([1, 999]), 404)]
    for user, data, status in cases:
        with state.factory() as database:
            with pytest.raises(service.AppointmentTransferValidationError) as failure:
                service.transfer_appointments_between_roles(database, user, data)
            assert failure.value.status_code == status
            assert not database.dirty
            assert database.get(Appointment, 1).doctor_id == 8
    state.sync.assert_not_called()


def test_lifecycle_and_ambiguous_examination_reject_entire_batch(transfer_db):
    state = transfer_db
    for field, value in [('deleted', True), ('status', AppointmentStatus.CANCELLED),
                         ('status', AppointmentStatus.SCHEDULED), ('active', False),
                         ('exam_status', ExaminationStatus.WAITING_PAYMENT),
                         ('exam_status', ExaminationStatus.PAID), ('exam_status', ExaminationStatus.COMPLETED),
                         ('duplicate', True)]:
        with state.factory() as database:
            appointment = database.get(Appointment, 3)
            examination = database.get(Examination, 3)
            if field == 'deleted':
                appointment.is_deleted = value
            elif field == 'status':
                appointment.status = value
            elif field == 'active':
                examination.is_active = value
            elif field == 'exam_status':
                examination.status = value
            else:
                database.add(Examination(id=4, examination_code='QA-E4', patient_id=1, appointment_id=3,
                    doctor_id=8, examination_date=datetime(2026, 9, 28), status=ExaminationStatus.DOCTOR_EXAM))
            database.flush()
            with pytest.raises(service.AppointmentTransferValidationError):
                service.transfer_appointments_between_roles(database, actor(), payload([1, 3]))
            assert database.get(Appointment, 1).doctor_id == 8
            assert not database.dirty
    state.sync.assert_not_called()


def test_success_deduplication_noop_and_role_status_mapping(transfer_db):
    state = transfer_db
    with state.factory.begin() as database:
        result = service.transfer_appointments_between_roles(database, actor(), payload([3, '1', 1]))
        assert result.updated_count == 2 and result.appointment_ids == [1, 3]
        assert database.get(Appointment, 1).doctor_id == 9
        assert database.get(Examination, 1).doctor_id == 9
    assert state.sync.call_count == 2
    with state.factory.begin() as database:
        result = service.transfer_appointments_between_roles(database, actor(7, 'staff'), payload([1, 3]))
        assert result.updated_count == 0
    assert state.sync.call_count == 2
    with state.factory.begin() as database:
        result = service.transfer_appointments_between_roles(database, actor(9), payload(role='PSYCHOLOGIST', recipient=10))
        assert result.updated_count == 1
        assert database.get(Appointment, 1).psychologist_id == 10
        assert database.get(Examination, 1).status == ExaminationStatus.PSYCHOLOGIST_EXAM
    with state.factory.begin() as database:
        service.transfer_appointments_between_roles(database, actor(10, 'PSYCHOLOGIST'), payload(recipient=8))
        assert database.get(Examination, 1).status == ExaminationStatus.CONCLUSION
    with state.factory.begin() as database:
        with pytest.raises(service.AppointmentTransferValidationError) as failure:
            service.transfer_appointments_between_roles(database, actor(10, 'PSYCHOLOGIST'), payload(recipient=9))
        assert failure.value.status_code == 403
    with state.factory.begin() as database:
        service.transfer_appointments_between_roles(database, actor(), payload(role='staff', recipient=13))
        assert database.get(Examination, 1).status == ExaminationStatus.WAITING_TRANSFER
        assert database.get(Appointment, 1).doctor_id == 8


def test_concurrent_transfer_rechecks_ownership_after_real_row_lock(transfer_db):
    state = transfer_db
    ready = Event()
    process_ids = []
    def second_transfer():
        with state.factory() as database:
            process_ids.append(database.execute(text('SELECT pg_backend_pid()')).scalar())
            ready.set()
            try:
                service.transfer_appointments_between_roles(database, actor(), payload(role='PSYCHOLOGIST', recipient=10))
                database.commit()
                return 200
            except service.AppointmentTransferValidationError as error:
                database.rollback()
                return error.status_code
    with state.factory() as first, ThreadPoolExecutor(max_workers=1) as pool:
        try:
            service.transfer_appointments_between_roles(first, actor(), payload())
            future = pool.submit(second_transfer)
            assert ready.wait(5)
            wait_for_database_lock(state.engine, process_ids[0])
            assert not future.done()
            first.commit()
            assert future.result(timeout=5) == 403
        finally:
            first.rollback()
    with state.factory() as database:
        assert database.get(Appointment, 1).doctor_id == 9
        assert database.get(Examination, 1).status == ExaminationStatus.DOCTOR_EXAM


def test_disabled_recipient_rechecked_after_user_lock(transfer_db):
    state = transfer_db
    ready = Event()
    process_ids = []
    def transfer():
        with state.factory() as database:
            process_ids.append(database.execute(text('SELECT pg_backend_pid()')).scalar())
            ready.set()
            with pytest.raises(service.AppointmentTransferValidationError) as failure:
                service.transfer_appointments_between_roles(database, actor(), payload())
            return failure.value.status_code
    with state.factory() as first, ThreadPoolExecutor(max_workers=1) as pool:
        try:
            recipient = first.query(User).filter(User.id == 9).with_for_update().one()
            recipient.is_active = False
            first.flush()
            future = pool.submit(transfer)
            assert ready.wait(5)
            wait_for_database_lock(state.engine, process_ids[0])
            first.commit()
            assert future.result(timeout=5) == 400
        finally:
            first.rollback()
    state.sync.assert_not_called()


def test_endpoint_rolls_back_rejected_batch_and_only_notifies_committed_ids(transfer_db, monkeypatch):
    state = transfer_db
    application = Flask(__name__)
    setattr_all(monkeypatch,api, 'get_db', lambda: iter([state.factory()]))
    emitted = MagicMock()
    notified = MagicMock()
    setattr_all(monkeypatch,api, 'emit_appointment_changed', emitted)
    monkeypatch.setattr(api.notification_service, 'create_transfer_notifications', notified)
    endpoint = inspect.unwrap(api.transfer_appointments)
    for data, status in [(payload([1, 2]), 403), (payload([1, 999]), 404), (None, 400)]:
        with application.test_request_context('/api/appointments/transfer', method='POST', json=data):
            response = endpoint(actor())
            assert response[1] == status
    emitted.assert_not_called()
    notified.assert_not_called()
    with state.factory() as database:
        assert database.get(Appointment, 1).doctor_id == 8
    with application.test_request_context('/api/appointments/transfer', method='POST', json=payload([1, 3])):
        response = endpoint(actor())
        assert response[1] == 200 and response[0].json['updated_count'] == 2
    emitted.assert_called_once()
    assert emitted.call_args.kwargs['extra']['appointment_ids'] == [1, 3]
    assert notified.call_args.args[1] == [1, 3]
    emitted.reset_mock()
    notified.reset_mock()
    with application.test_request_context('/api/appointments/transfer', method='POST', json=payload([1, 3])):
        response = endpoint(actor(7, 'staff'))
        assert response[1] == 200 and response[0].json['updated_count'] == 0
    emitted.assert_not_called()
    notified.assert_not_called()


def test_examination_status_rechecked_after_real_row_lock(transfer_db):
    state = transfer_db
    ready = Event()
    process_ids = []
    def transfer():
        with state.factory() as database:
            process_ids.append(database.execute(text('SELECT pg_backend_pid()')).scalar())
            ready.set()
            with pytest.raises(service.AppointmentTransferValidationError) as failure:
                service.transfer_appointments_between_roles(database, actor(), payload())
            return failure.value.status_code
    with state.factory() as first, ThreadPoolExecutor(max_workers=1) as pool:
        try:
            examination = first.query(Examination).filter(Examination.id == 1).with_for_update().one()
            examination.status = ExaminationStatus.PAID
            first.flush()
            future = pool.submit(transfer)
            assert ready.wait(5)
            wait_for_database_lock(state.engine, process_ids[0])
            first.commit()
            assert future.result(timeout=5) == 409
        finally:
            first.rollback()
    with state.factory() as database:
        assert database.get(Appointment, 1).doctor_id == 8
        assert database.get(Examination, 1).status == ExaminationStatus.PAID
    state.sync.assert_not_called()


def test_unexpected_mid_batch_failure_rolls_back_database_and_never_notifies(transfer_db, monkeypatch):
    state = transfer_db
    application = Flask(__name__)
    setattr_all(monkeypatch,api, 'get_db', lambda: iter([state.factory()]))
    emitted = MagicMock()
    notified = MagicMock()
    setattr_all(monkeypatch,api, 'emit_appointment_changed', emitted)
    monkeypatch.setattr(api.notification_service, 'create_transfer_notifications', notified)
    state.sync.side_effect = [True, RuntimeError('isolated failure')]
    with application.test_request_context('/api/appointments/transfer', method='POST', json=payload([1, 3])):
        assert inspect.unwrap(api.transfer_appointments)(actor())[1] == 500
    with state.factory() as database:
        assert database.get(Appointment, 1).doctor_id == 8
        assert database.get(Appointment, 3).doctor_id == 8
        assert database.get(Examination, 1).doctor_id == 8
        assert database.get(Examination, 3).doctor_id == 8
    emitted.assert_not_called()
    notified.assert_not_called()


def test_authenticated_route_enforces_batch_scope_and_ignores_spoofed_actor_role(transfer_db, monkeypatch):
    state = transfer_db
    application = Flask(__name__)
    application.register_blueprint(api.router, url_prefix='/api/appointments')
    setattr_all(monkeypatch,api, 'get_db', lambda: iter([state.factory()]))
    monkeypatch.setattr(auth_api, 'get_db', lambda: iter([state.factory()]))
    monkeypatch.setattr(auth_api, 'get_current_user', lambda token: actor(8, 'admin'))
    emitted = MagicMock()
    notified = MagicMock()
    setattr_all(monkeypatch,api, 'emit_appointment_changed', emitted)
    monkeypatch.setattr(api.notification_service, 'create_transfer_notifications', notified)
    client = application.test_client()
    headers = {'Authorization': 'Bearer isolated-transfer-qa'}
    assert client.post('/api/appointments/transfer', json=payload()).status_code == 401
    assert client.post('/api/appointments/transfer', json=payload([1, 2]), headers=headers).status_code == 403
    assert client.post('/api/appointments/transfer', data='{', content_type='application/json', headers=headers).status_code == 400
    emitted.assert_not_called()
    notified.assert_not_called()
    result = client.post('/api/appointments/transfer', json=payload(), headers=headers)
    assert result.status_code == 200 and result.json['updated_count'] == 1
    emitted.assert_called_once()
    with state.factory() as database:
        assert database.get(Appointment, 1).doctor_id == 9
        assert database.get(Appointment, 2).doctor_id == 9


def test_transfer_recipients_are_available_to_clinicians_without_account_admin_data(transfer_db, monkeypatch):
    from app.api import user as user_api
    state = transfer_db
    application = Flask(__name__)
    application.register_blueprint(user_api.user_router)
    monkeypatch.setattr(user_api, 'get_db', lambda: iter([state.factory()]))
    endpoint = inspect.unwrap(user_api.get_transfer_recipients)
    with application.test_request_context('/users/transfer-recipients?role=doctor'):
        response = endpoint(actor(8))
        assert [row['id'] for row in response.json] == [9]
        assert set(response.json[0]) == {'id', 'full_name', 'role'}
    with application.test_request_context('/users/transfer-recipients?role=psychologist'):
        assert [row['id'] for row in endpoint(actor(8)).json] == [10]
    with application.test_request_context('/users/transfer-recipients?role=staff'):
        assert [row['id'] for row in endpoint(actor(8)).json] == [7, 13]
    with application.test_request_context('/users/transfer-recipients?role=admin'):
        assert endpoint(actor(8))[1] == 400
    for inactive_or_missing in (11, 999):
        with application.test_request_context('/users/transfer-recipients?role=doctor'):
            assert endpoint(actor(inactive_or_missing))[1] == 403
