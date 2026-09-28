from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from flask import Flask
from pydantic import ValidationError

from app.api import auth as auth_api
from app.core import login_throttle as throttle
from app.core.config import Settings
from app.services import access_sessions


@pytest.fixture
def isolated(monkeypatch):
    sessions = access_sessions.MemorySessionStore()
    monkeypatch.setattr(access_sessions, 'session_store', lambda: sessions)
    monkeypatch.setattr(throttle.settings, 'DEBUG', True)
    clock = [1000.0]
    store = throttle.MemoryLoginThrottle(clock=lambda: clock[0])
    monkeypatch.setattr(throttle, '_memory_store', store)
    for key, value in {'LOGIN_REDIS_URL': None, 'REALTIME_REDIS_URL': None,
                       'LOGIN_ACCOUNT_ATTEMPTS': 3, 'LOGIN_IP_ATTEMPTS': 6,
                       'LOGIN_WINDOW_SECONDS': 60, 'SECRET_KEY': 'isolated-login-qa-key'}.items():
        monkeypatch.setattr(throttle.settings, key, value)
    return SimpleNamespace(store=store, clock=clock)


def test_account_budget_shared_across_ips_and_case_variants(isolated):
    assert throttle.reserve_login_attempt(' QA ', 'ip1') == 0
    assert throttle.reserve_login_attempt('qa', 'ip2') == 0
    assert throttle.reserve_login_attempt('QA', 'ip3') == 0
    assert throttle.reserve_login_attempt('qa', 'ip4') == 60


def test_ip_budget_blocks_rotating_usernames(isolated):
    for attempt in range(6):
        assert throttle.reserve_login_attempt(f'qa-{attempt}', 'one-ip') == 0
    assert throttle.reserve_login_attempt('new-name', 'one-ip') == 60
    assert throttle.reserve_login_attempt('new-name', 'other-ip') == 0


def test_blocked_requests_do_not_extend_wait_or_consume_other_budget(isolated):
    for _ in range(3):
        throttle.reserve_login_attempt('qa', 'one-ip')
    isolated.clock[0] += 10.2
    for _ in range(20):
        assert throttle.reserve_login_attempt('qa', 'other-ip') == 50
    assert throttle._budget_key('ip', 'other-ip') not in isolated.store.entries
    isolated.clock[0] += 49.8
    assert throttle.reserve_login_attempt('qa', 'other-ip') == 0


def test_parallel_attempts_reserve_atomically(isolated):
    with ThreadPoolExecutor(max_workers=12) as workers:
        results = list(workers.map(lambda _: throttle.reserve_login_attempt('qa', 'one-ip'), range(30)))
    assert results.count(0) == 3
    assert results.count(60) == 27


def test_memory_cap_cannot_evict_live_budgets_or_grow_unbounded():
    clock = [1000.0]
    store = throttle.MemoryLoginThrottle(max_keys=2, clock=lambda: clock[0])
    assert store.reserve([('ip1', 2), ('name1', 2)], 60) == 0
    assert store.reserve([('ip2', 2), ('name2', 2)], 60) == 60
    assert len(store.entries) == 2
    clock[0] += 60
    assert store.reserve([('ip2', 2), ('name2', 2)], 60) == 0
    assert len(store.entries) == 2


def test_stored_keys_never_contain_raw_username_or_ip(isolated):
    throttle.reserve_login_attempt('private-username', '192.0.2.1')
    keys = '|'.join(isolated.store.entries)
    assert 'private-username' not in keys
    assert '192.0.2.1' not in keys


@pytest.fixture
def login_app(isolated, monkeypatch):
    application = Flask(__name__)
    application.config['TESTING'] = True
    application.register_blueprint(auth_api.router)
    database = MagicMock()
    get_db = MagicMock(side_effect=lambda: iter([database]))
    authenticate = MagicMock(return_value=None)
    monkeypatch.setattr(auth_api, 'get_db', get_db)
    monkeypatch.setattr(auth_api, 'authenticate_user', authenticate)
    return SimpleNamespace(client=application.test_client(), database=database, get_db=get_db, authenticate=authenticate)


def test_rate_limit_precedes_db_and_password_hash_work(login_app):
    for _ in range(3):
        assert login_app.client.post('/auth/login', json={'username': 'qa', 'password': 'wrong'}).status_code == 401
    login_app.get_db.reset_mock()
    login_app.authenticate.reset_mock()
    response = login_app.client.post('/auth/login', json={'username': 'qa', 'password': 'wrong'})
    assert response.status_code == 429
    assert response.headers['Retry-After'] == '60'
    assert response.json == {'code': 'request.rate_limited', 'detail': 'Vui lòng chờ trước khi thử đăng nhập lại.', 'retry_after': 60}
    login_app.get_db.assert_not_called()
    login_app.authenticate.assert_not_called()


def test_forwarded_header_alone_cannot_bypass_ip_budget(login_app):
    for attempt in range(6):
        response = login_app.client.post('/auth/login', json={'username': f'qa{attempt}', 'password': 'wrong'},
            headers={'X-Forwarded-For': f'192.0.2.{attempt}'})
        assert response.status_code == 401
    response = login_app.client.post('/auth/login', json={'username': 'another', 'password': 'wrong'},
        headers={'X-Forwarded-For': '198.51.100.1'})
    assert response.status_code == 429


def test_invalid_bodies_still_consume_ip_budget(login_app):
    for _ in range(6):
        assert login_app.client.post('/auth/login', json=[]).status_code == 400
    assert login_app.client.post('/auth/login', json=[]).status_code == 429
    login_app.authenticate.assert_not_called()


def test_expired_window_allows_fresh_login_attempt(login_app, isolated):
    for _ in range(3):
        login_app.client.post('/auth/login', json={'username': 'qa', 'password': 'wrong'})
    isolated.clock[0] += 60
    assert login_app.client.post('/auth/login', json={'username': 'qa', 'password': 'wrong'}).status_code == 401
    assert login_app.authenticate.call_count == 4


@pytest.mark.parametrize('url_field', ['LOGIN_REDIS_URL', 'REALTIME_REDIS_URL'])
def test_redis_reservation_uses_atomic_script_and_hashed_keys(isolated, monkeypatch, url_field):
    monkeypatch.setattr(throttle.settings, url_field, 'redis://qa.invalid/0')
    store = MagicMock()
    store.eval.return_value = 1501
    factory = MagicMock(return_value=store)
    monkeypatch.setattr(throttle, '_redis_store', factory)
    assert throttle.reserve_login_attempt('qa-user', '192.0.2.1') == 2
    factory.assert_called_once_with('redis://qa.invalid/0')
    arguments = store.eval.call_args.args
    assert arguments[0] == throttle.REDIS_RESERVE
    assert arguments[1] == 2
    assert arguments[-3:] == (60000, 6, 3)
    assert 'qa-user' not in str(arguments)
    assert '192.0.2.1' not in str(arguments)
    assert isolated.store.entries == {}


def test_redis_outage_is_fail_closed_without_memory_fallback(login_app, isolated, monkeypatch):
    monkeypatch.setattr(throttle.settings, 'LOGIN_REDIS_URL', 'redis://qa.invalid/0')
    monkeypatch.setattr(throttle, '_redis_store', MagicMock(side_effect=RuntimeError('isolated failure')))
    response = login_app.client.post('/auth/login', json={'username': 'qa', 'password': 'wrong'})
    assert response.status_code == 503
    assert response.headers['Retry-After'] == '5'
    assert response.json['code'] == 'system.unavailable'
    assert isolated.store.entries == {}
    login_app.get_db.assert_not_called()


@pytest.mark.parametrize('field,value', [('LOGIN_ACCOUNT_ATTEMPTS', 0), ('LOGIN_IP_ATTEMPTS', -1),
                                      ('LOGIN_WINDOW_SECONDS', 0), ('LOGIN_WINDOW_SECONDS', 3601)])
def test_invalid_limits_cannot_disable_protection(field, value):
    with pytest.raises(ValidationError):
        Settings(_env_file=None, **{field: value})


def test_success_does_not_reset_budget_for_password_spraying(login_app, isolated, monkeypatch):
    account = SimpleNamespace(id=1, username='qa', hashed_password='qa-hash', role='admin',
                              is_active=True, full_name='QA', email=None)
    login_app.authenticate.return_value = account
    for _ in range(3):
        response = login_app.client.post('/auth/login', json={'username': 'qa', 'password': 'correct'})
        assert response.status_code == 200
    assert login_app.client.post('/auth/login', json={'username': 'qa', 'password': 'correct'}).status_code == 429
