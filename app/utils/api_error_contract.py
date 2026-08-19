"""Add a stable machine-readable code to JSON error responses.

Existing response fields stay untouched for backward compatibility. Frontend
workflows use ``code`` for user-facing copy and keep technical details out of
toast notifications.
"""

from __future__ import annotations

import json


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
