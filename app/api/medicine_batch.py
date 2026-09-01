from flask import Blueprint, request, jsonify
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, desc
from app.core.database import get_db
from app.models.medicine_batch import MedicineBatch
from app.models.medicine import Medicine
from app.api.auth import require_auth
from app.realtime.events import emit_inventory_changed
from app.modules.medicines.services.inventory_service import (
    InventoryValidationError,
    adjust_batch,
    import_batch,
    parse_quantity,
)
from app.models.medicine_transaction import MedicineTransaction
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
        
        query = db.query(MedicineBatch).options(
            joinedload(MedicineBatch.medicine),
            joinedload(MedicineBatch.supplier),
            joinedload(MedicineBatch.creator),
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
        
        # remaining_quantity is deliberately ignored: a new lot starts with
        # its full imported quantity and the service records the import ledger.
        import_price = data.get('import_price')
        if import_price in (None, ''):
            import_price = None
        else:
            try:
                import_price = float(import_price)
            except (TypeError, ValueError):
                return jsonify({'detail': 'Giá nhập không hợp lệ'}), 400, {'Content-Type': 'application/json; charset=utf-8'}
            if import_price < 0:
                return jsonify({'detail': 'Giá nhập không được âm'}), 400, {'Content-Type': 'application/json; charset=utf-8'}

        _, batch, movement = import_batch(
            db,
            medicine_id=int(data['medicine_id']),
            batch_number=batch_number,
            import_date=import_date,
            expiry_date=expiry_date,
            quantity=data['quantity'],
            import_price=import_price,
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
        return jsonify({'detail': str(e)}), 400, {'Content-Type': 'application/json; charset=utf-8'}
    except Exception as e:
        db.rollback()
        logger.error(f"Lỗi tạo lô thuốc: {e}")
        return jsonify({'detail': 'Lỗi tạo lô thuốc', 'error': str(e)}), 500, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()


@medicine_batch_router.route('/medicine-batches/inventory-count', methods=['POST'])
@require_auth
def inventory_count_by_batch(user):
    """Adjust counted quantities per lot and append adjustment movements."""

    db = next(get_db())
    try:
        data = request.get_json() or {}
        adjustments = data.get('adjustments')
        if not isinstance(adjustments, list) or not adjustments:
            return jsonify({'detail': 'Danh sách kiểm kê theo lô là bắt buộc'}), 400

        normalized_adjustments = []
        seen_batch_ids = set()
        for item in adjustments:
            if not isinstance(item, dict) or not item.get('batch_id'):
                return jsonify({
                    'detail': 'Mỗi dòng kiểm kê phải có batch_id',
                    'code': 'inventory.batch_required',
                }), 400
            try:
                batch_id = int(item['batch_id'])
            except (TypeError, ValueError):
                return jsonify({'detail': 'batch_id không hợp lệ'}), 400
            if batch_id in seen_batch_ids:
                return jsonify({'detail': 'Không được gửi trùng một lô trong cùng lượt kiểm kê'}), 400
            seen_batch_ids.add(batch_id)
            normalized_adjustments.append((batch_id, item))

        results_by_batch_id = {}
        # Stable order keeps concurrent multi-lot counts from locking rows in
        # different orders.  The response remains in the caller's order.
        ordered = sorted(normalized_adjustments, key=lambda pair: pair[0])
        for batch_id, item in ordered:
            try:
                medicine, batch, movement, old_quantity, new_quantity = adjust_batch(
                    db,
                    batch_id=batch_id,
                    actual_quantity=item.get('actual_quantity'),
                    delta=item.get('delta'),
                    note=item.get('note', ''),
                    created_by=user.id,
                )
            except (InventoryValidationError, LookupError, ValueError) as exc:
                db.rollback()
                return jsonify({'detail': str(exc)}), 400

            results_by_batch_id[batch.id] = {
                'batch_id': batch.id,
                'medicine_id': medicine.id,
                'medicine_name': medicine.name,
                'batch_number': batch.batch_number,
                'old_quantity': float(old_quantity),
                'new_quantity': float(new_quantity),
                'difference': float(new_quantity - old_quantity),
                'transaction_id': movement.id if movement else None,
            }

        # Return the same order the caller submitted, while the writes above
        # still use a stable lock order.
        results = [results_by_batch_id[batch_id] for batch_id, _ in normalized_adjustments]

        db.commit()
        emit_inventory_changed('inventory_counted', entity='medicine_batch', extra={
            'batch_ids': [item['batch_id'] for item in results],
            'adjustments': results,
        })
        return jsonify({
            'success': True,
            'message': f'Điều chỉnh thành công {len(results)} lô thuốc',
            'adjustments': results,
        }), 200
    except Exception as e:
        db.rollback()
        logger.error(f'Lỗi kiểm kê theo lô: {e}')
        return jsonify({'detail': 'Lỗi kiểm kê theo lô', 'error': str(e)}), 500
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
                'detail': 'Không được sửa trực tiếp số lượng lô. Hãy dùng kiểm kê theo lô để tạo adjustment.',
                'code': 'inventory.batch_balance_readonly',
                'adjustment_url': '/api/medicine-batches/inventory-count',
            }), 409, {'Content-Type': 'application/json; charset=utf-8'}
        
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
        
        if 'import_price' in data:
            batch.import_price = float(data['import_price']) if data['import_price'] else None
        
        if 'supplier_id' in data:
            batch.supplier_id = data['supplier_id']
        
        if 'invoice_number' in data:
            batch.invoice_number = data['invoice_number']
        
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
                'detail': 'Không thể xóa lô còn tồn. Hãy kiểm kê/điều chỉnh theo lô trước.',
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
        except:
            return jsonify({'detail': 'Định dạng ngày nhập không hợp lệ (YYYY-MM-DD)'}), 400, {'Content-Type': 'application/json; charset=utf-8'}
        
        supplier_id = data.get('supplier_id')
        invoice_number = data.get('invoice_number')
        
        normalized_items = []
        seen_batch_numbers = set()
        
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
            if not batch_number:
                batch_counter += 1
                batch_number = f"LOT-{batch_counter:02d}"
            if batch_number in seen_batch_numbers or db.query(MedicineBatch.id).filter(
                MedicineBatch.batch_number == batch_number
            ).first():
                raise InventoryValidationError(f"Dòng {index + 1}: Số lô '{batch_number}' đã tồn tại")
            seen_batch_numbers.add(batch_number)

            import_price = item.get('import_price')
            if import_price in (None, ''):
                import_price = None
            else:
                try:
                    import_price = float(import_price)
                except (TypeError, ValueError):
                    raise InventoryValidationError(f"Dòng {index + 1}: Giá nhập không hợp lệ")
                if import_price < 0:
                    raise InventoryValidationError(f"Dòng {index + 1}: Giá nhập không được âm")

            normalized_items.append({
                'index': index,
                'medicine_id': medicine_id,
                'batch_number': batch_number,
                'expiry_date': expiry_date,
                'quantity': quantity,
                'import_price': import_price,
                'notes': item.get('notes') or data.get('notes'),
            })

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
        return jsonify({'detail': str(e)}), 400, {'Content-Type': 'application/json; charset=utf-8'}
    except Exception as e:
        db.rollback()
        logger.error(f"Lỗi nhập kho theo đơn hàng: {e}")
        return jsonify({'detail': 'Lỗi nhập kho theo đơn hàng', 'error': str(e)}), 500, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()
