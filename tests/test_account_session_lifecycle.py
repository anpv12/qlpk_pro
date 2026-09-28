from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import MagicMock
import inspect
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
from threading import Event

import pytest
from flask import Flask
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL
from sqlalchemy.orm import sessionmaker

from app.api import auth as auth_api, user as user_api
from app.models.user import User
from app.services import auth, access_sessions as sessions
from app.realtime import socket as realtime
from test_login_throttle_redis import isolated_redis


@pytest.fixture
def account(monkeypatch):
    for key, value in {'DEBUG': True, 'SECRET_KEY': 'isolated-account-lifecycle-secret',
        'ALGORITHM': 'HS256', 'ACCESS_TOKEN_EXPIRE_MINUTES': 60}.items():
        monkeypatch.setattr(auth.settings, key, value)
    monkeypatch.setattr(sessions, 'session_store', lambda: store)
    store = sessions.MemorySessionStore()
    return SimpleNamespace(id=7, username='qa', hashed_password='qa-hash', is_active=True,
        role='staff', groups=[], can_view_all_patients=False, full_name='QA',
        created_at=datetime(2026, 1, 1))


def issue(account):
    return auth.create_access_token({'sub': account.username}, user=account)


@pytest.fixture(params=['memory', 'redis'])
def store(request, account, monkeypatch):
    current = sessions.session_store()
    if request.param == 'redis':
        redis = request.getfixturevalue('isolated_redis')
        current = sessions.RedisSessionStore(redis.url)
        monkeypatch.setattr(sessions, 'session_store', lambda: current)
    yield current
    if request.param == 'redis':
        current.client.close()


def test_revoke_all_sessions_never_resurrects_after_reenable(account, store):
    first, second = issue(account), issue(account)
    other = SimpleNamespace(**{**vars(account), 'id': 8, 'username': 'other'})
    other_token = issue(other)
    sessions.revoke_account_sessions(account.id)
    account.is_active = False
    assert not auth.token_matches_user(first, account)
    account.is_active = True
    replacement = issue(account)
    assert not auth.token_matches_user(first, account)
    assert not auth.token_matches_user(second, account)
    assert auth.token_matches_user(replacement, account)
    assert auth.token_matches_user(other_token, other)


def test_stale_generation_cannot_register_after_revocation(account, store):
    previous = sessions.account_session_generation(account.id)
    sessions.revoke_account_sessions(account.id)
    assert sessions.account_session_generation(account.id) != previous
    with pytest.raises(sessions.SessionStoreUnavailable):
        sessions.register_session('stale-token', 'a' * 32, datetime.now().timestamp() + 60,
                                  user_id=account.id, generation=previous)
    assert not store.active(sessions.session_key('a' * 32), 'stale-token')


def test_loss_of_account_key_never_restores_old_tokens(account, store):
    token = issue(account)
    store.revoke(sessions.account_session_key(account.id))
    replacement = issue(account)
    assert not auth.token_matches_user(token, account)
    assert auth.token_matches_user(replacement, account)


def test_parallel_generation_initialization_has_one_owner(account, store):
    with ThreadPoolExecutor(max_workers=12) as workers:
        values = list(workers.map(lambda unused: sessions.account_session_generation(account.id), range(24)))
    assert len(set(values)) == 1


def test_account_generation_outlives_longest_registered_session(account, store):
    expires = datetime.now().timestamp() + 172800
    generation = sessions.account_session_generation(account.id)
    sessions.register_session('qa', 'b' * 32, expires, user_id=account.id, generation=generation)
    key = sessions.account_session_key(account.id)
    if isinstance(store, sessions.MemorySessionStore):
        assert store.entries[key][1] >= expires
    else:
        assert store.client.ttl(key) >= 172799


def test_concurrent_register_and_revoke_never_accepts_old_generation(account, store):
    generation = sessions.account_session_generation(account.id)
    with ThreadPoolExecutor(max_workers=2) as workers:
        registration = workers.submit(sessions.register_session, 'qa', 'c' * 32,
                                      datetime.now().timestamp() + 60, user_id=account.id, generation=generation)
        revocation = workers.submit(sessions.revoke_account_sessions, account.id)
        revocation.result(timeout=5)
        try:
            registration.result(timeout=5)
        except sessions.SessionStoreUnavailable:
            pass
    assert not sessions.session_is_active('qa', {'jti': 'c' * 32, 'session_user_id': account.id,
                                               'session_generation': generation})


def test_memory_generation_expiry_and_capacity_fail_closed():
    now = [0]
    store = sessions.MemorySessionStore(max_entries=2, clock=lambda: now[0])
    generation = store.generation('account')
    store.register('token', 'digest', 90000, 'account', generation)
    with pytest.raises(RuntimeError):
        store.generation('another-account')
    now[0] = 86401
    assert store.active('token', 'digest', 'account', generation)
    now[0] = 90001
    assert not store.active('token', 'digest', 'account', generation)
    assert store.generation('account') != generation


def test_login_session_store_failure_returns_503_without_commit(account, monkeypatch):
    application = Flask(__name__)
    application.register_blueprint(auth_api.router)
    database = MagicMock()
    monkeypatch.setattr(auth_api, 'get_db', lambda: iter([database]))
    monkeypatch.setattr(auth_api, 'authenticate_user', lambda *args: account)
    from app.core import login_throttle
    monkeypatch.setattr(login_throttle, 'reserve_login_attempt', lambda *args: 0)
    sessions.session_store().generation = MagicMock(side_effect=RuntimeError('QA outage'))
    response = application.test_client().post('/auth/login', json={'username': 'qa', 'password': 'qa'})
    assert response.status_code == 503
    database.commit.assert_not_called()
    database.rollback.assert_called_once()


@pytest.fixture
def api(account, monkeypatch):
    application = Flask(__name__)
    application.register_blueprint(user_api.user_router)
    admin = SimpleNamespace(id=1, role='admin', is_active=True, groups=[])
    monkeypatch.setattr(auth_api, 'get_current_user', lambda token: admin)
    from app.utils import account_access
    actor_db = MagicMock()
    actor_db.query.return_value.filter.return_value.first.return_value = admin
    monkeypatch.setattr(account_access, 'get_db', lambda: iter([actor_db]))
    monkeypatch.setattr(auth_api, 'get_db', lambda: iter([MagicMock()]))
    database = MagicMock()
    query = database.query.return_value.filter.return_value
    query.first.return_value = account
    query.with_for_update.return_value = query
    monkeypatch.setattr(user_api, 'get_db', lambda: iter([database]))
    monkeypatch.setattr(user_api, 'emit_catalog_changed', MagicMock())
    return application.test_client(), database


@pytest.mark.parametrize('method,body', [('DELETE', {}), ('PUT', {'is_active': False}),
    ('PUT', {'role': 'admin'}), ('PUT', {'can_view_all_patients': True})])
def test_security_change_revokes_before_database_commit(account, api, method, body):
    client, database = api
    old = issue(account)
    database.commit.side_effect = lambda: assert_revoked(old, account)
    response = client.open('/users/7', method=method, json=body, headers={'Authorization': 'Bearer qa'})
    assert response.status_code == 200
    database.query.return_value.filter.return_value.with_for_update.assert_called_once()
    account.is_active = True
    assert not auth.token_matches_user(old, account)


def assert_revoked(token, account):
    assert not sessions.session_is_active(token, auth.decode_access_claims(token))


def test_profile_change_does_not_force_logout(account, api):
    client, database = api
    old = issue(account)
    response = client.put('/users/7', json={'full_name': 'New Name'}, headers={'Authorization': 'Bearer qa'})
    assert response.status_code == 200
    assert auth.token_matches_user(old, account)


@pytest.mark.parametrize('method', ['PUT', 'DELETE'])
def test_store_failure_does_not_commit_account_change(account, api, method):
    client, database = api
    sessions.session_store().revoke = MagicMock(side_effect=RuntimeError('QA outage'))
    response = client.open('/users/7', method=method, json={'is_active': False}, headers={'Authorization': 'Bearer qa'})
    assert response.status_code == 503
    assert account.is_active is True
    database.commit.assert_not_called()
    database.rollback.assert_called_once()


def test_database_failure_keeps_account_sessions_revoked(account, api):
    client, database = api
    old = issue(account)
    database.commit.side_effect = RuntimeError('QA commit failure')
    response = client.delete('/users/7', headers={'Authorization': 'Bearer qa'})
    assert response.status_code == 500
    account.is_active = True
    assert not auth.token_matches_user(old, account)


@pytest.mark.parametrize('value', ['false', 0, None, []])
def test_invalid_active_flag_rejected_before_revocation(account, api, value):
    client, database = api
    old = issue(account)
    response = client.put('/users/7', json={'is_active': value}, headers={'Authorization': 'Bearer qa'})
    assert response.status_code == 400
    database.commit.assert_not_called()
    assert auth.token_matches_user(old, account)


@pytest.mark.parametrize('owner', [auth_api, realtime])
def test_http_and_socket_reject_revoked_generation_after_reenable(account, monkeypatch, owner):
    token = issue(account)
    database = MagicMock()
    database.query.return_value.filter.return_value.first.return_value = account
    monkeypatch.setattr(owner, 'get_db', lambda: iter([database]))
    load = auth_api.get_current_user if owner is auth_api else realtime._load_socket_user
    assert load(token) is account
    sessions.revoke_account_sessions(account.id)
    account.is_active = False
    account.is_active = True
    assert load(token) is None
    assert load(issue(account)) is account


@pytest.fixture
def isolated_postgres():
    initdb, pg_ctl = shutil.which('initdb'), shutil.which('pg_ctl')
    if not initdb or not pg_ctl:
        pytest.skip('PostgreSQL initdb/pg_ctl required for isolated lock integration')
    with tempfile.TemporaryDirectory(prefix='qlpk-pgqa-', dir='/tmp') as directory:
        data = str(Path(directory) / 'data')
        subprocess.run([initdb, '-D', data, '--auth-local=trust', '--no-locale', '--encoding=UTF8'],
                       check=True, capture_output=True, timeout=30)
        engine = None
        try:
            subprocess.run([pg_ctl, '-D', data, '-w', '-l', str(Path(directory) / 'server.log'),
                            '-o', f"-k {directory} -c listen_addresses='' -c fsync=off", 'start'],
                           check=True, capture_output=True, timeout=30)
            engine = create_engine(URL.create('postgresql+psycopg2', database='postgres',
                                             query={'host': directory}), connect_args={'connect_timeout': 5})
            User.__table__.create(engine)
            factory = sessionmaker(bind=engine, expire_on_commit=False)
            with factory.begin() as database:
                database.add(User(id=7, username='qa', full_name='QA', hashed_password='qa-hash',
                                  role='staff', is_active=True))
            yield factory, engine
        finally:
            if engine is not None:
                engine.dispose()
            subprocess.run([pg_ctl, '-D', data, '-m', 'immediate', '-w', 'stop'],
                           capture_output=True, timeout=30)


def wait_for_database_lock(engine, process_id):
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        with engine.connect() as connection:
            waiting = connection.execute(text('SELECT wait_event_type FROM pg_stat_activity WHERE pid=:pid'),
                                         {'pid': process_id}).scalar()
        if waiting == 'Lock':
            return
        time.sleep(0.02)
    pytest.fail('Expected PostgreSQL row-lock wait was not observed')


@pytest.mark.parametrize('first_operation', ['login', 'disable'])
def test_postgres_login_and_disable_serialize_without_resurrecting_sessions(
        account, store, isolated_postgres, monkeypatch, first_operation):
    factory, engine = isolated_postgres
    application = Flask(__name__)
    monkeypatch.setattr(auth, 'verify_password', lambda plain, hashed: plain == 'qa-password')
    monkeypatch.setattr(user_api, 'emit_catalog_changed', MagicMock())
    endpoint = inspect.unwrap(user_api.read_user)
    admin = SimpleNamespace(id=1, role='admin', is_active=True)
    ready = Event()
    process_ids = []

    def database_provider():
        database = factory()
        process_ids.append(database.execute(text('SELECT pg_backend_pid()')).scalar())
        ready.set()
        return iter([database])

    monkeypatch.setattr(user_api, 'get_db', database_provider)

    def disable():
        with application.test_request_context('/users/7', method='DELETE'):
            return endpoint(admin, 7)[1]

    def login():
        with factory() as database:
            process_ids.append(database.execute(text('SELECT pg_backend_pid()')).scalar())
            ready.set()
            user = auth.authenticate_user(database, 'qa', 'qa-password')
            token = issue(user) if user else None
            database.commit()
            return token

    old = issue(account)
    with factory() as first, ThreadPoolExecutor(max_workers=1) as workers:
        try:
            if first_operation == 'login':
                user = auth.authenticate_user(first, 'qa', 'qa-password')
                old = issue(user)
                future = workers.submit(disable)
            else:
                user = first.query(User).filter(User.id == 7).with_for_update().first()
                sessions.revoke_account_sessions(user.id)
                user.is_active = False
                first.flush()
                future = workers.submit(login)
            assert ready.wait(5)
            wait_for_database_lock(engine, process_ids[0])
            assert not future.done()
            first.commit()
            assert future.result(timeout=5) == (200 if first_operation == 'login' else None)
        finally:
            first.rollback()
    with application.test_request_context('/users/7', method='PUT', json={'is_active': True}):
        assert endpoint(admin, 7)[1] == 200
    with factory() as database:
        user = auth.authenticate_user(database, 'qa', 'qa-password')
        assert user.is_active is True
        assert not auth.token_matches_user(old, user)
        assert auth.token_matches_user(issue(user), user)
        database.commit()
