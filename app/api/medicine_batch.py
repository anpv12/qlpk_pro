from flask import Blueprint, request, jsonify
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from app.core.database import get_db
from app.models.medicine_batch import MedicineBatch
from app.models.medicine import Medicine
from app.api.auth import require_auth
from app.realtime.events import emit_inventory_changed
import logging
from datetime import datetime, date

logger = logging.getLogger(__name__)

medicine_batch_router = Blueprint('medicine_batch', __name__)


def generate_batch_number(db, medicine_id=None):
    """
    Tự động tạo số lô mới (LOT-01, LOT-02...) đảm bảo không trùng trong toàn bộ bảng.
    Bỏ phụ thuộc vào medicine_id vì cột batch_number đang unique toàn cục.
    """
    last_batch = db.query(MedicineBatch).order_by(desc(MedicineBatch.id)).first()
    
    if last_batch and last_batch.batch_number:
        try:
            last_number = int(str(last_batch.batch_number).split('-')[-1])
            new_number = last_number + 1
        except Exception:
            new_number = 1
    else:
        new_number = 1
    
    return f"LOT-{new_number:02d}"


@medicine_batch_router.route('/medicine-batches/', methods=['GET'])
@require_auth
def get_medicine_batches(user):
    """Lấy danh sách lô thuốc"""
    db = next(get_db())
    try:
        # Lấy query parameters
        medicine_id = request.args.get('medicine_id', type=int)
        supplier_id = request.args.get('supplier_id', type=int)
        status = request.args.get('status')  # Bình thường, Sắp hết hạn, Đã hết hạn, Sắp hết
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 50, type=int)
        
        query = db.query(MedicineBatch)
        
        # Lọc theo medicine_id
        if medicine_id:
            query = query.filter(MedicineBatch.medicine_id == medicine_id)
        
        # Lọc theo supplier_id
        if supplier_id:
            query = query.filter(MedicineBatch.supplier_id == supplier_id)
        
        # Lọc theo trạng thái
        if status:
            today = date.today()
            if status == "Đã hết hạn":
                query = query.filter(MedicineBatch.expiry_date < today)
            elif status == "Sắp hết hạn":
                from datetime import timedelta
                query = query.filter(
                    MedicineBatch.expiry_date >= today,
                    MedicineBatch.expiry_date <= today + timedelta(days=30)
                )
            elif status == "Sắp hết":
                query = query.filter(
                    MedicineBatch.remaining_quantity <= MedicineBatch.quantity * 0.1
                )
            elif status == "Bình thường":
                from datetime import timedelta
                query = query.filter(
                    MedicineBatch.expiry_date > today + timedelta(days=30),
                    MedicineBatch.remaining_quantity > MedicineBatch.quantity * 0.1
                )
        
        # Sắp xếp theo FEFO (First Expired First Out)
        query = query.order_by(MedicineBatch.expiry_date.asc(), MedicineBatch.import_date.asc())
        
        # Phân trang
        total = query.count()
        batches = query.offset((page - 1) * per_page).limit(per_page).all()
        
        return jsonify({
            'batches': [batch.to_dict() for batch in batches],
            'total': total,
            'page': page,
            'per_page': per_page,
            'total_pages': (total + per_page - 1) // per_page
        }), 200, {'Content-Type': 'application/json; charset=utf-8'}
    except Exception as e:
        logger.error(f"Lỗi lấy danh sách lô thuốc: {e}")
        return jsonify({'detail': 'Lỗi lấy danh sách lô thuốc', 'error': str(e)}), 500, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()


@medicine_batch_router.route('/medicine-batches/<int:batch_id>', methods=['GET'])
@require_auth
def get_medicine_batch(user, batch_id):
    """Lấy thông tin chi tiết lô thuốc"""
    db = next(get_db())
    try:
        batch = db.query(MedicineBatch).filter(MedicineBatch.id == batch_id).first()
        if not batch:
            return jsonify({'detail': 'Không tìm thấy lô thuốc'}), 404, {'Content-Type': 'application/json; charset=utf-8'}
        
        return jsonify(batch.to_dict()), 200, {'Content-Type': 'application/json; charset=utf-8'}
    except Exception as e:
        logger.error(f"Lỗi lấy thông tin lô thuốc: {e}")
        return jsonify({'detail': 'Lỗi lấy thông tin lô thuốc', 'error': str(e)}), 500, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()


@medicine_batch_router.route('/medicines/<int:medicine_id>/batches', methods=['GET'])
@require_auth
def get_medicine_batches_by_medicine(user, medicine_id):
    """Lấy danh sách lô thuốc theo medicine_id"""
    db = next(get_db())
    try:
        # Kiểm tra thuốc có tồn tại không
        medicine = db.query(Medicine).filter(Medicine.id == medicine_id).first()
        if not medicine:
            return jsonify({'detail': 'Không tìm thấy thuốc'}), 404, {'Content-Type': 'application/json; charset=utf-8'}
        
        # Lấy tất cả lô thuốc của thuốc này, sắp xếp theo FEFO
        batches = db.query(MedicineBatch).filter(
            MedicineBatch.medicine_id == medicine_id
        ).order_by(MedicineBatch.expiry_date.asc(), MedicineBatch.import_date.asc()).all()
        
        # Tính tổng số lượng tồn kho từ các lô
        total_quantity = sum(float(batch.remaining_quantity) for batch in batches)
        
        # Tính giá nhập trung bình (weighted average)
        total_value = 0
        total_qty = 0
        for batch in batches:
            if batch.import_price and batch.remaining_quantity:
                total_value += float(batch.import_price) * float(batch.remaining_quantity)
                total_qty += float(batch.remaining_quantity)
        avg_import_price = total_value / total_qty if total_qty > 0 else None
        
        # Tính giá trị tồn kho
        stock_value = total_value if total_value > 0 else None
        
        return jsonify({
            'medicine_id': medicine_id,
            'medicine_name': medicine.name,
            'batches': [batch.to_dict() for batch in batches],
            'total_batches': len(batches),
            'total_quantity': total_quantity,
            'avg_import_price': avg_import_price,
            'stock_value': stock_value
        }), 200, {'Content-Type': 'application/json; charset=utf-8'}
    except Exception as e:
        logger.error(f"Lỗi lấy danh sách lô thuốc: {e}")
        return jsonify({'detail': 'Lỗi lấy danh sách lô thuốc', 'error': str(e)}), 500, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()


@medicine_batch_router.route('/medicine-batches/', methods=['POST'])
@require_auth
def create_medicine_batch(user):
    """Tạo lô thuốc mới"""
    db = next(get_db())
    try:
        data = request.get_json()
        
        # Validate dữ liệu
        if not data.get('medicine_id'):
            return jsonify({'detail': 'medicine_id là bắt buộc'}), 400, {'Content-Type': 'application/json; charset=utf-8'}
        
        if not data.get('import_date'):
            return jsonify({'detail': 'Ngày nhập kho là bắt buộc'}), 400, {'Content-Type': 'application/json; charset=utf-8'}
        
        if not data.get('expiry_date'):
            return jsonify({'detail': 'Ngày hết hạn là bắt buộc'}), 400, {'Content-Type': 'application/json; charset=utf-8'}
        
        if not data.get('quantity') or float(data.get('quantity', 0)) <= 0:
            return jsonify({'detail': 'Số lượng nhập phải lớn hơn 0'}), 400, {'Content-Type': 'application/json; charset=utf-8'}
        
        # Kiểm tra thuốc có tồn tại không
        medicine = db.query(Medicine).filter(Medicine.id == data['medicine_id']).first()
        if not medicine:
            return jsonify({'detail': 'Không tìm thấy thuốc'}), 404, {'Content-Type': 'application/json; charset=utf-8'}
        
        # Parse dates
        try:
            import_date = datetime.strptime(data['import_date'], '%Y-%m-%d').date()
            expiry_date = datetime.strptime(data['expiry_date'], '%Y-%m-%d').date()
        except:
            return jsonify({'detail': 'Định dạng ngày không hợp lệ (YYYY-MM-DD)'}), 400, {'Content-Type': 'application/json; charset=utf-8'}
        
        # Tạo số lô tự động nếu không có
        batch_number = data.get('batch_number')
        if not batch_number:
            batch_number = generate_batch_number(db, data['medicine_id'])
        else:
            # Kiểm tra số lô đã tồn tại chưa
            existing = db.query(MedicineBatch).filter(MedicineBatch.batch_number == batch_number).first()
            if existing:
                return jsonify({'detail': 'Số lô đã tồn tại'}), 400, {'Content-Type': 'application/json; charset=utf-8'}
        
        # Tạo lô thuốc mới
        batch = MedicineBatch(
            medicine_id=data['medicine_id'],
            batch_number=batch_number,
            import_date=import_date,
            expiry_date=expiry_date,
            quantity=float(data['quantity']),
            remaining_quantity=float(data.get('remaining_quantity', data['quantity'])),
            import_price=float(data['import_price']) if data.get('import_price') else None,
            supplier_id=data.get('supplier_id'),
            invoice_number=data.get('invoice_number'),
            created_by=user.id,
            notes=data.get('notes')
        )
        
        db.add(batch)
        
        # Cập nhật tổng số lượng tồn kho của thuốc (hỗ trợ số thập phân)
        current_stock = float(medicine.stock_quantity) if medicine.stock_quantity else 0.0
        medicine.stock_quantity = current_stock + float(data['quantity'])
        
        db.commit()
        db.refresh(batch)
        emit_inventory_changed('batch_created', entity='medicine_batch', entity_id=batch.id, extra={
            'medicine_id': batch.medicine_id,
        })
        
        return jsonify(batch.to_dict()), 201, {'Content-Type': 'application/json; charset=utf-8'}
    except Exception as e:
        db.rollback()
        logger.error(f"Lỗi tạo lô thuốc: {e}")
        return jsonify({'detail': 'Lỗi tạo lô thuốc', 'error': str(e)}), 500, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()


@medicine_batch_router.route('/medicine-batches/<int:batch_id>', methods=['PUT'])
@require_auth
def update_medicine_batch(user, batch_id):
    """Cập nhật thông tin lô thuốc"""
    db = next(get_db())
    try:
        batch = db.query(MedicineBatch).filter(MedicineBatch.id == batch_id).first()
        if not batch:
            return jsonify({'detail': 'Không tìm thấy lô thuốc'}), 404, {'Content-Type': 'application/json; charset=utf-8'}
        
        data = request.get_json()
        
        old_quantity = float(batch.remaining_quantity)
        
        # Cập nhật các trường
        if 'import_date' in data:
            try:
                batch.import_date = datetime.strptime(data['import_date'], '%Y-%m-%d').date()
            except:
                return jsonify({'detail': 'Định dạng ngày nhập không hợp lệ'}), 400, {'Content-Type': 'application/json; charset=utf-8'}
        
        if 'expiry_date' in data:
            try:
                batch.expiry_date = datetime.strptime(data['expiry_date'], '%Y-%m-%d').date()
            except:
                return jsonify({'detail': 'Định dạng ngày hết hạn không hợp lệ'}), 400, {'Content-Type': 'application/json; charset=utf-8'}
        
        if 'quantity' in data:
            batch.quantity = float(data['quantity'])
        
        if 'remaining_quantity' in data:
            batch.remaining_quantity = float(data['remaining_quantity'])
        
        if 'import_price' in data:
            batch.import_price = float(data['import_price']) if data['import_price'] else None
        
        if 'supplier_id' in data:
            batch.supplier_id = data['supplier_id']
        
        if 'invoice_number' in data:
            batch.invoice_number = data['invoice_number']
        
        if 'notes' in data:
            batch.notes = data['notes']
        
        # Cập nhật tổng số lượng tồn kho của thuốc
        new_quantity = float(batch.remaining_quantity)
        quantity_diff = new_quantity - old_quantity
        if quantity_diff != 0:
            medicine = db.query(Medicine).filter(Medicine.id == batch.medicine_id).first()
            if medicine:
                # Hỗ trợ số thập phân: không dùng int() nữa
                current_stock = float(medicine.stock_quantity) if medicine.stock_quantity else 0.0
                medicine.stock_quantity = current_stock + quantity_diff
        
        db.commit()
        db.refresh(batch)
        emit_inventory_changed('batch_updated', entity='medicine_batch', entity_id=batch.id, extra={
            'medicine_id': batch.medicine_id,
        })
        
        return jsonify(batch.to_dict()), 200, {'Content-Type': 'application/json; charset=utf-8'}
    except Exception as e:
        db.rollback()
        logger.error(f"Lỗi cập nhật lô thuốc: {e}")
        return jsonify({'detail': 'Lỗi cập nhật lô thuốc', 'error': str(e)}), 500, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()


@medicine_batch_router.route('/medicine-batches/<int:batch_id>', methods=['DELETE'])
@require_auth
def delete_medicine_batch(user, batch_id):
    """Xóa lô thuốc"""
    db = next(get_db())
    try:
        batch = db.query(MedicineBatch).filter(MedicineBatch.id == batch_id).first()
        if not batch:
            return jsonify({'detail': 'Không tìm thấy lô thuốc'}), 404, {'Content-Type': 'application/json; charset=utf-8'}
        
        medicine_id = batch.medicine_id
        remaining_qty = float(batch.remaining_quantity)
        
        db.delete(batch)
        
        # Cập nhật tổng số lượng tồn kho của thuốc (hỗ trợ số thập phân)
        medicine = db.query(Medicine).filter(Medicine.id == medicine_id).first()
        if medicine:
            current_stock = float(medicine.stock_quantity) if medicine.stock_quantity else 0.0
            medicine.stock_quantity = max(0.0, current_stock - float(remaining_qty))
        
        db.commit()
        emit_inventory_changed('batch_deleted', entity='medicine_batch', entity_id=batch_id, extra={
            'medicine_id': medicine_id,
        })
        
        return jsonify({'detail': 'Đã xóa lô thuốc thành công'}), 200, {'Content-Type': 'application/json; charset=utf-8'}
    except Exception as e:
        db.rollback()
        logger.error(f"Lỗi xóa lô thuốc: {e}")
        return jsonify({'detail': 'Lỗi xóa lô thuốc', 'error': str(e)}), 500, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()


@medicine_batch_router.route('/medicine-batches/import-order', methods=['POST'])
@require_auth
def import_order(user):
    """Nhập kho theo đơn hàng (nhiều lô cùng lúc)"""
    db = next(get_db())
    try:
        data = request.get_json()
        
        # Validate dữ liệu
        if not data.get('items') or not isinstance(data['items'], list):
            return jsonify({'detail': 'Danh sách thuốc nhập kho là bắt buộc'}), 400, {'Content-Type': 'application/json; charset=utf-8'}
        
        if not data.get('import_date'):
            return jsonify({'detail': 'Ngày nhập kho là bắt buộc'}), 400, {'Content-Type': 'application/json; charset=utf-8'}
        
        try:
            import_date = datetime.strptime(data['import_date'], '%Y-%m-%d').date()
        except:
            return jsonify({'detail': 'Định dạng ngày nhập không hợp lệ (YYYY-MM-DD)'}), 400, {'Content-Type': 'application/json; charset=utf-8'}
        
        supplier_id = data.get('supplier_id')
        invoice_number = data.get('invoice_number')
        
        created_batches = []
        total_value = 0
        
        # Lấy số lô lớn nhất từ database để bắt đầu đếm
        last_batch = db.query(MedicineBatch).order_by(desc(MedicineBatch.id)).first()
        if last_batch and last_batch.batch_number:
            try:
                last_number = int(str(last_batch.batch_number).split('-')[-1])
                batch_counter = last_number
            except Exception:
                batch_counter = 0
        else:
            batch_counter = 0
        
        # Tạo từng lô thuốc
        for item in data['items']:
            if not item.get('medicine_id'):
                continue
            
            if not item.get('expiry_date'):
                continue
            
            if not item.get('quantity') or float(item.get('quantity', 0)) <= 0:
                continue
            
            # Kiểm tra thuốc có tồn tại không
            medicine = db.query(Medicine).filter(Medicine.id == item['medicine_id']).first()
            if not medicine:
                continue
            
            # Parse expiry_date
            try:
                expiry_date = datetime.strptime(item['expiry_date'], '%Y-%m-%d').date()
            except:
                continue
            
            # Tạo số lô tự động
            batch_number = item.get('batch_number')
            if not batch_number or batch_number.strip() == '':
                # Tăng counter và tạo số lô mới
                batch_counter += 1
                batch_number = f"LOT-{batch_counter:02d}"
            else:
                # Kiểm tra số lô đã tồn tại chưa
                existing = db.query(MedicineBatch).filter(MedicineBatch.batch_number == batch_number).first()
                if existing:
                    continue
            
            # Tạo lô thuốc
            batch = MedicineBatch(
                medicine_id=item['medicine_id'],
                batch_number=batch_number,
                import_date=import_date,
                expiry_date=expiry_date,
                quantity=float(item['quantity']),
                remaining_quantity=float(item.get('remaining_quantity', item['quantity'])),
                import_price=float(item['import_price']) if item.get('import_price') else None,
                supplier_id=supplier_id,
                invoice_number=invoice_number,
                created_by=user.id,
                notes=item.get('notes')
            )
            
            db.add(batch)
            
            # Cập nhật tổng số lượng tồn kho của thuốc (hỗ trợ số thập phân)
            current_stock = float(medicine.stock_quantity) if medicine.stock_quantity else 0.0
            medicine.stock_quantity = current_stock + float(item['quantity'])
            
            # Tính tổng giá trị
            if batch.import_price:
                total_value += float(batch.import_price) * float(batch.quantity)
            
            created_batches.append(batch)
        
        db.commit()
        
        # Refresh để lấy ID
        for batch in created_batches:
            db.refresh(batch)
        emit_inventory_changed('import_order_created', entity='medicine_batch', extra={
            'batch_ids': [batch.id for batch in created_batches],
            'medicine_ids': [batch.medicine_id for batch in created_batches],
            'total_batches': len(created_batches),
        })
        
        return jsonify({
            'batches': [batch.to_dict() for batch in created_batches],
            'total_batches': len(created_batches),
            'total_value': total_value
        }), 201, {'Content-Type': 'application/json; charset=utf-8'}
    except Exception as e:
        db.rollback()
        logger.error(f"Lỗi nhập kho theo đơn hàng: {e}")
        return jsonify({'detail': 'Lỗi nhập kho theo đơn hàng', 'error': str(e)}), 500, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()
