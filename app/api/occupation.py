from flask import Blueprint, jsonify, request
from app.core.database import get_db, SessionLocal
from app.models.occupation import Occupation
from app.api.auth import require_auth
from app.realtime.events import emit_catalog_changed
import logging

logger = logging.getLogger(__name__)
occupation_bp = Blueprint('occupation', __name__)

@occupation_bp.route('/occupations/', methods=['GET'])
@require_auth  # Bật lại authentication
def get_occupations(user):
    """Lấy danh sách tất cả nghề nghiệp đang hoạt động"""
    try:
        db = next(get_db())
        occupations = db.query(Occupation).filter(Occupation.is_active == True).order_by(Occupation.name).all()
        
        occupation_list = []
        for occupation in occupations:
            occupation_list.append({
                'id': occupation.id,
                'name': occupation.name,
                'is_active': occupation.is_active
            })
        
        return jsonify({
            'success': True,
            'data': occupation_list
        }), 200
        
    except Exception as e:
        logger.error(f"Error getting occupations: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'Lỗi khi lấy danh sách nghề nghiệp: {str(e)}'
        }), 500
    finally:
        db.close()

@occupation_bp.route('/occupations/', methods=['POST'])
@require_auth
def create_occupation(user):
    """Tạo nghề nghiệp mới"""
    try:
        db = SessionLocal()
        data = request.get_json()
        name = data.get('name', '').strip()
        
        if not name:
            return jsonify({
                'success': False,
                'message': 'Tên nghề nghiệp không được để trống'
            }), 400
        
        # Kiểm tra trùng lặp (case-insensitive)
        existing = db.query(Occupation).filter(Occupation.name.ilike(name)).first()
        if existing:
            # Nếu nghề nghiệp đã tồn tại, trả về thông tin của nó
            return jsonify({
                'success': True,
                'message': 'Nghề nghiệp này đã tồn tại',
                'data': {
                    'id': existing.id,
                    'name': existing.name
                }
            }), 200
        
        new_occupation = Occupation(name=name)
        db.add(new_occupation)
        db.commit()
        emit_catalog_changed('occupation_created', entity='occupation', entity_id=new_occupation.id)
        
        return jsonify({
            'success': True,
            'message': 'Tạo nghề nghiệp thành công',
            'data': {
                'id': new_occupation.id,
                'name': new_occupation.name
            }
        }), 201
        
    except Exception as e:
        logger.error(f"Error creating occupation: {str(e)}")
        if 'db' in locals():
            db.rollback()
        return jsonify({
            'success': False,
            'message': 'Lỗi khi tạo nghề nghiệp'
        }), 500
    finally:
        if 'db' in locals():
            db.close()

@occupation_bp.route('/occupations/<int:occupation_id>', methods=['PUT'])
@require_auth
def update_occupation(user, occupation_id):
    """Cập nhật nghề nghiệp"""
    try:
        db = SessionLocal()
        occupation = db.query(Occupation).filter(Occupation.id == occupation_id).first()
        if not occupation:
            return jsonify({
                'success': False,
                'message': 'Không tìm thấy nghề nghiệp'
            }), 404
        
        data = request.get_json()
        name = data.get('name', '').strip()
        is_active = data.get('is_active', True)
        
        if not name:
            return jsonify({
                'success': False,
                'message': 'Tên nghề nghiệp không được để trống'
            }), 400
        
        # Kiểm tra trùng lặp (trừ chính nó)
        existing = db.query(Occupation).filter(
            Occupation.name.ilike(name),
            Occupation.id != occupation_id
        ).first()
        if existing:
            return jsonify({
                'success': False,
                'message': 'Nghề nghiệp này đã tồn tại'
            }), 400
        
        occupation.name = name
        occupation.is_active = is_active
        db.commit()
        emit_catalog_changed('occupation_updated', entity='occupation', entity_id=occupation.id)
        
        return jsonify({
            'success': True,
            'message': 'Cập nhật nghề nghiệp thành công',
            'data': {
                'id': occupation.id,
                'name': occupation.name,
                'is_active': occupation.is_active
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error updating occupation: {str(e)}")
        if 'db' in locals():
            db.rollback()
        return jsonify({
            'success': False,
            'message': 'Lỗi khi cập nhật nghề nghiệp'
        }), 500
    finally:
        if 'db' in locals():
            db.close()

@occupation_bp.route('/occupations/<int:occupation_id>', methods=['DELETE'])
@require_auth
def delete_occupation(user, occupation_id):
    """Xóa nghề nghiệp (soft delete)"""
    try:
        db = SessionLocal()
        occupation = db.query(Occupation).filter(Occupation.id == occupation_id).first()
        if not occupation:
            return jsonify({
                'success': False,
                'message': 'Không tìm thấy nghề nghiệp'
            }), 404
        
        # Soft delete - chỉ set is_active = False
        occupation.is_active = False
        db.commit()
        emit_catalog_changed('occupation_deleted', entity='occupation', entity_id=occupation_id)
        
        return jsonify({
            'success': True,
            'message': 'Xóa nghề nghiệp thành công'
        }), 200
        
    except Exception as e:
        logger.error(f"Error deleting occupation: {str(e)}")
        if 'db' in locals():
            db.rollback()
        return jsonify({
            'success': False,
            'message': 'Lỗi khi xóa nghề nghiệp'
        }), 500
    finally:
        if 'db' in locals():
            db.close()
