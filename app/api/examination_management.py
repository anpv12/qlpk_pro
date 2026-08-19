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
import logging

examination_management_bp = Blueprint('examination_management', __name__)

@examination_management_bp.route('/examinations', methods=['GET'])
@require_auth
def get_examinations(user):
    """Lấy danh sách lượt khám với phân trang và lọc"""
    try:
        db = next(get_db())
        result = get_examination_management_list_result(db, request.args)
        return jsonify(result), 200
        
    except Exception as e:
        logging.error(f"Lỗi lấy danh sách lượt khám: {str(e)}")
        return jsonify({'detail': 'Có lỗi xảy ra khi lấy danh sách lượt khám'}), 500
    finally:
        db.close()


@examination_management_bp.route('/examinations/<int:examination_id>', methods=['GET'])
@require_auth
def get_examination_detail(user, examination_id):
    """Lấy chi tiết lượt khám"""
    try:
        db = next(get_db())
        result = get_examination_management_detail_result(db, examination_id)
        return jsonify(result), 200
    except ManagementExaminationNotFound:
        return jsonify({'detail': 'Lượt khám không tồn tại'}), 404
    except Exception as e:
        logging.error(f"Lỗi lấy chi tiết lượt khám: {str(e)}")
        return jsonify({'detail': 'Có lỗi xảy ra khi lấy chi tiết lượt khám'}), 500
    finally:
        db.close()


@examination_management_bp.route('/examinations/<int:examination_id>/status', methods=['PUT'])
@require_auth
def update_examination_status(user, examination_id):
    """Cập nhật trạng thái lượt khám"""
    try:
        db = next(get_db())
        data = request.get_json()
        result = update_management_examination_status_result(db, examination_id, data)
        examination = db.query(Examination).filter(Examination.id == examination_id).first()
        emit_examination_changed('status_updated', examination=examination, extra=result)
        return jsonify(result), 200
    except StatusTransitionExaminationNotFound:
        return jsonify({'detail': 'Lượt khám không tồn tại'}), 404
    except InvalidStatusValue:
        return jsonify({'detail': 'Trạng thái không hợp lệ'}), 400
    except Exception as e:
        logging.error(f"Lỗi cập nhật trạng thái lượt khám: {str(e)}")
        return jsonify({'detail': 'Có lỗi xảy ra khi cập nhật trạng thái'}), 500
    finally:
        db.close()


@examination_management_bp.route('/examinations/stats', methods=['GET'])
@require_auth
def get_examination_stats(user):
    """Lấy thống kê lượt khám theo trạng thái"""
    try:
        db = next(get_db())
        stats = get_examination_stats_result(
            db,
            request.args,
            auth_header=request.headers.get('Authorization'),
            logger=logging,
        )
        return jsonify(stats), 200
        
    except Exception as e:
        logging.error(f"Lỗi lấy thống kê lượt khám: {str(e)}")
        return jsonify({'detail': 'Có lỗi xảy ra khi lấy thống kê'}), 500
    finally:
        db.close()


def get_status_text(status):
    """Backward-compatible status text helper."""
    from app.modules.examinations.view_models.management import get_examination_status_text
    return get_examination_status_text(status)
