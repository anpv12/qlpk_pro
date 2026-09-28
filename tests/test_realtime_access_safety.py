import json
import re
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from flask import Flask
from flask_socketio import SocketIO

from app.realtime import access, events, socket as realtime
from app.realtime import delivery


def user(user_id=1, role='staff', permissions=()):
    return SimpleNamespace(id=user_id, role=role, is_active=True,
        groups=[SimpleNamespace(group=SimpleNamespace(permissions=json.dumps(list(permissions))))])


@pytest.fixture
def transport(monkeypatch):
    application = Flask(__name__)
    application.secret_key = 'isolated-socket-qa'
    server = SocketIO(async_mode='threading', logger=False, engineio_logger=False)
    monkeypatch.setattr(realtime, 'socketio', server)
    realtime.init_realtime(application)
    users = {
        'staff': user(1, permissions=['qlkham-letan']),
        'doctor': user(2, 'doctor', ['qlkham-bs']),
        'admin': user(3, 'admin'),
    }
    def load(token, *, with_rooms=False):
        current = users.get(token)
        if not current or current.is_active is not True:
            return None
        return (current, access.allowed_subscription_rooms(current)) if with_rooms else current
    monkeypatch.setattr(realtime, '_load_socket_user', load)
    monkeypatch.setattr(realtime, 'mark_connected', MagicMock())
    monkeypatch.setattr(realtime, 'mark_disconnected', MagicMock())
    database = MagicMock()
    database.query.return_value.filter.return_value.first.return_value = SimpleNamespace(
        id=10, patient_id=20, doctor_id=2, psychologist_id=None, is_deleted=False)
    database.query.return_value.scalar.return_value = False
    monkeypatch.setattr(realtime, 'get_db', lambda: iter([database]))
    clients = []
    def connect(token):
        client = server.test_client(application, auth={'token': token})
        clients.append(client)
        if client.is_connected():
            client.get_received()
        return client
    yield SimpleNamespace(app=application, server=server, users=users, connect=connect, database=database)
    for client in clients:
        if client.is_connected():
            client.disconnect()


def subscribe(client, rooms):
    client.emit('qlpk:subscribe', {'rooms': rooms})
    messages = client.get_received()
    return next(message['args'][0]['rooms'] for message in messages if message['name'] == 'qlpk:subscribed')


def received_events(client):
    return [message['args'][0] for message in client.get_received() if message['name'] == 'qlpk:event']


def test_room_permissions_match_existing_navigation():
    source = (Path(__file__).resolve().parents[1] / 'app/static/js/app-shell/navigation.config.js').read_text()
    for path, permission in re.findall(r"href: '([^']+)'\s*,\s*permission: '([^']+)'", source):
        page = path.removesuffix('.html').lstrip('/')
        page = 'dashboard' if page == 'index' else page
        assert permission in access.PAGE_PERMISSIONS[page]


@pytest.mark.parametrize('permission,room', [
    ('qlkham-bs', 'page:doctor-examination'), ('ql-thuoc', 'page:medicine-management'),
    ('ql-kho-thuoc', 'page:medicine-reference-catalog'), ('ql-phanquyen', 'page:permission-management'),
    ('ql-tailieu', 'page:document-management'), ('ca-nhan', 'page:doctor-busy-schedule'),
    ('chi-tieu', 'workflow:finance'), ('ca-nhan-phimtat', 'workflow:personal'),
])
def test_room_permission_mapping(permission, room):
    assert room in access.allowed_subscription_rooms(user(permissions=[permission]))
    assert room not in access.allowed_subscription_rooms(user())


def test_staff_cannot_subscribe_other_roles_users_entities_or_admin(transport):
    client = transport.connect('staff')
    allowed = subscribe(client, ['page:receptionist-new', 'workflow:operations', 'workflow:admin',
        'page:permission-management', 'workflow:finance', 'entity:patient:2', 'user:2', 'role:admin', 'unknown'])
    assert allowed == ['page:receptionist-new', 'workflow:operations']
    realtime.emit_realtime_event('qa', {'secret': 'must-not-arrive'}, rooms=['user:2', 'role:admin', 'workflow:finance'])
    assert received_events(client) == []


def test_admin_can_join_known_pages_but_not_another_user_or_entity(transport):
    client = transport.connect('admin')
    assert subscribe(client, ['page:permission-management', 'workflow:finance', 'page:invented', 'user:2', 'entity:patient:2']) == [
        'page:permission-management', 'workflow:finance']


@pytest.mark.parametrize('payload', [None, [], 'bad', 42, {}, {'rooms': 'page:dashboard'}, {'rooms': [None]},
                                     {'rooms': [{}]}, {'rooms': ['page:dashboard'] * 129}])
def test_malformed_subscriptions_do_not_crash_or_join(transport, payload):
    client = transport.connect('staff')
    client.emit('qlpk:subscribe', payload)
    assert client.is_connected()
    assert [message['name'] for message in client.get_received()] == ['qlpk:subscription_error']


def test_subscription_replacement_leaves_old_workspace_rooms(transport):
    client = transport.connect('admin')
    subscribe(client, ['workflow:finance'])
    subscribe(client, ['page:dashboard'])
    realtime.emit_realtime_event('qa', rooms=['workflow:finance'])
    assert received_events(client) == []
    realtime.emit_realtime_event('qa', rooms=['page:dashboard'])
    assert len(received_events(client)) == 1


def test_permissions_are_reloaded_for_each_subscription(transport):
    client = transport.connect('staff')
    subscribe(client, ['page:receptionist-new'])
    transport.users['staff'].groups = []
    assert subscribe(client, ['page:receptionist-new']) == []
    realtime.emit_realtime_event('qa', rooms=['page:receptionist-new'])
    assert received_events(client) == []


@pytest.mark.parametrize('change', ['inactive', 'expired', 'role', 'identity'])
def test_invalidated_session_disconnects_before_subscribing(transport, change):
    client = transport.connect('staff')
    if change == 'inactive':
        transport.users['staff'].is_active = False
    elif change == 'expired':
        transport.users.pop('staff')
    elif change == 'role':
        transport.users['staff'].role = 'admin'
    else:
        transport.users['staff'].id = 99
    client.emit('qlpk:subscribe', {'rooms': ['page:dashboard']})
    assert not client.is_connected()


def test_private_notification_only_reaches_recipient_even_with_broadcast_rooms(transport):
    staff = transport.connect('staff')
    doctor = transport.connect('doctor')
    admin = transport.connect('admin')
    for client in (staff, doctor, admin):
        subscribe(client, ['workflow:operations'])
    events.emit_notification_changed('created', user_id=2, role='staff',
        extra={'notification': {'message': 'private clinical notification'}, 'unread_count': 7}, rooms=['global'])
    assert received_events(staff) == []
    assert received_events(admin) == []
    notifications = received_events(doctor)
    assert len(notifications) == 1
    assert notifications[0]['payload']['unread_count'] == 7


def test_role_notification_does_not_leak_to_admin_via_inherited_room(transport):
    staff = transport.connect('staff')
    admin = transport.connect('admin')
    events.emit_notification_changed('created', role='staff', extra={'notification': {'message': 'staff-only'}})
    assert len(received_events(staff)) == 1
    assert received_events(admin) == []


def test_unaddressed_notification_does_not_broadcast_patient_data(transport):
    client = transport.connect('staff')
    subscribe(client, ['workflow:operations'])
    events.emit_notification_changed('reminder_created', extra={'patient_id': 42, 'count': 1}, rooms=['global'])
    assert received_events(client) == []


@pytest.mark.parametrize('action,entity,entity_id,extra', [
    ('user_updated', 'user', 1, {}), ('user_deleted', 'user', 1, {}),
    ('user_groups_updated', 'user_group', None, {'user_id': 1}),
    ('user_group_added', 'user_group', 7, {'user_id': 1}),
    ('user_group_deleted', 'user_group', 7, {'user_id': 1}),
])
def test_account_changes_revoke_all_target_sockets_only(transport, action, entity, entity_id, extra):
    first = transport.connect('staff')
    second = transport.connect('staff')
    other = transport.connect('doctor')
    events.emit_catalog_changed(action, entity=entity, entity_id=entity_id, extra=extra)
    assert not first.is_connected()
    assert not second.is_connected()
    assert other.is_connected()


@pytest.mark.parametrize('action', ['group_updated', 'group_deleted'])
def test_group_changes_revoke_existing_room_snapshots(transport, action):
    staff = transport.connect('staff')
    doctor = transport.connect('doctor')
    events.emit_catalog_changed(action, entity='group', entity_id=7)
    assert not staff.is_connected()
    assert not doctor.is_connected()


def test_nonsecurity_catalog_change_does_not_disconnect(transport):
    client = transport.connect('staff')
    events.emit_catalog_changed('service_updated', entity='service', entity_id=7)
    assert client.is_connected()


@pytest.mark.parametrize('payload', [[], 'bad', 42, {'token': {}}, {'token': 42}, {'token': ['secret']}])
def test_invalid_auth_payload_rejected_without_exception(payload):
    with Flask(__name__).test_request_context('/socket.io'):
        assert realtime._extract_token(payload) == ''


def test_subscription_permissions_load_before_db_session_closes(monkeypatch):
    current = user(permissions=['qlkham-bs'])
    database = MagicMock()
    database.query.return_value.filter.return_value.first.return_value = current
    monkeypatch.setattr(realtime, 'get_db', lambda: iter([database]))
    monkeypatch.setattr(realtime, 'decode_access_token', lambda token: 'qa-user')
    monkeypatch.setattr(realtime, 'token_matches_user', lambda token, user: True)
    def permissions(actor):
        database.close.assert_not_called()
        return {'page:doctor-examination'}
    monkeypatch.setattr(realtime, 'allowed_subscription_rooms', permissions)
    assert realtime._load_socket_user('qa', with_rooms=True) == (current, {'page:doctor-examination'})
    database.close.assert_called_once()


def test_clinical_broadcast_projects_per_recipient_and_deduplicates_rooms(transport):
    assigned = transport.connect('doctor')
    transport.users['other'] = user(4, 'doctor', ['qlkham-bs'])
    other = transport.connect('other')
    staff = transport.connect('staff')
    for client in (assigned, other, staff):
        subscribe(client, ['workflow:operations', 'page:doctor-examination'])
    events.emit_appointment_changed('updated', appointment_id=10, extra={
        'patient_id': 20, 'full_name': 'private name', 'diagnosis': 'private diagnosis'})
    assigned_events = received_events(assigned)
    assert len(assigned_events) == 1
    assert assigned_events[0]['payload'] == {'action': 'updated', 'appointment_id': 10, 'patient_id': 20}
    assert received_events(other)[0]['payload'] == {'action': 'changed'}
    assert received_events(staff)[0]['payload']['appointment_id'] == 10


def test_previous_doctor_gets_anonymous_refresh_after_transfer(transport):
    client = transport.connect('doctor')
    subscribe(client, ['workflow:operations'])
    transport.database.query.return_value.filter.return_value.first.return_value.doctor_id = 9
    events.emit_appointment_changed('transferred', appointment_id=10, extra={'patient_id': 20, 'doctor_id': 9})
    assert received_events(client)[0]['payload'] == {'action': 'changed'}


def test_patient_family_update_only_keeps_data_for_authorized_recipient(transport):
    staff = transport.connect('staff')
    doctor = transport.connect('doctor')
    subscribe(doctor, ['workflow:operations'])
    events.emit_patient_changed('family_member_updated', patient_id=20,
        extra={'data': {'id': 5, 'full_name': 'private relative'}})
    assert received_events(staff)[0]['payload']['data']['id'] == 5
    assert received_events(doctor)[0]['payload'] == {'action': 'changed'}


def test_attachment_event_cannot_leak_through_inventory_room(transport):
    transport.users['inventory'] = user(4, 'doctor', ['ql-kho-thuoc'])
    client = transport.connect('inventory')
    subscribe(client, ['workflow:inventory'])
    events.emit_document_changed('attachment_uploaded', entity='attachment', entity_id=5,
        extra={'patient_id': 20, 'url': '/private/file'})
    assert received_events(client)[0]['payload'] == {'action': 'changed'}


def test_inventory_event_omits_prescription_patient_and_visit_details(transport):
    client = transport.connect('admin')
    subscribe(client, ['workflow:inventory'])
    events.emit_inventory_changed('prescription_saved', entity='prescription', extra={
        'patient_id': 20, 'appointment_id': 10, 'data': {'diagnosis': 'private'}})
    assert received_events(client)[0]['payload'] == {'action': 'prescription_saved', 'entity': 'prescription', 'entity_id': None}


@pytest.mark.parametrize('state', ['inactive', 'expired'])
def test_idle_socket_revalidated_before_next_event(transport, state):
    client = transport.connect('doctor')
    subscribe(client, ['workflow:operations'])
    if state == 'inactive':
        transport.users['doctor'].is_active = False
    else:
        transport.users.pop('doctor')
    events.emit_appointment_changed('updated', appointment_id=10)
    assert not client.is_connected()


def test_delivery_database_failure_never_falls_back_to_broadcast(transport):
    client = transport.connect('doctor')
    subscribe(client, ['workflow:operations'])
    transport.database.query.side_effect = RuntimeError('isolated failure')
    events.emit_appointment_changed('updated', appointment_id=10, extra={'full_name': 'must not leak'})
    assert received_events(client) == []
    transport.database.close.assert_called()


def test_room_permission_revoked_without_subscribe_cannot_receive_finance(transport):
    transport.users['finance'] = user(4, 'doctor', ['chi-tieu'])
    client = transport.connect('finance')
    subscribe(client, ['workflow:finance'])
    transport.users['finance'].groups = []
    events.emit_finance_changed('changed', entity='expense', entity_id=1)
    assert received_events(client) == []


@pytest.mark.parametrize('payload', [
    {'appointment_id': True}, {'appointment_id': '10'}, {'appointment_ids': []},
    {'appointment_ids': [10, False]}, {'appointment_ids': '10'}, {'patient_id': None}, {},
])
def test_ambiguous_scope_fails_closed(payload):
    database = MagicMock()
    database.query.return_value.filter.return_value.first.return_value = SimpleNamespace(
        doctor_id=2, psychologist_id=None, patient_id=20, is_deleted=False)
    assert delivery.can_receive_clinical_payload(database, user(2, 'doctor'), payload) is False


@pytest.mark.parametrize('role,doctor_id,psychologist_id,expected', [
    ('doctor', 2, None, True), ('doctor', 3, 2, False), ('psychologist', 3, 2, True),
    ('psychologist', 2, None, True), ('psychologist', 3, None, False),
])
def test_appointment_scope_uses_existing_clinical_policy(role, doctor_id, psychologist_id, expected):
    database = MagicMock()
    database.query.return_value.filter.return_value.first.return_value = SimpleNamespace(
        doctor_id=doctor_id, psychologist_id=psychologist_id, patient_id=20, is_deleted=False)
    assert delivery.can_receive_clinical_payload(database, user(2, role), {'appointment_id': 10, 'patient_id': 20}) is expected


@pytest.mark.parametrize('missing,deleted,mismatch', [(True, False, False), (False, True, False), (False, False, True)])
def test_deleted_missing_or_conflicting_appointment_is_not_disclosed(missing, deleted, mismatch):
    database = MagicMock()
    database.query.return_value.filter.return_value.first.return_value = None if missing else SimpleNamespace(
        doctor_id=2, psychologist_id=None, patient_id=20, is_deleted=deleted)
    assert not delivery.can_receive_clinical_payload(database, user(2, 'doctor'),
        {'appointment_id': 10, 'patient_id': 21 if mismatch else 20})


def test_batch_with_one_unowned_appointment_is_fully_redacted():
    database = MagicMock()
    database.query.return_value.filter.return_value.first.side_effect = [
        SimpleNamespace(doctor_id=2, psychologist_id=None, patient_id=20, is_deleted=False),
        SimpleNamespace(doctor_id=3, psychologist_id=None, patient_id=30, is_deleted=False)]
    assert not delivery.can_receive_clinical_payload(database, user(2, 'doctor'), {'appointment_ids': [10, 11]})


def test_examination_event_resolves_current_appointment_not_payload_doctor():
    database = MagicMock()
    database.query.return_value.filter.return_value.first.side_effect = [
        SimpleNamespace(appointment_id=10),
        SimpleNamespace(doctor_id=3, psychologist_id=None, patient_id=20, is_deleted=False)]
    assert not delivery.can_receive_clinical_payload(database, user(2, 'doctor'), {'examination_id': 4, 'doctor_id': 2})


def test_event_checks_authorization_once_per_token_for_multiple_tabs(transport, monkeypatch):
    first = transport.connect('doctor')
    second = transport.connect('doctor')
    subscribe(first, ['workflow:operations'])
    subscribe(second, ['workflow:operations'])
    original = realtime._prepare_delivery
    prepare = MagicMock(side_effect=original)
    monkeypatch.setattr(realtime, '_prepare_delivery', prepare)
    events.emit_appointment_changed('updated', appointment_id=10)
    prepare.assert_called_once()
    assert len(received_events(first)) == len(received_events(second)) == 1


def test_disconnect_removes_token_from_process_memory(transport):
    client = transport.connect('doctor')
    assert 'doctor' in realtime._client_tokens.values()
    client.disconnect()
    assert 'doctor' not in realtime._client_tokens.values()


def test_recipient_lookup_failure_does_not_turn_committed_save_into_error(transport, monkeypatch):
    monkeypatch.setattr(transport.server.server.manager, 'get_participants', MagicMock(side_effect=RuntimeError('QA')))
    events.emit_appointment_changed('updated', appointment_id=10)
    realtime.disconnect_user_clients(1)


def test_clinical_scope_grant_and_revocation_apply_without_resubscribe(transport):
    client = transport.connect('doctor')
    subscribe(client, ['workflow:operations'])
    transport.database.query.return_value.filter.return_value.first.return_value.doctor_id = 8
    transport.users['doctor'].can_view_all_patients = True
    events.emit_appointment_changed('updated', appointment_id=10)
    assert received_events(client)[0]['payload']['appointment_id'] == 10
    transport.users['doctor'].can_view_all_patients = False
    events.emit_appointment_changed('updated', appointment_id=10)
    assert received_events(client)[0]['payload'] == {'action': 'changed'}
