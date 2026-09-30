"""Add a stable machine-readable code to JSON error responses.

Existing response fields stay untouched for backward compatibility. Frontend
workflows use ``code`` for user-facing copy and keep technical details out of
toast notifications.
"""

from __future__ import annotations

import functools
import json
import logging

from flask import jsonify, request
from werkzeug.exceptions import HTTPException

logger = logging.getLogger(__name__)


STATUS_ERROR_CODES = {
    400: "request.invalid",
    401: "auth.required",
    403: "auth.forbidden",
    404: "resource.not_found",
    409: "resource.conflict",
    410: "resource.expired",
    413: "request.too_large",
    422: "request.invalid",
    429: "request.rate_limited",
}


def stable_error_code(status_code: int) -> str:
    if status_code >= 500:
        return "system.unavailable"
    return STATUS_ERROR_CODES.get(status_code, "request.failed")


def attach_stable_error_code(response):
    """Return *response* with an additive ``code`` for JSON HTTP errors."""
    if response.status_code < 400 or not response.is_json:
        return response

    payload = response.get_json(silent=True)
    if not isinstance(payload, dict) or payload.get("code"):
        return response

    normalized = dict(payload)
    normalized["code"] = stable_error_code(response.status_code)
    response.set_data(json.dumps(normalized, ensure_ascii=False, separators=(",", ":")))
    response.content_type = "application/json; charset=utf-8"
    return response


def _error_payload(fields, error):
    return {key: value.format(error=error) if isinstance(value, str) else value for key, value in fields.items()}


def api_error_boundary(**fields):
    """Turn an unexpected exception in a JSON view into ``(jsonify(fields), 500)``.

    String field values may reference the exception as ``{error}``. HTTP errors
    (``abort``, malformed JSON) keep their own status with the same JSON shape.
    Unexpected exceptions are logged with their traceback. The view's own
    ``finally`` blocks run first; ``Session.close()`` there rolls back any
    transaction left open by the failure.
    """
    def decorate(view):
        @functools.wraps(view)
        def wrapped(*args, **kwargs):
            try:
                return view(*args, **kwargs)
            except HTTPException as error:
                return jsonify(_error_payload(fields, error)), error.code
            except Exception as error:
                logger.exception("Unhandled error in %s %s", request.method, request.path)
                return jsonify(_error_payload(fields, error)), 500
        # The boundary is part of the endpoint contract: inspect.unwrap() (used to bypass auth in
        # tests) stops here instead of skipping the error handling.
        del wrapped.__wrapped__
        return wrapped
    return decorate
