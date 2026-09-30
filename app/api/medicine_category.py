from flask import Blueprint, request, jsonify
from app.core.database import get_db
from app.models.medicine_category import MedicineCategory
from app.api.auth import require_auth
from app.realtime.events import emit_inventory_changed
from app.utils.search_normalization import normalized_contains
import logging
from app.utils.api_error_contract import api_error_boundary

logger = logging.getLogger(__name__)

medicine_category_router = Blueprint('medicine_category', __name__)


@medicine_category_router.route('/medicine-categories/', methods=['GET'])
@require_auth
@api_error_boundary(error='Lỗi khi lấy danh sách danh mục thuốc')
def get_medicine_categories(user):
    """Lấy danh sách danh mục thuốc"""
    try:
        db = next(get_db())
        
        # Get query parameters
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 10, type=int)
        search = request.args.get('search', '')
        status = request.args.get('status', '')
        
        # Build query
        query = db.query(MedicineCategory)
        
        # Apply filters
        if search:
            query = query.filter(
                normalized_contains(MedicineCategory.name, search) |
                normalized_contains(MedicineCategory.description, search)
            )
            
        if status:
            if status == 'active':
                query = query.filter(MedicineCategory.is_active == True)
            elif status == 'inactive':
                query = query.filter(MedicineCategory.is_active == False)
        
        # Get total count
        total = query.count()
        
        # Apply pagination
        categories = query.offset((page - 1) * per_page).limit(per_page).all()
        
        # Convert to dict
        categories_data = [category.to_dict() for category in categories]
        
        return jsonify({
            'categories': categories_data,
            'total': total,
            'page': page,
            'per_page': per_page,
            'total_pages': (total + per_page - 1) // per_page
        })
        
    finally:
        db.close()


@medicine_category_router.route('/medicine-categories/', methods=['POST'])
@require_auth
@api_error_boundary(error='Lỗi khi tạo danh mục thuốc')
def create_medicine_category(user):
    """Tạo danh mục thuốc mới"""
    try:
        db = next(get_db())
        data = request.get_json()
        
        # Validate required fields
        if not data.get('name'):
            return jsonify({"error": "Tên danh mục là bắt buộc"}), 400
        
        # Check if name already exists
        existing_category = db.query(MedicineCategory).filter(
            MedicineCategory.name == data['name']
        ).first()
        
        if existing_category:
            return jsonify({"error": "Tên danh mục đã tồn tại"}), 400
        
        # Create new category
        category = MedicineCategory(
            name=data['name'],
            description=data.get('description', ''),
            is_active=data.get('is_active', True)
        )
        
        db.add(category)
        db.commit()
        db.refresh(category)
        emit_inventory_changed('medicine_category_created', entity='medicine_category', entity_id=category.id)
        
        return jsonify({
            "message": "Tạo danh mục thuốc thành công",
            "category": category.to_dict()
        }), 201
        
    finally:
        db.close()


@medicine_category_router.route('/medicine-categories/<int:category_id>', methods=['GET'])
@require_auth
@api_error_boundary(error='Lỗi khi lấy thông tin danh mục thuốc')
def get_medicine_category(user, category_id):
    """Lấy thông tin danh mục thuốc theo ID"""
    try:
        db = next(get_db())
        
        category = db.query(MedicineCategory).filter(
            MedicineCategory.id == category_id
        ).first()
        
        if not category:
            return jsonify({"error": "Không tìm thấy danh mục thuốc"}), 404
        
        return jsonify(category.to_dict())
        
    finally:
        db.close()


@medicine_category_router.route('/medicine-categories/<int:category_id>', methods=['PUT'])
@require_auth
@api_error_boundary(error='Lỗi khi cập nhật danh mục thuốc')
def update_medicine_category(user, category_id):
    """Cập nhật thông tin danh mục thuốc"""
    try:
        db = next(get_db())
        data = request.get_json()
        
        category = db.query(MedicineCategory).filter(
            MedicineCategory.id == category_id
        ).first()
        
        if not category:
            return jsonify({"error": "Không tìm thấy danh mục thuốc"}), 404
        
        # Check if new name conflicts with existing
        if 'name' in data and data['name'] != category.name:
            existing_category = db.query(MedicineCategory).filter(
                MedicineCategory.name == data['name']
            ).first()
            
            if existing_category:
                return jsonify({"error": "Tên danh mục đã tồn tại"}), 400
        
        # Update fields
        if 'name' in data:
            category.name = data['name']
        if 'description' in data:
            category.description = data['description']
        if 'is_active' in data:
            category.is_active = data['is_active']
        
        db.commit()
        db.refresh(category)
        emit_inventory_changed('medicine_category_updated', entity='medicine_category', entity_id=category.id)
        
        return jsonify({
            "message": "Cập nhật danh mục thuốc thành công",
            "category": category.to_dict()
        })
        
    finally:
        db.close()


@medicine_category_router.route('/medicine-categories/<int:category_id>', methods=['DELETE'])
@require_auth
@api_error_boundary(error='Lỗi khi xóa danh mục thuốc')
def delete_medicine_category(user, category_id):
    """Xóa danh mục thuốc"""
    try:
        db = next(get_db())
        
        category = db.query(MedicineCategory).filter(
            MedicineCategory.id == category_id
        ).first()
        
        if not category:
            return jsonify({"error": "Không tìm thấy danh mục thuốc"}), 404
        
        # Note: Không còn kiểm tra category_id vì đã không dùng nữa
        
        db.delete(category)
        db.commit()
        emit_inventory_changed('medicine_category_deleted', entity='medicine_category', entity_id=category_id)
        
        return jsonify({"message": "Xóa danh mục thuốc thành công"})
        
    finally:
        db.close()


@medicine_category_router.route('/medicine-categories/active', methods=['GET'])
@require_auth
@api_error_boundary(error='Lỗi khi lấy danh sách danh mục thuốc')
def get_active_medicine_categories(user):
    """Lấy danh sách danh mục thuốc đang hoạt động (cho dropdown)"""
    try:
        db = next(get_db())
        
        categories = db.query(MedicineCategory).filter(
            MedicineCategory.is_active == True
        ).order_by(MedicineCategory.name).all()
        
        # Convert to simple format for dropdown
        categories_data = [
            {'value': category.id, 'label': category.name}
            for category in categories
        ]
        
        return jsonify(categories_data)
        
    finally:
        db.close()
