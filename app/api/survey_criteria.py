from flask import Blueprint, jsonify, request
from app.core.database import get_db, SessionLocal
from app.models.survey_criteria import SurveyCriteria
from app.api.auth import require_auth
from app.utils.survey_template_policy import require_survey_manager
from app.realtime.events import emit_catalog_changed
import logging
from app.utils.api_error_contract import api_error_boundary

logger = logging.getLogger(__name__)
survey_criteria_bp = Blueprint('survey_criteria', __name__)

@survey_criteria_bp.route('/survey-criteria/', methods=['GET'])
@require_auth
@api_error_boundary(success=False, message='Lỗi khi lấy danh sách tiêu chí: {error}')
def get_survey_criteria(user):
    """Lấy danh sách tất cả tiêu chí khảo sát đang hoạt động"""
    try:
        db = next(get_db())
        criteria = db.query(SurveyCriteria).filter(SurveyCriteria.is_active == True).order_by(SurveyCriteria.name).all()
        
        criteria_list = []
        for c in criteria:
            criteria_list.append({
                'id': c.id,
                'name': c.name,
                'description': c.description,
                'is_active': c.is_active
            })
        
        return jsonify({
            'success': True,
            'data': criteria_list
        }), 200
        
    finally:
        db.close()

@survey_criteria_bp.route('/survey-criteria/', methods=['POST'])
@require_auth
@require_survey_manager
@api_error_boundary(success=False, message='Lỗi khi tạo tiêu chí')
def create_survey_criteria(user):
    """Tạo tiêu chí khảo sát mới"""
    try:
        db = SessionLocal()
        data = request.get_json()
        name = data.get('name', '').strip()
        
        if not name:
            return jsonify({
                'success': False,
                'message': 'Tên tiêu chí không được để trống'
            }), 400
        
        # Kiểm tra trùng lặp (case-insensitive)
        existing = db.query(SurveyCriteria).filter(SurveyCriteria.name.ilike(name)).first()
        if existing:
            # Nếu tiêu chí đã tồn tại, trả về thông tin của nó
            return jsonify({
                'success': True,
                'message': 'Tiêu chí này đã tồn tại',
                'data': {
                    'id': existing.id,
                    'name': existing.name
                }
            }), 200
        
        new_criteria = SurveyCriteria(
            name=name,
            description=data.get('description', '').strip() or None
        )
        db.add(new_criteria)
        db.commit()
        emit_catalog_changed('survey_criteria_created', entity='survey_criteria', entity_id=new_criteria.id)
        
        return jsonify({
            'success': True,
            'message': 'Tạo tiêu chí thành công',
            'data': {
                'id': new_criteria.id,
                'name': new_criteria.name
            }
        }), 201
        
    finally:
        if 'db' in locals():
            db.close()

@survey_criteria_bp.route('/survey-criteria/<int:criteria_id>', methods=['PUT'])
@require_auth
@require_survey_manager
@api_error_boundary(success=False, message='Lỗi khi cập nhật tiêu chí')
def update_survey_criteria(user, criteria_id):
    """Cập nhật tiêu chí khảo sát"""
    try:
        db = SessionLocal()
        criteria = db.query(SurveyCriteria).filter(SurveyCriteria.id == criteria_id).first()
        if not criteria:
            return jsonify({
                'success': False,
                'message': 'Không tìm thấy tiêu chí'
            }), 404
        
        data = request.get_json()
        name = data.get('name', '').strip()
        is_active = data.get('is_active', True)
        
        if not name:
            return jsonify({
                'success': False,
                'message': 'Tên tiêu chí không được để trống'
            }), 400
        
        # Kiểm tra trùng lặp (trừ chính nó)
        existing = db.query(SurveyCriteria).filter(
            SurveyCriteria.name.ilike(name),
            SurveyCriteria.id != criteria_id
        ).first()
        if existing:
            return jsonify({
                'success': False,
                'message': 'Tiêu chí này đã tồn tại'
            }), 400
        
        criteria.name = name
        criteria.is_active = is_active
        if 'description' in data:
            criteria.description = data.get('description', '').strip() or None
        db.commit()
        emit_catalog_changed('survey_criteria_updated', entity='survey_criteria', entity_id=criteria.id)
        
        return jsonify({
            'success': True,
            'message': 'Cập nhật tiêu chí thành công',
            'data': {
                'id': criteria.id,
                'name': criteria.name,
                'is_active': criteria.is_active
            }
        }), 200
        
    finally:
        if 'db' in locals():
            db.close()

@survey_criteria_bp.route('/survey-criteria/<int:criteria_id>', methods=['DELETE'])
@require_auth
@require_survey_manager
@api_error_boundary(success=False, message='Lỗi khi xóa tiêu chí')
def delete_survey_criteria(user, criteria_id):
    """Xóa tiêu chí khảo sát (soft delete)"""
    try:
        db = SessionLocal()
        criteria = db.query(SurveyCriteria).filter(SurveyCriteria.id == criteria_id).first()
        if not criteria:
            return jsonify({
                'success': False,
                'message': 'Không tìm thấy tiêu chí'
            }), 404
        
        # Soft delete - chỉ set is_active = False
        criteria.is_active = False
        db.commit()
        emit_catalog_changed('survey_criteria_deleted', entity='survey_criteria', entity_id=criteria_id)
        
        return jsonify({
            'success': True,
            'message': 'Xóa tiêu chí thành công'
        }), 200
        
    finally:
        if 'db' in locals():
            db.close()
