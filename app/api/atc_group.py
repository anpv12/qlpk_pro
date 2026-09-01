from flask import Blueprint, request, jsonify
from app.core.database import get_db
from app.models.atc_group import ATCGroup
from app.api.auth import require_auth
from app.realtime.events import emit_inventory_changed
from app.utils.search_normalization import normalized_contains
import logging

logger = logging.getLogger(__name__)

atc_group_bp = Blueprint('atc_group', __name__)


@atc_group_bp.route('/atc-groups/', methods=['GET'])
@require_auth
def get_atc_groups(user):
    """Lấy danh sách nhóm thuốc"""
    try:
        db = next(get_db())
        
        # Get query parameters
        search = request.args.get('search', '')
        
        # Build query
        query = db.query(ATCGroup)
        
        # Apply search filter
        if search:
            query = query.filter(normalized_contains(ATCGroup.name, search))
        
        # Order by name
        atc_groups = query.order_by(ATCGroup.name).all()
        
        result = [atc_group.to_dict() for atc_group in atc_groups]
        
        return jsonify({
            'success': True,
            'data': result
        }), 200
        
    except Exception as e:
        logger.error(f"Error getting ATC groups: {e}")
        return jsonify({
            'success': False,
            'detail': 'Internal server error'
        }), 500
    finally:
        db.close()


@atc_group_bp.route('/atc-groups/', methods=['POST'])
@require_auth
def create_atc_group(user):
    """Tạo nhóm thuốc mới"""
    try:
        db = next(get_db())
        data = request.get_json()
        
        # Validate required fields
        if not data.get('name'):
            return jsonify({
                'success': False,
                'detail': 'Name is required'
            }), 400
        
        # Check if name already exists
        existing_group = db.query(ATCGroup).filter(ATCGroup.name == data['name']).first()
        if existing_group:
            return jsonify({
                'success': False,
                'detail': 'Nhóm thuốc đã tồn tại'
            }), 409
        
        # Create new nhóm thuốc
        atc_group = ATCGroup(name=data['name'])
        
        db.add(atc_group)
        db.commit()
        db.refresh(atc_group)
        emit_inventory_changed('atc_group_created', entity='atc_group', entity_id=atc_group.id)
        
        return jsonify({
            'success': True,
            'data': atc_group.to_dict()
        }), 201
        
    except Exception as e:
        logger.error(f"Error creating nhóm thuốc: {e}")
        db.rollback()
        return jsonify({
            'success': False,
            'detail': 'Internal server error'
        }), 500
    finally:
        db.close()
