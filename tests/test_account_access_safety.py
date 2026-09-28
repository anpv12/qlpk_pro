import json
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from flask import Flask

from app.api import auth, group, user, user_group
from app.models.user import UserRole
from app.utils import account_access as policy
from app.services import access_sessions


def actor(role='staff', permissions=(), **fields):
    values = dict(id=1, role=role, is_active=True, can_view_all_patients=False,
                  groups=[SimpleNamespace(group=SimpleNamespace(permissions=json.dumps(list(permissions))))])
    values.update(fields)
    return SimpleNamespace(**values)


@pytest.fixture
def application(monkeypatch):
    store = access_sessions.MemorySessionStore()
    monkeypatch.setattr(access_sessions, 'session_store', lambda: store)
    app = Flask(__name__)
    app.config['TESTING'] = True
    for blueprint in (user.user_router, group.router, user_group.router):
        app.register_blueprint(blueprint)
    activity = MagicMock()
    monkeypatch.setattr(auth, 'get_db', lambda: iter([activity]))
    monkeypatch.setattr(auth, 'get_current_user', lambda token: actor())
    return app


def set_actor(monkeypatch, current):
    database = MagicMock()
    database.query.return_value.filter.return_value.first.return_value = current
    monkeypatch.setattr(policy, 'get_db', lambda: iter([database]))
    return database


def set_database(monkeypatch, module, values=()):
    database = MagicMock()
    database.query.return_value.filter.return_value.first.side_effect = list(values)
    database.query.return_value.filter.return_value.with_for_update.return_value = database.query.return_value.filter.return_value
    monkeypatch.setattr(module, 'get_db', lambda: iter([database]))
    monkeypatch.setattr(module, 'emit_catalog_changed', MagicMock())
    return database


MANAGEMENT_ROUTES = [
    ('GET', '/users/'), ('POST', '/users/'),
    ('GET', '/users/2'), ('PUT', '/users/2'), ('DELETE', '/users/2'),
    ('POST', '/users/2/avatar'), ('POST', '/users/2/license-certificate'),
    ('GET', '/groups/'), ('POST', '/groups/'),
    ('GET', '/groups/2'), ('PUT', '/groups/2'), ('DELETE', '/groups/2'),
    ('GET', '/user-groups/2'), ('POST', '/user-groups/'),
    ('DELETE', '/user-groups/2'), ('POST', '/user-groups/2'),
]


@pytest.mark.parametrize('method,path', MANAGEMENT_ROUTES)
@pytest.mark.parametrize('current', [actor(), actor('doctor'), actor('admin', is_active=False), None])
def test_management_routes_fail_closed_before_domain_io(application, monkeypatch, method, path, current):
    set_actor(monkeypatch, current)
    domains = []
    for module in (user, group, user_group):
        domain = MagicMock(side_effect=AssertionError('unauthorized domain access'))
        monkeypatch.setattr(module, 'get_db', domain)
        domains.append(domain)
    response = application.test_client().open(path, method=method, json={}, headers={'Authorization': 'Bearer qa'})
    assert response.status_code == 403
    for domain in domains:
        domain.assert_not_called()


@pytest.mark.parametrize('raw', ['broken', '{}', '"ql-taikhoan"', 'null', '[42]', None])
def test_malformed_permissions_do_not_grant_access(application, monkeypatch, raw):
    current = actor()
    current.groups[0].group.permissions = raw
    set_actor(monkeypatch, current)
    response = application.test_client().get('/users/', headers={'Authorization': 'Bearer qa'})
    assert response.status_code == 403


@pytest.mark.parametrize('role,permissions', [('admin', []), (UserRole.ADMIN, []), ('staff', ['ql-taikhoan']), ('staff', ['ql-phanquyen'])])
def test_authorized_account_read_uses_current_db_permissions(application, monkeypatch, role, permissions):
    access_db = set_actor(monkeypatch, actor(role, permissions))
    database = set_database(monkeypatch, user)
    database.query.return_value.filter.return_value.all.return_value = []
    response = application.test_client().get('/users/', headers={'Authorization': 'Bearer qa'})
    assert response.status_code == 200
    assert response.json == []
    access_db.close.assert_called_once()
    database.close.assert_called_once()


@pytest.mark.parametrize('path', ['/users/doctors', '/users/psychologists', '/users/me/password'])
def test_clinical_pickers_and_own_password_do_not_require_management(application, monkeypatch, path):
    guard = MagicMock(side_effect=AssertionError('management guard invoked'))
    monkeypatch.setattr(policy, 'get_db', guard)
    database = set_database(monkeypatch, user)
    database.query.return_value.filter.return_value.all.return_value = []
    client = application.test_client()
    if path.endswith('password'):
        response = client.put(path, json={}, headers={'Authorization': 'Bearer qa'})
        assert response.status_code == 400
    else:
        response = client.get(path, headers={'Authorization': 'Bearer qa'})
        assert response.status_code == 200
    guard.assert_not_called()


@pytest.mark.parametrize('payload', [dict(role='admin'), dict(role='staff'), dict(is_active=False),
                                     dict(can_view_all_patients=True), dict(password='new-password')])
def test_account_manager_cannot_change_security_fields(application, monkeypatch, payload):
    set_actor(monkeypatch, actor(permissions=['ql-taikhoan']))
    target = actor('doctor', id=2)
    database = set_database(monkeypatch, user, [target])
    response = application.test_client().put('/users/2', json=payload, headers={'Authorization': 'Bearer qa'})
    assert response.status_code == 403
    database.commit.assert_not_called()
    assert target.role == 'doctor'
    assert target.is_active is True
    assert target.can_view_all_patients is False


@pytest.mark.parametrize('method,path', [('POST', '/users/'), ('DELETE', '/users/2')])
def test_account_creation_and_deactivation_require_admin(application, monkeypatch, method, path):
    set_actor(monkeypatch, actor(permissions=['ql-taikhoan']))
    database = set_database(monkeypatch, user, [actor(id=2)])
    response = application.test_client().open(path, method=method, json={}, headers={'Authorization': 'Bearer qa'})
    assert response.status_code == 403
    database.commit.assert_not_called()
    database.add.assert_not_called()


@pytest.mark.parametrize('path', ['/users/2', '/users/2/avatar', '/users/2/license-certificate'])
@pytest.mark.parametrize('target', [actor('admin', id=2), actor(permissions=['ql-phanquyen'], id=2)])
def test_manager_cannot_mutate_stronger_account_or_write_its_files(application, monkeypatch, path, target):
    set_actor(monkeypatch, actor(permissions=['ql-taikhoan']))
    database = set_database(monkeypatch, user, [target])
    storage = MagicMock(side_effect=AssertionError('file write before authorization'))
    monkeypatch.setattr(user, 'upload_dir', storage)
    response = application.test_client().open(path, method='PUT' if path == '/users/2' else 'POST',
                                              json={}, headers={'Authorization': 'Bearer qa'})
    assert response.status_code == 403
    storage.assert_not_called()
    database.commit.assert_not_called()


def test_avatar_missing_user_fails_before_file_processing(application, monkeypatch):
    set_actor(monkeypatch, actor('admin'))
    set_database(monkeypatch, user, [None])
    response = application.test_client().post('/users/2/avatar', headers={'Authorization': 'Bearer qa'})
    assert response.status_code == 404


@pytest.mark.parametrize('method,path', [('POST', '/groups/'), ('PUT', '/groups/2')])
def test_group_manager_cannot_grant_permissions_they_do_not_hold(application, monkeypatch, method, path):
    set_actor(monkeypatch, actor(permissions=['ql-nhomquyen']))
    target = SimpleNamespace(permissions='[]')
    database = set_database(monkeypatch, group, [target])
    response = application.test_client().open(path, method=method, json={'permissions': ['ql-phanquyen']},
                                              headers={'Authorization': 'Bearer qa'})
    assert response.status_code == 403
    database.commit.assert_not_called()
    database.add.assert_not_called()
    assert target.permissions == '[]'


@pytest.mark.parametrize('method', ['PUT', 'DELETE'])
def test_group_manager_cannot_modify_stronger_group(application, monkeypatch, method):
    set_actor(monkeypatch, actor(permissions=['ql-nhomquyen']))
    database = set_database(monkeypatch, group, [SimpleNamespace(permissions='["ql-phanquyen"]')])
    response = application.test_client().open('/groups/2', method=method, json={'permissions': []},
                                              headers={'Authorization': 'Bearer qa'})
    assert response.status_code == 403
    database.delete.assert_not_called()
    database.commit.assert_not_called()
    database.query.return_value.filter.return_value.delete.assert_not_called()


@pytest.mark.parametrize('body,status', [({}, 400), ({'group_ids': '2'}, 400),
    ({'group_ids': [True]}, 400), ({'group_ids': [0]}, 400), ({'group_ids': [1.5]}, 400),
    ({'group_ids': ['x']}, 400), ({'group_ids': [2]}, 404)])
def test_invalid_assignment_never_deletes_old_memberships(application, monkeypatch, body, status):
    set_actor(monkeypatch, actor('admin'))
    database = set_database(monkeypatch, user_group, [actor(id=2), None])
    response = application.test_client().post('/user-groups/2', json=body, headers={'Authorization': 'Bearer qa'})
    assert response.status_code == status
    database.query.return_value.filter_by.return_value.delete.assert_not_called()
    database.commit.assert_not_called()


@pytest.mark.parametrize('body', [{'group_ids': [2, 2]}, {'group_ids': ['2', 2]}, {'group_ids': []}])
def test_assignment_validates_then_replaces_once(application, monkeypatch, body):
    set_actor(monkeypatch, actor(permissions=['ql-phanquyen', 'ql-taikhoan']))
    database = set_database(monkeypatch, user_group, [actor(id=2), SimpleNamespace(permissions='["ql-taikhoan"]')])
    response = application.test_client().post('/user-groups/2', json=body, headers={'Authorization': 'Bearer qa'})
    assert response.status_code == 200
    database.query.return_value.filter_by.return_value.delete.assert_called_once()
    assert database.add.call_count == (1 if body['group_ids'] else 0)
    database.commit.assert_called_once()


@pytest.mark.parametrize('target,selected', [(actor('admin', id=2), '[]'),
    (actor(permissions=['ql-taikhoan'], id=2), '[]'), (actor(id=2), '["ql-taikhoan"]')])
def test_assignment_manager_cannot_escalate_or_modify_stronger_accounts(application, monkeypatch, target, selected):
    set_actor(monkeypatch, actor(permissions=['ql-phanquyen']))
    database = set_database(monkeypatch, user_group, [target, SimpleNamespace(permissions=selected)])
    response = application.test_client().post('/user-groups/2', json={'group_ids': [2]}, headers={'Authorization': 'Bearer qa'})
    assert response.status_code == 403
    database.query.return_value.filter_by.return_value.delete.assert_not_called()
    database.commit.assert_not_called()


def test_debug_patient_route_applies_clinical_scope_before_read(application, monkeypatch):
    database = set_database(monkeypatch, user)
    monkeypatch.setattr(user, 'patient_access_error', lambda *args: 'Denied')
    response = application.test_client().get('/users/patients/2', headers={'Authorization': 'Bearer qa'})
    assert response.status_code == 403
    database.query.assert_not_called()


def test_permission_session_closes_when_handler_fails(application, monkeypatch):
    database = set_actor(monkeypatch, actor('admin'))
    failing = policy.require_account_permission('ql-taikhoan')(MagicMock(side_effect=ValueError('QA')))
    with application.test_request_context('/'), pytest.raises(ValueError, match='QA'):
        failing(actor())
    database.close.assert_called_once()


@pytest.mark.parametrize('current', [actor('admin'), actor(permissions=['ql-taikhoan'])])
def test_manager_can_update_nonsecurity_profile_fields(application, monkeypatch, current):
    set_actor(monkeypatch, current)
    target = actor(id=2, full_name='Old')
    database = set_database(monkeypatch, user, [target])
    monkeypatch.setattr(user, 'UserRead', SimpleNamespace(model_validate=lambda item: SimpleNamespace(model_dump=lambda: {'full_name': item.full_name})))
    response = application.test_client().put('/users/2', json={'full_name': 'New', 'role': 'staff', 'is_active': True,
        'can_view_all_patients': False}, headers={'Authorization': 'Bearer qa'})
    assert response.status_code == 200
    assert response.json == {'full_name': 'New'}
    database.commit.assert_called_once()


def test_admin_can_create_account(application, monkeypatch):
    set_actor(monkeypatch, actor('admin'))
    database = set_database(monkeypatch, user)
    monkeypatch.setattr(user, 'get_password_hash', lambda password: 'qa-hash')
    monkeypatch.setattr(user, 'UserRead', SimpleNamespace(model_validate=lambda item: SimpleNamespace(model_dump=lambda: {'role': item.role})))
    response = application.test_client().post('/users/', json={'username': 'qa', 'full_name': 'QA', 'password': 'qa-secret',
        'role': 'staff'}, headers={'Authorization': 'Bearer qa'})
    assert response.status_code == 201
    assert response.json == {'role': 'staff'}
    database.add.assert_called_once()
    database.commit.assert_called_once()


def test_admin_can_deactivate_account(application, monkeypatch):
    set_actor(monkeypatch, actor('admin'))
    target = actor(id=2)
    database = set_database(monkeypatch, user, [target])
    response = application.test_client().delete('/users/2', headers={'Authorization': 'Bearer qa'})
    assert response.status_code == 200
    assert target.is_active is False
    database.commit.assert_called_once()


@pytest.mark.parametrize('current', [actor('admin'), actor(permissions=['ql-nhomquyen'])])
@pytest.mark.parametrize('method,path', [('POST', '/groups/'), ('PUT', '/groups/2'), ('DELETE', '/groups/2')])
def test_group_management_positive_paths(application, monkeypatch, current, method, path):
    set_actor(monkeypatch, current)
    target = SimpleNamespace(id=2, code='qa', name='QA', desc='', permissions='["ql-nhomquyen"]')
    database = set_database(monkeypatch, group, [None if method == 'POST' else target])
    response = application.test_client().open(path, method=method,
        json={'code': 'qa', 'name': 'QA', 'permissions': ['ql-nhomquyen']}, headers={'Authorization': 'Bearer qa'})
    assert response.status_code == 200
    database.commit.assert_called_once()


def test_group_metadata_update_preserves_permissions(application, monkeypatch):
    set_actor(monkeypatch, actor(permissions=['ql-nhomquyen']))
    target = SimpleNamespace(id=2, code='qa', name='QA', desc='', permissions='["ql-nhomquyen"]')
    database = set_database(monkeypatch, group, [target])
    response = application.test_client().put('/groups/2', json={'name': 'Updated'}, headers={'Authorization': 'Bearer qa'})
    assert response.status_code == 200
    assert response.json['permissions'] == ['ql-nhomquyen']
    assert target.name == 'Updated'
    database.commit.assert_called_once()


@pytest.mark.parametrize('stronger', [True, False])
def test_add_membership_checks_delegation_before_insert(application, monkeypatch, stronger):
    set_actor(monkeypatch, actor(permissions=['ql-phanquyen']))
    selected = SimpleNamespace(permissions='["ql-taikhoan"]' if stronger else '[]')
    database = set_database(monkeypatch, user_group, [actor(id=2), selected])
    database.query.return_value.filter_by.return_value.first.return_value = None
    response = application.test_client().post('/user-groups/', json={'user_id': 2, 'group_id': 3},
                                              headers={'Authorization': 'Bearer qa'})
    assert response.status_code == (403 if stronger else 200)
    assert database.add.call_count == (0 if stronger else 1)
    assert database.commit.call_count == (0 if stronger else 1)


@pytest.mark.parametrize('stronger', [True, False])
def test_delete_membership_checks_target_before_delete(application, monkeypatch, stronger):
    set_actor(monkeypatch, actor(permissions=['ql-phanquyen']))
    target = actor('admin' if stronger else 'staff', id=2)
    database = set_database(monkeypatch, user_group, [SimpleNamespace(user_id=2, group_id=3), target, SimpleNamespace(permissions='[]')])
    response = application.test_client().delete('/user-groups/7', headers={'Authorization': 'Bearer qa'})
    assert response.status_code == (403 if stronger else 200)
    assert database.delete.call_count == (0 if stronger else 1)
    assert database.commit.call_count == (0 if stronger else 1)


def test_assignment_commit_failure_rolls_back(application, monkeypatch):
    set_actor(monkeypatch, actor('admin'))
    database = set_database(monkeypatch, user_group, [actor(id=2)])
    database.commit.side_effect = RuntimeError('qa failure')
    response = application.test_client().post('/user-groups/2', json={'group_ids': []}, headers={'Authorization': 'Bearer qa'})
    assert response.status_code == 500
    database.rollback.assert_called_once()
    database.close.assert_called_once()
    user_group.emit_catalog_changed.assert_not_called()
