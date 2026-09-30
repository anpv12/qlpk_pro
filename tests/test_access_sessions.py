from types import SimpleNamespace
from unittest.mock import MagicMock
from time import time

import pytest
from flask import Flask
from flask_socketio import SocketIO

from app.api import auth as auth_api
from app.services import auth, access_sessions as sessions
from app.realtime import socket as realtime
from test_login_throttle_redis import isolated_redis


@pytest.fixture
def account(monkeypatch):
    for key, value in {'DEBUG': True, 'SECRET_KEY': 'isolated-session-test-secret',
        'ALGORITHM': 'HS256', 'ACCESS_TOKEN_EXPIRE_MINUTES': 60}.items():
        monkeypatch.setattr(auth.settings, key, value)
    store = sessions.MemorySessionStore()
    monkeypatch.setattr(sessions, 'session_store', lambda: store)
    return SimpleNamespace(id=1, username='qa', hashed_password='qa-hash', is_active=True, role='staff', groups=[])


def issue(account):
    return auth.create_access_token({'sub': account.username}, user=account)


def test_tokens_unique_and_logout_revokes_only_one_session(account):
    first, second = issue(account), issue(account)
    assert first != second
    sessions.revoke_session(auth.decode_access_claims(first))
    assert not auth.token_matches_user(first, account)
    assert auth.token_matches_user(second, account)


def test_store_reset_logs_out_instead_of_resurrecting_token(account):
    token = issue(account)
    sessions.session_store().entries.clear()
    assert not auth.token_matches_user(token, account)


def test_memory_store_expiry_and_capacity_do_not_evict_live_sessions():
    clock = [10]
    store = sessions.MemorySessionStore(max_entries=1, clock=lambda: clock[0])
    store.register('first', 'digest', 20)
    with pytest.raises(RuntimeError):
        store.register('second', 'digest', 30)
    assert store.active('first', 'digest')
    clock[0] = 21
    assert not store.active('first', 'digest')
    store.register('second', 'digest', 30)


def test_signed_token_with_changed_jti_not_registered_is_rejected(account):
    import jwt
    claims = auth.decode_access_claims(issue(account))
    claims['jti'] = 'a' * 32
    token = jwt.encode(claims, auth.settings.SECRET_KEY, algorithm='HS256')
    assert not auth.token_matches_user(token, account)


@pytest.mark.parametrize('jti', [None, '', 'x' * 32, 1, [], {}, 'a' * 33])
def test_invalid_session_id_fails_closed(jti):
    assert sessions.session_key(jti) is None


def test_logout_http_replay_is_401_and_socket_revoked(account, monkeypatch):
    application = Flask(__name__)
    application.secret_key = 'qa-session'
    application.register_blueprint(auth_api.router)
    application.add_url_rule('/protected', 'protected', auth_api.require_auth(lambda user: 'ok'))
    database = MagicMock()
    database.query.return_value.filter.return_value.first.return_value = account
    for owner in (auth_api, realtime):
        monkeypatch.setattr(owner, 'get_db', lambda: iter([database]))
    server = SocketIO(async_mode='threading')
    monkeypatch.setattr(realtime, 'socketio', server)
    realtime.init_realtime(application)
    first, second = issue(account), issue(account)
    first_socket = server.test_client(application, auth={'token': first})
    second_socket = server.test_client(application, auth={'token': second})
    try:
        client = application.test_client()
        headers = {'Authorization': f'Bearer {first}'}
        assert client.post('/auth/logout', headers=headers).status_code == 200
        assert not first_socket.is_connected()
        assert second_socket.is_connected()
        assert client.get('/protected', headers=headers).status_code == 401
        assert client.post('/auth/logout', headers=headers).status_code == 401
        assert client.get('/protected', headers={'Authorization': f'Bearer {second}'}).status_code == 200
    finally:
        for socket in (first_socket, second_socket):
            if socket.is_connected():
                socket.disconnect()


@pytest.mark.parametrize('guard', [auth_api.require_auth, auth_api.require_admin])
def test_validation_store_outage_is_503_not_success_or_401(account, monkeypatch, guard):
    token = issue(account)
    database = MagicMock()
    database.query.return_value.filter.return_value.first.return_value = account
    monkeypatch.setattr(auth_api, 'get_db', lambda: iter([database]))
    sessions.session_store().active = MagicMock(side_effect=RuntimeError('QA outage'))
    application = Flask(__name__)
    handler = MagicMock(return_value='not allowed')
    application.add_url_rule('/protected', 'protected', guard(handler))
    response = application.test_client().get('/protected', headers={'Authorization': f'Bearer {token}'})
    assert response.status_code == 503
    handler.assert_not_called()


def test_revoke_store_failure_never_claims_logout_success(account, monkeypatch):
    token = issue(account)
    database = MagicMock()
    database.query.return_value.filter.return_value.first.return_value = account
    monkeypatch.setattr(auth_api, 'get_db', lambda: iter([database]))
    sessions.session_store().revoke = MagicMock(side_effect=RuntimeError('QA outage'))
    application = Flask(__name__)
    application.register_blueprint(auth_api.router)
    response = application.test_client().post('/auth/logout', headers={'Authorization': f'Bearer {token}'})
    assert response.status_code == 503
    assert auth.token_matches_user(token, account)


def test_real_redis_sessions_ttl_revocation_and_loss(isolated_redis):
    store = sessions.RedisSessionStore(isolated_redis.url)
    try:
        store.register('qa:first', 'digest-one', time() + 60)
        store.register('qa:second', 'digest-two', time() + 60)
        assert 0 < isolated_redis.client.ttl('qa:first') <= 60
        assert store.active('qa:first', 'digest-one')
        assert not store.active('qa:first', 'wrong')
        store.revoke('qa:first')
        assert not store.active('qa:first', 'digest-one')
        assert store.active('qa:second', 'digest-two')
        isolated_redis.client.flushdb()
        assert not store.active('qa:second', 'digest-two')
    finally:
        store.client.close()


def test_production_never_uses_memory_sessions(monkeypatch):
    monkeypatch.setattr(sessions.settings, 'DEBUG', False)
    monkeypatch.setattr(sessions.settings, 'SESSION_REDIS_URL', None)
    monkeypatch.setattr(sessions.settings, 'REALTIME_REDIS_URL', None)
    with pytest.raises(RuntimeError, match='shared Redis'):
        sessions.session_store()


def test_production_config_requires_shared_session_store():
    from app.core.security_config import production_security_errors
    config = SimpleNamespace(SECRET_KEY='isolated-qa-secret-at-least-32-bytes',
        ACCESS_TOKEN_EXPIRE_MINUTES=480, ALGORITHM='HS256', SESSION_REDIS_URL=None, REALTIME_REDIS_URL=None)
    assert any('SESSION_REDIS_URL' in message for message in production_security_errors(config))


def test_socket_connect_store_outage_rejected_without_presence(account, monkeypatch):
    application = Flask(__name__)
    monkeypatch.setattr(realtime, '_load_socket_user', MagicMock(side_effect=sessions.SessionStoreUnavailable()))
    presence = MagicMock()
    monkeypatch.setattr(realtime, 'mark_connected', presence)
    with application.test_request_context('/socket.io'):
        assert realtime.handle_connect({'token': issue(account)}) is False
    presence.assert_not_called()
