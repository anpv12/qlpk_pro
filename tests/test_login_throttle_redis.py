import os
import shutil
import subprocess
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from flask import Flask
from redis import Redis
from redis.exceptions import ConnectionError

from app.api import auth as auth_api
from app.core import login_throttle as throttle


@pytest.fixture
def isolated_redis(monkeypatch):
    binary = os.environ.get('QLPK_TEST_REDIS_SERVER') or shutil.which('redis-server')
    if not binary:
        pytest.skip('Set QLPK_TEST_REDIS_SERVER to run against an isolated Redis binary')
    with tempfile.TemporaryDirectory(prefix='qlpk-rqa-', dir='/tmp') as directory:
        socket_path = str(Path(directory) / 'redis.sock')
        with open(Path(directory) / 'redis.log', 'w') as log:
            process = subprocess.Popen([binary, '--port', '0', '--unixsocket', socket_path,
                '--unixsocketperm', '700', '--save', '', '--appendonly', 'no',
                '--maxmemory-policy', 'noeviction', '--dir', directory], stdout=log, stderr=log)
            client = Redis(unix_socket_path=socket_path, decode_responses=True,
                           socket_timeout=1, socket_connect_timeout=1)
            try:
                deadline = time.monotonic() + 10
                while True:
                    if process.poll() is not None:
                        pytest.fail('Isolated Redis exited before readiness')
                    try:
                        if client.ping():
                            break
                    except ConnectionError:
                        if time.monotonic() >= deadline:
                            pytest.fail('Isolated Redis readiness timeout')
                        time.sleep(0.02)
                url = f'unix://{socket_path}?db=0'
                for key, value in {'LOGIN_REDIS_URL': url, 'REALTIME_REDIS_URL': None,
                    'LOGIN_ACCOUNT_ATTEMPTS': 3, 'LOGIN_IP_ATTEMPTS': 100,
                    'LOGIN_WINDOW_SECONDS': 60, 'SECRET_KEY': 'isolated-redis-qa-key'}.items():
                    monkeypatch.setattr(throttle.settings, key, value)
                monkeypatch.setattr(throttle, '_memory_store', throttle.MemoryLoginThrottle())
                yield SimpleNamespace(client=client, url=url, process=process)
            finally:
                if 'url' in locals():
                    throttle._redis_store(url).close()
                throttle._redis_store.cache_clear()
                client.close()
                if process.poll() is None:
                    process.terminate()
                    try:
                        process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait(timeout=5)


def test_lua_reserves_concurrently_without_overshoot(isolated_redis):
    with ThreadPoolExecutor(max_workers=20) as workers:
        results = list(workers.map(lambda _: throttle.reserve_login_attempt('qa', '192.0.2.1'), range(50)))
    assert results.count(0) == 3
    assert all(result > 0 for result in results if result != 0)
    account_key = throttle._budget_key('account', 'qa')
    ip_key = throttle._budget_key('ip', '192.0.2.1')
    assert isolated_redis.client.mget(account_key, ip_key) == ['3', '3']
    assert 0 < isolated_redis.client.pttl(account_key) <= 60000
    assert throttle._memory_store.entries == {}


def test_separate_clients_share_atomic_budget(isolated_redis):
    keys = [throttle._budget_key('ip', '192.0.2.1'), throttle._budget_key('account', 'qa')]
    def reserve(_):
        client = Redis.from_url(isolated_redis.url, decode_responses=True)
        try:
            return client.eval(throttle.REDIS_RESERVE, 2, *keys, 60000, 100, 3)
        finally:
            client.close()
    with ThreadPoolExecutor(max_workers=12) as workers:
        results = list(workers.map(reserve, range(24)))
    assert results.count(0) == 3
    assert isolated_redis.client.mget(*keys) == ['3', '3']


def test_blocked_account_does_not_increment_another_ip_or_extend_ttl(isolated_redis):
    for _ in range(3):
        assert throttle.reserve_login_attempt('qa', '192.0.2.1') == 0
    key = throttle._budget_key('account', 'qa')
    before = isolated_redis.client.pttl(key)
    time.sleep(0.03)
    assert throttle.reserve_login_attempt('qa', '192.0.2.2') > 0
    assert isolated_redis.client.pttl(key) < before
    assert isolated_redis.client.get(throttle._budget_key('ip', '192.0.2.2')) is None


def test_ip_budget_blocks_new_account_without_consuming_its_budget(isolated_redis, monkeypatch):
    monkeypatch.setattr(throttle.settings, 'LOGIN_IP_ATTEMPTS', 2)
    for username in ['first', 'second']:
        assert throttle.reserve_login_attempt(username, '192.0.2.1') == 0
    assert throttle.reserve_login_attempt('third', '192.0.2.1') > 0
    assert isolated_redis.client.get(throttle._budget_key('account', 'third')) is None


def test_real_ttl_expiry_allows_new_window(isolated_redis, monkeypatch):
    monkeypatch.setattr(throttle.settings, 'LOGIN_WINDOW_SECONDS', 1)
    for _ in range(3):
        throttle.reserve_login_attempt('qa', '192.0.2.1')
    assert throttle.reserve_login_attempt('qa', '192.0.2.1') == 1
    time.sleep(1.05)
    assert throttle.reserve_login_attempt('qa', '192.0.2.1') == 0
    assert isolated_redis.client.get(throttle._budget_key('account', 'qa')) == '1'


def test_counter_without_ttl_is_repaired_instead_of_permanent_lockout(isolated_redis):
    key = throttle._budget_key('account', 'qa')
    isolated_redis.client.set(key, 3)
    assert throttle.reserve_login_attempt('qa', '192.0.2.1') == 60
    assert 0 < isolated_redis.client.pttl(key) <= 60000
    assert isolated_redis.client.get(key) == '3'


def test_real_redis_http_429_happens_before_db(isolated_redis, monkeypatch):
    application = Flask(__name__)
    application.register_blueprint(auth_api.router)
    database = MagicMock()
    get_db = MagicMock(side_effect=lambda: iter([database]))
    authenticate = MagicMock(return_value=None)
    monkeypatch.setattr(auth_api, 'get_db', get_db)
    monkeypatch.setattr(auth_api, 'authenticate_user', authenticate)
    client = application.test_client()
    for _ in range(3):
        assert client.post('/auth/login', json={'username': 'qa', 'password': 'invalid'}).status_code == 401
    get_db.reset_mock()
    authenticate.reset_mock()
    response = client.post('/auth/login', json={'username': 'qa', 'password': 'invalid'})
    assert response.status_code == 429
    assert 0 < int(response.headers['Retry-After']) <= 60
    get_db.assert_not_called()
    authenticate.assert_not_called()


@pytest.mark.parametrize('failure', ['stopped', 'corrupt'])
def test_actual_store_failure_denies_login_without_memory_fallback(isolated_redis, monkeypatch, failure):
    if failure == 'stopped':
        isolated_redis.process.terminate()
        isolated_redis.process.wait(timeout=5)
    else:
        isolated_redis.client.set(throttle._budget_key('account', 'qa'), 'invalid-counter')
    application = Flask(__name__)
    application.register_blueprint(auth_api.router)
    get_db = MagicMock(side_effect=AssertionError('Must not access database'))
    monkeypatch.setattr(auth_api, 'get_db', get_db)
    response = application.test_client().post('/auth/login', json={'username': 'qa', 'password': 'invalid'})
    assert response.status_code == 503
    get_db.assert_not_called()
    assert throttle._memory_store.entries == {}


def test_throttle_redis_fixture_never_opens_tcp_port(isolated_redis):
    assert isolated_redis.client.config_get('port') == {'port': '0'}
    assert isolated_redis.client.config_get('save') == {'save': ''}
    assert isolated_redis.client.config_get('appendonly') == {'appendonly': 'no'}
