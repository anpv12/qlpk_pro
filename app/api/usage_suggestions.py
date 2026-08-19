from flask import Blueprint, jsonify, request

from app.api.auth import require_auth
from app.schemas.usage_suggestion import (
    UsageSuggestionRequest,
    UsageSuggestionResponse,
    UsageSuggestionItem,
)
from app.services.usage_suggestion_service import (
    request_usage_suggestions,
    UsageSuggestionError,
)

usage_suggestions_bp = Blueprint("usage_suggestions", __name__)


@usage_suggestions_bp.route("/usage-suggestions", methods=["POST"])
@require_auth
def generate_usage_suggestions(current_user):
    """Endpoint gọi dịch vụ AI để sinh gợi ý cách dùng thuốc."""
    try:
        payload = request.get_json(force=True, silent=False) or {}
    except Exception as exc:
        return (
            jsonify(
                {
                    "success": False,
                    "error": "Payload không hợp lệ.",
                    "details": str(exc),
                }
            ),
            400,
        )

    try:
        validated = UsageSuggestionRequest.model_validate(payload)
    except Exception as exc:
        return (
            jsonify(
                {
                    "success": False,
                    "error": "Payload không đúng cấu trúc.",
                    "details": str(exc),
                }
            ),
            400,
        )

    try:
        suggestions = request_usage_suggestions(validated.model_dump())
    except UsageSuggestionError as exc:
        return (
            jsonify(
                {
                    "success": False,
                    "error": str(exc),
                }
            ),
            502,
        )
    except Exception as exc:
        return (
            jsonify(
                {
                    "success": False,
                    "error": "Lỗi không xác định khi gọi dịch vụ AI.",
                    "details": str(exc),
                }
            ),
            500,
        )

    response = UsageSuggestionResponse(
        suggestions=[
            UsageSuggestionItem(**item) if not isinstance(item, UsageSuggestionItem) else item
            for item in suggestions
        ]
    )

    return jsonify({"success": True, "data": response.model_dump()}), 200

