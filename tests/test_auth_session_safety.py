from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from flask import Flask
import jwt

from app.api import auth as auth_api
from app.services import auth as auth_service
from app.realtime import socket as realtime
from app.core import login_throttle
from app.services import access_sessions
from uuid import uuid4


@pytest.fixture(autouse=True)
def isolated_login_throttle(monkeypatch):
    store = access_sessions.MemorySessionStore()
    monkeypatch.setattr(access_sessions, 'session_store', lambda: store)
    monkeypatch.setattr(login_throttle, '_memory_store', login_throttle.MemoryLoginThrottle())
    monkeypatch.setattr(login_throttle.settings, 'LOGIN_REDIS_URL', None)
    monkeypatch.setattr(login_throttle.settings, 'REALTIME_REDIS_URL', None)


@pytest.fixture
def token_settings(monkeypatch):
    monkeypatch.setattr(auth_service.settings, 'DEBUG', True)
    monkeypatch.setattr(auth_service.settings, 'SECRET_KEY', 'qa-isolated-secret-not-for-production')
    monkeypatch.setattr(auth_service.settings, 'ALGORITHM', 'HS256')
    monkeypatch.setattr(auth_service.settings, 'ACCESS_TOKEN_EXPIRE_MINUTES', 0)
    monkeypatch.setattr(auth_api, 'SECRET_KEY', auth_service.settings.SECRET_KEY)
    return auth_service.settings


def signed_token(settings, **claims):
    binding = auth_service.credential_binding(SimpleNamespace(id=1, username='qa-user', hashed_password='qa-hash'))
    identity = uuid4().hex
    generation = access_sessions.account_session_generation(1)
    token = jwt.encode({'sub': 'qa-user', 'credential_version': binding, 'jti': identity,
        'session_user_id': 1, 'session_generation': generation, **claims}, settings.SECRET_KEY, algorithm='HS256')
    access_sessions.register_session(token, identity, datetime.now(timezone.utc).timestamp() + 3600,
                                     user_id=1, generation=generation)
    return token


@pytest.mark.parametrize('active', [False, None])
def test_inactive_user_cannot_authenticate(monkeypatch, active):
    database = MagicMock()
    database.query.return_value.filter.return_value.with_for_update.return_value = database.query.return_value.filter.return_value
    database.query.return_value.filter.return_value.first.return_value = SimpleNamespace(
        username='qa-user', is_active=active, hashed_password='hash')
    verify = MagicMock(return_value=True)
    monkeypatch.setattr(auth_service, 'verify_password', verify)
    assert auth_service.authenticate_user(database, 'qa-user', 'password') is None


@pytest.mark.parametrize('owner', [auth_api, realtime])
@pytest.mark.parametrize('active', [False, None, True])
def test_http_and_socket_user_load_rechecks_account_state(monkeypatch, token_settings, owner, active):
    database = MagicMock()
    user = SimpleNamespace(id=1, username='qa-user', is_active=active, hashed_password='qa-hash')
    database.query.return_value.filter.return_value.first.return_value = user
    monkeypatch.setattr(owner, 'get_db', lambda: iter([database]))
    loader = auth_api.get_current_user if owner is auth_api else realtime._load_socket_user
    result = loader(signed_token(token_settings))
    assert result is (user if active else None)
    database.close.assert_called_once()


def test_expired_token_is_rejected_even_when_new_tokens_have_no_expiry(token_settings):
    token = signed_token(token_settings, exp=datetime.now(timezone.utc) - timedelta(minutes=1))
    assert auth_service.decode_access_token(token) is None


@pytest.mark.parametrize('subject', ['', None, 42, [], {}])
def test_token_subject_must_be_nonempty_username(token_settings, subject):
    assert auth_service.decode_access_token(signed_token(token_settings, sub=subject)) is None


def test_legacy_no_expiry_token_still_accepted_and_signature_checked(token_settings):
    token = signed_token(token_settings)
    assert auth_service.decode_access_token(token) == 'qa-user'
    forged = jwt.encode({'sub': 'qa-user'}, 'wrong-secret', algorithm='HS256')
    assert auth_service.decode_access_token(forged) is None


@pytest.mark.parametrize('decorator', [auth_api.require_auth, auth_api.require_admin])
def test_inactive_account_cannot_enter_protected_route(monkeypatch, decorator):
    monkeypatch.setattr(auth_api, 'get_current_user', lambda token: SimpleNamespace(id=1, role='admin', is_active=False))
    application = Flask(__name__)
    handler = MagicMock(return_value='allowed')
    application.add_url_rule('/protected', 'protected', decorator(handler))
    response = application.test_client().get('/protected', headers={'Authorization': 'Bearer token'})
    assert response.status_code == 401
    handler.assert_not_called()


@pytest.mark.parametrize('payload', [None, [], 'bad', 42, {'username': [], 'password': 'value'}, {'username': 'qa', 'password': 42}])
def test_invalid_login_body_returns_400_without_authentication(monkeypatch, payload):
    database = MagicMock()
    monkeypatch.setattr(auth_api, 'get_db', lambda: iter([database]))
    authenticate = MagicMock(return_value=None)
    monkeypatch.setattr(auth_api, 'authenticate_user', authenticate)
    application = Flask(__name__)
    application.register_blueprint(auth_api.router)
    response = application.test_client().post('/auth/login', json=payload)
    assert response.status_code == 400
    authenticate.assert_not_called()


def test_login_rejects_inactive_account_before_issuing_token(monkeypatch):
    database = MagicMock()
    monkeypatch.setattr(auth_api, 'get_db', lambda: iter([database]))
    monkeypatch.setattr(auth_api, 'authenticate_user', lambda *args: SimpleNamespace(is_active=False, username='qa-user'))
    issuer = MagicMock()
    monkeypatch.setattr(auth_api, 'create_access_token', issuer)
    application = Flask(__name__)
    application.register_blueprint(auth_api.router)
    response = application.test_client().post('/auth/login', json={'username': 'qa-user', 'password': 'password'})
    assert response.status_code == 401
    issuer.assert_not_called()
    database.commit.assert_not_called()


def test_failed_activity_update_always_closes_session(monkeypatch):
    database = MagicMock()
    database.commit.side_effect = RuntimeError('simulated db failure')
    monkeypatch.setattr(auth_api, 'get_db', lambda: iter([database]))
    monkeypatch.setattr(auth_api, 'get_current_user', lambda token: SimpleNamespace(id=1, is_active=True))
    application = Flask(__name__)
    application.add_url_rule('/protected', 'protected', auth_api.require_auth(lambda user: 'ok'))
    response = application.test_client().get('/protected', headers={'Authorization': 'Bearer token'})
    assert response.status_code == 200
    database.close.assert_called_once()
    database.rollback.assert_called_once()


@pytest.mark.parametrize('owner', [auth_api, realtime])
def test_expired_token_never_reaches_database(monkeypatch, token_settings, owner):
    database_provider = MagicMock()
    monkeypatch.setattr(owner, 'get_db', database_provider)
    loader = auth_api.get_current_user if owner is auth_api else realtime._load_socket_user
    token = signed_token(token_settings, exp=datetime.now(timezone.utc) - timedelta(minutes=1))
    assert loader(token) is None
    database_provider.assert_not_called()


@pytest.mark.parametrize('decorator', [auth_api.require_auth, auth_api.require_admin])
@pytest.mark.parametrize('header', [None, '', 'Basic token', 'Bearer ', 'Bearer malformed'])
def test_missing_or_invalid_token_never_enters_handler(monkeypatch, decorator, header):
    monkeypatch.setattr(auth_api, 'get_current_user', lambda token: None)
    application = Flask(__name__)
    handler = MagicMock(return_value='allowed')
    application.add_url_rule('/protected', 'protected', decorator(handler))
    response = application.test_client().get('/protected', headers={} if header is None else {'Authorization': header})
    assert response.status_code == 401
    handler.assert_not_called()


@pytest.mark.parametrize('role,status', [('admin', 200), ('staff', 403)])
def test_admin_guard_retains_role_boundary(monkeypatch, role, status):
    monkeypatch.setattr(auth_api, 'get_current_user', lambda token: SimpleNamespace(id=1, role=role, is_active=True))
    application = Flask(__name__)
    application.add_url_rule('/protected', 'protected', auth_api.require_admin(lambda user: 'ok'))
    response = application.test_client().get('/protected', headers={'Authorization': 'Bearer token'})
    assert response.status_code == status


def test_active_password_authentication_still_works(monkeypatch):
    database = MagicMock()
    database.query.return_value.filter.return_value.with_for_update.return_value = database.query.return_value.filter.return_value
    user = SimpleNamespace(username='qa-user', is_active=True, hashed_password='hash')
    database.query.return_value.filter.return_value.first.return_value = user
    monkeypatch.setattr(auth_service, 'verify_password', lambda password, hashed: password == 'correct')
    assert auth_service.authenticate_user(database, 'qa-user', 'correct') is user
    assert auth_service.authenticate_user(database, 'qa-user', 'wrong') is None


def test_active_login_keeps_bearer_response_contract(monkeypatch, token_settings):
    database = MagicMock()
    user = SimpleNamespace(id=1, username='qa-user', is_active=True, role='admin', full_name='QA', email=None, hashed_password='qa-hash')
    monkeypatch.setattr(auth_api, 'get_db', lambda: iter([database]))
    monkeypatch.setattr(auth_api, 'authenticate_user', lambda *args: user)
    application = Flask(__name__)
    application.register_blueprint(auth_api.router)
    response = application.test_client().post('/auth/login', json={'username': 'qa-user', 'password': 'password'})
    assert response.status_code == 200
    data = response.get_json()
    assert data['token_type'] == 'bearer'
    assert auth_service.decode_access_token(data['access_token']) == 'qa-user'
    from app.services.session_identity import ALL_PERMISSIONS
    assert data['user']['permissions'] == ALL_PERMISSIONS
    database.close.assert_called_once()


@pytest.mark.parametrize('active', [False, True])
def test_socket_connect_account_gate_without_presence_side_effect_for_rejected_user(monkeypatch, token_settings, active):
    database = MagicMock()
    database.query.return_value.filter.return_value.first.return_value = SimpleNamespace(
        id=1, username='qa-user', is_active=active, role='staff', hashed_password='qa-hash')
    monkeypatch.setattr(realtime, 'get_db', lambda: iter([database]))
    presence = MagicMock()
    join = MagicMock()
    monkeypatch.setattr(realtime, 'mark_connected', presence)
    monkeypatch.setattr(realtime, 'join_room', join)
    monkeypatch.setattr(realtime, 'emit', MagicMock())
    monkeypatch.setattr(realtime, 'emit_realtime_event', MagicMock())
    application = Flask(__name__)
    application.secret_key = 'qa-session'
    with application.test_request_context('/socket.io'):
        result = realtime.handle_connect({'token': signed_token(token_settings)})
    if active:
        assert result is None
        presence.assert_called_once_with(1)
        assert [call.args[0] for call in join.call_args_list] == ['global', 'user:1', 'role:staff']
    else:
        assert result is False
        presence.assert_not_called()
        join.assert_not_called()
