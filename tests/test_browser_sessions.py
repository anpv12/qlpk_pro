from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from flask import Flask, jsonify
from flask_socketio import SocketIO

from app.api import auth as api, user as user_api
from app.core import login_throttle
from app.realtime import socket
from app.services import auth, access_sessions, browser_sessions as browser


@pytest.fixture
def setup(monkeypatch):
    for key, value in {'DEBUG': True, 'SECRET_KEY': 'cookie-test-secret-only', 'ALGORITHM': 'HS256',
                       'ACCESS_TOKEN_EXPIRE_MINUTES': 60}.items():
        monkeypatch.setattr(auth.settings, key, value)
    store = access_sessions.MemorySessionStore()
    monkeypatch.setattr(access_sessions, 'session_store', lambda: store)
    account = SimpleNamespace(id=7, username='qa', hashed_password='hash', is_active=True,
                              role='admin', full_name='QA', email=None, groups=[], avatar=None, phone='0123')
    database = MagicMock()
    query = database.query.return_value.filter.return_value
    query.first.return_value = account
    query.with_for_update.return_value = query
    monkeypatch.setattr(api, 'get_db', lambda: iter([database]))
    monkeypatch.setattr(user_api, 'get_db', lambda: iter([database]))
    monkeypatch.setattr(api, 'authenticate_user', lambda *args: account)
    monkeypatch.setattr(login_throttle, 'reserve_login_attempt', lambda *args: 0)
    monkeypatch.setattr(user_api, 'verify_password', lambda *args: True)
    monkeypatch.setattr(user_api, 'get_password_hash', lambda *args: 'new-hash')
    application = Flask(__name__)
    application.register_blueprint(api.router)
    application.register_blueprint(api.check_router)
    application.register_blueprint(user_api.user_router)
    handler = MagicMock(side_effect=lambda user: jsonify(ok=True))
    application.add_url_rule('/write', 'write', api.require_auth(handler), methods=['POST'])
    application.add_url_rule('/admin', 'admin', api.require_admin(handler), methods=['POST'])
    return SimpleNamespace(app=application, client=application.test_client(), account=account, database=database,
                           store=store, handler=handler)


def login(setup):
    return setup.client.post('/auth/login', json={'username': 'qa', 'password': 'password'},
                             headers={'X-QLPK-Session': 'cookie', 'Origin': 'http://localhost'})


def test_cookie_login_hides_token_and_sets_httponly_host_only_cookie(setup):
    response = login(setup)
    assert response.status_code == 200
    assert 'access_token' not in response.json
    assert response.json['token_type'] == 'cookie'
    assert len(response.json['csrf_token']) == 64
    header = response.headers['Set-Cookie']
    assert 'HttpOnly' in header and 'SameSite=Lax' in header and 'Path=/' in header
    assert 'Domain=' not in header
    assert response.headers['Cache-Control'] == 'no-store'


@pytest.mark.parametrize('origin', [None, 'null', 'http://evil.test', 'https://localhost', 'http://localhost:81'])
def test_cookie_login_rejects_wrong_origin_before_authentication(setup, monkeypatch, origin):
    authenticate = MagicMock()
    monkeypatch.setattr(api, 'authenticate_user', authenticate)
    headers = {'X-QLPK-Session': 'cookie'}
    if origin is not None:
        headers['Origin'] = origin
    assert setup.client.post('/auth/login', json={'username': 'qa', 'password': 'x'}, headers=headers).status_code == 403
    authenticate.assert_not_called()


@pytest.mark.parametrize('path', ['/write', '/admin'])
@pytest.mark.parametrize('csrf_kind', ['absent', 'wrong', 'unicode', 'other-session', 'valid'])
def test_cookie_write_requires_session_bound_csrf(setup, path, csrf_kind):
    response = login(setup)
    csrf = response.json['csrf_token']
    values = {'wrong': 'bad', 'unicode': 'é', 'other-session': browser.browser_csrf_token('other'), 'valid': csrf}
    headers = {'Origin': 'http://localhost'}
    if csrf_kind != 'absent':
        headers['X-CSRF-Token'] = values[csrf_kind]
    result = setup.client.post(path, headers=headers)
    assert result.status_code == (200 if csrf_kind == 'valid' else 403)
    if csrf_kind != 'valid':
        setup.handler.assert_not_called()


def test_header_cannot_override_cookie_to_bypass_csrf(setup):
    login(setup)
    bearer = auth.create_access_token({'sub': 'qa'}, user=setup.account)
    result = setup.client.post('/write', headers={'Origin': 'http://localhost', 'Authorization': 'Bearer ' + bearer})
    assert result.status_code == 403
    setup.handler.assert_not_called()


@pytest.mark.parametrize('path,method', [('/auth/session', 'GET'), ('/write', 'POST')])
def test_cross_tab_cookie_switch_rejects_old_session_identity(setup, path, method):
    old = login(setup).json
    current = login(setup).json
    headers = {'Origin': 'http://localhost', 'X-CSRF-Token': current['csrf_token'], 'X-QLPK-Session-Id': old['session_id']}
    assert setup.client.open(path, method=method, headers=headers).status_code == 403
    setup.handler.assert_not_called()
    headers['X-QLPK-Session-Id'] = current['session_id']
    assert setup.client.open(path, method=method, headers=headers).status_code == 200


def test_cookie_token_cannot_be_replayed_as_bearer_or_socket_token(setup):
    login(setup)
    token = setup.client.get_cookie(browser.session_cookie_name()).value
    client = setup.app.test_client()
    assert client.post('/write', headers={'Authorization': 'Bearer ' + token}).status_code == 403
    with setup.app.test_request_context('/socket.io', headers={'Origin': 'http://localhost'}):
        assert socket._extract_token({'token': token}) == ''


def test_session_info_bootstraps_csrf_only_same_origin_without_token(setup):
    response = login(setup)
    assert setup.client.get('/auth/session', headers={'Origin': 'http://evil.test'}).status_code == 403
    result = setup.client.get('/auth/session', headers={'Sec-Fetch-Site': 'same-origin'})
    assert result.status_code == 200
    assert result.json['csrf_token'] == response.json['csrf_token']
    assert 'access_token' not in result.json
    assert result.headers['Cache-Control'] == 'no-store'


def test_logout_revokes_registry_before_clearing_cookie(setup):
    response = login(setup)
    token = setup.client.get_cookie(browser.session_cookie_name()).value
    result = setup.client.post('/auth/logout', headers={'Origin': 'http://localhost', 'X-CSRF-Token': response.json['csrf_token']})
    assert result.status_code == 200
    assert setup.client.get_cookie(browser.session_cookie_name()) is None
    assert not auth.token_matches_user(token, setup.account)


def test_logout_outage_keeps_cookie_and_does_not_claim_success(setup):
    response = login(setup)
    setup.store.revoke = MagicMock(side_effect=RuntimeError('QA'))
    result = setup.client.post('/auth/logout', headers={'Origin': 'http://localhost', 'X-CSRF-Token': response.json['csrf_token']})
    assert result.status_code == 503
    assert 'Set-Cookie' not in result.headers
    assert setup.client.get_cookie(browser.session_cookie_name())


def test_password_change_rotates_cookie_and_csrf_without_exposing_jwt(setup):
    response = login(setup)
    token = setup.client.get_cookie(browser.session_cookie_name()).value
    headers = {'Origin': 'http://localhost', 'X-CSRF-Token': response.json['csrf_token']}
    result = setup.client.put('/users/me/password', json={'current_password': 'old-pass', 'new_password': 'new-pass'}, headers=headers)
    assert result.status_code == 200
    assert 'access_token' not in result.json
    assert result.json['csrf_token'] != response.json['csrf_token']
    assert not auth.token_matches_user(token, setup.account)
    assert setup.client.post('/write', headers=headers).status_code == 403
    headers['X-CSRF-Token'] = result.json['csrf_token']
    assert setup.client.post('/write', headers=headers).status_code == 200


@pytest.mark.parametrize('origin,valid_csrf,allowed', [('http://localhost', True, True), ('http://evil.test', True, False),
                                                       ('http://localhost', False, False), (None, True, False)])
def test_socket_cookie_requires_origin_and_csrf(setup, origin, valid_csrf, allowed):
    response = login(setup)
    token = setup.client.get_cookie(browser.session_cookie_name()).value
    headers = {'Cookie': f'{browser.session_cookie_name()}={token}'}
    if origin:
        headers['Origin'] = origin
    with setup.app.test_request_context('/socket.io', headers=headers):
        result = socket._extract_token({'csrf_token': response.json['csrf_token'] if valid_csrf else ''})
    assert bool(result) is allowed


def test_production_cookie_is_secure_host_prefix_and_http_login_rejected(setup, monkeypatch):
    monkeypatch.setattr(auth.settings, 'DEBUG', False)
    assert login(setup).status_code == 403
    monkeypatch.setattr(auth.settings, 'SECRET_KEY', 'isolated-production-cookie-secret-at-least-32-bytes')
    monkeypatch.setattr(auth.settings, 'SESSION_REDIS_URL', 'redis://unused.invalid')
    response = setup.client.post('/auth/login', base_url='https://localhost',
        headers={'Origin': 'https://localhost', 'X-QLPK-Session': 'cookie'}, json={'username': 'qa', 'password': 'x'})
    assert response.status_code == 200
    header = response.headers['Set-Cookie']
    assert header.startswith('__Host-qlpk_session=')
    assert 'Secure' in header and 'HttpOnly' in header and 'Domain=' not in header


def test_existing_cookie_cannot_downgrade_login_to_bearer(setup):
    login(setup)
    result = setup.client.post('/auth/login', json={'username': 'qa', 'password': 'x'})
    assert result.status_code == 403


def test_cookie_registry_outage_returns503_before_handler(setup):
    response = login(setup)
    setup.store.active = MagicMock(side_effect=RuntimeError('QA outage'))
    result = setup.client.post('/write', headers={'Origin': 'http://localhost', 'X-CSRF-Token': response.json['csrf_token']})
    assert result.status_code == 503
    setup.handler.assert_not_called()


def test_real_socket_transport_uses_cookie_and_logout_disconnects_it(setup, monkeypatch):
    setup.app.secret_key = 'qa-socket-session'
    server = SocketIO(async_mode='threading')
    monkeypatch.setattr(socket, 'socketio', server)
    monkeypatch.setattr(socket, 'get_db', lambda: iter([setup.database]))
    monkeypatch.setattr(socket, 'mark_connected', MagicMock())
    monkeypatch.setattr(socket, 'mark_disconnected', MagicMock())
    socket.init_realtime(setup.app)
    response = login(setup)
    client = server.test_client(setup.app, flask_test_client=setup.client,
        headers={'Origin': 'http://localhost'}, auth={'csrf_token': response.json['csrf_token']})
    try:
        assert client.is_connected()
        client.emit('qlpk:subscribe', {'rooms': ['page:dashboard']})
        assert any(event['name'] == 'qlpk:subscribed' for event in client.get_received())
        result = setup.client.post('/auth/logout', headers={'Origin': 'http://localhost', 'X-CSRF-Token': response.json['csrf_token']})
        assert result.status_code == 200
        assert not client.is_connected()
    finally:
        if client.is_connected():
            client.disconnect()


@pytest.mark.parametrize('raw,expected', [('["qlkham-bs","lichhen","qlkham-bs"]', ['lichhen', 'qlkham-bs']),
                                        ('["qlkham-bs",7]', []), ('broken', []), ('{}', [])])
def test_login_bootstrap_check_and_rotation_share_fresh_permission_payload(setup, raw, expected):
    setup.account.role = 'doctor'
    group = SimpleNamespace(permissions=raw)
    setup.account.groups = [SimpleNamespace(group=group)]
    signed_in = login(setup)
    assert signed_in.status_code == 200
    assert signed_in.json['user']['permissions'] == expected
    for path in ['/auth/session', '/check/me', '/users/me']:
        result = setup.client.get(path, headers={'Origin': 'http://localhost'})
        assert result.status_code == 200
        assert result.headers['Cache-Control'] == 'no-store'
        user = result.json['user'] if path == '/auth/session' else result.json
        assert user['permissions'] == expected
        assert user['full_name'] == 'QA'
    group.permissions = '["lichhen"]'
    updated = setup.client.get('/auth/session', headers={'Origin': 'http://localhost'})
    assert updated.json['user']['permissions'] == ['lichhen']
    rotated = setup.client.put('/users/me/password', headers={'Origin': 'http://localhost',
        'X-CSRF-Token': updated.json['csrf_token']}, json={'current_password': 'old-pass', 'new_password': 'new-pass'})
    assert rotated.status_code == 200
    assert rotated.json['user']['permissions'] == ['lichhen']


def test_profile_preserves_extra_fields_and_uses_fresh_identity(setup, monkeypatch):
    login(setup)
    monkeypatch.setattr(api, 'get_current_user', lambda token: SimpleNamespace(id=7, role='admin', is_active=True))
    setup.account.role = 'doctor'
    setup.account.groups = [SimpleNamespace(group=SimpleNamespace(permissions='["lichhen"]'))]
    setup.account.license_number = 'QA-LICENSE'
    response = setup.client.get('/users/me', headers={'Origin': 'http://localhost'})
    assert response.status_code == 200
    assert response.json['role'] == 'doctor'
    assert response.json['permissions'] == ['lichhen']
    assert response.json['phone'] == '0123'
    assert response.json['avatar'] is None
    assert response.json['is_active'] is True
    assert response.json['license_number'] == 'QA-LICENSE'


@pytest.mark.parametrize('current', [None, SimpleNamespace(id=7, is_active=False)])
def test_profile_rejects_missing_or_inactive_fresh_account(setup, monkeypatch, current):
    login(setup)
    monkeypatch.setattr(api, 'get_current_user', lambda token: SimpleNamespace(id=7, is_active=True))
    setup.database.query.return_value.filter.return_value.first.return_value = current
    response = setup.client.get('/users/me', headers={'Origin': 'http://localhost'})
    assert response.status_code == 401
