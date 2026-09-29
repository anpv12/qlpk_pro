from types import SimpleNamespace
from unittest.mock import MagicMock
from urllib.parse import parse_qs, urlsplit
import base64
import hashlib
import json

import pytest
from flask import Flask
from requests_oauthlib import OAuth2Session
from sqlalchemy import update

from app.api import auth as auth_api, calendar as api
from app.models.google_calendar import GoogleCalendarConnection
from app.models.user import User
from app.services import auth, access_sessions as sessions
from app.services import google_calendar_service as google
from test_account_session_lifecycle import isolated_postgres
from module_parts import setattr_all


@pytest.fixture
def oauth(isolated_postgres, monkeypatch):
    factory, engine = isolated_postgres
    GoogleCalendarConnection.__table__.create(engine)
    for key, value in {'DEBUG': True, 'SECRET_KEY': 'isolated-calendar-oauth-secret',
                       'ALGORITHM': 'HS256', 'ACCESS_TOKEN_EXPIRE_MINUTES': 60}.items():
        monkeypatch.setattr(auth.settings, key, value)
    store = sessions.MemorySessionStore()
    monkeypatch.setattr(sessions, 'session_store', lambda: store)
    account = SimpleNamespace(id=7, username='qa', hashed_password='qa-hash', is_active=True,
                              role='staff', groups=[], can_view_all_patients=False)
    identity_db = MagicMock()
    identity_db.query.return_value.filter.return_value.first.return_value = account
    monkeypatch.setattr(auth_api, 'get_db', lambda: iter([identity_db]))
    setattr_all(monkeypatch,api, 'get_db', lambda: iter([factory()]))
    setattr_all(monkeypatch,api, 'emit_appointment_changed', MagicMock())
    monkeypatch.setattr(google.GoogleCalendarService, 'get_authorization_url',
                        lambda uri, state: (f'https://accounts.example/auth?state={state}', 'v' * 64))
    exchange = MagicMock(return_value={'access_token': 'qa-access', 'refresh_token': 'qa-refresh', 'expires_at': None})
    monkeypatch.setattr(google.GoogleCalendarService, 'exchange_code_for_token', exchange)
    application = Flask(__name__)
    application.secret_key = 'isolated-flask-session'
    application.register_blueprint(api.calendar_bp)
    token = auth.create_access_token({'sub': 'qa'}, user=account)
    return SimpleNamespace(application=application, client=application.test_client(), token=token,
                           factory=factory, exchange=exchange, store=store)


def begin(context):
    response = context.client.get('/api/calendar/connect/google/init', headers={'Authorization': f'Bearer {context.token}'})
    assert response.status_code == 200
    return parse_qs(urlsplit(response.json['url']).query)['state'][0]


def callback(context, client=None, **params):
    response = (client or context.client).get('/api/calendar/oauth/google/callback', query_string=params)
    assert response.status_code == 302
    return response.headers['Location']


def connections(context):
    with context.factory() as database:
        return [(row.user_id, row.access_token) for row in database.query(GoogleCalendarConnection)]


def test_success_uses_bound_verifier_and_state_is_single_use(oauth):
    state = begin(oauth)
    assert callback(oauth, code='qa-code', state=state).endswith('calendar_connected=google')
    assert oauth.exchange.call_args.args[0] == 'qa-code'
    assert oauth.exchange.call_args.args[2] == 'v' * 64
    assert connections(oauth) == [(7, 'qa-access')]
    assert callback(oauth, code='qa-code', state=state).endswith('calendar_error=invalid_state')
    assert oauth.exchange.call_count == 1


@pytest.mark.parametrize('params', [{'code': 'qa'}, {'code': 'qa', 'state': 'forged'}, {'code': 'qa', 'state': ''}])
def test_missing_or_forged_state_never_exchanges(oauth, params):
    begin(oauth)
    assert callback(oauth, **params).endswith('calendar_error=invalid_state')
    oauth.exchange.assert_not_called()
    assert connections(oauth) == []


def test_state_from_another_browser_is_rejected(oauth):
    state = begin(oauth)
    other_browser = oauth.application.test_client()
    assert callback(oauth, other_browser, code='attacker', state=state).endswith('calendar_error=invalid_state')
    oauth.exchange.assert_not_called()


def test_expired_state_rejected(oauth, monkeypatch):
    state = begin(oauth)
    now = api.time.time()
    monkeypatch.setattr(api.time, 'time', lambda: now + api.OAUTH_STATE_TTL_SECONDS + 1)
    assert callback(oauth, code='qa', state=state).endswith('calendar_error=invalid_state')
    oauth.exchange.assert_not_called()


@pytest.mark.parametrize('change', ['logout', 'disable'])
def test_login_session_must_still_be_active_before_exchange(oauth, change):
    state = begin(oauth)
    if change == 'logout':
        sessions.revoke_session(auth.decode_access_claims(oauth.token))
    else:
        with oauth.factory.begin() as database:
            database.execute(update(User).where(User.id == 7).values(is_active=False))
    assert callback(oauth, code='qa', state=state).endswith('calendar_error=session_expired')
    oauth.exchange.assert_not_called()
    assert connections(oauth) == []


def test_logout_during_exchange_stores_nothing(oauth):
    state = begin(oauth)
    def revoke_then_return(*args):
        sessions.revoke_session(auth.decode_access_claims(oauth.token))
        return {'access_token': 'late', 'refresh_token': 'late', 'expires_at': None}
    oauth.exchange.side_effect = revoke_then_return
    assert callback(oauth, code='qa', state=state).endswith('calendar_error=session_expired')
    assert connections(oauth) == []


def test_provider_error_and_exception_details_are_not_reflected(oauth):
    state = begin(oauth)
    location = callback(oauth, state=state, error='<script>alert(1)</script>')
    assert location.endswith('calendar_error=access_denied')
    state = begin(oauth)
    oauth.exchange.side_effect = RuntimeError('client_secret=leak')
    location = callback(oauth, code='qa', state=state)
    assert location.endswith('calendar_error=oauth_failed') and 'leak' not in location
    assert connections(oauth) == []


def test_session_store_outage_fails_closed(oauth, monkeypatch):
    state = begin(oauth)
    def unavailable():
        raise RuntimeError('store down')
    monkeypatch.setattr(sessions, 'session_store', unavailable)
    assert callback(oauth, code='qa', state=state).endswith('calendar_error=session_unavailable')
    oauth.exchange.assert_not_called()


def test_real_google_flow_sends_state_s256_challenge_and_verifier(tmp_path, monkeypatch):
    secrets_file = tmp_path / 'client.json'
    secrets_file.write_text(json.dumps({'web': {
        'client_id': 'qa.apps.googleusercontent.com', 'client_secret': 'qa-secret',
        'auth_uri': 'https://accounts.google.com/o/oauth2/auth', 'token_uri': 'https://oauth2.googleapis.com/token',
        'redirect_uris': ['http://localhost/callback']}}))
    monkeypatch.setattr(google.GoogleCalendarService, 'get_credentials_file_path', lambda: str(secrets_file))
    url, verifier = google.GoogleCalendarService.get_authorization_url('http://localhost/callback', 'qa-state')
    query = parse_qs(urlsplit(url).query)
    expected = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('=')
    assert query['state'] == ['qa-state'] and query['code_challenge_method'] == ['S256']
    assert query['code_challenge'] == [expected] and query['access_type'] == ['offline']
    captured = {}
    def capture(session, token_url, **kwargs):
        captured.update(kwargs)
        raise RuntimeError('stop before network')
    monkeypatch.setattr(OAuth2Session, 'fetch_token', capture)
    with pytest.raises(RuntimeError, match='stop before network'):
        google.GoogleCalendarService.exchange_code_for_token('qa-code', 'http://localhost/callback', verifier)
    assert captured['code'] == 'qa-code' and captured['code_verifier'] == verifier
