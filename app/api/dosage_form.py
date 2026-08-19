from flask import Blueprint, request, jsonify
from app.core.database import get_db
from app.models.dosage_form import DosageForm
from app.api.auth import require_auth
from app.realtime.events import emit_inventory_changed
import logging

logger = logging.getLogger(__name__)

dosage_form_bp = Blueprint('dosage_form', __name__)


@dosage_form_bp.route('/dosage-forms/', methods=['GET'])
@require_auth
def get_dosage_forms(user):
    """Lấy danh sách dạng bào chế"""
    try:
        db = next(get_db())
        
        # Get query parameters
        search = request.args.get('search', '')
        
        # Build query
        query = db.query(DosageForm)
        
        # Apply search filter
        if search:
            query = query.filter(DosageForm.name.ilike(f'%{search}%'))
        
        # Order by name
        dosage_forms = query.order_by(DosageForm.name).all()
        
        result = [dosage_form.to_dict() for dosage_form in dosage_forms]
        
        return jsonify({
            'success': True,
            'data': result
        }), 200
        
    except Exception as e:
        logger.error(f"Error getting dosage forms: {e}")
        return jsonify({
            'success': False,
            'detail': 'Internal server error'
        }), 500
    finally:
        db.close()


@dosage_form_bp.route('/dosage-forms/', methods=['POST'])
@require_auth
def create_dosage_form(user):
    """Tạo dạng bào chế mới"""
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
        existing_form = db.query(DosageForm).filter(DosageForm.name == data['name']).first()
        if existing_form:
            return jsonify({
                'success': False,
                'detail': 'Dosage form already exists'
            }), 409
        
        # Create new dosage form
        dosage_form = DosageForm(name=data['name'])
        
        db.add(dosage_form)
        db.commit()
        db.refresh(dosage_form)
        emit_inventory_changed('dosage_form_created', entity='dosage_form', entity_id=dosage_form.id)
        
        return jsonify({
            'success': True,
            'data': dosage_form.to_dict()
        }), 201
        
    except Exception as e:
        logger.error(f"Error creating dosage form: {e}")
        db.rollback()
        return jsonify({
            'success': False,
            'detail': 'Internal server error'
        }), 500
    finally:
        db.close()
