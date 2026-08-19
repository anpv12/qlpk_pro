from flask import Blueprint, request, jsonify
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.supplier import Supplier
from app.api.auth import require_auth
from app.realtime.events import emit_inventory_changed
import logging

logger = logging.getLogger(__name__)

supplier_router = Blueprint('supplier', __name__)


@supplier_router.route('/suppliers/', methods=['GET'])
@require_auth
def get_suppliers(user):
    """Lấy danh sách nhà cung cấp"""
    db = next(get_db())
    try:
        # Lấy query parameters
        search = request.args.get('search', '').strip()
        is_active = request.args.get('is_active', type=int)
        
        query = db.query(Supplier)
        
        # Tìm kiếm theo tên
        if search:
            query = query.filter(Supplier.name.ilike(f'%{search}%'))
        
        # Lọc theo trạng thái active
        if is_active is not None:
            query = query.filter(Supplier.is_active == is_active)
        
        suppliers = query.order_by(Supplier.name).all()
        
        return jsonify({
            'suppliers': [supplier.to_dict() for supplier in suppliers],
            'total': len(suppliers)
        }), 200, {'Content-Type': 'application/json; charset=utf-8'}
    except Exception as e:
        logger.error(f"Lỗi lấy danh sách nhà cung cấp: {e}")
        return jsonify({'detail': 'Lỗi lấy danh sách nhà cung cấp', 'error': str(e)}), 500, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()


@supplier_router.route('/suppliers/<int:supplier_id>', methods=['GET'])
@require_auth
def get_supplier(user, supplier_id):
    """Lấy thông tin chi tiết nhà cung cấp"""
    db = next(get_db())
    try:
        supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
        if not supplier:
            return jsonify({'detail': 'Không tìm thấy nhà cung cấp'}), 404, {'Content-Type': 'application/json; charset=utf-8'}
        
        return jsonify(supplier.to_dict()), 200, {'Content-Type': 'application/json; charset=utf-8'}
    except Exception as e:
        logger.error(f"Lỗi lấy thông tin nhà cung cấp: {e}")
        return jsonify({'detail': 'Lỗi lấy thông tin nhà cung cấp', 'error': str(e)}), 500, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()


@supplier_router.route('/suppliers/', methods=['POST'])
@require_auth
def create_supplier(user):
    """Tạo nhà cung cấp mới"""
    db = next(get_db())
    try:
        data = request.get_json()
        
        # Validate dữ liệu
        if not data.get('name'):
            return jsonify({'detail': 'Tên nhà cung cấp là bắt buộc'}), 400, {'Content-Type': 'application/json; charset=utf-8'}
        
        # Kiểm tra tên đã tồn tại chưa
        existing = db.query(Supplier).filter(Supplier.name == data['name']).first()
        if existing:
            return jsonify({'detail': 'Tên nhà cung cấp đã tồn tại'}), 400, {'Content-Type': 'application/json; charset=utf-8'}
        
        # Tạo nhà cung cấp mới
        supplier = Supplier(
            name=data.get('name'),
            phone=data.get('phone'),
            email=data.get('email'),
            address=data.get('address'),
            tax_code=data.get('tax_code'),
            contact_person=data.get('contact_person'),
            notes=data.get('notes'),
            is_active=data.get('is_active', 1)
        )
        
        db.add(supplier)
        db.commit()
        db.refresh(supplier)
        emit_inventory_changed('supplier_created', entity='supplier', entity_id=supplier.id)
        
        return jsonify(supplier.to_dict()), 201, {'Content-Type': 'application/json; charset=utf-8'}
    except Exception as e:
        db.rollback()
        logger.error(f"Lỗi tạo nhà cung cấp: {e}")
        return jsonify({'detail': 'Lỗi tạo nhà cung cấp', 'error': str(e)}), 500, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()


@supplier_router.route('/suppliers/<int:supplier_id>', methods=['PUT'])
@require_auth
def update_supplier(user, supplier_id):
    """Cập nhật thông tin nhà cung cấp"""
    db = next(get_db())
    try:
        supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
        if not supplier:
            return jsonify({'detail': 'Không tìm thấy nhà cung cấp'}), 404, {'Content-Type': 'application/json; charset=utf-8'}
        
        data = request.get_json()
        
        # Validate dữ liệu
        if 'name' in data and data['name']:
            # Kiểm tra tên đã tồn tại chưa (trừ chính nó)
            existing = db.query(Supplier).filter(
                Supplier.name == data['name'],
                Supplier.id != supplier_id
            ).first()
            if existing:
                return jsonify({'detail': 'Tên nhà cung cấp đã tồn tại'}), 400, {'Content-Type': 'application/json; charset=utf-8'}
            supplier.name = data['name']
        
        if 'phone' in data:
            supplier.phone = data['phone']
        if 'email' in data:
            supplier.email = data['email']
        if 'address' in data:
            supplier.address = data['address']
        if 'tax_code' in data:
            supplier.tax_code = data['tax_code']
        if 'contact_person' in data:
            supplier.contact_person = data['contact_person']
        if 'notes' in data:
            supplier.notes = data['notes']
        if 'is_active' in data:
            supplier.is_active = data['is_active']
        
        db.commit()
        db.refresh(supplier)
        emit_inventory_changed('supplier_updated', entity='supplier', entity_id=supplier.id)
        
        return jsonify(supplier.to_dict()), 200, {'Content-Type': 'application/json; charset=utf-8'}
    except Exception as e:
        db.rollback()
        logger.error(f"Lỗi cập nhật nhà cung cấp: {e}")
        return jsonify({'detail': 'Lỗi cập nhật nhà cung cấp', 'error': str(e)}), 500, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()


@supplier_router.route('/suppliers/<int:supplier_id>', methods=['DELETE'])
@require_auth
def delete_supplier(user, supplier_id):
    """Xóa nhà cung cấp"""
    db = next(get_db())
    try:
        supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
        if not supplier:
            return jsonify({'detail': 'Không tìm thấy nhà cung cấp'}), 404, {'Content-Type': 'application/json; charset=utf-8'}
        
        # Kiểm tra xem có lô thuốc nào đang sử dụng nhà cung cấp này không
        from app.models.medicine_batch import MedicineBatch
        batches_count = db.query(MedicineBatch).filter(MedicineBatch.supplier_id == supplier_id).count()
        if batches_count > 0:
            return jsonify({
                'detail': f'Không thể xóa nhà cung cấp này vì đang có {batches_count} lô thuốc sử dụng'
            }), 400, {'Content-Type': 'application/json; charset=utf-8'}
        
        db.delete(supplier)
        db.commit()
        emit_inventory_changed('supplier_deleted', entity='supplier', entity_id=supplier_id)
        
        return jsonify({'detail': 'Đã xóa nhà cung cấp thành công'}), 200, {'Content-Type': 'application/json; charset=utf-8'}
    except Exception as e:
        db.rollback()
        logger.error(f"Lỗi xóa nhà cung cấp: {e}")
        return jsonify({'detail': 'Lỗi xóa nhà cung cấp', 'error': str(e)}), 500, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()
