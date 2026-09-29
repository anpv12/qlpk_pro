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
    policy = response.headers['Content-Security-Policy']
    assert "script-src 'self';" in policy
    assert "'unsafe-inline'" not in policy.split('style-src')[0]
    assert "'unsafe-eval'" not in policy
    assert 'Content-Security-Policy-Report-Only' not in response.headers


def test_templates_and_scripts_have_no_inline_script_sources():
    import pathlib
    import re
    root = pathlib.Path(__file__).resolve().parents[1] / 'app'
    offenders = []
    for path in [*root.joinpath('templates').rglob('*.html'), *root.joinpath('static/js').rglob('*.js')]:
        if 'vendor' in path.parts:
            continue
        text = path.read_text(encoding='utf-8', errors='ignore')
        if re.search(r'<script(?![^>]*\bsrc=)[^>]*>', text) or 'javascript:' in text or re.search(r'\son(click|change|input|blur|focus|submit|load|mousedown|keydown|keyup)\s*=', text):
            offenders.append(str(path.relative_to(root)))
    assert offenders == []


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
