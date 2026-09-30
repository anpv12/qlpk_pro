from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from flask import Flask
from flask_socketio import SocketIO
import jwt

from app.api import auth as auth_api, user as user_api
from app.realtime import socket as realtime
from app.services import auth
from app.services import access_sessions


@pytest.fixture
def account(monkeypatch):
    store = access_sessions.MemorySessionStore()
    monkeypatch.setattr(access_sessions, 'session_store', lambda: store)
    monkeypatch.setattr(auth.settings, 'DEBUG', True)
    monkeypatch.setattr(auth.settings, 'SECRET_KEY', 'isolated-revocation-qa-key')
    monkeypatch.setattr(auth.settings, 'ALGORITHM', 'HS256')
    monkeypatch.setattr(auth.settings, 'ACCESS_TOKEN_EXPIRE_MINUTES', 60)
    return SimpleNamespace(id=7, username='qa-user', is_active=True, hashed_password='old-hash', role='staff')


def issue(account):
    return auth.create_access_token({'sub': account.username}, user=account)


def test_token_contains_opaque_binding_not_password_hash(account):
    token = issue(account)
    claims = jwt.decode(token, auth.settings.SECRET_KEY, algorithms=['HS256'])
    assert len(claims['credential_version']) == 64
    assert 'old-hash' not in str(claims)
    assert auth.token_matches_user(token, account)
    assert claims['exp'] > datetime.now(timezone.utc).timestamp()


@pytest.mark.parametrize('changed', ['password', 'identity', 'username', 'inactive'])
@pytest.mark.parametrize('owner', [auth_api, realtime])
def test_http_and_socket_reject_token_after_account_change(account, monkeypatch, changed, owner):
    token = issue(account)
    database = MagicMock()
    database.query.return_value.filter.return_value.first.return_value = account
    database.query.return_value.filter.return_value.with_for_update.return_value.first.return_value = account
    monkeypatch.setattr(owner, 'get_db', lambda: iter([database]))
    loader = auth_api.get_current_user if owner is auth_api else realtime._load_socket_user
    assert loader(token) is account
    if changed == 'password':
        account.hashed_password = 'new-hash'
    elif changed == 'identity':
        account.id = 8
    elif changed == 'username':
        account.username = 'another-user'
    else:
        account.is_active = False
    assert loader(token) is None
    assert database.close.call_count == 2


@pytest.mark.parametrize('binding', [None, '', [], {}, 42, 'a' * 64, 'é' * 64])
def test_missing_or_invalid_binding_is_rejected(account, binding):
    claims = {'sub': account.username}
    if binding is not None:
        claims['credential_version'] = binding
    token = jwt.encode(claims, auth.settings.SECRET_KEY, algorithm='HS256')
    assert not auth.token_matches_user(token, account)


def test_password_rotation_invalidates_all_issued_tokens_without_database_migration(account):
    first, second = issue(account), issue(account)
    account.hashed_password = 'new-hash'
    replacement = issue(account)
    assert not auth.token_matches_user(first, account)
    assert not auth.token_matches_user(second, account)
    assert auth.token_matches_user(replacement, account)


def test_explicit_expiry_still_checked_with_binding(account):
    token = auth.create_access_token({'sub': account.username}, user=account, expires_delta=timedelta(seconds=-1))
    assert not auth.token_matches_user(token, account)


def test_nonexpiring_configuration_does_not_disable_password_revocation(account, monkeypatch):
    monkeypatch.setattr(auth.settings, 'ACCESS_TOKEN_EXPIRE_MINUTES', 0)
    token = issue(account)
    account.hashed_password = 'changed-hash'
    assert not auth.token_matches_user(token, account)


def test_changed_profile_or_last_login_does_not_invalidate_token(account):
    token = issue(account)
    account.full_name = 'Updated profile'
    account.last_login = datetime.now(timezone.utc)
    assert auth.token_matches_user(token, account)


def test_issuer_rejects_wrong_subject_or_missing_credential(account):
    with pytest.raises(ValueError):
        auth.create_access_token({'sub': 'another'}, user=account)
    account.hashed_password = None
    with pytest.raises(ValueError):
        issue(account)


@pytest.fixture
def password_app(account, monkeypatch):
    application = Flask(__name__)
    application.config['TESTING'] = True
    application.register_blueprint(user_api.user_router)
    database = MagicMock()
    database.query.return_value.filter.return_value.first.return_value = account
    database.query.return_value.filter.return_value.with_for_update.return_value.first.return_value = account
    monkeypatch.setattr(user_api, 'get_db', lambda: iter([database]))
    monkeypatch.setattr(auth_api, 'get_db', lambda: iter([database]))
    monkeypatch.setattr(user_api, 'verify_password', lambda plain, hashed: plain == 'current-password')
    monkeypatch.setattr(user_api, 'get_password_hash', lambda plain: 'new-hash')
    revoke = MagicMock()
    monkeypatch.setattr(user_api, 'disconnect_user_clients', revoke)
    return application, database, revoke


def test_password_endpoint_returns_replacement_and_old_token_gets_401(account, password_app):
    application, database, revoke = password_app
    old_token = issue(account)
    client = application.test_client()
    response = client.put('/users/me/password', headers={'Authorization': f'Bearer {old_token}'},
        json={'current_password': 'current-password', 'new_password': 'next-password'})
    assert response.status_code == 200
    assert response.json['token_type'] == 'bearer'
    assert auth.token_matches_user(response.json['access_token'], account)
    assert not auth.token_matches_user(old_token, account)
    revoke.assert_called_once_with(account.id)
    database.query.return_value.filter.return_value.with_for_update.assert_called_once()
    database.commit.assert_called()
    response = client.put('/users/me/password', headers={'Authorization': f'Bearer {old_token}'},
        json={'current_password': 'current-password', 'new_password': 'third-password'})
    assert response.status_code == 401


@pytest.mark.parametrize('body', [None, [], 'bad', 42, {'current_password': [], 'new_password': 'valid-pass'},
    {'current_password': 'current-password', 'new_password': 123456},
    {'current_password': 'current-password', 'new_password': ['valid-pass']}])
def test_malformed_password_input_never_changes_credential(account, password_app, body):
    application, database, revoke = password_app
    response = application.test_client().put('/users/me/password', headers={'Authorization': f'Bearer {issue(account)}'}, json=body)
    assert response.status_code == 400
    assert account.hashed_password == 'old-hash'
    revoke.assert_not_called()


def test_wrong_current_password_keeps_old_token_valid(account, password_app):
    application, database, revoke = password_app
    token = issue(account)
    response = application.test_client().put('/users/me/password', headers={'Authorization': f'Bearer {token}'},
        json={'current_password': 'wrong', 'new_password': 'next-password'})
    assert response.status_code == 400
    assert auth.token_matches_user(token, account)
    revoke.assert_not_called()


def test_password_change_rechecks_session_after_acquiring_account_lock(account, password_app):
    application, database, revoke = password_app
    token = issue(account)
    def after_lock():
        access_sessions.revoke_account_sessions(account.id)
        return account
    database.query.return_value.filter.return_value.with_for_update.return_value.first.side_effect = after_lock
    response = application.test_client().put('/users/me/password', headers={'Authorization': f'Bearer {token}'},
        json={'current_password': 'current-password', 'new_password': 'next-password'})
    assert response.status_code == 401
    assert account.hashed_password == 'old-hash'
    revoke.assert_not_called()


def test_commit_failure_returns_no_replacement_and_does_not_disconnect(account, password_app):
    application, database, revoke = password_app
    database.commit.side_effect = [None, RuntimeError('QA commit failure')]
    response = application.test_client().put('/users/me/password', headers={'Authorization': f'Bearer {issue(account)}'},
        json={'current_password': 'current-password', 'new_password': 'next-password'})
    assert response.status_code == 500
    assert 'access_token' not in response.json
    database.rollback.assert_called_once()
    revoke.assert_not_called()


def test_connected_socket_rejects_old_credential_before_next_event(account, monkeypatch):
    application = Flask(__name__)
    application.secret_key = 'isolated-session'
    server = SocketIO(async_mode='threading')
    monkeypatch.setattr(realtime, 'socketio', server)
    database = MagicMock()
    account.groups = []
    database.query.return_value.filter.return_value.first.return_value = account
    monkeypatch.setattr(realtime, 'get_db', lambda: iter([database]))
    realtime.init_realtime(application)
    token = issue(account)
    client = server.test_client(application, auth={'token': token})
    try:
        assert client.is_connected()
        client.get_received()
        account.hashed_password = 'new-hash'
        realtime.emit_realtime_event('catalog.changed', {'entity': 'service'}, rooms=[f'user:{account.id}'])
        assert not client.is_connected()
        old_client = server.test_client(application, auth={'token': token})
        assert not old_client.is_connected()
        replacement_client = server.test_client(application, auth={'token': issue(account)})
        try:
            assert replacement_client.is_connected()
        finally:
            if replacement_client.is_connected():
                replacement_client.disconnect()
    finally:
        if client.is_connected():
            client.disconnect()
