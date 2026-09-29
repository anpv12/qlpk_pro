"""Baseline HTTP security headers for every response.

The workspace shell embeds pages in same-origin iframes, so framing is limited
to the same origin instead of denied. Scripts are self-hosted under
``/static/vendor`` and the app has no inline ``<script>`` blocks, inline event
handlers or ``javascript:`` URLs, so the Content Security Policy is enforced
with ``script-src 'self'``. Inline ``style`` attributes set by components remain
allowed. HSTS is only sent on secure requests (nginx terminates TLS and ProxyFix
forwards the scheme).
"""

CONTENT_SECURITY_POLICY = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self' 'unsafe-inline'; "
    "font-src 'self' data:; "
    "img-src 'self' data: blob: https:; "
    "connect-src 'self' ws: wss:; "
    "frame-src 'self' blob:; worker-src 'self' blob:; "
    "frame-ancestors 'self'; base-uri 'self'; object-src 'none'; form-action 'self'"
)
DEFAULT_SECURITY_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'Content-Security-Policy': CONTENT_SECURITY_POLICY,
}
STRICT_TRANSPORT_SECURITY = 'max-age=31536000; includeSubDomains'
INSECURE_DEFAULT_SECRET_KEY = 'qlpk-production-secret-key-2024'


def security_headers(is_secure=False):
    """Return the header map to apply; HSTS only when the request used HTTPS."""
    headers = dict(DEFAULT_SECURITY_HEADERS)
    if is_secure:
        headers['Strict-Transport-Security'] = STRICT_TRANSPORT_SECURITY
    return headers


def apply_security_headers(response, is_secure=False):
    """Add the baseline headers without overriding values a view already set."""
    for name, value in security_headers(is_secure).items():
        response.headers.setdefault(name, value)
    return response


def uses_insecure_default_secret(secret_key):
    return not secret_key or secret_key == INSECURE_DEFAULT_SECRET_KEY
