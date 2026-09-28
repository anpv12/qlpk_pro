from flask import Blueprint, request, jsonify
from app.core.database import get_db
from app.models.sexual_orientation import SexualOrientation
from app.api.auth import require_auth
from app.realtime.events import emit_catalog_changed

sexual_orientation_bp = Blueprint('sexual_orientation', __name__)

@sexual_orientation_bp.route('/sexual-orientations/', methods=['GET'])
@require_auth
def get_sexual_orientations(user):
    """Lấy danh sách tất cả xu hướng tính dục"""
    try:
        db = next(get_db())
        sexual_orientations = db.query(SexualOrientation).order_by(SexualOrientation.name).all()
        
        result = [
            {
                'id': so.id,
                'name': so.name,
                'created_at': so.created_at.isoformat() if so.created_at else None,
                'updated_at': so.updated_at.isoformat() if so.updated_at else None
            }
            for so in sexual_orientations
        ]
        
        return jsonify(result), 200
    except Exception as e:
        return jsonify({'error': f'Lỗi khi lấy danh sách xu hướng tính dục: {str(e)}'}), 500

@sexual_orientation_bp.route('/sexual-orientations/', methods=['POST'])
@require_auth
def create_sexual_orientation(user):
    """Tạo xu hướng tính dục mới"""
    try:
        data = request.get_json()
        name = data.get('name')
        
        if not name:
            return jsonify({'error': 'Tên xu hướng tính dục không được để trống'}), 400
        
        db = next(get_db())
        
        # Kiểm tra xem đã tồn tại chưa
        existing = db.query(SexualOrientation).filter(SexualOrientation.name == name).first()
        if existing:
            return jsonify({'error': 'Xu hướng tính dục này đã tồn tại'}), 409
        
        # Tạo mới
        new_sexual_orientation = SexualOrientation(name=name)
        db.add(new_sexual_orientation)
        db.commit()
        db.refresh(new_sexual_orientation)
        emit_catalog_changed('sexual_orientation_created', entity='sexual_orientation', entity_id=new_sexual_orientation.id)
        
        result = {
            'id': new_sexual_orientation.id,
            'name': new_sexual_orientation.name,
            'created_at': new_sexual_orientation.created_at.isoformat() if new_sexual_orientation.created_at else None,
            'updated_at': new_sexual_orientation.updated_at.isoformat() if new_sexual_orientation.updated_at else None
        }
        
        return jsonify(result), 201
    except Exception as e:
        return jsonify({'error': f'Lỗi khi tạo xu hướng tính dục: {str(e)}'}), 500

@sexual_orientation_bp.route('/sexual-orientations/<int:sexual_orientation_id>', methods=['PUT'])
@require_auth
def update_sexual_orientation(user, sexual_orientation_id):
    """Cập nhật xu hướng tính dục"""
    try:
        data = request.get_json()
        name = data.get('name')
        
        if not name:
            return jsonify({'error': 'Tên xu hướng tính dục không được để trống'}), 400
        
        db = next(get_db())
        sexual_orientation = db.query(SexualOrientation).filter(SexualOrientation.id == sexual_orientation_id).first()
        
        if not sexual_orientation:
            return jsonify({'error': 'Không tìm thấy xu hướng tính dục'}), 404
        
        # Kiểm tra xem tên mới đã tồn tại chưa (trừ chính nó)
        existing = db.query(SexualOrientation).filter(
            SexualOrientation.name == name,
            SexualOrientation.id != sexual_orientation_id
        ).first()
        if existing:
            return jsonify({'error': 'Xu hướng tính dục này đã tồn tại'}), 409
        
        sexual_orientation.name = name
        db.commit()
        emit_catalog_changed('sexual_orientation_updated', entity='sexual_orientation', entity_id=sexual_orientation.id)
        
        result = {
            'id': sexual_orientation.id,
            'name': sexual_orientation.name,
            'created_at': sexual_orientation.created_at.isoformat() if sexual_orientation.created_at else None,
            'updated_at': sexual_orientation.updated_at.isoformat() if sexual_orientation.updated_at else None
        }
        
        return jsonify(result), 200
    except Exception as e:
        return jsonify({'error': f'Lỗi khi cập nhật xu hướng tính dục: {str(e)}'}), 500

@sexual_orientation_bp.route('/sexual-orientations/<int:sexual_orientation_id>', methods=['DELETE'])
@require_auth
def delete_sexual_orientation(user, sexual_orientation_id):
    """Xóa xu hướng tính dục"""
    try:
        db = next(get_db())
        sexual_orientation = db.query(SexualOrientation).filter(SexualOrientation.id == sexual_orientation_id).first()
        
        if not sexual_orientation:
            return jsonify({'error': 'Không tìm thấy xu hướng tính dục'}), 404
        
        db.delete(sexual_orientation)
        db.commit()
        emit_catalog_changed('sexual_orientation_deleted', entity='sexual_orientation', entity_id=sexual_orientation_id)
        
        return jsonify({'message': 'Đã xóa xu hướng tính dục thành công'}), 200
    except Exception as e:
        return jsonify({'error': f'Lỗi khi xóa xu hướng tính dục: {str(e)}'}), 500
