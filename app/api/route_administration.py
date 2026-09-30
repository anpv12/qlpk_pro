from flask import Blueprint, request, jsonify
from app.core.database import get_db
from app.models.route_administration import RouteAdministration
from app.api.auth import require_auth
from app.realtime.events import emit_inventory_changed
from app.utils.search_normalization import normalized_contains
import logging
from app.utils.api_error_contract import api_error_boundary

logger = logging.getLogger(__name__)

route_administration_bp = Blueprint('route_administration', __name__)


@route_administration_bp.route('/route-administrations/', methods=['GET'])
@require_auth
@api_error_boundary(success=False, detail='Internal server error')
def get_route_administrations(user):
    """Lấy danh sách đường dùng"""
    try:
        db = next(get_db())
        
        # Get query parameters
        search = request.args.get('search', '')
        
        # Build query
        query = db.query(RouteAdministration)
        
        # Apply search filter
        if search:
            query = query.filter(normalized_contains(RouteAdministration.name, search))
        
        # Order by name
        route_administrations = query.order_by(RouteAdministration.name).all()
        
        result = [route_administration.to_dict() for route_administration in route_administrations]
        
        return jsonify({
            'success': True,
            'data': result
        }), 200
        
    finally:
        db.close()


@route_administration_bp.route('/route-administrations/', methods=['POST'])
@require_auth
@api_error_boundary(success=False, detail='Internal server error')
def create_route_administration(user):
    """Tạo đường dùng mới"""
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
        existing_route = db.query(RouteAdministration).filter(RouteAdministration.name == data['name']).first()
        if existing_route:
            return jsonify({
                'success': False,
                'detail': 'Route administration already exists'
            }), 409
        
        # Create new route administration
        route_administration = RouteAdministration(name=data['name'])
        
        db.add(route_administration)
        db.commit()
        db.refresh(route_administration)
        emit_inventory_changed('route_administration_created', entity='route_administration', entity_id=route_administration.id)
        
        return jsonify({
            'success': True,
            'data': route_administration.to_dict()
        }), 201
        
    finally:
        db.close()
