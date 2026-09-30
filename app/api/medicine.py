from flask import Blueprint, request, jsonify, make_response
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.config import settings
from app.models.medicine import Medicine
from app.models.medicine_category import MedicineCategory
from app.models.medicine_batch import MedicineBatch
from app.api.auth import require_auth
from app.utils.search_normalization import normalized_contains
from app.realtime.events import emit_inventory_changed
from sqlalchemy.exc import IntegrityError
from app.modules.medicines.services.catalog_service import CatalogValidationError, write_clinic_medicine
from app.modules.medicines.services.reference_review import can_review_reference, review_preview, confirm_reference
import logging
from datetime import datetime, date, timezone
from sqlalchemy import func, or_

logger = logging.getLogger(__name__)

medicine_router = Blueprint('medicine', __name__)


def latest_batch_of(batches):
    return max(batches, key=lambda batch: (
        batch.import_date,
        batch.created_at or datetime.min.replace(tzinfo=timezone.utc),
        batch.id,
    ), default=None)


@medicine_router.route('/medicine/statistics/ledger', methods=['GET'])
@require_auth
def get_dispensing_ledger(user):
    from app.modules.prescriptions.services.ledger_report import build_ledger_report
    db = next(get_db())
    try:
        return jsonify(build_ledger_report(db, request.args)), 200
    except (ValueError, TypeError):
        return jsonify(success=False, detail='Bộ lọc ngày, loại giao dịch hoặc mã định danh không hợp lệ'), 400
    finally:
        db.close()


def _filtered_medicine_query(category, db, is_imported, reference_status, search, sort_by, unit):
    from sqlalchemy.orm import joinedload
    query = db.query(Medicine).options(joinedload(Medicine.reference_catalog))
    if request.args.get('missing_import_price') == 'true':
        query = query.filter(Medicine.batches.any(MedicineBatch.import_price.is_(None)))

    # Apply filters
    if search:
        query = query.filter(
            or_(
                normalized_contains(Medicine.name, search),
                normalized_contains(Medicine.generic_name, search),
            )
        )

    if category:
        # Filter by category name instead of ID
        query = query.join(MedicineCategory).filter(MedicineCategory.name == category)

    if unit:
        query = query.filter(Medicine.unit == unit)

    if reference_status == 'unlinked':
        query = query.filter(Medicine.reference_catalog_id.is_(None))
    elif reference_status == 'linked':
        query = query.filter(Medicine.reference_catalog_id.isnot(None))

    if is_imported in ['true', 'false']:
        query = query.filter(Medicine.is_imported == (is_imported == 'true'))

    # Apply sorting - mặc định sort theo updated_at DESC (mới nhất trước)
    if sort_by == 'name':
        query = query.order_by(Medicine.name.asc())
    elif sort_by == 'unit_price':
        query = query.order_by(Medicine.unit_price.desc())
    elif sort_by == 'stock_quantity':
        query = query.order_by(Medicine.stock_quantity.desc())
    elif sort_by == 'created_at':
        query = query.order_by(Medicine.created_at.desc())
    elif sort_by == 'expiry_date':
        from sqlalchemy import select, func
        nearest_expiry = (
            select(func.min(MedicineBatch.expiry_date))
            .where(MedicineBatch.medicine_id == Medicine.id, MedicineBatch.remaining_quantity > 0)
            .correlate(Medicine)
            .scalar_subquery()
        )
        # Thuốc sắp hết hạn nhất (lô còn tồn) lên trước; thuốc không có
        # lô nào còn hạn xuống cuối vì chúng không cần cảnh báo.
        query = query.order_by(nearest_expiry.asc().nullslast())
    else:  # Mặc định: updated_at DESC (mới nhất trước), nếu null thì dùng created_at
        from sqlalchemy import desc, func
        query = query.order_by(
            desc(func.coalesce(Medicine.updated_at, Medicine.created_at)),
            desc(Medicine.created_at)
        )
    return query


@medicine_router.route('/medicines/', methods=['GET'])
@require_auth
def get_medicines(user):
    """Lấy danh sách thuốc"""
    try:
        db = next(get_db())
        
        # Get query parameters
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 10, type=int)
        search = request.args.get('search', '')
        category = request.args.get('category', '')
        unit = request.args.get('unit', '')
        reference_status = request.args.get('reference_status', '')
        is_imported = request.args.get('is_imported', '')  # 'true' | 'false'
        has_low_stock = request.args.get('has_low_stock', '')  # 'true'
        expires_in_days = request.args.get('expires_in_days', type=int)
        sort_by = request.args.get('sort_by', 'updated_at')  # Mặc định sort theo updated_at
        
        # Build query
        query = _filtered_medicine_query(category, db, is_imported, reference_status, search, sort_by, unit)

        # Post-filter later for computed flags if needed
        
        # Get total count
        total = query.count()
        
        # Apply pagination
        medicines = query.offset((page - 1) * per_page).limit(per_page).all()
        
        # `latest_batch_pricing` phải cùng thứ tự ưu tiên với GET một thuốc
        # (import_date -> created_at -> id, mới nhất trước) để "Giá nhập"
        # trên bảng danh sách và trên form khớp nhau.
        # Convert to dict & computed filters
        medicines_data = []
        for medicine in medicines:
            data = medicine.to_dict()
            latest = latest_batch_of(medicine.batches)
            data['latest_batch_pricing'] = ({
                'batch_id': latest.id, 'batch_number': latest.batch_number,
                'import_date': latest.import_date.isoformat(),
                'import_price': float(latest.import_price) if latest.import_price is not None else None,
            } if latest else None)
            medicines_data.append(data)
        if has_low_stock == 'true':
            medicines_data = [m for m in medicines_data if m.get('is_low_stock')]
        if isinstance(expires_in_days, int):
            medicines_data = [m for m in medicines_data if m.get('days_to_expiry') is not None and m.get('days_to_expiry') <= expires_in_days]
        
        return jsonify({
            'medicines': medicines_data,
            'can_review_reference': can_review_reference(db, user.id),
            'total': total,
            'page': page,
            'per_page': per_page,
            'total_pages': (total + per_page - 1) // per_page
        })
        
    except Exception as e:
        logger.error(f"Error getting medicines: {e}")
        return jsonify({"error": "Lỗi khi lấy danh sách thuốc"}), 500
    finally:
        db.close()


def catalog_error(error):
    return jsonify({'error': str(error), 'user_message': str(error), 'existing_medicine_id': error.existing_medicine_id}), error.status


@medicine_router.route('/medicines/', methods=['POST'])
@require_auth
def create_medicine(user):
    db = next(get_db())
    try:
        medicine = write_clinic_medicine(db, request.get_json() or {}, user.id)
        db.commit()
        emit_inventory_changed('medicine_created', entity='medicine', entity_id=medicine.id)
        return jsonify({'message': 'Đã thêm thuốc từ DAV', 'medicine': medicine.to_dict()}), 201
    except CatalogValidationError as error:
        db.rollback()
        return catalog_error(error)
    except IntegrityError:
        db.rollback()
        return jsonify({'error': 'Thuốc DAV hoặc mã thuốc đã tồn tại. Hãy tải lại danh sách.'}), 409
    except Exception:
        db.rollback()
        logger.exception('Cannot create DAV-linked medicine')
        return jsonify({'error': 'Không thể thêm thuốc.'}), 500
    finally:
        db.close()


@medicine_router.route('/medicines/<int:medicine_id>', methods=['GET'])
@require_auth
def get_medicine(user, medicine_id):
    """Lấy thông tin thuốc theo ID"""
    try:
        db = next(get_db())
        
        medicine = db.query(Medicine).filter(Medicine.id == medicine_id).first()
        if not medicine:
            return jsonify({"error": "Không tìm thấy thuốc"}), 404
        
        result = medicine.to_dict()
        latest = db.query(MedicineBatch).filter_by(medicine_id=medicine_id).order_by(
            MedicineBatch.import_date.desc(), MedicineBatch.created_at.desc().nullslast(),
            MedicineBatch.id.desc()).first()
        result['latest_batch_pricing'] = ({
            'batch_id': latest.id, 'batch_number': latest.batch_number,
            'import_date': latest.import_date.isoformat(),
            'import_price': float(latest.import_price) if latest.import_price is not None else None,
        } if latest else None)
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"Error getting medicine: {e}")
        return jsonify({"error": "Lỗi khi lấy thông tin thuốc"}), 500
    finally:
        db.close()


@medicine_router.route('/medicines/export/excel', methods=['GET'])
@require_auth
def export_medicines_excel(user):
    """Xuất danh sách thuốc ra Excel"""
    from flask import send_file
    from io import BytesIO
    import pandas as pd
    from datetime import datetime
    
    db = next(get_db())
    try:
        medicines = db.query(Medicine).filter(Medicine.is_active == True).all()

        data = []
        for med in medicines:
            data.append({
                'Tên thuốc': med.name,
                'Mô tả': med.description or '',
                'Mã nguồn DAV': med.reference_catalog.source_id if med.reference_catalog else '',
                'Số lượng tồn': float(med.stock_quantity) if med.stock_quantity else 0,
                'Giá vốn': float(med.import_price) if med.import_price else 0,
                'Giá bán': float(med.unit_price) if med.unit_price else 0,
                'Quy cách': med.packaging or ''
            })

        df = pd.DataFrame(data)
        output = BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Danh sách thuốc')
        output.seek(0)

        filename = f'danh_sach_thuoc_{datetime.now().strftime("%Y%m%d")}.xlsx'
        return send_file(output, mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                       as_attachment=True, download_name=filename)

    except Exception as e:
        logger.error(f"Error exporting to Excel: {e}")
        return jsonify({'detail': str(e)}), 500, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()


@medicine_router.route('/medicines/<int:medicine_id>', methods=['PUT'])
@require_auth
def update_medicine(user, medicine_id):
    db = next(get_db())
    try:
        medicine = db.query(Medicine).filter_by(id=medicine_id).with_for_update().first()
        if not medicine:
            return jsonify({'error': 'Không tìm thấy thuốc'}), 404
        write_clinic_medicine(db, request.get_json() or {}, user.id, medicine)
        db.commit()
        emit_inventory_changed('medicine_updated', entity='medicine', entity_id=medicine.id)
        return jsonify({'message': 'Đã cập nhật thuốc', 'medicine': medicine.to_dict()})
    except CatalogValidationError as error:
        db.rollback()
        return catalog_error(error)
    except IntegrityError:
        db.rollback()
        return jsonify({'error': 'Thuốc DAV hoặc mã thuốc đã tồn tại. Hãy tải lại danh sách.'}), 409
    except Exception:
        db.rollback()
        logger.exception('Cannot update DAV-linked medicine')
        return jsonify({'error': 'Không thể cập nhật thuốc.'}), 500
    finally:
        db.close()


@medicine_router.route('/medicines/<int:medicine_id>/price', methods=['GET', 'POST'])
@require_auth
def medicine_price(user, medicine_id):
    from app.modules.medicines.services.price_history import price_payload, update_price
    db = next(get_db())
    try:
        if not can_review_reference(db, user.id):
            return jsonify(error='Bạn chưa có quyền quản lý Tủ thuốc.'), 403
        query = db.query(Medicine).filter_by(id=medicine_id)
        medicine = query.with_for_update().first()
        if not medicine:
            return jsonify(error='Không tìm thấy thuốc.'), 404
        if request.method == 'GET':
            before = request.args.get('before_id', type=int)
            return jsonify(price_payload(db, medicine, before))
        changed = update_price(db, medicine, request.get_json(silent=True), user.id)
        result = price_payload(db, medicine)
        db.commit()
        if changed:
            emit_inventory_changed('medicine_price_updated', entity='medicine', entity_id=medicine.id)
        return jsonify(result)
    except CatalogValidationError as error:
        db.rollback()
        return catalog_error(error)
    except Exception:
        db.rollback()
        logger.exception('Cannot update medicine sale price')
        return jsonify(error='Không thể cập nhật giá. Hãy mở lại để kiểm tra.'), 500
    finally:
        db.close()


@medicine_router.route('/medicines/<int:medicine_id>/reference-review', methods=['GET', 'POST'])
@require_auth
def review_medicine_reference(user, medicine_id):
    db = next(get_db())
    try:
        if not can_review_reference(db, user.id):
            return jsonify(error='Bạn chưa có quyền quản lý Tủ thuốc.'), 403
        query = db.query(Medicine).filter_by(id=medicine_id)
        medicine = (query.with_for_update() if request.method == 'POST' else query).first()
        if not medicine:
            return jsonify(error='Không tìm thấy thuốc.'), 404
        if request.method == 'GET':
            reference_id = request.args.get('reference_catalog_id')
            if reference_id is not None:
                try:
                    reference_id = int(reference_id)
                    if reference_id <= 0:
                        raise ValueError()
                except ValueError:
                    raise CatalogValidationError('Hãy chọn thuốc hợp lệ trong danh mục.')
            return jsonify(review_preview(db, medicine, reference_id))
        confirm_reference(db, medicine, request.get_json(silent=True), user.id)
        db.commit()
        emit_inventory_changed('medicine_updated', entity='medicine', entity_id=medicine.id)
        return jsonify(message='Đã xác nhận thuốc từ DAV.', medicine=medicine.to_dict())
    except CatalogValidationError as error:
        db.rollback()
        return catalog_error(error)
    except IntegrityError:
        db.rollback()
        return jsonify(error='Thuốc DAV này đã được liên kết. Hãy tải lại và kiểm tra.'), 409
    except Exception:
        db.rollback()
        logger.exception('Cannot review medicine reference')
        return jsonify(error='Không thể lưu xác nhận thuốc. Hãy mở lại và kiểm tra.'), 500
    finally:
        db.close()


@medicine_router.route('/medicines/<int:medicine_id>', methods=['DELETE'])
@require_auth
def delete_medicine(user, medicine_id):
    """Xóa thuốc"""
    try:
        db = next(get_db())
        
        medicine = db.query(Medicine).filter(Medicine.id == medicine_id).first()
        if not medicine:
            return jsonify({"error": "Không tìm thấy thuốc"}), 404
        from app.models.prescription import PrescriptionItem
        from app.models.medicine_transaction import MedicineTransaction
        if db.query(PrescriptionItem.id).filter_by(medicine_id=medicine_id).first():
            message = 'Thuốc đã được kê trong đơn thuốc, không thể xóa.'
            return jsonify(error=message, user_message=message), 409
        if db.query(MedicineTransaction.id).filter_by(medicine_id=medicine_id).first():
            message = 'Thuốc đã có giao dịch nhập/xuất kho, không thể xóa.'
            return jsonify(error=message, user_message=message), 409
        # Chưa dùng thật (không đơn thuốc, không giao dịch): lịch sử giá chỉ
        # còn giá trị đối chiếu khi thuốc còn tồn tại, xóa cùng thuốc.
        from app.models.medicine_price_history import MedicinePriceHistory
        db.query(MedicinePriceHistory).filter_by(medicine_id=medicine_id).delete()
        db.delete(medicine)
        db.commit()
        emit_inventory_changed('medicine_deleted', entity='medicine', entity_id=medicine_id)
        
        return jsonify({"message": "Xóa thuốc thành công"})
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting medicine: {e}")
        return jsonify({"error": "Lỗi khi xóa thuốc"}), 500
    finally:
        db.close()


@medicine_router.route('/medicines/categories', methods=['GET'])
@require_auth
def get_medicine_categories(user):
    """Lấy danh sách danh mục thuốc (deprecated - use /medicine-categories/active)"""
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
        
    except Exception as e:
        logger.error(f"Error getting medicine categories: {e}")
        return jsonify({"error": "Lỗi khi lấy danh sách danh mục thuốc"}), 500
    finally:
        db.close()


@medicine_router.route('/medicines/active-ingredients', methods=['GET'])
@require_auth
def get_active_ingredients(user):
    """Lấy danh sách hoạt chất/biệt dược duy nhất (DISTINCT generic_name) cho autocomplete"""
    try:
        db = next(get_db())
        
        results = db.query(Medicine.generic_name).filter(
            Medicine.generic_name.isnot(None),
            Medicine.generic_name != ''
        ).distinct().order_by(Medicine.generic_name).all()
        
        ingredients = sorted(set(r[0].strip() for r in results if r[0] and r[0].strip()))
        
        return jsonify({
            'success': True,
            'data': ingredients
        })
        
    except Exception as e:
        logger.error(f"Error getting active ingredients: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        db.close()

# Route/hàm còn lại nằm ở medicine_part2.py; import để đăng ký route và giữ tên cũ trên module này.
from app.api.medicine_part2 import (  # noqa: E402,F401
    get_medicine_units,
    get_dashboard,
    get_statistics_summary,
)

# Route/hàm còn lại nằm ở medicine_part3.py; import để đăng ký route và giữ tên cũ trên module này.
from app.api.medicine_part3 import (  # noqa: E402,F401
    get_statistics_prescriptions,
)

# Route/hàm còn lại nằm ở medicine_part4.py; import để đăng ký route và giữ tên cũ trên module này.
from app.api.medicine_part4 import (  # noqa: E402,F401
    get_statistics_inventory,
    get_statistics_prescription_history,
    get_statistics_doctors,
)

# Route/hàm còn lại nằm ở medicine_part5.py; import để đăng ký route và giữ tên cũ trên module này.
from app.api.medicine_part5 import (  # noqa: E402,F401
    export_statistics_excel,
)
