from flask import Blueprint, request, jsonify
from app.core.database import get_db
from app.models.atc_code import ATCCode
from app.api.auth import require_auth
from app.realtime.events import emit_inventory_changed
from app.utils.search_normalization import normalized_contains
import logging

logger = logging.getLogger(__name__)

atc_code_bp = Blueprint('atc_code', __name__)


@atc_code_bp.route('/atc-codes/', methods=['GET'])
@require_auth
def get_atc_codes(user):
    """Lấy danh sách mã ATC"""
    try:
        db = next(get_db())
        
        # Get query parameters
        search = request.args.get('search', '')
        
        # Build query
        query = db.query(ATCCode)
        
        # Apply search filter
        if search:
            query = query.filter(
                normalized_contains(ATCCode.code, search) |
                normalized_contains(ATCCode.name, search)
            )
        
        # Order by code
        atc_codes = query.order_by(ATCCode.code).all()
        
        result = [atc_code.to_dict() for atc_code in atc_codes]
        
        return jsonify({
            'success': True,
            'data': result
        }), 200
        
    except Exception as e:
        logger.error(f"Error getting ATC codes: {e}")
        return jsonify({
            'success': False,
            'detail': 'Internal server error'
        }), 500
    finally:
        db.close()


@atc_code_bp.route('/atc-codes/', methods=['POST'])
@require_auth
def create_atc_code(user):
    """Tạo mã ATC mới"""
    try:
        db = next(get_db())
        data = request.get_json()
        
        # Validate required fields
        if not data.get('code') or not data.get('name'):
            return jsonify({
                'success': False,
                'detail': 'Code and name are required'
            }), 400
        
        # Check if code already exists
        existing_code = db.query(ATCCode).filter(ATCCode.code == data['code']).first()
        if existing_code:
            return jsonify({
                'success': False,
                'detail': 'ATC code already exists'
            }), 409
        
        # Create new ATC code
        atc_code = ATCCode(
            code=data['code'],
            name=data['name']
        )
        
        db.add(atc_code)
        db.commit()
        db.refresh(atc_code)
        emit_inventory_changed('atc_code_created', entity='atc_code', entity_id=atc_code.id)
        
        return jsonify({
            'success': True,
            'data': atc_code.to_dict()
        }), 201
        
    except Exception as e:
        logger.error(f"Error creating ATC code: {e}")
        db.rollback()
        return jsonify({
            'success': False,
            'detail': 'Internal server error'
        }), 500
    finally:
        db.close()
