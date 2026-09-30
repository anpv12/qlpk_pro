import ast
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest
import jwt

from app.core.config import Settings
from app.core.security_config import production_security_errors, validate_security_config
from app.services import auth
from app.services import access_sessions


ROOT = Path(__file__).resolve().parents[1]
QA_SECRET = 'isolated-production-qa-key-not-a-real-deployment-secret'


def config(**changes):
    return SimpleNamespace(**{'DEBUG': False, 'SECRET_KEY': QA_SECRET,
        'ACCESS_TOKEN_EXPIRE_MINUTES': 480, 'ALGORITHM': 'HS256',
        'SESSION_REDIS_URL': 'redis://qa.invalid/0', **changes})


@pytest.mark.parametrize('secret', ['', None, 'short', 'qlpk-production-secret-key-2024'])
def test_production_refuses_missing_default_or_short_secret_without_echoing_it(secret):
    with pytest.raises(RuntimeError) as failure:
        validate_security_config(config(SECRET_KEY=secret))
    assert 'SECRET_KEY' in str(failure.value)
    if secret:
        assert secret not in str(failure.value)


@pytest.mark.parametrize('expiry', [0, -1, 1441, None, '480', True])
def test_production_requires_bounded_expiry(expiry):
    with pytest.raises(RuntimeError, match='ACCESS_TOKEN_EXPIRE_MINUTES'):
        validate_security_config(config(ACCESS_TOKEN_EXPIRE_MINUTES=expiry))


@pytest.mark.parametrize('algorithm', ['none', 'HS384', 'RS256', None])
def test_symmetric_key_contract_has_explicit_algorithm(algorithm):
    with pytest.raises(RuntimeError, match='ALGORITHM'):
        validate_security_config(config(ALGORITHM=algorithm))


@pytest.mark.parametrize('expiry', [1, 480, 1440])
def test_valid_configuration_accepted(expiry):
    assert production_security_errors(config(ACCESS_TOKEN_EXPIRE_MINUTES=expiry)) == []
    validate_security_config(config(ACCESS_TOKEN_EXPIRE_MINUTES=expiry))


def test_debug_mode_not_confused_with_production_readiness():
    current = config(DEBUG=True, ACCESS_TOKEN_EXPIRE_MINUTES=0)
    validate_security_config(current)
    assert production_security_errors(current)


def test_secret_defaults_are_empty_and_token_default_is_finite():
    assert Settings.model_fields['SECRET_KEY'].default == ''
    assert Settings.model_fields['SENDER_PASSWORD'].default == ''
    assert Settings.model_fields['ACCESS_TOKEN_EXPIRE_MINUTES'].default == 480


def test_startup_guard_precedes_database_and_route_imports_without_importing_main():
    tree = ast.parse((ROOT / 'main.py').read_text())
    guard = next(index for index, node in enumerate(tree.body) if isinstance(node, ast.Expr)
        and isinstance(node.value, ast.Call) and isinstance(node.value.func, ast.Name)
        and node.value.func.id == 'validate_security_config')
    database = next(index for index, node in enumerate(tree.body) if isinstance(node, ast.ImportFrom)
        and node.module == 'app.core.database')
    routes = next(index for index, node in enumerate(tree.body) if isinstance(node, ast.ImportFrom)
        and node.module and node.module.startswith('app.api.'))
    assert guard < database < routes


@pytest.fixture
def production(monkeypatch):
    store = access_sessions.MemorySessionStore()
    monkeypatch.setattr(access_sessions, 'session_store', lambda: store)
    for field, value in vars(config()).items():
        monkeypatch.setattr(auth.settings, field, value)
    return SimpleNamespace(id=1, username='qa', hashed_password='qa-hash', is_active=True)


@pytest.mark.parametrize('requested', [None, timedelta(days=100), timedelta(minutes=5)])
def test_issuer_caps_explicit_lifetime_to_configuration(production, requested):
    before = datetime.now(timezone.utc).timestamp()
    token = auth.create_access_token({'sub': production.username}, user=production, expires_delta=requested)
    claims = jwt.decode(token, QA_SECRET, algorithms=['HS256'])
    assert before < claims['exp'] <= before + 480 * 60
    if requested == timedelta(minutes=5):
        assert claims['exp'] <= before + 300
    assert auth.token_matches_user(token, production)


@pytest.mark.parametrize('expiry', [None, '9999999999', True])
def test_production_rejects_signed_tokens_without_integer_expiry(production, expiry):
    claims = {'sub': production.username, 'credential_version': auth.credential_binding(production)}
    if expiry is not None:
        claims['exp'] = expiry
    token = jwt.encode(claims, QA_SECRET, algorithm='HS256')
    assert auth.decode_access_token(token) is None
    assert not auth.token_matches_user(token, production)


def test_unsafe_production_config_cannot_issue_or_accept_token(production, monkeypatch):
    token = auth.create_access_token({'sub': production.username}, user=production)
    monkeypatch.setattr(auth.settings, 'ACCESS_TOKEN_EXPIRE_MINUTES', 0)
    with pytest.raises(RuntimeError):
        auth.create_access_token({'sub': production.username}, user=production)
    assert auth.decode_access_token(token) is None


def test_caller_cannot_override_expiry_claim(production):
    token = auth.create_access_token({'sub': production.username, 'exp': 9999999999}, user=production)
    assert jwt.decode(token, QA_SECRET, algorithms=['HS256'])['exp'] < 9999999999
