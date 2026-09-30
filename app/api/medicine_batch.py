from flask import Blueprint, request, jsonify
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, desc, or_
from app.core.database import get_db
from app.models.medicine_batch import MedicineBatch
from app.models.medicine import Medicine
from app.api.auth import require_auth
from app.realtime.events import emit_inventory_changed
from app.modules.medicines.services.inventory_service import (
    InventoryValidationError,
    import_batch,
    parse_quantity,
    lock_medicine,
    add_movement,
)
from app.modules.medicines.services.reference_review import can_review_reference
from app.models.medicine_transaction import MedicineTransaction
from app.utils.search_normalization import normalized_contains
import logging
from decimal import Decimal
from datetime import datetime, date

logger = logging.getLogger(__name__)

medicine_batch_router = Blueprint('medicine_batch', __name__)


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
        search = request.args.get('search', '').strip()
        sort = request.args.get('sort', '')
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 50, type=int)
        
        query = db.query(MedicineBatch).options(
            joinedload(MedicineBatch.medicine),
            joinedload(MedicineBatch.supplier),
            joinedload(MedicineBatch.creator),
        )
        
        # Lọc theo tên thuốc hoặc số lô (bảng gộp "Lịch sử nhập & lô")
        if search:
            query = query.join(Medicine, MedicineBatch.medicine_id == Medicine.id).filter(
                or_(
                    normalized_contains(Medicine.name, search),
                    normalized_contains(MedicineBatch.batch_number, search),
                )
            )

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
        
        # Sắp xếp theo FEFO (First Expired First Out); "recent" phục vụ xem lại
        # lần vừa nhập trong panel Lịch sử nhập & lô, không đổi thứ tự mặc định.
        if sort == 'recent':
            query = query.order_by(MedicineBatch.created_at.desc(), MedicineBatch.id.desc())
        else:
            query = query.order_by(MedicineBatch.expiry_date.asc(), MedicineBatch.import_date.asc())
        
        # Phân trang
        total = query.count()
        batches = query.offset((page - 1) * per_page).limit(per_page).all()
        
        can_supply_price = can_review_reference(db, user.id)
        return jsonify({
            'batches': [dict(batch.to_dict(), can_supply_import_price=can_supply_price and batch.import_price is None) for batch in batches],
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
            if batch.import_price is not None and batch.remaining_quantity:
                total_value += float(batch.import_price) * float(batch.remaining_quantity)
                total_qty += float(batch.remaining_quantity)
        avg_import_price = total_value / total_qty if total_qty > 0 else None
        
        # Tính giá trị tồn kho
        missing_cost_quantity = sum(float(b.remaining_quantity) for b in batches if b.import_price is None)
        stock_value = total_value if missing_cost_quantity == 0 else None
        
        return jsonify({
            'medicine_id': medicine_id,
            'medicine_name': medicine.name,
            'unit': medicine.unit,
            'batches': [batch.to_dict() for batch in batches],
            'total_batches': len(batches),
            'total_quantity': total_quantity,
            'avg_import_price': avg_import_price,
            'stock_value': stock_value,
            'known_stock_value': total_value,
            'missing_cost_quantity': missing_cost_quantity,
            'aggregate_quantity': float(medicine.stock_quantity or 0),
            'stock_difference': float(medicine.stock_quantity or 0) - total_quantity,
            'synthetic_receipts': sum(b.batch_number.startswith('SEED-LOCAL-') for b in batches),
            'distinct_lots': len({(b.batch_number, b.expiry_date) for b in batches}),
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
        data = request.get_json() or {}
        
        # Validate dữ liệu
        if not data.get('medicine_id'):
            return jsonify({'detail': 'medicine_id là bắt buộc'}), 400, {'Content-Type': 'application/json; charset=utf-8'}
        
        if not data.get('import_date'):
            return jsonify({'detail': 'Ngày nhập kho là bắt buộc'}), 400, {'Content-Type': 'application/json; charset=utf-8'}
        
        if not data.get('expiry_date'):
            return jsonify({'detail': 'Ngày hết hạn là bắt buộc'}), 400, {'Content-Type': 'application/json; charset=utf-8'}
        
        try:
            quantity = float(data.get('quantity', 0))
        except (TypeError, ValueError):
            quantity = 0
        if quantity <= 0:
            return jsonify({'detail': 'Số lượng nhập phải lớn hơn 0'}), 400, {'Content-Type': 'application/json; charset=utf-8'}
        
        # Kiểm tra thuốc có tồn tại không
        medicine = db.query(Medicine).filter(Medicine.id == data['medicine_id']).first()
        if not medicine:
            return jsonify({'detail': 'Không tìm thấy thuốc'}), 404, {'Content-Type': 'application/json; charset=utf-8'}
        
        # Parse dates
        try:
            import_date = datetime.strptime(data['import_date'], '%Y-%m-%d').date()
            expiry_date = datetime.strptime(data['expiry_date'], '%Y-%m-%d').date()
        except (KeyError, TypeError, ValueError):
            return jsonify({'detail': 'Định dạng ngày không hợp lệ (YYYY-MM-DD)'}), 400, {'Content-Type': 'application/json; charset=utf-8'}
        
        if 'remaining_quantity' in data:
            raise InventoryValidationError('Không truyền tồn lô trực tiếp; chỉ nhập số lượng trên phiếu nhập')

        _, batch, movement = import_batch(
            db,
            medicine_id=int(data['medicine_id']),
            batch_number=data.get('batch_number'),
            import_date=import_date,
            expiry_date=expiry_date,
            quantity=data['quantity'],
            import_price=data.get('import_price'),
            supplier_id=data.get('supplier_id'),
            invoice_number=data.get('invoice_number'),
            notes=data.get('notes'),
            created_by=user.id,
        )
        
        db.commit()
        db.refresh(batch)
        emit_inventory_changed('batch_created', entity='medicine_batch', entity_id=batch.id, extra={
            'medicine_id': batch.medicine_id,
        })
        
        return jsonify(batch.to_dict()), 201, {'Content-Type': 'application/json; charset=utf-8'}
    except (InventoryValidationError, LookupError) as e:
        db.rollback()
        return jsonify({'detail': str(e), 'code': 'inventory.receipt_invalid'}), 400, {'Content-Type': 'application/json; charset=utf-8'}
    except Exception as e:
        db.rollback()
        logger.error(f"Lỗi tạo lô thuốc: {e}")
        return jsonify({'detail': 'Lỗi tạo lô thuốc', 'error': str(e)}), 500, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()


@medicine_batch_router.route('/medicine-batches/<int:batch_id>/import-price', methods=['POST'])
@require_auth
def supply_missing_import_price(user, batch_id):
    db = next(get_db())
    try:
        if not can_review_reference(db, user.id):
            return jsonify(detail='Bạn không có quyền truy cập Tủ thuốc.'), 403
        data = request.get_json() or {}
        if not isinstance(data, dict) or set(data) != {'import_price'}:
            raise InventoryValidationError('Chỉ bổ sung đơn giá nhập còn thiếu.')
        price = parse_quantity(data['import_price'], 'Đơn giá nhập')
        if price > Decimal('99999999.99'):
            raise InventoryValidationError('Đơn giá nhập vượt giới hạn cho phép.')
        medicine_id = db.query(MedicineBatch.medicine_id).filter_by(id=batch_id).scalar()
        if medicine_id is None:
            return jsonify(detail='Không tìm thấy lô thuốc.'), 404
        medicine = lock_medicine(db, medicine_id)
        batch = db.query(MedicineBatch).filter_by(id=batch_id).populate_existing().with_for_update().one_or_none()
        if batch is None:
            return jsonify(detail='Không tìm thấy lô thuốc.'), 404
        if batch.import_price is not None:
            return jsonify(detail='Lô đã có giá nhập. Hãy tải lại lịch sử nhập; không được ghi đè.'), 409
        batch.import_price = price
        add_movement(db, medicine_id=medicine_id, batch_id=batch.id,
                     movement_type='adjustment', quantity=0, price=price,
                     note=f'Bổ sung giá nhập còn thiếu: chưa ghi nhận → {price}; không thay đổi tồn hoặc giá vốn giao dịch cũ.',
                     created_by=user.id, balance_after=batch.remaining_quantity,
                     stock_balance_after=medicine.stock_quantity)
        db.commit()
        emit_inventory_changed('batch_updated', entity='medicine_batch', entity_id=batch.id,
                               extra={'medicine_id': medicine_id})
        return jsonify(success=True, batch=batch.to_dict()), 200
    except InventoryValidationError as error:
        db.rollback()
        return jsonify(detail=str(error)), 400
    except Exception:
        db.rollback()
        logger.exception('Không thể bổ sung giá nhập lô')
        return jsonify(detail='Không thể bổ sung giá nhập. Hãy tải lại để kiểm tra.'), 500
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
        
        data = request.get_json() or {}

        if 'quantity' in data or 'remaining_quantity' in data:
            return jsonify({
                'detail': 'Không được sửa trực tiếp số lượng lô đã ghi nhận.',
                'code': 'inventory.batch_balance_readonly',
            }), 409, {'Content-Type': 'application/json; charset=utf-8'}
        
        immutable = {'medicine_id', 'batch_number', 'import_date', 'expiry_date',
                     'import_price', 'supplier_id', 'invoice_number'}
        if immutable.intersection(data):
            return jsonify({
                'detail': 'Thông tin lần nhập đã ghi sổ không được sửa đè, kể cả giá nhập. Hãy đối soát chứng từ nếu nhập sai.',
                'code': 'inventory.receipt_readonly',
            }), 409

        if 'notes' in data:
            batch.notes = data['notes']
        
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

        movement_count = db.query(MedicineTransaction).filter(
            MedicineTransaction.batch_id == batch_id
        ).count()
        if movement_count > 0:
            return jsonify({
                'detail': 'Không thể xóa lô đã có lịch sử nhập/xuất/điều chỉnh',
                'code': 'inventory.batch_has_movements',
            }), 409, {'Content-Type': 'application/json; charset=utf-8'}
        if remaining_qty > 0:
            return jsonify({
                'detail': 'Không thể xóa lô còn tồn.',
                'code': 'inventory.batch_has_balance',
            }), 409, {'Content-Type': 'application/json; charset=utf-8'}

        # A zero-balance legacy lot without movements is safe to remove; no
        # aggregate delta is applied because its balance is already zero.
        db.delete(batch)
        
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


def _normalize_import_order_items(data, db):
    normalized_items = []
    # Validate every row before writing anything.  The old implementation
    # silently skipped invalid rows, which made an order look successful
    # while its aggregate was only partially updated.
    for index, item in enumerate(data['items']):
        if not isinstance(item, dict) or not item.get('medicine_id'):
            raise InventoryValidationError(f"Dòng {index + 1}: medicine_id là bắt buộc")
        try:
            medicine_id = int(item['medicine_id'])
        except (TypeError, ValueError):
            raise InventoryValidationError(f"Dòng {index + 1}: medicine_id không hợp lệ")
        if not db.query(Medicine.id).filter(Medicine.id == medicine_id).first():
            raise LookupError(f"Dòng {index + 1}: Không tìm thấy thuốc")
        if not item.get('expiry_date'):
            raise InventoryValidationError(f"Dòng {index + 1}: Hạn sử dụng là bắt buộc")
        try:
            expiry_date = datetime.strptime(item['expiry_date'], '%Y-%m-%d').date()
        except (TypeError, ValueError):
            raise InventoryValidationError(f"Dòng {index + 1}: Định dạng hạn sử dụng không hợp lệ")
        quantity = parse_quantity(item.get('quantity'), f"Dòng {index + 1}: Số lượng nhập", allow_zero=False)
        batch_number = str(item.get('batch_number') or '').strip()
        if 'remaining_quantity' in item:
            raise InventoryValidationError(f'Dòng {index + 1}: Không truyền tồn lô trực tiếp')
        import_price = parse_quantity(item.get('import_price'), f'Dòng {index + 1}: Đơn giá nhập')

        normalized_items.append({
            'index': index,
            'medicine_id': medicine_id,
            'batch_number': batch_number,
            'expiry_date': expiry_date,
            'quantity': quantity,
            'import_price': import_price,
            'notes': item.get('notes') or data.get('notes'),
        })
    return normalized_items


@medicine_batch_router.route('/medicine-batches/import-order', methods=['POST'])
@require_auth
def import_order(user):
    """Nhập kho theo đơn hàng (nhiều lô cùng lúc)"""
    db = next(get_db())
    try:
        data = request.get_json() or {}
        
        # Validate dữ liệu
        if not data.get('items') or not isinstance(data['items'], list):
            return jsonify({'detail': 'Danh sách thuốc nhập kho là bắt buộc'}), 400, {'Content-Type': 'application/json; charset=utf-8'}
        
        if not data.get('import_date'):
            return jsonify({'detail': 'Ngày nhập kho là bắt buộc'}), 400, {'Content-Type': 'application/json; charset=utf-8'}
        
        try:
            import_date = datetime.strptime(data['import_date'], '%Y-%m-%d').date()
        except (KeyError, TypeError, ValueError):
            return jsonify({'detail': 'Định dạng ngày nhập không hợp lệ (YYYY-MM-DD)'}), 400, {'Content-Type': 'application/json; charset=utf-8'}
        
        supplier_id = data.get('supplier_id')
        invoice_number = data.get('invoice_number')
        
        normalized_items = _normalize_import_order_items(data, db)

        created_by_index = {}
        total_value = 0
        # Lock medicines in deterministic order to avoid deadlocks when two
        # users import the same medicines in different UI row orders.
        for item in sorted(normalized_items, key=lambda row: (row['medicine_id'], row['index'])):
            _, batch, _ = import_batch(
                db,
                medicine_id=item['medicine_id'],
                batch_number=item['batch_number'],
                import_date=import_date,
                expiry_date=item['expiry_date'],
                quantity=item['quantity'],
                import_price=item['import_price'],
                supplier_id=supplier_id,
                invoice_number=invoice_number,
                notes=item['notes'],
                created_by=user.id,
            )
            created_by_index[item['index']] = batch
            if item['import_price'] is not None:
                total_value += float(item['import_price']) * float(item['quantity'])
        
        db.commit()
        
        # Refresh để lấy ID
        created_batches = [created_by_index[index] for index in range(len(normalized_items))]
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
    except (InventoryValidationError, LookupError) as e:
        db.rollback()
        return jsonify({'detail': str(e), 'code': 'inventory.receipt_invalid'}), 400, {'Content-Type': 'application/json; charset=utf-8'}
    except Exception as e:
        db.rollback()
        logger.error(f"Lỗi nhập kho theo đơn hàng: {e}")
        return jsonify({'detail': 'Lỗi nhập kho theo đơn hàng', 'error': str(e)}), 500, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()
