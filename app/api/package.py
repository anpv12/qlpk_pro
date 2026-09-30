from flask import Blueprint, request, jsonify
from app.core.database import get_db
from app.models.package import Package
from app.schemas.package import PackageCreate, PackageUpdate
from app.api.auth import require_auth
from app.realtime.events import emit_catalog_changed

import logging
from app.utils.api_error_contract import api_error_boundary

logger = logging.getLogger(__name__)

router = Blueprint('packages', __name__, url_prefix='/packages')


@router.route('/', methods=['GET'])
@require_auth
@api_error_boundary(detail='Internal server error: {error}')
def list_packages(user):
    db = next(get_db())
    try:
        packages = db.query(Package).filter(Package.is_active == True).all()
        result = []
        for package in packages:
            package_data = {
                'id': package.id,
                'name': package.name,
                'description': package.description,
                'price': package.price,
                'duration_minutes': package.duration_minutes,
                'is_active': package.is_active,
                'created_at': package.created_at.isoformat() if package.created_at else None,
                'updated_at': package.updated_at.isoformat() if package.updated_at else None
            }
            result.append(package_data)
        return jsonify(result), 200
    finally:
        db.close()


@router.route('/<int:package_id>', methods=['GET'])
@require_auth
@api_error_boundary(detail='Internal server error: {error}')
def get_package(user, package_id):
    db = next(get_db())
    try:
        package = db.query(Package).filter(Package.id == package_id).first()
        if not package:
            return jsonify({'detail': 'Package not found'}), 404
        
        result = {
            'id': package.id,
            'name': package.name,
            'description': package.description,
            'price': package.price,
            'duration_minutes': package.duration_minutes,
            'is_active': package.is_active,
            'created_at': package.created_at.isoformat() if package.created_at else None,
            'updated_at': package.updated_at.isoformat() if package.updated_at else None
        }
        return jsonify(result), 200
    finally:
        db.close()


@router.route('/', methods=['POST'])
@require_auth
@api_error_boundary(detail='Internal server error: {error}')
def create_package(user):
    db = next(get_db())
    try:
        data = request.get_json()
        package_data = PackageCreate(**data)
        
        # Check if package name already exists
        existing_package = db.query(Package).filter(Package.name == package_data.name).first()
        if existing_package:
            return jsonify({'detail': 'Package with this name already exists'}), 400
        
        new_package = Package(
            name=package_data.name,
            description=package_data.description,
            price=package_data.price,
            duration_minutes=package_data.duration_minutes,
            is_active=package_data.is_active
        )
        
        db.add(new_package)
        db.commit()
        db.refresh(new_package)
        emit_catalog_changed('package_created', entity='package', entity_id=new_package.id)
        
        result = {
            'id': new_package.id,
            'name': new_package.name,
            'description': new_package.description,
            'price': new_package.price,
            'duration_minutes': new_package.duration_minutes,
            'is_active': new_package.is_active,
            'created_at': new_package.created_at.isoformat() if new_package.created_at else None,
            'updated_at': new_package.updated_at.isoformat() if new_package.updated_at else None
        }
        return jsonify(result), 201
    finally:
        db.close()


@router.route('/<int:package_id>', methods=['PUT'])
@require_auth
@api_error_boundary(detail='Internal server error: {error}')
def update_package(user, package_id):
    db = next(get_db())
    try:
        package = db.query(Package).filter(Package.id == package_id).first()
        if not package:
            return jsonify({'detail': 'Package not found'}), 404
        
        data = request.get_json()
        update_data = PackageUpdate(**data)
        
        # Check if new name conflicts with existing package
        if update_data.name and update_data.name != package.name:
            existing_package = db.query(Package).filter(
                Package.name == update_data.name,
                Package.id != package_id
            ).first()
            if existing_package:
                return jsonify({'detail': 'Package with this name already exists'}), 400
        
        # Update fields
        if update_data.name is not None:
            package.name = update_data.name
        if update_data.description is not None:
            package.description = update_data.description
        if update_data.price is not None:
            package.price = update_data.price
        if update_data.duration_minutes is not None:
            package.duration_minutes = update_data.duration_minutes
        if update_data.is_active is not None:
            package.is_active = update_data.is_active
        
        db.commit()
        db.refresh(package)
        emit_catalog_changed('package_updated', entity='package', entity_id=package.id)
        
        result = {
            'id': package.id,
            'name': package.name,
            'description': package.description,
            'price': package.price,
            'duration_minutes': package.duration_minutes,
            'is_active': package.is_active,
            'created_at': package.created_at.isoformat() if package.created_at else None,
            'updated_at': package.updated_at.isoformat() if package.updated_at else None
        }
        return jsonify(result), 200
    finally:
        db.close()


@router.route('/<int:package_id>', methods=['DELETE'])
@require_auth
@api_error_boundary(detail='Internal server error: {error}')
def delete_package(user, package_id):
    db = next(get_db())
    try:
        package = db.query(Package).filter(Package.id == package_id).first()
        if not package:
            return jsonify({'detail': 'Package not found'}), 404
        
        # Check if package has associated appointments
        if package.appointments:
            return jsonify({'detail': 'Cannot delete package with associated appointments'}), 400
        
        db.delete(package)
        db.commit()
        emit_catalog_changed('package_deleted', entity='package', entity_id=package_id)
        
        return jsonify({'detail': 'Package deleted successfully'}), 200
    finally:
        db.close() 
