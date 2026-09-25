from flask import Blueprint, jsonify, request, send_file
import logging

from app.api.auth import require_auth
from app.core.database import SessionLocal
from app.realtime.events import emit_inventory_changed
from app.modules.medicines.services.dav_reference_sync import (
    DavReferenceSyncError,
    sync_dav_reference_catalog,
)
from app.modules.medicines.services.reference_catalog_query import (
    get_reference_catalog_detail,
    get_reference_catalog_summary,
    list_reference_catalog,
)
from app.modules.medicines.services.reference_catalog_export import build_reference_catalog_excel


reference_catalog_bp = Blueprint(
    "medicine_reference_catalog",
    __name__,
    url_prefix="/api/medicine-reference-catalog",
)
logger = logging.getLogger(__name__)


@reference_catalog_bp.route("", methods=["GET"])
@require_auth
def get_reference_catalog(user):
    db = SessionLocal()
    try:
        autocomplete = request.args.get("mode") == "autocomplete"
        result = list_reference_catalog(
            db,
            search=request.args.get("search") or request.args.get("q"),
            page=request.args.get("page", 1),
            per_page=request.args.get("per_page") or request.args.get("limit") or 20,
            status=request.args.get("status", "active"),
            autocomplete=autocomplete,
            registration_number=request.args.get('registration_number'),
            clinic_medicine_id=request.args.get('clinic_medicine_id', type=int),
        )
        if autocomplete:
            return jsonify({
                "success": True,
                "data": result["items"],
                "page": result["page"],
                "per_page": result["per_page"],
                "has_more": result["has_more"],
            })
        summary = get_reference_catalog_summary(db) if request.args.get("include_summary") != "0" else None
        return jsonify({
            "success": True,
            "data": result["items"],
            "total": result["total"],
            "page": result["page"],
            "per_page": result["per_page"],
            "total_pages": result["total_pages"],
            "summary": summary,
        })
    except ValueError as exc:
        return jsonify(success=False, message=str(exc)), 400
    except Exception as exc:
        return jsonify({"success": False, "message": str(exc)}), 500
    finally:
        db.close()


@reference_catalog_bp.route("/export/excel", methods=["GET"])
@require_auth
def export_reference_catalog(user):
    db = SessionLocal()
    try:
        output = build_reference_catalog_excel(
            db, search=request.args.get('search', ''), status=request.args.get('status', 'active')
        )
        response = send_file(
            output, as_attachment=True, download_name='danh_muc_thuoc_DAV.xlsx',
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        response.headers['Cache-Control'] = 'no-store'
        return response
    except Exception:
        logger.exception('Unexpected error while exporting DAV catalog')
        return jsonify(success=False, message='Không thể xuất danh mục DAV. Vui lòng thử lại.'), 500
    finally:
        db.close()


@reference_catalog_bp.route("/search", methods=["GET"])
@require_auth
def search_reference_catalog(user):
    db = SessionLocal()
    try:
        result = list_reference_catalog(
            db,
            search=request.args.get("q") or request.args.get("search"),
            page=1,
            per_page=request.args.get("limit", 20),
            status=request.args.get("status", "active"),
        )
        return jsonify({
            "success": True,
            "data": result["items"],
            "total": result["total"],
        })
    except Exception as exc:
        return jsonify({"success": False, "message": str(exc)}), 500
    finally:
        db.close()


@reference_catalog_bp.route("/<int:catalog_id>", methods=["GET"])
@require_auth
def get_reference_catalog_detail_endpoint(user, catalog_id):
    db = SessionLocal()
    try:
        item = get_reference_catalog_detail(db, catalog_id)
        if not item:
            return jsonify({"success": False, "message": "Không tìm thấy thuốc DAV"}), 404
        return jsonify({"success": True, "data": item})
    except Exception:
        logger.exception("Unexpected error while loading DAV medicine reference detail")
        return jsonify({"success": False, "message": "Lỗi hệ thống khi tải chi tiết thuốc DAV"}), 500
    finally:
        db.close()


@reference_catalog_bp.route("/sync", methods=["POST"])
@require_auth
def sync_reference_catalog(user):
    db = SessionLocal()
    try:
        payload = request.get_json(silent=True) or {}
        result = sync_dav_reference_catalog(
            db,
            page_size=payload.get("page_size") or 1000,
            timeout=payload.get("timeout") or 30,
        )
        emit_inventory_changed('reference_catalog_synced', entity='medicine_reference_catalog', extra=result)
        return jsonify({
            "success": True,
            "message": "Đồng bộ danh mục thuốc DAV thành công",
            "result": result,
        })
    except DavReferenceSyncError as exc:
        db.rollback()
        return jsonify({"success": False, "message": str(exc)}), 502
    except Exception as exc:
        db.rollback()
        logger.exception("Unexpected error while syncing DAV medicine reference catalog")
        return jsonify({"success": False, "message": "Lỗi hệ thống khi đồng bộ DAV"}), 500
    finally:
        db.close()
