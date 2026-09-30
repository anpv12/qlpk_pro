"""Survey-template lookup used by the clinical indication form."""

import logging

from flask import Blueprint, jsonify

from app.api.auth import require_auth
from app.core.database import get_db
from app.modules.orders.services.clinical_order_query import (
    get_survey_templates_for_order_result,
)
from app.modules.orders.view_models.clinical_order import (
    serialize_survey_template_for_order,
)
from app.utils.api_error_contract import api_error_boundary


logger = logging.getLogger(__name__)
survey_order_bp = Blueprint("order_surveys", __name__)


@survey_order_bp.route("/survey-templates-for-orders", methods=["GET"])
@require_auth
@api_error_boundary(success=False, detail='Không thể tải danh sách mẫu khảo sát')
def get_survey_templates_for_orders(current_user):
    """Return active survey templates available as clinical indications."""
    db = next(get_db())
    try:
        templates = get_survey_templates_for_order_result(db)
        data = [serialize_survey_template_for_order(template) for template in templates]
        return jsonify({"success": True, "data": data, "total": len(data)}), 200
    finally:
        db.close()
