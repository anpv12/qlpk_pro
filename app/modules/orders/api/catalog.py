"""Order catalog routes for clinical indication setup."""

import logging

from flask import Blueprint, jsonify, request

from app.api.auth import require_auth
from app.core.database import get_db
from app.realtime.events import emit_catalog_changed
from app.modules.orders.services.catalog_mutation import (
    CategoryHasChildren,
    CategoryHasOrders,
    CategoryNotFound,
    CategoryParentLoop,
    DefaultCategoryMissing,
    OrderItemHasChildren,
    OrderItemNotFound,
    ParentCategoryNotFound,
    RequiredName,
    create_order_category_record,
    create_order_item_record,
    delete_order_category_record,
    delete_order_item_record,
    update_order_category_record,
    update_order_item_record,
)
from app.modules.orders.services.catalog_query import (
    get_order_categories_result,
    get_order_category_tree_result,
    get_order_items_result,
    get_survey_templates_for_order_result,
)
from app.modules.orders.view_models.catalog import (
    serialize_category,
    serialize_category_row,
    serialize_order_item,
    serialize_survey_template_for_order,
)

logger = logging.getLogger(__name__)

order_catalog_bp = Blueprint("order_catalog", __name__)


@order_catalog_bp.route("/order-categories/tree", methods=["GET"])
@require_auth
def get_order_category_tree(current_user):
    """Trả về cây danh mục chỉ định nhiều cấp."""
    db = next(get_db())
    include_inactive = request.args.get("include_inactive", "false").lower() == "true"

    try:
        category_tree = get_order_category_tree_result(db, include_inactive=include_inactive)
        tree = [serialize_category(category, include_inactive) for category in category_tree.roots]

        return jsonify(
            {
                "success": True,
                "data": tree,
                "total_categories": category_tree.total_categories,
                "total_orders": category_tree.total_orders,
            }
        ), 200
    except Exception as exc:
        logger.error("Error fetching order category tree: %s", exc)
        return jsonify({"success": False, "detail": "Không thể tải danh mục chỉ định"}), 500
    finally:
        db.close()


@order_catalog_bp.route("/order-categories", methods=["GET"])
@require_auth
def list_order_categories(current_user):
    """Danh sách danh mục dạng bảng."""
    db = next(get_db())
    include_inactive = request.args.get("include_inactive", "false").lower() == "true"
    search = (request.args.get("search") or "").strip()

    try:
        categories_result = get_order_categories_result(
            db,
            include_inactive=include_inactive,
            search=search,
        )
        data = [
            serialize_category_row(category, include_inactive=include_inactive)
            for category in categories_result.categories
        ]

        return jsonify({"success": True, "data": data}), 200
    except Exception as exc:
        logger.error("Error listing order categories: %s", exc)
        return (
            jsonify({"success": False, "detail": "Không thể tải danh sách danh mục"}),
            500,
        )
    finally:
        db.close()


@order_catalog_bp.route("/order-categories", methods=["POST"])
@require_auth
def create_order_category(current_user):
    db = next(get_db())
    data = request.get_json() or {}

    try:
        category = create_order_category_record(db, data)
        db.commit()
        db.refresh(category)
        emit_catalog_changed('order_category_created', entity='order_catalog', entity_id=category.id)

        return jsonify({"success": True, "data": serialize_category(category, True)}), 201
    except RequiredName:
        return (
            jsonify({"success": False, "detail": "Tên danh mục là bắt buộc"}),
            400,
        )
    except ParentCategoryNotFound:
        return jsonify({"success": False, "detail": "Danh mục cha không tồn tại"}), 404
    except Exception as exc:
        db.rollback()
        logger.error("Error creating order category: %s", exc)
        return jsonify({"success": False, "detail": "Không thể tạo danh mục"}), 500
    finally:
        db.close()


@order_catalog_bp.route("/order-categories/<int:category_id>", methods=["PUT"])
@require_auth
def update_order_category(current_user, category_id):
    db = next(get_db())
    data = request.get_json() or {}

    try:
        category = update_order_category_record(db, category_id, data)

        db.commit()
        db.refresh(category)
        emit_catalog_changed('order_category_updated', entity='order_catalog', entity_id=category.id)

        return jsonify({"success": True, "data": serialize_category(category, True)}), 200
    except RequiredName:
        return jsonify({"success": False, "detail": "Tên danh mục là bắt buộc"}), 400
    except CategoryNotFound:
        return jsonify({"success": False, "detail": "Không tìm thấy danh mục"}), 404
    except ParentCategoryNotFound:
        return jsonify({"success": False, "detail": "Danh mục cha không tồn tại"}), 404
    except CategoryParentLoop:
        return (
            jsonify(
                {
                    "success": False,
                    "detail": "Danh mục cha không hợp lệ (gây vòng lặp)",
                }
            ),
            400,
        )
    except Exception as exc:
        db.rollback()
        logger.error("Error updating order category: %s", exc)
        return jsonify({"success": False, "detail": "Không thể cập nhật danh mục"}), 500
    finally:
        db.close()


@order_catalog_bp.route("/order-categories/<int:category_id>", methods=["DELETE"])
@require_auth
def delete_order_category(current_user, category_id):
    db = next(get_db())
    try:
        delete_order_category_record(db, category_id)
        db.commit()
        emit_catalog_changed('order_category_deleted', entity='order_catalog', entity_id=category_id)
        return jsonify({"success": True}), 200
    except CategoryNotFound:
        return jsonify({"success": False, "detail": "Không tìm thấy danh mục"}), 404
    except CategoryHasChildren:
        return (
            jsonify(
                {
                    "success": False,
                    "detail": "Không thể xóa danh mục còn danh mục con",
                }
            ),
            400,
        )
    except CategoryHasOrders:
        return (
            jsonify(
                {
                    "success": False,
                    "detail": "Không thể xóa danh mục còn chỉ định",
                }
            ),
            400,
        )
    except Exception as exc:
        db.rollback()
        logger.error("Error deleting order category: %s", exc)
        return jsonify({"success": False, "detail": "Không thể xóa danh mục"}), 500
    finally:
        db.close()


@order_catalog_bp.route("/order-items", methods=["GET"])
@require_auth
def list_order_items(current_user):
    """Danh sách chỉ định (có thể lọc theo danh mục)."""
    db = next(get_db())
    category_id = request.args.get("category_id", type=int)
    include_inactive = request.args.get("include_inactive", "false").lower() == "true"
    search = (request.args.get("search") or "").strip()

    try:
        order_items = get_order_items_result(
            db,
            category_id=category_id,
            include_inactive=include_inactive,
            search=search,
        )
        return jsonify(
            {
                "success": True,
                "data": [serialize_order_item(item) for item in order_items.items],
                "default_category_id": order_items.default_category_id,
            }
        ), 200
    except Exception as exc:
        logger.error("Error listing order items: %s", exc)
        return jsonify({"success": False, "detail": "Không thể tải danh sách chỉ định"}), 500
    finally:
        db.close()


@order_catalog_bp.route("/order-items", methods=["POST"])
@require_auth
def create_order_item(current_user):
    db = next(get_db())
    data = request.get_json() or {}

    try:
        item = create_order_item_record(db, data)
        db.commit()
        db.refresh(item)
        emit_catalog_changed('order_item_created', entity='order_catalog', entity_id=item.id)

        return jsonify({"success": True, "data": serialize_order_item(item)}), 201
    except RequiredName:
        return jsonify({"success": False, "detail": "Tên chỉ định là bắt buộc"}), 400
    except ValueError as exc:
        return jsonify({"success": False, "detail": str(exc)}), 400
    except DefaultCategoryMissing:
        return jsonify({"success": False, "detail": "Chưa cấu hình danh mục mặc định"}), 400
    except CategoryNotFound:
        return jsonify({"success": False, "detail": "Danh mục không tồn tại"}), 404
    except Exception as exc:
        db.rollback()
        logger.error("Error creating order item: %s", exc)
        return jsonify({"success": False, "detail": "Không thể tạo chỉ định"}), 500
    finally:
        db.close()


@order_catalog_bp.route("/order-items/<int:item_id>", methods=["PUT"])
@require_auth
def update_order_item(current_user, item_id):
    db = next(get_db())
    data = request.get_json() or {}

    try:
        item = update_order_item_record(db, item_id, data)

        db.commit()
        db.refresh(item)
        emit_catalog_changed('order_item_updated', entity='order_catalog', entity_id=item.id)

        return jsonify({"success": True, "data": serialize_order_item(item)}), 200
    except RequiredName:
        return jsonify({"success": False, "detail": "Tên chỉ định là bắt buộc"}), 400
    except OrderItemNotFound:
        return jsonify({"success": False, "detail": "Không tìm thấy chỉ định"}), 404
    except ValueError as exc:
        return jsonify({"success": False, "detail": str(exc)}), 400
    except DefaultCategoryMissing:
        return (
            jsonify(
                {
                    "success": False,
                    "detail": "Chưa cấu hình danh mục mặc định",
                }
            ),
            400,
        )
    except Exception as exc:
        db.rollback()
        logger.error("Error updating order item: %s", exc)
        return jsonify({"success": False, "detail": "Không thể cập nhật chỉ định"}), 500
    finally:
        db.close()


@order_catalog_bp.route("/order-items/<int:item_id>", methods=["DELETE"])
@require_auth
def delete_order_item(current_user, item_id):
    db = next(get_db())
    try:
        delete_order_item_record(db, item_id)
        db.commit()
        emit_catalog_changed('order_item_deleted', entity='order_catalog', entity_id=item_id)
        return jsonify({"success": True}), 200
    except OrderItemNotFound:
        return jsonify({"success": False, "detail": "Không tìm thấy chỉ định"}), 404
    except OrderItemHasChildren:
        return (
            jsonify(
                {
                    "success": False,
                    "detail": "Không thể xoá vì đang có chỉ định con thuộc nhóm này",
                }
            ),
            400,
        )
    except Exception as exc:
        db.rollback()
        logger.error("Error deleting order item: %s", exc)
        return jsonify({"success": False, "detail": "Không thể xóa chỉ định"}), 500
    finally:
        db.close()


@order_catalog_bp.route("/survey-templates-for-orders", methods=["GET"])
@require_auth
def get_survey_templates_for_orders(current_user):
    """Lấy danh sách mẫu khảo sát tâm lý để hiển thị trong modal chỉ định."""
    db = next(get_db())
    try:
        templates = get_survey_templates_for_order_result(db)
        data = [serialize_survey_template_for_order(template) for template in templates]
        
        return jsonify({
            "success": True,
            "data": data,
            "total": len(data)
        }), 200
    except Exception as exc:
        logger.error("Error fetching survey templates for orders: %s", exc)
        return jsonify({"success": False, "detail": "Không thể tải danh sách mẫu khảo sát"}), 500
    finally:
        db.close()
