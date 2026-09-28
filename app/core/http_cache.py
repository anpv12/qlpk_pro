"""Cache-control policy for versioned static assets.

Templates reference static files as ``/static/...?v=<app_version>``; the version
changes whenever the deployed assets change, so those responses can be cached
for a long time. Requests without a version keep Flask's default revalidation.
"""

STATIC_PREFIX = '/static/'
VERSIONED_STATIC_CACHE_CONTROL = 'public, max-age=31536000, immutable'


def versioned_static_cache_control(path, version, status_code):
    """Return the Cache-Control value for a versioned static asset, else None."""
    if status_code != 200 or not path or not path.startswith(STATIC_PREFIX):
        return None
    if not version or not str(version).strip():
        return None
    return VERSIONED_STATIC_CACHE_CONTROL
