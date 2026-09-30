from flask import Blueprint, request, jsonify
from app.api.auth import require_auth
from app.core.database import get_db
from app.models.examination import Examination
from app.realtime.events import emit_examination_changed
from app.modules.examinations.services import (
    InvalidStatusValue,
    ManagementExaminationNotFound,
    StatusTransitionExaminationNotFound,
    get_examination_management_detail_result,
    get_examination_management_list_result,
    get_examination_stats_result,
    update_management_examination_status_result,
)
from app.modules.examinations.services.management_query import InvalidManagementFilter
import logging
from app.utils.api_error_contract import api_error_boundary

examination_management_bp = Blueprint('examination_management', __name__)

@examination_management_bp.route('/examinations', methods=['GET'])
@require_auth
@api_error_boundary(detail='Có lỗi xảy ra khi lấy danh sách lượt khám')
def get_examinations(user):
    """Lấy danh sách lượt khám với phân trang và lọc"""
    db = None
    try:
        db = next(get_db())
        result = get_examination_management_list_result(db, request.args, user)
        return jsonify(result), 200
        
    except InvalidManagementFilter as exc:
        return jsonify(detail=str(exc)), 400
    finally:
        if db is not None:
            db.close()


@examination_management_bp.route('/examinations/<int:examination_id>', methods=['GET'])
@require_auth
@api_error_boundary(detail='Có lỗi xảy ra khi lấy chi tiết lượt khám')
def get_examination_detail(user, examination_id):
    """Lấy chi tiết lượt khám"""
    db = None
    try:
        db = next(get_db())
        result = get_examination_management_detail_result(db, examination_id, user)
        return jsonify(result), 200
    except ManagementExaminationNotFound:
        return jsonify({'detail': 'Lượt khám không tồn tại'}), 404
    finally:
        if db is not None:
            db.close()


@examination_management_bp.route('/examinations/<int:examination_id>/status', methods=['PUT'])
@require_auth
def update_examination_status(user, examination_id):
    """Cập nhật trạng thái lượt khám"""
    db = None
    try:
        db = next(get_db())
        data = request.get_json(silent=True)
        result = update_management_examination_status_result(db, examination_id, data, user)
        examination = db.query(Examination).filter(Examination.id == examination_id).first()
        emit_examination_changed('status_updated', examination=examination, extra=result)
        return jsonify(result), 200
    except (StatusTransitionExaminationNotFound, ManagementExaminationNotFound):
        return jsonify({'detail': 'Lượt khám không tồn tại'}), 404
    except InvalidStatusValue:
        return jsonify({'detail': 'Trạng thái không hợp lệ'}), 400
    except Exception as e:
        if db is not None:
            db.rollback()
        logging.error(f"Lỗi cập nhật trạng thái lượt khám: {str(e)}")
        return jsonify({'detail': 'Có lỗi xảy ra khi cập nhật trạng thái'}), 500
    finally:
        if db is not None:
            db.close()


@examination_management_bp.route('/examinations/stats', methods=['GET'])
@require_auth
@api_error_boundary(detail='Có lỗi xảy ra khi lấy thống kê')
def get_examination_stats(user):
    """Lấy thống kê lượt khám theo trạng thái"""
    db = None
    try:
        db = next(get_db())
        stats = get_examination_stats_result(db, request.args, user)
        return jsonify(stats), 200
        
    except InvalidManagementFilter as exc:
        return jsonify(detail=str(exc)), 400
    finally:
        if db is not None:
            db.close()


def get_status_text(status):
    """Backward-compatible status text helper."""
    from app.modules.examinations.view_models.management import get_examination_status_text
    return get_examination_status_text(status)
