from flask import Blueprint, request, jsonify
from app.core.database import get_db
from app.models.service_category import ServiceCategory
from app.schemas.service_category import ServiceCategoryCreate, ServiceCategoryUpdate
from app.api.auth import require_auth
from app.realtime.events import emit_catalog_changed

import logging
from app.utils.api_error_contract import api_error_boundary

logger = logging.getLogger(__name__)

router = Blueprint('service_categories', __name__, url_prefix='/service-categories')


@router.route('/', methods=['GET'])
@require_auth
@api_error_boundary(detail='Internal server error: {error}')
def list_service_categories(user):
    db = next(get_db())
    try:
        categories = db.query(ServiceCategory).filter(ServiceCategory.is_active == True).all()
        result = []
        for category in categories:
            category_data = {
                'id': category.id,
                'name': category.name,
                'description': category.description,
                'is_active': category.is_active,
                'created_at': category.created_at.isoformat() if category.created_at else None,
                'updated_at': category.updated_at.isoformat() if category.updated_at else None
            }
            result.append(category_data)
        return jsonify(result), 200
    finally:
        db.close()


@router.route('/<int:category_id>', methods=['GET'])
@require_auth
@api_error_boundary(detail='Internal server error: {error}')
def get_service_category(user, category_id):
    db = next(get_db())
    try:
        category = db.query(ServiceCategory).filter(ServiceCategory.id == category_id).first()
        if not category:
            return jsonify({'detail': 'Service category not found'}), 404
        
        result = {
            'id': category.id,
            'name': category.name,
            'description': category.description,
            'is_active': category.is_active,
            'created_at': category.created_at.isoformat() if category.created_at else None,
            'updated_at': category.updated_at.isoformat() if category.updated_at else None
        }
        return jsonify(result), 200
    finally:
        db.close()


@router.route('/', methods=['POST'])
@require_auth
@api_error_boundary(detail='Internal server error: {error}')
def create_service_category(user):
    db = next(get_db())
    try:
        data = request.get_json()
        category_data = ServiceCategoryCreate(**data)
        
        # Check if category name already exists
        existing_category = db.query(ServiceCategory).filter(ServiceCategory.name == category_data.name).first()
        if existing_category:
            return jsonify({'detail': 'Service category with this name already exists'}), 400
        
        new_category = ServiceCategory(
            name=category_data.name,
            description=category_data.description,
            is_active=category_data.is_active
        )
        
        db.add(new_category)
        db.commit()
        db.refresh(new_category)
        emit_catalog_changed('service_category_created', entity='service_category', entity_id=new_category.id)
        
        result = {
            'id': new_category.id,
            'name': new_category.name,
            'description': new_category.description,
            'is_active': new_category.is_active,
            'created_at': new_category.created_at.isoformat() if new_category.created_at else None,
            'updated_at': new_category.updated_at.isoformat() if new_category.updated_at else None
        }
        return jsonify(result), 201
    finally:
        db.close()


@router.route('/<int:category_id>', methods=['PUT'])
@require_auth
@api_error_boundary(detail='Internal server error: {error}')
def update_service_category(user, category_id):
    db = next(get_db())
    try:
        category = db.query(ServiceCategory).filter(ServiceCategory.id == category_id).first()
        if not category:
            return jsonify({'detail': 'Service category not found'}), 404
        
        data = request.get_json()
        update_data = ServiceCategoryUpdate(**data)
        
        # Check if new name conflicts with existing category
        if update_data.name and update_data.name != category.name:
            existing_category = db.query(ServiceCategory).filter(
                ServiceCategory.name == update_data.name,
                ServiceCategory.id != category_id
            ).first()
            if existing_category:
                return jsonify({'detail': 'Service category with this name already exists'}), 400
        
        # Update fields
        if update_data.name is not None:
            category.name = update_data.name
        if update_data.description is not None:
            category.description = update_data.description
        if update_data.is_active is not None:
            category.is_active = update_data.is_active
        
        db.commit()
        db.refresh(category)
        emit_catalog_changed('service_category_updated', entity='service_category', entity_id=category.id)
        
        result = {
            'id': category.id,
            'name': category.name,
            'description': category.description,
            'is_active': category.is_active,
            'created_at': category.created_at.isoformat() if category.created_at else None,
            'updated_at': category.updated_at.isoformat() if category.updated_at else None
        }
        return jsonify(result), 200
    finally:
        db.close()


@router.route('/<int:category_id>', methods=['DELETE'])
@require_auth
@api_error_boundary(detail='Internal server error: {error}')
def delete_service_category(user, category_id):
    db = next(get_db())
    try:
        category = db.query(ServiceCategory).filter(ServiceCategory.id == category_id).first()
        if not category:
            return jsonify({'detail': 'Service category not found'}), 404
        
        # Check if category has associated services
        if category.services:
            service_count = len(category.services)
            service_names = [service.name for service in category.services[:3]]  # Lấy 3 tên đầu
            if service_count > 3:
                service_names.append(f"... và {service_count - 3} dịch vụ khác")
            
            return jsonify({
                'detail': 'Cannot delete category with associated services',
                'message': f'Danh mục "{category.name}" có {service_count} dịch vụ liên quan: {", ".join(service_names)}. Vui lòng xóa hoặc chuyển các dịch vụ này trước khi xóa danh mục.',
                'service_count': service_count,
                'services': [{'id': s.id, 'name': s.name} for s in category.services]
            }), 400
        
        db.delete(category)
        db.commit()
        emit_catalog_changed('service_category_deleted', entity='service_category', entity_id=category_id)
        
        return jsonify({'detail': 'Service category deleted successfully'}), 200
    finally:
        db.close()


@router.route('/import', methods=['POST'])
@require_auth
@api_error_boundary(detail='Internal server error: {error}')
def import_service_categories(user):
    db = next(get_db())
    try:
        if 'file' not in request.files:
            return jsonify({'detail': 'No file uploaded'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'detail': 'No file selected'}), 400
        
        if not file.filename.endswith(('.xlsx', '.xls')):
            return jsonify({'detail': 'File must be Excel format (.xlsx or .xls)'}), 400
        
        # Read Excel file
        import pandas as pd
        
        try:
            df = pd.read_excel(file, header=0)
        except Exception as e:
            logger.warning('Service category import: unreadable Excel file', exc_info=True)
            return jsonify({'detail': f'Error reading Excel file: {str(e)}'}), 400
        
        # Validate columns
        required_columns = ['Tên nhóm dịch vụ', 'Mô tả', 'Trạng thái']
        if not all(col in df.columns for col in required_columns):
            return jsonify({'detail': f'File must contain columns: {", ".join(required_columns)}'}), 400
        
        # Process data
        success_count = 0
        error_count = 0
        errors = []
        
        for index, row in df.iterrows():
            try:
                name = str(row['Tên nhóm dịch vụ']).strip()
                description = str(row['Mô tả']).strip() if pd.notna(row['Mô tả']) else None
                status = str(row['Trạng thái']).strip()
                
                # Validate required fields
                if not name:
                    errors.append(f'Row {index + 2}: Tên nhóm dịch vụ không được để trống')
                    error_count += 1
                    continue
                
                # Check if category already exists
                existing_category = db.query(ServiceCategory).filter(ServiceCategory.name == name).first()
                if existing_category:
                    errors.append(f'Row {index + 2}: Nhóm dịch vụ "{name}" đã tồn tại')
                    error_count += 1
                    continue
                
                # Convert status to boolean
                is_active = status.lower() in ['kích hoạt', 'active', 'true', '1', 'yes']
                
                # Create new category
                new_category = ServiceCategory(
                    name=name,
                    description=description,
                    is_active=is_active
                )
                
                db.add(new_category)
                success_count += 1
                
            except Exception as e:
                logger.warning('Service category import row %s failed', index + 2, exc_info=True)
                errors.append(f'Row {index + 2}: {str(e)}')
                error_count += 1
        
        # Commit if any successful imports
        if success_count > 0:
            db.commit()
            emit_catalog_changed('service_categories_imported', entity='service_category', extra={'success_count': success_count})
        
        result = {
            'success_count': success_count,
            'error_count': error_count,
            'errors': errors
        }
        
        if error_count > 0:
            return jsonify({
                'detail': f'Import completed with {error_count} errors',
                'result': result
            }), 207  # Multi-Status
        else:
            return jsonify({
                'detail': f'Successfully imported {success_count} service groups',
                'result': result
            }), 200
            
    finally:
        db.close() 
