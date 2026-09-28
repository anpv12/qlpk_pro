from werkzeug.wrappers import Response

from app.core.security_headers import (
    STRICT_TRANSPORT_SECURITY,
    apply_security_headers,
    security_headers,
    uses_insecure_default_secret,
)


def test_baseline_headers_are_applied_to_plain_responses():
    response = apply_security_headers(Response('ok'), is_secure=False)
    assert response.headers['X-Content-Type-Options'] == 'nosniff'
    assert response.headers['X-Frame-Options'] == 'SAMEORIGIN'
    assert response.headers['Referrer-Policy'] == 'strict-origin-when-cross-origin'
    assert "frame-ancestors 'self'" in response.headers['Content-Security-Policy']
    assert 'Strict-Transport-Security' not in response.headers
    assert "script-src 'self'" in response.headers['Content-Security-Policy-Report-Only']
    assert "'unsafe-inline'" not in response.headers['Content-Security-Policy-Report-Only'].split('style-src')[0]


def test_hsts_only_on_secure_requests_and_view_values_win():
    response = Response('ok')
    response.headers['X-Frame-Options'] = 'DENY'
    apply_security_headers(response, is_secure=True)
    assert response.headers['Strict-Transport-Security'] == STRICT_TRANSPORT_SECURITY
    assert response.headers['X-Frame-Options'] == 'DENY'
    assert security_headers(True)['Strict-Transport-Security'] == STRICT_TRANSPORT_SECURITY


def test_default_secret_is_flagged():
    assert uses_insecure_default_secret('qlpk-production-secret-key-2024')
    assert uses_insecure_default_secret('')
    assert not uses_insecure_default_secret('a-real-random-secret')
