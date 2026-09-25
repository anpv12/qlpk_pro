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
from sqlalchemy import func, and_, or_, text

logger = logging.getLogger(__name__)

medicine_router = Blueprint('medicine', __name__)


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

        # Post-filter later for computed flags if needed
        
        # Get total count
        total = query.count()
        
        # Apply pagination
        medicines = query.offset((page - 1) * per_page).limit(per_page).all()
        
        # `latest_batch_pricing` phải cùng thứ tự ưu tiên với GET một thuốc
        # (import_date -> created_at -> id, mới nhất trước) để "Giá nhập"
        # trên bảng danh sách và trên form khớp nhau.
        def latest_batch_of(batches):
            if not batches:
                return None
            return max(batches, key=lambda b: (
                b.import_date, b.created_at or datetime.min.replace(tzinfo=timezone.utc), b.id))

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


@medicine_router.route('/medicines/units', methods=['GET'])
@require_auth
def get_medicine_units(user):
    """Lấy danh sách đơn vị tính từ database thuốc"""
    try:
        db = next(get_db())
        
        # Lấy tất cả đơn vị tính unique từ database thuốc
        units = db.query(Medicine.unit).filter(Medicine.unit.isnot(None), Medicine.unit != '').distinct().all()
        
        # Convert thành list và sort
        units_list = sorted([unit[0] for unit in units if unit[0]])
        
        # Trả về trực tiếp đơn vị tính (đã là tiếng Việt)
        # Giữ backward compatibility: nếu có dữ liệu cũ bằng tiếng Anh thì convert
        unit_mapping = {
            'tablet': 'viên',
            'tablets': 'viên',
            'bottle': 'chai',
            'bottles': 'chai',
            'pack': 'gói',
            'packet': 'gói',
            'tube': 'tuýp',
            'ampoule': 'ống',
            'drop': 'giọt',
            'syringe': 'bơm tiêm',
            'dose': 'liều',
            'bag': 'túi',
            'blister': 'vỉ',
            'kit': 'dụng cụ',
            'liter': 'lít',
            'litre': 'lít',
            'piece': 'miếng',
            'pen': 'bút tiêm'
        }
        result = []
        for unit in units_list:
            # Nếu đã là tiếng Việt, dùng trực tiếp
            if unit.lower() in ['viên', 'chai', 'gói', 'tuýp', 'ống', 'vỉ', 'hộp', 'lọ', 'giọt', 'viên nang', 'miếng dán', 'bơm tiêm', 'liều', 'túi', 'dụng cụ', 'lít', 'miếng', 'bút tiêm', 'ml', 'g', 'mg', 'mcg']:
                display_name = unit
            else:
                # Convert từ tiếng Anh sang tiếng Việt (backward compatibility)
                display_name = unit_mapping.get(unit.lower(), unit)
            result.append({'value': display_name, 'label': display_name})
        
        return jsonify({
            'success': True,
            'data': result
        }), 200
        
    except Exception as e:
        logger.error(f"Error getting medicine units: {e}")
        return jsonify({
            'success': False,
            'detail': 'Internal server error'
        }), 500
    finally:
        db.close()


@medicine_router.route('/medicines/dashboard', methods=['GET'])
@require_auth
def get_dashboard(user):
    """Lấy dữ liệu dashboard tổng quan"""
    try:
        db: Session = next(get_db())
        
        from app.models.medicine_batch import MedicineBatch
        from datetime import date
        
        today = date.today()
        
        # Tổng số thuốc
        total_medicines = db.query(Medicine).count()
        
        # Tổng số lô
        total_batches = db.query(MedicineBatch).count()
        
        # Load tất cả batches với eager loading để tránh N+1 query
        all_batches = db.query(MedicineBatch).all()
        from collections import defaultdict
        batches_by_medicine = defaultdict(list)
        for batch in all_batches:
            batches_by_medicine[batch.medicine_id].append(batch)
        
        # Tính tổng giá trị tồn kho từ batches
        total_value = 0
        for batch in all_batches:
            if batch.remaining_quantity and batch.import_price:
                total_value += float(batch.remaining_quantity) * float(batch.import_price)
        
        # Tính cảnh báo từ batches đã load sẵn (tránh lazy loading)
        warning_count = 0
        
        # Cảnh báo lô sắp hết (không liên quan hạn dùng)
        for batch in all_batches:
            if batch.quantity and batch.remaining_quantity:
                if float(batch.remaining_quantity) <= float(batch.quantity) * 0.1:
                    warning_count += 1
        
        # Load medicines để tính cảnh báo tồn kho thấp và hết hạn
        medicines = db.query(Medicine).all()
        
        for medicine in medicines:
            # Cảnh báo tồn kho thấp
            if medicine.low_stock_threshold and medicine.stock_quantity:
                if float(medicine.stock_quantity) <= float(medicine.low_stock_threshold):
                    warning_count += 1
            
            # Cảnh báo sắp hết hạn: theo lô còn tồn gần hạn nhất và ngưỡng
            # riêng của từng thuốc (khớp `is_expiring_soon` trong to_dict()).
            # `medicine.expiry_date` là field legacy không writer nào ghi,
            # không dùng ở đây.
            if medicine.expiry_warning_days:
                active_batches = [b for b in batches_by_medicine.get(medicine.id, [])
                                   if b.expiry_date and (b.remaining_quantity or 0) > 0]
                try:
                    if active_batches:
                        nearest_expiry = min(b.expiry_date for b in active_batches)
                        days_to_expiry = (nearest_expiry - today).days
                        if days_to_expiry <= medicine.expiry_warning_days:
                            warning_count += 1
                except Exception:
                    pass
        
        return jsonify({
            'total_medicines': total_medicines,
            'total_value': total_value,
            'total_batches': total_batches,
            'missing_import_price_count': len({batch.medicine_id for batch in all_batches if batch.import_price is None}),
            'warning_count': warning_count
        }), 200
        
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        logger.error(f"Error getting dashboard data: {e}\n{error_trace}")
        return jsonify({
            'success': False,
            'detail': f'Lỗi khi lấy dữ liệu dashboard: {str(e)}',
            'trace': error_trace if settings.DEBUG else None
        }), 500
    finally:
        db.close()



@medicine_router.route('/medicine/statistics/summary', methods=['GET'])
@require_auth
def get_statistics_summary(user):
    """
    Lấy thống kê tổng quan: Tổng đơn thuốc, Thuốc đã bốc, Tồn kho, Doanh thu
    Query params: from_date, to_date, doctor_id, medicine_type
    """
    from app.models.prescription import Prescription, PrescriptionItem
    from app.models.appointment import Appointment
    from sqlalchemy.orm import joinedload
    
    db = next(get_db())
    try:
        # Parse params
        from_date = request.args.get('from_date')
        to_date = request.args.get('to_date')
        doctor_id = request.args.get('doctor_id')
        medicine_type = request.args.get('medicine_type')  # BASIC, H, N
        search = request.args.get('search', '').strip().lower()
        
        # Base query for prescriptions
        prescriptions_query = db.query(Prescription).join(
            Appointment, Prescription.appointment_id == Appointment.id
        ).options(joinedload(Prescription.items))
        
        # Join Patient/UserModel nếu cần search
        if search:
            from app.models.user import User as UserModel
            from app.models.patient import Patient
            prescriptions_query = prescriptions_query.join(
                Patient, Appointment.patient_id == Patient.id
            ).join(
                UserModel, Appointment.doctor_id == UserModel.id
            )
        
        # Filter by date
        if from_date:
            try:
                from_date_obj = datetime.strptime(from_date, '%Y-%m-%d')
                prescriptions_query = prescriptions_query.filter(
                    Appointment.appointment_date >= from_date_obj
                )
            except ValueError:
                pass
        
        if to_date:
            try:
                to_date_obj = datetime.strptime(to_date, '%Y-%m-%d')
                to_date_obj = to_date_obj.replace(hour=23, minute=59, second=59)
                prescriptions_query = prescriptions_query.filter(
                    Appointment.appointment_date <= to_date_obj
                )
            except ValueError:
                pass
        
        # Filter by doctor
        if doctor_id:
            prescriptions_query = prescriptions_query.filter(
                Appointment.doctor_id == int(doctor_id)
            )
        
        # Filter by search (patient, doctor, medicine — accent-insensitive)
        if search:
            prescriptions_query = prescriptions_query.filter(
                or_(
                    normalized_contains(Patient.full_name, search),
                    normalized_contains(UserModel.full_name, search),
                    Prescription.items.any(normalized_contains(PrescriptionItem.medicine_name, search)),
                )
            )
        
        prescriptions = prescriptions_query.all()
        
        # Calculate stats
        total_prescriptions = len(prescriptions)
        total_dispensed = 0
        total_medicine_items = 0
        total_revenue = 0
        
        for pres in prescriptions:
            for item in pres.items:
                # Filter by medicine type if specified
                if medicine_type:
                    med = db.query(Medicine).filter(Medicine.id == item.medicine_id).first() if item.medicine_id else None
                    if not med or med.prescription_type != medicine_type:
                        continue
                
                total_medicine_items += 1
                qty = float(item.quantity) if item.quantity else 0
                price = 0 if item.is_external else (float(item.unit_price) if item.unit_price else 0)
                total_dispensed += qty
                total_revenue += qty * price
        
        # Get remaining stock
        remaining_stock = db.query(func.sum(Medicine.stock_quantity)).filter(
            Medicine.is_active == True
        ).scalar() or 0
        
        # Get count of active medicine types
        medicine_count = db.query(Medicine).filter(
            Medicine.is_active == True
        ).count()
        
        # Count total examinations (lượt khám thật — cùng logic với tab prescriptions)
        from app.models.examination import Examination
        exam_count_query = db.query(func.count(Examination.id)).join(
            Appointment, Examination.appointment_id == Appointment.id
        ).filter(
            Examination.is_active == True,
            Appointment.status == 'CONFIRMED'
        )
        if from_date:
            try:
                exam_count_query = exam_count_query.filter(Appointment.appointment_date >= datetime.strptime(from_date, '%Y-%m-%d'))
            except ValueError:
                pass
        if to_date:
            try:
                exam_count_query = exam_count_query.filter(Appointment.appointment_date <= datetime.strptime(to_date, '%Y-%m-%d').replace(hour=23, minute=59, second=59))
            except ValueError:
                pass
        if doctor_id:
            exam_count_query = exam_count_query.filter(Examination.doctor_id == int(doctor_id))
        total_examinations = exam_count_query.scalar() or 0
        
        # Calculate total service revenue (nguồn: appointments.service_id → services.default_price)
        from app.models.service import Service as SvcModel
        svc_rev_query = db.query(func.sum(SvcModel.default_price)).join(
            Appointment, Appointment.service_id == SvcModel.id
        ).filter(
            Appointment.status == 'CONFIRMED',
            Appointment.service_id.isnot(None)
        )
        if from_date:
            try:
                svc_rev_query = svc_rev_query.filter(Appointment.appointment_date >= datetime.strptime(from_date, '%Y-%m-%d'))
            except ValueError:
                pass
        if to_date:
            try:
                svc_rev_query = svc_rev_query.filter(Appointment.appointment_date <= datetime.strptime(to_date, '%Y-%m-%d').replace(hour=23, minute=59, second=59))
            except ValueError:
                pass
        if doctor_id:
            svc_rev_query = svc_rev_query.join(
                Examination, Examination.appointment_id == Appointment.id
            ).filter(Examination.doctor_id == int(doctor_id))
        total_service_revenue = int(float(svc_rev_query.scalar() or 0))
        
        return jsonify({
            'success': True,
            'total_prescriptions': total_prescriptions,
            'total_examinations': total_examinations,
            'total_dispensed': total_medicine_items,
            'total_dispensed_qty': total_dispensed,
            'medicine_count': medicine_count,
            'remaining_stock': int(float(remaining_stock)),
            'total_revenue': int(total_revenue),
            'total_service_revenue': total_service_revenue
        }), 200
        
    except Exception as e:
        logger.error(f"Error getting statistics summary: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({'success': False, 'detail': str(e)}), 500
    finally:
        db.close()


@medicine_router.route('/medicine/statistics/prescriptions', methods=['GET'])
@require_auth
def get_statistics_prescriptions(user):
    """
    Lấy danh sách đơn thuốc grouped by doctor
    Query params: from_date, to_date, doctor_id, medicine_type, search
    """
    from app.models.prescription import Prescription, PrescriptionItem
    from app.models.appointment import Appointment
    from app.models.user import User as UserModel
    from app.models.patient import Patient
    from app.models.service import Service
    from sqlalchemy.orm import joinedload
    
    db = next(get_db())
    try:
        # Parse params
        from_date = request.args.get('from_date')
        to_date = request.args.get('to_date')
        doctor_id = request.args.get('doctor_id')
        medicine_type = request.args.get('medicine_type')
        search = request.args.get('search', '').strip().lower()
        
        # Query prescriptions with joins
        prescriptions_query = db.query(Prescription).join(
            Appointment, Prescription.appointment_id == Appointment.id
        ).join(
            UserModel, Appointment.doctor_id == UserModel.id
        ).join(
            Patient, Appointment.patient_id == Patient.id
        ).options(
            joinedload(Prescription.items),
            joinedload(Prescription.appointment).joinedload(Appointment.doctor),
            joinedload(Prescription.appointment).joinedload(Appointment.patient),
            joinedload(Prescription.appointment).joinedload(Appointment.appointment_services)
        )
        
        # Filter by date
        if from_date:
            try:
                from_date_obj = datetime.strptime(from_date, '%Y-%m-%d')
                prescriptions_query = prescriptions_query.filter(
                    Appointment.appointment_date >= from_date_obj
                )
            except ValueError:
                pass
        
        if to_date:
            try:
                to_date_obj = datetime.strptime(to_date, '%Y-%m-%d')
                to_date_obj = to_date_obj.replace(hour=23, minute=59, second=59)
                prescriptions_query = prescriptions_query.filter(
                    Appointment.appointment_date <= to_date_obj
                )
            except ValueError:
                pass
        
        # Filter by doctor
        if doctor_id:
            prescriptions_query = prescriptions_query.filter(
                Appointment.doctor_id == int(doctor_id)
            )
        
        # Filter by search (patient name, doctor name, medicine name — accent-insensitive)
        if search:
            prescriptions_query = prescriptions_query.filter(
                or_(
                    normalized_contains(Patient.full_name, search),
                    normalized_contains(UserModel.full_name, search),
                    Prescription.items.any(normalized_contains(PrescriptionItem.medicine_name, search)),
                )
            )
        
        prescriptions = prescriptions_query.order_by(
            UserModel.full_name,
            Appointment.appointment_date.desc()
        ).all()
        
        # Group by doctor - pre-load all doctors and psychologists
        doctors_data = {}
        all_staff = db.query(UserModel).filter(
            UserModel.role.in_(['DOCTOR', 'PSYCHOLOGIST']),
            UserModel.is_active == True
        ).all()
        for staff in all_staff:
            doctors_data[staff.id] = {
                'doctor_id': staff.id,
                'doctor_name': staff.full_name,
                'examination_count': 0,
                'prescription_count': 0,
                'medicine_count': 0,
                'total_medicine_items': 0,
                'total_dispensed_qty': 0,
                'service_count': 0,
                'medicine_amount': 0,
                'service_amount': 0,
                'prescriptions': [],
                '_prescription_types': set()
            }
        
        # === Query examination_count per doctor (lượt khám thật, không phụ thuộc prescription) ===
        from app.models.examination import Examination, ExaminationStatus as ExamStatus
        
        
        exam_query = db.query(
            Examination.doctor_id,
            func.count(Examination.id)
        ).join(
            Appointment, Examination.appointment_id == Appointment.id
        ).filter(
            Examination.is_active == True,
            Appointment.status == 'CONFIRMED'
        )
        
        # Apply same date filters
        if from_date:
            try:
                from_date_obj_exam = datetime.strptime(from_date, '%Y-%m-%d')
                exam_query = exam_query.filter(Appointment.appointment_date >= from_date_obj_exam)
            except ValueError:
                pass
        if to_date:
            try:
                to_date_obj_exam = datetime.strptime(to_date, '%Y-%m-%d').replace(hour=23, minute=59, second=59)
                exam_query = exam_query.filter(Appointment.appointment_date <= to_date_obj_exam)
            except ValueError:
                pass
        if doctor_id:
            exam_query = exam_query.filter(Examination.doctor_id == int(doctor_id))
        
        exam_counts = exam_query.group_by(Examination.doctor_id).all()
        for doc_id, count in exam_counts:
            if doc_id in doctors_data:
                doctors_data[doc_id]['examination_count'] = count
        
        # === Query service_count per doctor (từ appointments.service_id — nguồn đúng duy nhất) ===
        from app.models.service import Service
        
        svc_query = db.query(
            Examination.doctor_id,
            func.count(Appointment.service_id)
        ).join(
            Appointment, Examination.appointment_id == Appointment.id
        ).filter(
            Examination.is_active == True,
            Appointment.status == 'CONFIRMED',
            Appointment.service_id.isnot(None)
        )
        
        if from_date:
            try:
                svc_query = svc_query.filter(Appointment.appointment_date >= datetime.strptime(from_date, '%Y-%m-%d'))
            except ValueError:
                pass
        if to_date:
            try:
                svc_query = svc_query.filter(Appointment.appointment_date <= datetime.strptime(to_date, '%Y-%m-%d').replace(hour=23, minute=59, second=59))
            except ValueError:
                pass
        if doctor_id:
            svc_query = svc_query.filter(Examination.doctor_id == int(doctor_id))
        
        svc_counts = svc_query.group_by(Examination.doctor_id).all()
        for doc_id, count in svc_counts:
            if doc_id in doctors_data:
                doctors_data[doc_id]['service_count'] = count
        
        # === Query service_amount per doctor (nguồn: appointments.service_id → services.default_price) ===
        svc_amount_query = db.query(
            Examination.doctor_id,
            func.sum(Service.default_price)
        ).join(
            Appointment, Examination.appointment_id == Appointment.id
        ).join(
            Service, Appointment.service_id == Service.id
        ).filter(
            Examination.is_active == True,
            Appointment.status == 'CONFIRMED',
            Appointment.service_id.isnot(None)
        )
        
        if from_date:
            try:
                svc_amount_query = svc_amount_query.filter(Appointment.appointment_date >= datetime.strptime(from_date, '%Y-%m-%d'))
            except ValueError:
                pass
        if to_date:
            try:
                svc_amount_query = svc_amount_query.filter(Appointment.appointment_date <= datetime.strptime(to_date, '%Y-%m-%d').replace(hour=23, minute=59, second=59))
            except ValueError:
                pass
        if doctor_id:
            svc_amount_query = svc_amount_query.filter(Examination.doctor_id == int(doctor_id))
        
        svc_amounts = svc_amount_query.group_by(Examination.doctor_id).all()
        for doc_id, amount in svc_amounts:
            if doc_id in doctors_data:
                doctors_data[doc_id]['service_amount'] = int(float(amount)) if amount else 0
        
        # === Query full examination list per doctor (để hiển thị khi expand) ===
        from app.models.patient import Patient
        
        all_exams_query = db.query(Examination).join(
            Appointment, Examination.appointment_id == Appointment.id
        ).join(
            Patient, Appointment.patient_id == Patient.id
        ).filter(
            Examination.is_active == True,
            Appointment.status == 'CONFIRMED'
        )
        
        if from_date:
            try:
                all_exams_query = all_exams_query.filter(Appointment.appointment_date >= datetime.strptime(from_date, '%Y-%m-%d'))
            except ValueError:
                pass
        if to_date:
            try:
                all_exams_query = all_exams_query.filter(Appointment.appointment_date <= datetime.strptime(to_date, '%Y-%m-%d').replace(hour=23, minute=59, second=59))
            except ValueError:
                pass
        if doctor_id:
            all_exams_query = all_exams_query.filter(Examination.doctor_id == int(doctor_id))
        
        all_exams = all_exams_query.order_by(Appointment.appointment_date.desc()).all()
        
        # Build examination list per doctor
        for exam in all_exams:
            doc_id = exam.doctor_id
            if doc_id not in doctors_data:
                continue
            appt = exam.appointment
            patient = appt.patient if appt else None
            
            # Lấy tên dịch vụ từ appointments.service_id → services.name (nguồn đúng duy nhất)
            service_name = ''
            service_amount = 0
            if appt and appt.service_id:
                svc = db.query(Service.name).filter(Service.id == appt.service_id).scalar()
                service_name = svc or ''
                # Lấy tiền dịch vụ từ services.default_price (nguồn đúng duy nhất)
                svc_price = db.query(Service.default_price).filter(Service.id == appt.service_id).scalar()
                service_amount = int(float(svc_price)) if svc_price else 0
            
            if 'examinations' not in doctors_data[doc_id]:
                doctors_data[doc_id]['examinations'] = []
            
            doctors_data[doc_id]['examinations'].append({
                'examination_id': exam.id,
                'appointment_id': appt.id if appt else None,
                'patient_name': patient.full_name if patient else 'N/A',
                'appointment_date': appt.appointment_date.strftime('%d/%m/%Y') if appt and appt.appointment_date else '',
                'appointment_time': appt.appointment_date.strftime('%H:%M') if appt and appt.appointment_date else '',
                'services': service_name,
                'service_amount': service_amount,
                'exam_status': exam.status.value if exam.status else ''
            })
        
        # Đảm bảo tất cả doctor đều có 'examinations' key
        for doc_data in doctors_data.values():
            if 'examinations' not in doc_data:
                doc_data['examinations'] = []
        
        grand_total = {'examination_count': 0, 'prescription_count': 0, 'medicine_count': 0, 'medicine_amount': 0, 'service_amount': 0, 'total_medicine_items': 0, 'service_count': 0, 'total_dispensed_qty': 0}
        grand_total_types = set()  # Track distinct prescription types
        
        for pres in prescriptions:
            appt = pres.appointment
            doctor = appt.doctor
            patient = appt.patient
            
            doctor_id_key = doctor.id if doctor else 0
            doctor_name = doctor.full_name if doctor else 'Chưa xác định'
            
            if doctor_id_key not in doctors_data:
                doctors_data[doctor_id_key] = {
                    'doctor_id': doctor_id_key,
                    'doctor_name': doctor_name,
                    'prescription_count': 0,
                    'medicine_count': 0,
                    'total_medicine_items': 0,
                    'service_count': 0,
                    'medicine_amount': 0,
                    'service_amount': 0,
                    'prescriptions': [],
                    '_prescription_types': set()
                }
            
            # Calculate medicine stats for this prescription
            medicine_count = len(pres.items)
            total_amount = float(pres.total_amount) if pres.total_amount else 0
            
            # Get services
            services = ', '.join([s.service.name for s in appt.appointment_services if s.service]) if appt.appointment_services else ''
            
            # Collect individual service names for aggregation
            service_names = [s.service.name for s in appt.appointment_services if s.service] if appt.appointment_services else []
            
            # Calculate treatment days (from prescription items usage)
            treatment_days = 0
            for item in pres.items:
                if item.usage:
                    # Try to extract days from usage text
                    usage_lower = item.usage.lower()
                    import re
                    days_match = re.search(r'(\d+)\s*(ngày|day)', usage_lower)
                    if days_match:
                        treatment_days = max(treatment_days, int(days_match.group(1)))
            
            # Medicine items detail
            medicine_items = []
            for idx, item in enumerate(pres.items, 1):
                # Check medicine type if filter applied
                if medicine_type:
                    med = db.query(Medicine).filter(Medicine.id == item.medicine_id).first() if item.medicine_id else None
                    if not med or med.prescription_type != medicine_type:
                        continue
                
                # Determine purchase location
                purchase_location = 'Bên ngoài' if item.is_external else 'Trong phòng khám'
                
                # Get medicine type label
                med = db.query(Medicine).filter(Medicine.id == item.medicine_id).first() if item.medicine_id else None
                med_type = 'Cơ bản'
                if med:
                    type_map = {'BASIC': 'Cơ bản', 'H': 'H', 'N': 'N', 'TOXIC': 'Độc'}
                    med_type = type_map.get(med.prescription_type, 'Cơ bản')
                
                medicine_items.append({
                    'stt': idx,
                    'name': item.medicine_name,
                    'purchase_location': purchase_location,
                    'medicine_type': med_type,
                    'quantity': float(item.quantity) if item.quantity else 0,
                    'unit': item.unit or 'viên',
                    'unit_price': 0 if item.is_external else (float(item.unit_price) if item.unit_price else 0),
                    'total_price': 0 if item.is_external else ((float(item.quantity) if item.quantity else 0) * (float(item.unit_price) if item.unit_price else 0))
                })
            
            # Collect distinct prescription types for this prescription
            pres_types = set()
            for med_item in medicine_items:
                pres_types.add(med_item['medicine_type'])
            
            # Recalculate total_amount from medicine items (external = 0)
            total_amount = sum(item['total_price'] for item in medicine_items)
            
            prescription_data = {
                'id': pres.id,
                'appointment_id': appt.id,
                'patient_name': patient.full_name if patient else 'N/A',
                'appointment_date': appt.appointment_date.strftime('%d/%m/%Y') if appt.appointment_date else '',
                'appointment_time': appt.appointment_date.strftime('%H:%M') if appt.appointment_date else '',
                'services': services,
                'medicine_count': len(pres_types),  # Distinct prescription types
                'total_medicine_items': len(medicine_items),  # Total medicine items
                'total_dispensed_qty': sum(m['quantity'] for m in medicine_items),  # Total pills
                'prescription_types': list(pres_types),  # List of type labels
                'treatment_days': treatment_days if treatment_days > 0 else None,
                'total_amount': total_amount,
                're_examination_date': pres.re_examination_date.strftime('%d/%m/%Y') if pres.re_examination_date else None,
                'recheck_date': pres.re_examination_date.strftime('%d/%m/%Y') if pres.re_examination_date else None,
                'medicines': medicine_items
            }
            
            doctors_data[doctor_id_key]['prescriptions'].append(prescription_data)
            doctors_data[doctor_id_key]['prescription_count'] += 1
            doctors_data[doctor_id_key]['_prescription_types'].update(pres_types)
            dispensed_qty = sum(m['quantity'] for m in medicine_items)
            doctors_data[doctor_id_key]['total_medicine_items'] += len(medicine_items)
            doctors_data[doctor_id_key]['total_dispensed_qty'] += dispensed_qty
            doctors_data[doctor_id_key]['medicine_amount'] += total_amount
            
            grand_total_types.update(pres_types)
            grand_total['prescription_count'] += 1
            grand_total['total_medicine_items'] += len(medicine_items)
            grand_total['medicine_amount'] += total_amount
            grand_total['total_dispensed_qty'] += dispensed_qty
        
        grand_total['medicine_count'] = len(grand_total_types)
        # Tính grand_total examination_count và service_count từ doctors_data
        grand_total['examination_count'] = sum(d['examination_count'] for d in doctors_data.values())
        grand_total['service_count'] = sum(d['service_count'] for d in doctors_data.values())
        grand_total['service_amount'] = sum(d['service_amount'] for d in doctors_data.values())
        
        for doc_data in doctors_data.values():
            doc_data['medicine_count'] = len(doc_data['_prescription_types'])
            doc_data['prescription_types'] = list(doc_data['_prescription_types'])
            del doc_data['_prescription_types']
        
        return jsonify({
            'success': True,
            'grand_total': grand_total,
            'doctors': sorted(doctors_data.values(), key=lambda x: x['examination_count'], reverse=True)
        }), 200
        
    except Exception as e:
        logger.error(f"Error getting statistics prescriptions: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({'success': False, 'detail': str(e)}), 500
    finally:
        db.close()


@medicine_router.route('/medicine/statistics/inventory', methods=['GET'])
@require_auth
def get_statistics_inventory(user):
    """
    Lấy danh sách thuốc với thông tin tồn kho
    Query params: search, medicine_type
    """
    from sqlalchemy.orm import joinedload
    from app.models.prescription import Prescription, PrescriptionItem
    from app.models.appointment import Appointment
    
    db = next(get_db())
    try:
        # Parse params
        search = request.args.get('search', '').strip().lower()
        medicine_type = request.args.get('medicine_type')
        from_date = request.args.get('from_date')
        to_date = request.args.get('to_date')
        doctor_id = request.args.get('doctor_id')
        
        # Parse date filters
        from_date_obj = None
        to_date_obj = None
        if from_date:
            try:
                from_date_obj = datetime.strptime(from_date, '%Y-%m-%d')
            except ValueError:
                pass
        if to_date:
            try:
                to_date_obj = datetime.strptime(to_date, '%Y-%m-%d').replace(hour=23, minute=59, second=59)
            except ValueError:
                pass
        
        # Pre-calculate dispensed quantities from prescription_items by medicine_id (SL bán)
        dispensed_query = db.query(
            PrescriptionItem.medicine_id,
            func.sum(PrescriptionItem.quantity)
        ).join(
            Prescription, PrescriptionItem.prescription_id == Prescription.id
        ).join(
            Appointment, Prescription.appointment_id == Appointment.id
        ).filter(
            PrescriptionItem.medicine_id.isnot(None),
            PrescriptionItem.is_external == False
        )
        
        if from_date_obj:
            dispensed_query = dispensed_query.filter(Appointment.appointment_date >= from_date_obj)
        if to_date_obj:
            dispensed_query = dispensed_query.filter(Appointment.appointment_date <= to_date_obj)
        if doctor_id:
            dispensed_query = dispensed_query.filter(Appointment.doctor_id == int(doctor_id))
        
        dispensed_query = dispensed_query.group_by(PrescriptionItem.medicine_id)
        dispensed_map = {row[0]: float(row[1]) if row[1] else 0 for row in dispensed_query.all()}
        
        # Query medicines
        query = db.query(Medicine).filter(Medicine.is_active == True)
        
        if medicine_type:
            query = query.filter(Medicine.prescription_type == medicine_type)
        
        if search:
            query = query.filter(
                or_(
                    normalized_contains(Medicine.name, search),
                    normalized_contains(Medicine.internal_code, search),
                )
            )
        
        medicines = query.options(joinedload(Medicine.batches)).order_by(Medicine.name).all()
        
        # Build response
        data = []

        total_export = 0
        total_stock = 0
        
        for med in medicines:
            
            # SL bán = from prescription_items (real dispensing data)
            stock_qty = float(med.stock_quantity) if med.stock_quantity else 0
            export_qty = dispensed_map.get(med.id, 0)
            
            # Get latest batch info
            latest_batch = None
            if med.batches:
                sorted_batches = sorted(med.batches, key=lambda b: b.expiry_date or date.min, reverse=True)
                latest_batch = sorted_batches[0] if sorted_batches else None
            
            # Determine status
            status = 'Đủ hàng'
            if med.low_stock_threshold and stock_qty <= med.low_stock_threshold:
                if stock_qty == 0:
                    status = 'Cần nhập'
                else:
                    status = 'Sắp hết'
            
            # Type label
            type_map = {'BASIC': 'Cơ bản', 'H': 'Thuốc H', 'N': 'Thuốc N', 'TOXIC': 'Thuốc độc'}
            
            # Get import price from latest batch or medicine
            import_price = 0
            if latest_batch and latest_batch.import_price:
                import_price = float(latest_batch.import_price)
            elif med.import_price:
                import_price = float(med.import_price)
            
            data.append({
                'id': med.id,
                'internal_code': med.internal_code or '-',
                'name': med.name,
                'medicine_type': type_map.get(med.prescription_type, 'Cơ bản'),
                'unit': med.unit or 'viên',
                'import_price': import_price,
                'unit_price': float(med.unit_price) if med.unit_price else 0,

                'export_quantity': int(export_qty),
                'stock_quantity': int(stock_qty),
                'batch_number': latest_batch.batch_number if latest_batch else '-',
                'expiry_date': latest_batch.expiry_date.strftime('%d/%m/%Y') if latest_batch and latest_batch.expiry_date else '-',
                'status': status
            })
            

            total_export += export_qty
            total_stock += stock_qty
        
        return jsonify({
            'success': True,
            'summary': {

                'total_export': int(total_export),
                'total_stock': int(total_stock)
            },
            'medicines': data
        }), 200
        
    except Exception as e:
        logger.error(f"Error getting statistics inventory: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({'success': False, 'detail': str(e)}), 500
    finally:
        db.close()


@medicine_router.route('/medicine/statistics/prescription-history', methods=['GET'])
@require_auth
def get_statistics_prescription_history(user):
    """
    Lịch sử kê thuốc: group by Medicine → Doctor → chi tiết từng đơn
    Query params: from_date, to_date, doctor_id, medicine_type, search
    """
    from app.models.prescription import Prescription, PrescriptionItem
    from app.models.appointment import Appointment
    from app.models.user import User as UserModel
    from app.models.patient import Patient
    from sqlalchemy.orm import joinedload

    db = next(get_db())
    try:
        from_date = request.args.get('from_date')
        to_date = request.args.get('to_date')
        doctor_id = request.args.get('doctor_id')
        medicine_type = request.args.get('medicine_type')
        search = request.args.get('search', '').strip().lower()

        # Query prescription items with all joins
        items_query = db.query(PrescriptionItem).join(
            Prescription, PrescriptionItem.prescription_id == Prescription.id
        ).join(
            Appointment, Prescription.appointment_id == Appointment.id
        ).join(
            UserModel, Appointment.doctor_id == UserModel.id
        ).join(
            Patient, Appointment.patient_id == Patient.id
        )

        # Date filters
        if from_date:
            try:
                from_date_obj = datetime.strptime(from_date, '%Y-%m-%d')
                items_query = items_query.filter(Appointment.appointment_date >= from_date_obj)
            except ValueError:
                pass
        if to_date:
            try:
                to_date_obj = datetime.strptime(to_date, '%Y-%m-%d').replace(hour=23, minute=59, second=59)
                items_query = items_query.filter(Appointment.appointment_date <= to_date_obj)
            except ValueError:
                pass

        # Doctor filter
        if doctor_id:
            items_query = items_query.filter(Appointment.doctor_id == int(doctor_id))

        # Search filter (accent-insensitive)
        if search:
            items_query = items_query.filter(
                or_(
                    normalized_contains(PrescriptionItem.medicine_name, search),
                    normalized_contains(Patient.full_name, search),
                    normalized_contains(UserModel.full_name, search),
                )
            )

        # Medicine type filter
        if medicine_type:
            med_ids = db.query(Medicine.id).filter(Medicine.prescription_type == medicine_type).subquery()
            items_query = items_query.filter(PrescriptionItem.medicine_id.in_(med_ids))

        # Execute query
        all_items = items_query.order_by(
            PrescriptionItem.medicine_name,
            UserModel.full_name,
            Appointment.appointment_date.desc()
        ).all()

        # Build medicine → doctor → items hierarchy
        medicines_map = {}
        # Cache medicine info
        medicine_cache = {}

        for item in all_items:
            prescription = item.prescription
            appointment = prescription.appointment
            doctor = appointment.doctor
            patient = appointment.patient

            med = db.query(Medicine).filter(Medicine.id == item.medicine_id).first() if item.medicine_id else None
            med_name = med.name if med else item.medicine_name
            med_key = item.medicine_id if item.medicine_id else f"external:{item.id}"
            doc_id = doctor.id if doctor else 0
            doc_name = doctor.full_name if doctor else 'Chưa xác định'

            # Get medicine type from cache or DB
            if med_key not in medicine_cache:
                if med:
                    type_map = {'BASIC': 'Cơ bản', 'H': 'Thuốc H', 'N': 'Thuốc N', 'TOXIC': 'Thuốc độc'}
                    medicine_cache[med_key] = {
                        'medicine_type': type_map.get(med.prescription_type, 'Cơ bản'),
                        'generic_name': med.generic_name or '',
                        'current_stock': float(med.stock_quantity) if med.stock_quantity else 0,
                        'unit': med.unit or 'viên',
                        'unit_price': float(med.unit_price) if med.unit_price else 0
                    }
                else:
                    medicine_cache[med_key] = {
                        'medicine_type': 'Cơ bản',
                        'generic_name': '',
                        'current_stock': 0,
                        'unit': item.unit or 'viên',
                        'unit_price': float(item.unit_price) if item.unit_price else 0
                    }

            med_info = medicine_cache[med_key]
            qty = float(item.quantity) if item.quantity else 0
            price = 0 if item.is_external else (float(item.unit_price) if item.unit_price else 0)
            amount = qty * price
            source = 'Bên ngoài' if item.is_external else 'Phòng khám'

            # Init medicine entry
            if med_key not in medicines_map:
                medicines_map[med_key] = {
                    'medicine_id': item.medicine_id,
                    'medicine_name': med_name,
                    'generic_name': med_info['generic_name'],
                    'medicine_type': med_info['medicine_type'],
                    'current_stock': med_info['current_stock'],
                    'unit': med_info['unit'],
                    'total_prescriptions': 0,
                    'total_quantity': 0,
                    'total_amount': 0,
                    'doctors': {}
                }

            med_entry = medicines_map[med_key]
            med_entry['total_prescriptions'] += 1
            med_entry['total_quantity'] += qty
            med_entry['total_amount'] += amount

            # Init doctor entry under medicine
            if doc_id not in med_entry['doctors']:
                med_entry['doctors'][doc_id] = {
                    'doctor_id': doc_id,
                    'doctor_name': doc_name,
                    'total_prescriptions': 0,
                    'total_quantity': 0,
                    'total_amount': 0,
                    'items': []
                }

            doc_entry = med_entry['doctors'][doc_id]
            doc_entry['total_prescriptions'] += 1
            doc_entry['total_quantity'] += qty
            doc_entry['total_amount'] += amount

            doc_entry['items'].append({
                'date': appointment.appointment_date.strftime('%d/%m/%Y') if appointment.appointment_date else '',
                'patient_name': patient.full_name if patient else 'N/A',
                'prescription_code': prescription.prescription_code or '',
                'quantity': qty,
                'source': source,
                'unit_price': price,
                'amount': amount
            })

        # Convert to list format
        medicines_list = []
        for med_data in medicines_map.values():
            med_data['doctors'] = sorted(
                med_data['doctors'].values(),
                key=lambda d: d['total_quantity'],
                reverse=True
            )
            medicines_list.append(med_data)

        # Sort by total_quantity descending
        medicines_list.sort(key=lambda m: m['total_quantity'], reverse=True)

        return jsonify({
            'success': True,
            'medicines': medicines_list
        }), 200

    except Exception as e:
        logger.error(f"Error getting prescription history: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({'success': False, 'detail': str(e)}), 500
    finally:
        db.close()


@medicine_router.route('/medicine/statistics/doctors', methods=['GET'])
@require_auth
def get_statistics_doctors(user):
    """Lấy danh sách bác sĩ cho dropdown filter"""
    from app.models.user import User as UserModel, UserRole
    
    db = next(get_db())
    try:
        doctors = db.query(UserModel).filter(
            UserModel.role.in_([UserRole.DOCTOR, UserRole.PSYCHOLOGIST]),
            UserModel.is_active == True
        ).order_by(UserModel.full_name).all()
        
        return jsonify({
            'success': True,
            'doctors': [{'id': d.id, 'name': d.full_name} for d in doctors]
        }), 200
        
    except Exception as e:
        logger.error(f"Error getting doctors list: {e}")
        return jsonify({'success': False, 'detail': str(e)}), 500
    finally:
        db.close() 


@medicine_router.route('/medicine/statistics/export', methods=['GET'])
@require_auth
def export_statistics_excel(user):
    """Xuất Excel thống kê thuốc: Sheet 1 = Bác sĩ, Tâm lý gia, Sheet 2 = Tồn kho"""
    from app.models.prescription import Prescription, PrescriptionItem
    from app.models.appointment import Appointment
    from app.models.user import User as UserModel
    from app.models.patient import Patient
    from sqlalchemy.orm import joinedload
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from io import BytesIO
    
    db = next(get_db())
    try:
        # Parse params
        from_date = request.args.get('from_date')
        to_date = request.args.get('to_date')
        doctor_id = request.args.get('doctor_id')
        medicine_type = request.args.get('medicine_type')
        
        from_date_obj = None
        to_date_obj = None
        if from_date:
            try:
                from_date_obj = datetime.strptime(from_date, '%Y-%m-%d')
            except ValueError:
                pass
        if to_date:
            try:
                to_date_obj = datetime.strptime(to_date, '%Y-%m-%d').replace(hour=23, minute=59, second=59)
            except ValueError:
                pass
        
        # Common styles
        header_font = Font(bold=True, color="FFFFFF", size=11)
        header_fill = PatternFill(start_color="14479B", end_color="14479B", fill_type="solid")
        header_align = Alignment(horizontal="center", vertical="center", wrap_text=True)
        doctor_fill = PatternFill(start_color="E0F2FE", end_color="E0F2FE", fill_type="solid")
        doctor_font = Font(bold=True, size=11)
        total_fill = PatternFill(start_color="F0F9FF", end_color="F0F9FF", fill_type="solid")
        total_font = Font(bold=True, color="DC2626", size=11)
        thin_border = Border(
            left=Side(style='thin'), right=Side(style='thin'),
            top=Side(style='thin'), bottom=Side(style='thin')
        )
        
        wb = Workbook()
        
        # ==================== SHEET 1: ĐƠN THUỐC ====================
        ws1 = wb.active
        ws1.title = "Bác sĩ, Tâm lý gia"
        
        # Title
        ws1.merge_cells('A1:J1')
        title_cell = ws1['A1']
        date_label = ""
        if from_date_obj:
            date_label += f" từ {from_date_obj.strftime('%d/%m/%Y')}"
        if to_date_obj:
            date_label += f" đến {to_date_obj.strftime('%d/%m/%Y')}"
        title_cell.value = f"THỐNG KÊ THEO BÁC SĨ/TÂM LÝ GIA{date_label}"
        title_cell.font = Font(bold=True, size=14, color="14479B")
        title_cell.alignment = Alignment(horizontal="center")
        
        # Headers — 10 columns
        headers1 = ["Bệnh nhân", "Ngày hẹn", "Giờ hẹn", "Dịch vụ", "Mã đơn", "Tên thuốc", "Mua tại", "Số lượng", "Thành tiền", "Ngày tái khám"]
        col_widths = [25, 14, 10, 22, 18, 30, 14, 12, 15, 14]
        for col_idx, (header, width) in enumerate(zip(headers1, col_widths), 1):
            cell = ws1.cell(row=3, column=col_idx, value=header)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = header_align
            cell.border = thin_border
            ws1.column_dimensions[cell.column_letter].width = width
        
        # Query prescriptions grouped by doctor
        prescriptions_query = db.query(Prescription).join(
            Appointment, Prescription.appointment_id == Appointment.id
        ).join(
            UserModel, Appointment.doctor_id == UserModel.id
        ).join(
            Patient, Appointment.patient_id == Patient.id
        ).options(
            joinedload(Prescription.items),
            joinedload(Prescription.appointment).joinedload(Appointment.doctor),
            joinedload(Prescription.appointment).joinedload(Appointment.patient),
            joinedload(Prescription.appointment).joinedload(Appointment.appointment_services)
        )
        
        if from_date_obj:
            prescriptions_query = prescriptions_query.filter(Appointment.appointment_date >= from_date_obj)
        if to_date_obj:
            prescriptions_query = prescriptions_query.filter(Appointment.appointment_date <= to_date_obj)
        if doctor_id:
            prescriptions_query = prescriptions_query.filter(Appointment.doctor_id == int(doctor_id))
        
        prescriptions = prescriptions_query.order_by(
            UserModel.full_name, Appointment.appointment_date.desc()
        ).all()
        
        # Group by doctor
        doctors_grouped = {}
        for pres in prescriptions:
            doc = pres.appointment.doctor
            doc_id = doc.id if doc else 0
            if doc_id not in doctors_grouped:
                doctors_grouped[doc_id] = {
                    'name': doc.full_name if doc else 'Chưa xác định',
                    'prescriptions': []
                }
            doctors_grouped[doc_id]['prescriptions'].append(pres)
        
        row = 4
        grand_total_pres = 0
        grand_total_qty = 0
        grand_total_amount = 0
        
        prescription_fill = PatternFill(start_color="DBEAFE", end_color="DBEAFE", fill_type="solid")
        prescription_font = Font(bold=True, size=11)
        doctor_fill_dark = PatternFill(start_color="14479B", end_color="14479B", fill_type="solid")
        doctor_font_white = Font(bold=True, size=11, color="FFFFFF")
        
        for doc_id, doc_data in doctors_grouped.items():
            # Level 1: Doctor header row — merge all 10 cols
            ws1.merge_cells(start_row=row, start_column=1, end_row=row, end_column=10)
            cell = ws1.cell(row=row, column=1, value=f"▸ {doc_data['name']}")
            cell.font = doctor_font_white
            cell.fill = doctor_fill_dark
            for c in range(1, 11):
                ws1.cell(row=row, column=c).border = thin_border
                ws1.cell(row=row, column=c).fill = doctor_fill_dark
            row += 1
            
            for pres in doc_data['prescriptions']:
                appt = pres.appointment
                patient = appt.patient
                services = ', '.join([s.service.name for s in appt.appointment_services if s.service]) if appt.appointment_services else ''
                
                recheck = ''
                if pres.re_examination_date:
                    recheck = pres.re_examination_date.strftime('%d/%m/%Y') if hasattr(pres.re_examination_date, 'strftime') else str(pres.re_examination_date)
                
                appt_date = appt.appointment_date.strftime('%d/%m/%Y') if appt.appointment_date else ''
                appt_time = appt.appointment_date.strftime('%H:%M') if appt.appointment_date else ''
                
                pres_code = pres.prescription_code or ''
                
                # Filter items by medicine_type if needed
                filtered_items = []
                for item in pres.items:
                    if medicine_type:
                        med = db.query(Medicine).filter(Medicine.id == item.medicine_id).first() if item.medicine_id else None
                        if not med or med.prescription_type != medicine_type:
                            continue
                    filtered_items.append(item)
                
                # Calculate prescription totals
                pres_qty = sum(float(it.quantity) if it.quantity else 0 for it in filtered_items)
                pres_amount = sum(
                    (float(it.quantity) if it.quantity else 0) * (0 if it.is_external else (float(it.unit_price) if it.unit_price else 0))
                    for it in filtered_items
                )
                
                # Level 2: Patient row — cols 1-5 patient info, cols 8-9 totals, col 10 recheck
                ws1.cell(row=row, column=1, value=f"  → {patient.full_name}" if patient else '').font = prescription_font
                ws1.cell(row=row, column=2, value=appt_date).font = prescription_font
                ws1.cell(row=row, column=3, value=str(appt_time)).font = prescription_font
                ws1.cell(row=row, column=4, value=services).font = prescription_font
                ws1.cell(row=row, column=5, value=pres_code).font = prescription_font
                # cols 6-7 empty for patient row
                ws1.cell(row=row, column=8, value=pres_qty).font = prescription_font
                ws1.cell(row=row, column=8).number_format = '#,##0'
                ws1.cell(row=row, column=9, value=pres_amount).font = prescription_font
                ws1.cell(row=row, column=9).number_format = '#,##0'
                ws1.cell(row=row, column=10, value=recheck).font = prescription_font
                for c in range(1, 11):
                    ws1.cell(row=row, column=c).fill = prescription_fill
                    ws1.cell(row=row, column=c).border = thin_border
                row += 1
                
                # Level 3: Medicine item rows — only cols 6-9
                for item in filtered_items:
                    qty = float(item.quantity) if item.quantity else 0
                    price = 0 if item.is_external else (float(item.unit_price) if item.unit_price else 0)
                    amount = qty * price
                    purchase = 'Bên ngoài' if item.is_external else 'Phòng khám'
                    
                    ws1.cell(row=row, column=6, value=item.medicine_name)
                    ws1.cell(row=row, column=7, value=purchase)
                    ws1.cell(row=row, column=8, value=qty)
                    ws1.cell(row=row, column=8).number_format = '#,##0'
                    ws1.cell(row=row, column=9, value=amount)
                    ws1.cell(row=row, column=9).number_format = '#,##0'
                    for c in range(1, 11):
                        ws1.cell(row=row, column=c).border = thin_border
                    row += 1
                
                grand_total_pres += 1
                grand_total_qty += pres_qty
                grand_total_amount += pres_amount
        
        # Grand total row
        ws1.merge_cells(start_row=row, start_column=1, end_row=row, end_column=7)
        cell = ws1.cell(row=row, column=1, value=f"TỔNG CỘNG — {grand_total_pres} đơn thuốc")
        cell.font = total_font
        cell.fill = total_fill
        ws1.cell(row=row, column=8, value=grand_total_qty).font = total_font
        ws1.cell(row=row, column=8).number_format = '#,##0'
        ws1.cell(row=row, column=9, value=grand_total_amount).font = total_font
        ws1.cell(row=row, column=9).number_format = '#,##0'
        for c in range(1, 11):
            ws1.cell(row=row, column=c).border = thin_border
            ws1.cell(row=row, column=c).fill = total_fill
        
        # ==================== SHEET 2: TỒN KHO ====================
        ws2 = wb.create_sheet("Tồn kho")
        
        ws2.merge_cells('A1:I1')
        title2 = ws2['A1']
        title2.value = f"THỐNG KÊ TỒN KHO{date_label}"
        title2.font = Font(bold=True, size=14, color="14479B")
        title2.alignment = Alignment(horizontal="center")
        
        headers2 = ["STT", "Tên thuốc", "Loại", "Giá nhập", "Giá bán", "Đã bốc", "Tồn kho", "Hạn dùng", "Trạng thái"]
        col_widths2 = [6, 30, 12, 14, 14, 10, 10, 14, 12]
        for col_idx, (header, width) in enumerate(zip(headers2, col_widths2), 1):
            cell = ws2.cell(row=3, column=col_idx, value=header)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = header_align
            cell.border = thin_border
            ws2.column_dimensions[cell.column_letter].width = width
        
        # Query inventory data
        dispensed_query = db.query(
            PrescriptionItem.medicine_id,
            func.sum(PrescriptionItem.quantity)
        ).join(
            Prescription, PrescriptionItem.prescription_id == Prescription.id
        ).join(
            Appointment, Prescription.appointment_id == Appointment.id
        ).filter(
            PrescriptionItem.medicine_id.isnot(None),
            PrescriptionItem.is_external == False
        )
        if from_date_obj:
            dispensed_query = dispensed_query.filter(Appointment.appointment_date >= from_date_obj)
        if to_date_obj:
            dispensed_query = dispensed_query.filter(Appointment.appointment_date <= to_date_obj)
        if doctor_id:
            dispensed_query = dispensed_query.filter(Appointment.doctor_id == int(doctor_id))
        dispensed_query = dispensed_query.group_by(PrescriptionItem.medicine_id)
        dispensed_map = {r[0]: float(r[1]) if r[1] else 0 for r in dispensed_query.all()}
        
        medicines_query = db.query(Medicine).filter(Medicine.is_active == True)
        if medicine_type:
            medicines_query = medicines_query.filter(Medicine.prescription_type == medicine_type)
        medicines = medicines_query.options(joinedload(Medicine.batches)).order_by(Medicine.name).all()
        
        type_map = {'BASIC': 'Cơ bản', 'H': 'Thuốc H', 'N': 'Thuốc N', 'TOXIC': 'Thuốc độc'}
        
        status_fills = {
            'Đủ hàng': PatternFill(start_color="D1FAE5", end_color="D1FAE5", fill_type="solid"),
            'Sắp hết': PatternFill(start_color="FEF3C7", end_color="FEF3C7", fill_type="solid"),
            'Cần nhập': PatternFill(start_color="FEE2E2", end_color="FEE2E2", fill_type="solid"),
        }
        
        row2 = 4
        for idx, med in enumerate(medicines, 1):
            stock_qty = float(med.stock_quantity) if med.stock_quantity else 0
            export_qty = dispensed_map.get(med.id, 0)
            
            latest_batch = None
            if med.batches:
                sorted_batches = sorted(med.batches, key=lambda b: b.expiry_date or date.min, reverse=True)
                latest_batch = sorted_batches[0] if sorted_batches else None
            
            status = 'Đủ hàng'
            if med.low_stock_threshold and stock_qty <= med.low_stock_threshold:
                status = 'Cần nhập' if stock_qty == 0 else 'Sắp hết'
            
            import_price = 0
            if latest_batch and latest_batch.import_price:
                import_price = float(latest_batch.import_price)
            elif med.import_price:
                import_price = float(med.import_price)
            
            expiry = latest_batch.expiry_date.strftime('%d/%m/%Y') if latest_batch and latest_batch.expiry_date else '-'
            
            values2 = [
                idx,
                med.name,
                type_map.get(med.prescription_type, 'Cơ bản'),
                import_price,
                float(med.unit_price) if med.unit_price else 0,
                int(export_qty),
                int(stock_qty),
                expiry,
                status
            ]
            for col_idx, val in enumerate(values2, 1):
                cell = ws2.cell(row=row2, column=col_idx, value=val)
                cell.border = thin_border
                if col_idx in (4, 5):
                    cell.number_format = '#,##0'
                if col_idx == 9:
                    cell.fill = status_fills.get(val, PatternFill())
            row2 += 1
        
        # ==================== SHEET 3: LỊCH SỬ KÊ THUỐC ====================
        ws3 = wb.create_sheet("Lịch sử kê thuốc")
        
        ws3.merge_cells('A1:H1')
        title3 = ws3['A1']
        title3.value = f"LỊCH SỬ KÊ THUỐC{date_label}"
        title3.font = Font(bold=True, size=14, color="14479B")
        title3.alignment = Alignment(horizontal="center")
        
        headers3 = ["Tên thuốc", "Tên gốc/Biệt dược", "Loại thuốc", "Bác sĩ / Ngày kê", "Bệnh nhân", "Mã đơn", "Số viên kê", "Thành tiền"]
        col_widths3 = [30, 25, 12, 25, 25, 18, 12, 15]
        for col_idx, (header, width) in enumerate(zip(headers3, col_widths3), 1):
            cell = ws3.cell(row=3, column=col_idx, value=header)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = header_align
            cell.border = thin_border
            ws3.column_dimensions[cell.column_letter].width = width
        
        # Query prescription items (reuse same pattern as API)
        items_query = db.query(PrescriptionItem).join(
            Prescription, PrescriptionItem.prescription_id == Prescription.id
        ).join(
            Appointment, Prescription.appointment_id == Appointment.id
        ).join(
            UserModel, Appointment.doctor_id == UserModel.id
        ).join(
            Patient, Appointment.patient_id == Patient.id
        )
        if from_date_obj:
            items_query = items_query.filter(Appointment.appointment_date >= from_date_obj)
        if to_date_obj:
            items_query = items_query.filter(Appointment.appointment_date <= to_date_obj)
        if doctor_id:
            items_query = items_query.filter(Appointment.doctor_id == int(doctor_id))
        if medicine_type:
            med_ids = db.query(Medicine.id).filter(Medicine.prescription_type == medicine_type).subquery()
            items_query = items_query.filter(PrescriptionItem.medicine_id.in_(med_ids))
        
        all_items = items_query.order_by(
            PrescriptionItem.medicine_name, UserModel.full_name, Appointment.appointment_date.desc()
        ).all()
        
        # Group into medicine → doctor → items
        med_map = {}
        med_cache = {}
        for item in all_items:
            pres = item.prescription
            appt = pres.appointment
            doc = appt.doctor
            pat = appt.patient
            m = db.query(Medicine).filter(Medicine.id == item.medicine_id).first() if item.medicine_id else None
            mname = m.name if m else item.medicine_name
            mkey = item.medicine_id if item.medicine_id else f"external:{item.id}"
            did = doc.id if doc else 0
            
            if mkey not in med_cache:
                med_cache[mkey] = {
                    'name': mname,
                    'generic_name': m.generic_name if m else '',
                    'med_type': type_map.get(m.prescription_type, 'Cơ bản') if m else 'Cơ bản'
                }
            
            if mkey not in med_map:
                med_map[mkey] = {'doctors': {}}
            if did not in med_map[mkey]['doctors']:
                med_map[mkey]['doctors'][did] = {
                    'name': doc.full_name if doc else 'Chưa xác định',
                    'items': []
                }
            
            qty = float(item.quantity) if item.quantity else 0
            price = 0 if item.is_external else (float(item.unit_price) if item.unit_price else 0)
            med_map[mkey]['doctors'][did]['items'].append({
                'date': appt.appointment_date.strftime('%d/%m/%Y') if appt.appointment_date else '',
                'patient': pat.full_name if pat else '',
                'code': pres.prescription_code or '',
                'qty': qty,
                'amount': qty * price
            })
        
        # Write to sheet
        row3 = 4
        grand_qty = 0
        grand_amount = 0
        
        medicine_fill = PatternFill(start_color="DBEAFE", end_color="DBEAFE", fill_type="solid")
        medicine_font = Font(bold=True, size=11)
        
        for mkey in sorted(med_map.keys(), key=lambda key: med_cache.get(key, {}).get('name', '')):
            info = med_cache.get(mkey, {})
            med_data = med_map[mkey]
            
            # Medicine header row
            med_total_qty = sum(
                sum(it['qty'] for it in d['items'])
                for d in med_data['doctors'].values()
            )
            med_total_amount = sum(
                sum(it['amount'] for it in d['items'])
                for d in med_data['doctors'].values()
            )
            
            values_med = [info.get('name', ''), info.get('generic_name', ''), info.get('med_type', ''), '', '', '', med_total_qty, med_total_amount]
            for col_idx, val in enumerate(values_med, 1):
                cell = ws3.cell(row=row3, column=col_idx, value=val)
                cell.font = medicine_font
                cell.fill = medicine_fill
                cell.border = thin_border
                if col_idx == 7:
                    cell.number_format = '#,##0'
                elif col_idx == 8:
                    cell.number_format = '#,##0'
            row3 += 1
            
            for did, doc_data in med_data['doctors'].items():
                # Doctor sub-header
                doc_qty = sum(it['qty'] for it in doc_data['items'])
                doc_amount = sum(it['amount'] for it in doc_data['items'])
                
                values_doc = ['', '', '', doc_data['name'], '', '', doc_qty, doc_amount]
                for col_idx, val in enumerate(values_doc, 1):
                    cell = ws3.cell(row=row3, column=col_idx, value=val)
                    cell.font = doctor_font
                    cell.fill = doctor_fill
                    cell.border = thin_border
                    if col_idx == 7:
                        cell.number_format = '#,##0'
                    elif col_idx == 8:
                        cell.number_format = '#,##0'
                row3 += 1
                
                # Individual items
                for it in doc_data['items']:
                    values_it = ['', '', '', it['date'], it['patient'], it['code'], it['qty'], it['amount']]
                    for col_idx, val in enumerate(values_it, 1):
                        cell = ws3.cell(row=row3, column=col_idx, value=val)
                        cell.border = thin_border
                        if col_idx == 7:
                            cell.number_format = '#,##0'
                        elif col_idx == 8:
                            cell.number_format = '#,##0'
                    row3 += 1
            
            grand_qty += med_total_qty
            grand_amount += med_total_amount
        
        # Grand total
        ws3.merge_cells(start_row=row3, start_column=1, end_row=row3, end_column=6)
        cell = ws3.cell(row=row3, column=1, value="TỔNG CỘNG")
        cell.font = total_font
        cell.fill = total_fill
        ws3.cell(row=row3, column=7, value=grand_qty).font = total_font
        ws3.cell(row=row3, column=7).number_format = '#,##0'
        ws3.cell(row=row3, column=8, value=grand_amount).font = total_font
        ws3.cell(row=row3, column=8).number_format = '#,##0'
        for c in range(1, 9):
            ws3.cell(row=row3, column=c).border = thin_border
            ws3.cell(row=row3, column=c).fill = total_fill

        # Save to buffer
        buffer = BytesIO()
        wb.save(buffer)
        buffer.seek(0)
        
        response = make_response(buffer.getvalue())
        response.headers['Content-Type'] = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        filename = f"thong_ke_thuoc_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        response.headers['Content-Disposition'] = f'attachment; filename={filename}'
        return response
        
    except Exception as e:
        logger.error(f"Error exporting statistics: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({'success': False, 'detail': str(e)}), 500
    finally:
        db.close()
