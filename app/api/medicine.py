from flask import Blueprint, request, jsonify, make_response
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.config import settings
from app.models.medicine import Medicine
from app.models.medicine_category import MedicineCategory
from app.models.medicine_batch import MedicineBatch
from app.models.supplier import Supplier
from app.api.auth import require_auth
from app.utils.patient_utils import generate_medicine_code
from app.realtime.events import emit_inventory_changed
import logging
from datetime import datetime, date, timedelta
from sqlalchemy import func, and_, or_, text
import unicodedata

logger = logging.getLogger(__name__)

medicine_router = Blueprint('medicine', __name__)


def remove_accents(input_str):
    """Bỏ dấu tiếng Việt để tìm kiếm accent-insensitive"""
    if not input_str:
        return ""
    nfkd = unicodedata.normalize('NFD', input_str)
    return ''.join(c for c in nfkd if not unicodedata.combining(c)).replace('đ', 'd').replace('Đ', 'D')


# Bảng ánh xạ đầy đủ ký tự tiếng Việt có dấu → không dấu (cho PostgreSQL translate())
_VN_ACCENTED  = 'àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ'
_VN_UNACCENTED = 'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd'
_VN_ACCENTED_UPPER  = _VN_ACCENTED.upper()
_VN_UNACCENTED_UPPER = _VN_UNACCENTED.upper()
_TRANSLATE_FROM = _VN_ACCENTED + _VN_ACCENTED_UPPER
_TRANSLATE_TO   = _VN_UNACCENTED + _VN_UNACCENTED_UPPER


def _pg_unaccent(column):
    """Bỏ dấu tiếng Việt trong Postgres bằng translate() — xử lý tất cả dấu thanh"""
    return func.lower(func.translate(column, _TRANSLATE_FROM, _TRANSLATE_TO))


def validate_date(date_str):
    """Validate và convert date string to proper format"""
    if not date_str or date_str == '':
        return None
    
    try:
        # Thử parse các format ngày khác nhau
        date_formats = [
            '%Y-%m-%d',      # 2025-12-31
            '%d/%m/%Y',      # 31/12/2025
            '%m/%d/%Y',      # 12/31/2025
            '%Y-%m-%d %H:%M:%S',  # 2025-12-31 00:00:00
        ]
        
        for fmt in date_formats:
            try:
                parsed_date = datetime.strptime(str(date_str), fmt)
                return parsed_date.date()
            except ValueError:
                continue
        
        # Nếu không parse được, log warning và return None
        # Chỉ log warning nếu ngày có vẻ hợp lý (không phải lỗi Excel)
        if len(str(date_str)) > 5:  # Chỉ log nếu có vẻ là ngày thật
            logger.warning(f"Không thể parse ngày: {date_str}")
        return None
        
    except Exception as e:
        logger.warning(f"Lỗi validate ngày {date_str}: {e}")
        return None


def truncate_string(value, max_length):
    """Cắt ngắn string nếu quá dài"""
    if not value or value == '':
        return None
    
    value_str = str(value).strip()
    if len(value_str) > max_length:
        logger.warning(f"Cắt ngắn string từ {len(value_str)} ký tự xuống {max_length}: {value_str[:50]}...")
        return value_str[:max_length]
    
    return value_str


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
        category_type = request.args.get('category_type', '')
        is_imported = request.args.get('is_imported', '')  # 'true' | 'false'
        has_low_stock = request.args.get('has_low_stock', '')  # 'true'
        expires_in_days = request.args.get('expires_in_days', type=int)
        sort_by = request.args.get('sort_by', 'updated_at')  # Mặc định sort theo updated_at
        
        # Build query
        query = db.query(Medicine)
        
        # Apply filters
        if search:
            query = query.filter(
                or_(
                    Medicine.name.ilike(f'%{search}%'),
                    Medicine.generic_name.ilike(f'%{search}%')
                )
            )
            
        if category:
            # Filter by category name instead of ID
            query = query.join(MedicineCategory).filter(MedicineCategory.name == category)
            
        if unit:
            query = query.filter(Medicine.unit == unit)

        if category_type:
            query = query.filter(Medicine.category_type == category_type)

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
        
        # Eager load batches để tính batch_count hiệu quả
        from sqlalchemy.orm import joinedload
        for medicine in medicines:
            # Load batches để có thể đếm
            _ = len(medicine.batches) if medicine.batches else 0
        
        # Convert to dict & computed filters
        medicines_data = [medicine.to_dict() for medicine in medicines]
        if has_low_stock == 'true':
            medicines_data = [m for m in medicines_data if m.get('is_low_stock')]
        if isinstance(expires_in_days, int):
            medicines_data = [m for m in medicines_data if m.get('days_to_expiry') is not None and m.get('days_to_expiry') <= expires_in_days]
        
        return jsonify({
            'medicines': medicines_data,
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


@medicine_router.route('/medicines/', methods=['POST'])
@require_auth
def create_medicine(user):
    """Tạo thuốc mới"""
    try:
        db = next(get_db())
        data = request.get_json()
        
        # Validate required fields
        required_fields = ['name', 'unit', 'category_type', 'prescription_type']
        for field in required_fields:
            if not data.get(field):
                return jsonify({"error": f"Thiếu trường bắt buộc: {field}"}), 400
        
        # Xử lý đơn giá bán và đơn giá vốn - không bắt buộc, cho phép None hoặc 0
        unit_price = data.get('unit_price')
        if unit_price is not None:
            try:
                unit_price = float(unit_price) if unit_price != '' else None
                if unit_price is not None and unit_price < 0:
                    return jsonify({"error": "'Đơn giá bán' không được âm"}), 400
            except (ValueError, TypeError):
                unit_price = None
        else:
            unit_price = None
        
        import_price = data.get('import_price')
        if import_price is not None:
            try:
                import_price = float(import_price) if import_price != '' else None
                if import_price is not None and import_price < 0:
                    return jsonify({"error": "'Đơn giá vốn' không được âm"}), 400
            except (ValueError, TypeError):
                import_price = None
        else:
            import_price = None
        
        # Normalize internal_code - chuyển chuỗi rỗng thành None
        internal_code = data.get('internal_code')
        if isinstance(internal_code, str):
            internal_code = internal_code.strip()
        if not internal_code:
            internal_code = None
        
        # Tự động sinh mã thuốc nếu không có
        if not internal_code:
            try:
                internal_code = generate_medicine_code(db)
            except Exception as e:
                logger.error(f"Error generating medicine code: {e}")
                return jsonify({"error": "Không thể tạo mã thuốc tự động"}), 500
        else:
            # Validate internal_code unique if provided
            existing = db.query(Medicine).filter(Medicine.internal_code == internal_code).first()
            if existing:
                return jsonify({"error": "Mã thuốc đã tồn tại"}), 400
        
        # Normalize national_code - chuyển chuỗi rỗng thành None
        national_code = data.get('national_code')
        if isinstance(national_code, str):
            national_code = national_code.strip()
        if not national_code:
            national_code = None
        
        # Convert checkbox value to boolean
        is_imported = data.get('is_imported') == True or str(data.get('is_imported')).lower() == 'true'
        
        # Validate prescription_type
        prescription_type = data.get('prescription_type', 'BASIC')
        valid_prescription_types = ['BASIC', 'H', 'N', 'TOXIC']  # TOXIC = Thuốc độc
        if prescription_type not in valid_prescription_types:
            return jsonify({"error": "Loại đơn thuốc không hợp lệ. Chỉ chấp nhận: BASIC, H, N, TOXIC"}), 400
        
        # Handle empty date fields
        expiry_date = data.get('expiry_date')
        if expiry_date == '':
            expiry_date = None
        
        # Create new medicine
        medicine = Medicine(
            name=data['name'],
            generic_name=data.get('generic_name'),
            internal_code=internal_code,
            national_code=national_code,
            unit_price=unit_price,
            import_price=import_price,
            unit=data['unit'],
            strength=data.get('strength'),
            stock_quantity=float(data['stock_quantity']) if data.get('stock_quantity') is not None else 0.0,  # Hỗ trợ số thập phân
            expiry_date=expiry_date,
            description=data.get('description'),
            category_type=data.get('category_type', 'DRUG'),
            prescription_type=prescription_type,
            is_imported=is_imported,
            administration_method=data.get('administration_method'),
            low_stock_threshold=data.get('low_stock_threshold'),
            expiry_warning_days=data.get('expiry_warning_days'),
            packaging=data.get('packaging'),
            units_per_box=data.get('units_per_box'),
            packaging_unit=data.get('packaging_unit'),
            origin=data.get('origin')
        )
        
        db.add(medicine)
        db.commit()
        db.refresh(medicine)
        emit_inventory_changed('medicine_created', entity='medicine', entity_id=medicine.id)
        
        return jsonify({
            "message": "Tạo thuốc thành công",
            "medicine": medicine.to_dict()
        }), 201
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating medicine: {e}")
        return jsonify({"error": "Lỗi khi tạo thuốc"}), 500
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
        
        return jsonify(medicine.to_dict())
        
    except Exception as e:
        logger.error(f"Error getting medicine: {e}")
        return jsonify({"error": "Lỗi khi lấy thông tin thuốc"}), 500
    finally:
        db.close()


@medicine_router.route('/medicines/inventory-count', methods=['POST'])
@require_auth
def inventory_count(user):
    """Điều chỉnh tồn kho sau kiểm kê"""
    db = next(get_db())
    try:
        data = request.get_json()
        adjustments = data.get('adjustments', [])
        
        if not adjustments or len(adjustments) == 0:
            return jsonify({'detail': 'Không có điều chỉnh nào'}), 400, {'Content-Type': 'application/json; charset=utf-8'}
        
        updated_medicines = []
        
        for adj in adjustments:
            medicine_id = adj.get('medicine_id')
            actual_quantity = adj.get('actual_quantity')
            note = adj.get('note', '')
            
            if not medicine_id or actual_quantity is None:
                continue
            
            medicine = db.query(Medicine).filter(Medicine.id == medicine_id).first()
            if not medicine:
                continue
            
            # Cập nhật số lượng tồn kho
            old_quantity = float(medicine.stock_quantity) if medicine.stock_quantity else 0
            medicine.stock_quantity = float(actual_quantity)
            
            updated_medicines.append({
                'medicine_id': medicine_id,
                'medicine_name': medicine.name,
                'old_quantity': old_quantity,
                'new_quantity': actual_quantity,
                'difference': actual_quantity - old_quantity,
                'note': note
            })
        
        db.commit()
        emit_inventory_changed('inventory_counted', entity='medicine', extra={
            'adjustments': updated_medicines,
        })
        
        return jsonify({
            'success': True,
            'message': f'Điều chỉnh thành công {len(updated_medicines)} thuốc',
            'adjustments': updated_medicines
        }), 200, {'Content-Type': 'application/json; charset=utf-8'}
        
    except Exception as e:
        db.rollback()
        logger.error(f"Lỗi điều chỉnh tồn kho: {e}")
        return jsonify({'detail': 'Lỗi điều chỉnh tồn kho', 'error': str(e)}), 500, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()


@medicine_router.route('/medicines/export/excel', methods=['GET'])
@require_auth
def export_medicines_excel(user):
    """Xuất dữ liệu ra Excel"""
    from flask import send_file
    from io import BytesIO
    import pandas as pd
    from datetime import datetime
    
    db = next(get_db())
    try:
        export_type = request.args.get('type', 'medicines')
        
        if export_type == 'medicines':
            # Xuất danh sách thuốc
            medicines = db.query(Medicine).filter(Medicine.is_active == True).all()
            
            data = []
            for med in medicines:
                data.append({
                    'Tên thuốc': med.name,
                    'Mô tả': med.description or '',
                    'Loại thuốc': med.category_type or '',
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
            
        elif export_type == 'stock_report':
            # Xuất báo cáo tồn kho
            batches = db.query(MedicineBatch).filter(MedicineBatch.remaining_quantity > 0).all()
            
            data = []
            for batch in batches:
                data.append({
                    'Tên thuốc': batch.medicine.name if batch.medicine else '',
                    'Số lô': batch.batch_number or '',
                    'Ngày nhập': batch.import_date.strftime('%d/%m/%Y') if batch.import_date else '',
                    'Hạn sử dụng': batch.expiry_date.strftime('%d/%m/%Y') if batch.expiry_date else '',
                    'Số lượng nhập': float(batch.quantity) if batch.quantity else 0,
                    'Số lượng còn lại': float(batch.remaining_quantity) if batch.remaining_quantity else 0,
                    'Giá nhập': float(batch.import_price) if batch.import_price else 0,
                    'Giá trị tồn': float(batch.remaining_quantity * batch.import_price) if batch.remaining_quantity and batch.import_price else 0,
                    'Nhà cung cấp': batch.supplier.name if batch.supplier else ''
                })
            
            df = pd.DataFrame(data)
            output = BytesIO()
            with pd.ExcelWriter(output, engine='openpyxl') as writer:
                df.to_excel(writer, index=False, sheet_name='Báo cáo tồn kho')
            output.seek(0)
            
            filename = f'bao_cao_ton_kho_{datetime.now().strftime("%Y%m%d")}.xlsx'
            return send_file(output, mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 
                           as_attachment=True, download_name=filename)
            
        elif export_type == 'transactions':
            # Xuất lịch sử giao dịch (tạm thời trả về danh sách batches)
            batches = db.query(MedicineBatch).order_by(MedicineBatch.import_date.desc()).all()
            
            data = []
            for batch in batches:
                data.append({
                    'Ngày giao dịch': batch.import_date.strftime('%d/%m/%Y') if batch.import_date else '',
                    'Loại': 'Nhập kho',
                    'Tên thuốc': batch.medicine.name if batch.medicine else '',
                    'Số lô': batch.batch_number or '',
                    'Số lượng': float(batch.quantity) if batch.quantity else 0,
                    'Giá nhập': float(batch.import_price) if batch.import_price else 0,
                    'Thành tiền': float(batch.quantity * batch.import_price) if batch.quantity and batch.import_price else 0,
                    'Nhà cung cấp': batch.supplier.name if batch.supplier else ''
                })
            
            df = pd.DataFrame(data)
            output = BytesIO()
            with pd.ExcelWriter(output, engine='openpyxl') as writer:
                df.to_excel(writer, index=False, sheet_name='Lịch sử giao dịch')
            output.seek(0)
            
            filename = f'lich_su_giao_dich_{datetime.now().strftime("%Y%m%d")}.xlsx'
            return send_file(output, mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 
                           as_attachment=True, download_name=filename)
            
        elif export_type == 'suppliers':
            # Xuất báo cáo nhà cung cấp
            suppliers = db.query(Supplier).filter(Supplier.is_active == 1).all()
            
            data = []
            for supplier in suppliers:
                # Đếm số lô từ nhà cung cấp này
                batch_count = db.query(MedicineBatch).filter(MedicineBatch.supplier_id == supplier.id).count()
                
                data.append({
                    'Tên nhà cung cấp': supplier.name,
                    'Số điện thoại': supplier.phone or '',
                    'Email': supplier.email or '',
                    'Địa chỉ': supplier.address or '',
                    'Số lô đã nhập': batch_count,
                    'Ghi chú': supplier.notes or ''
                })
            
            df = pd.DataFrame(data)
            output = BytesIO()
            with pd.ExcelWriter(output, engine='openpyxl') as writer:
                df.to_excel(writer, index=False, sheet_name='Nhà cung cấp')
            output.seek(0)
            
            filename = f'bao_cao_nha_cung_cap_{datetime.now().strftime("%Y%m%d")}.xlsx'
            return send_file(output, mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 
                           as_attachment=True, download_name=filename)
        
        else:
            return jsonify({'detail': 'Loại xuất dữ liệu không hợp lệ'}), 400, {'Content-Type': 'application/json; charset=utf-8'}
            
    except Exception as e:
        logger.error(f"Error exporting to Excel: {e}")
        return jsonify({'detail': str(e)}), 500, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()


@medicine_router.route('/medicines/export/pdf', methods=['GET'])
@require_auth
def export_medicines_pdf(user):
    """Xuất dữ liệu ra PDF (tạm thời trả về thông báo)"""
    return jsonify({'detail': 'Chức năng xuất PDF đang được phát triển'}), 501, {'Content-Type': 'application/json; charset=utf-8'}


@medicine_router.route('/medicines/<int:medicine_id>', methods=['PUT'])
@require_auth
def update_medicine(user, medicine_id):
    """Cập nhật thông tin thuốc"""
    try:
        db = next(get_db())
        data = request.get_json()
        
        medicine = db.query(Medicine).filter(Medicine.id == medicine_id).first()
        if not medicine:
            return jsonify({"error": "Không tìm thấy thuốc"}), 404
        # Normalize and validate internal_code trước khi cập nhật
        old_internal_code = medicine.internal_code
        if 'internal_code' in data:
            raw_internal_code = data.get('internal_code')
            if isinstance(raw_internal_code, str):
                normalized_internal_code = raw_internal_code.strip()
            else:
                normalized_internal_code = raw_internal_code

            if not normalized_internal_code:
                normalized_internal_code = None
            elif normalized_internal_code != old_internal_code:
                existing = (
                    db.query(Medicine)
                    .filter(Medicine.internal_code == normalized_internal_code, Medicine.id != medicine_id)
                    .first()
                )
                if existing:
                    return jsonify({"error": "Mã thuốc đã tồn tại"}), 400
            data['internal_code'] = normalized_internal_code
        
        # Normalize national_code - chuyển chuỗi rỗng thành None
        if 'national_code' in data:
            raw_national_code = data.get('national_code')
            if isinstance(raw_national_code, str):
                normalized_national_code = raw_national_code.strip()
            else:
                normalized_national_code = raw_national_code
            
            if not normalized_national_code:
                normalized_national_code = None
            data['national_code'] = normalized_national_code
        
        # Validate prescription_type if provided
        if 'prescription_type' in data:
            prescription_type = data.get('prescription_type')
            valid_prescription_types = ['BASIC', 'H', 'N', 'TOXIC']  # TOXIC = Thuốc độc
            if prescription_type not in valid_prescription_types:
                return jsonify({"error": "Loại đơn thuốc không hợp lệ. Chỉ chấp nhận: BASIC, H, N, TOXIC"}), 400
        
        # Xử lý đơn giá bán và đơn giá vốn - không bắt buộc, cho phép None hoặc 0
        if 'unit_price' in data:
            unit_price = data.get('unit_price')
            if unit_price is not None and unit_price != '':
                try:
                    unit_price = float(unit_price)
                    if unit_price < 0:
                        return jsonify({"error": "'Đơn giá bán' không được âm"}), 400
                except (ValueError, TypeError):
                    unit_price = None
            else:
                unit_price = None
            medicine.unit_price = unit_price
        
        if 'import_price' in data:
            import_price = data.get('import_price')
            if import_price is not None and import_price != '':
                try:
                    import_price = float(import_price)
                    if import_price < 0:
                        return jsonify({"error": "'Đơn giá vốn' không được âm"}), 400
                except (ValueError, TypeError):
                    import_price = None
            else:
                import_price = None
            medicine.import_price = import_price
        
        # Handle empty date fields
        if 'expiry_date' in data:
            expiry_date = data.get('expiry_date')
            if expiry_date == '' or expiry_date is None:
                expiry_date = None
            medicine.expiry_date = expiry_date
        
        # Update fields
        update_fields = [
            'name', 'generic_name', 'internal_code', 'national_code',
            'unit', 'strength',
            'stock_quantity',
            'description', 'category_type', 'prescription_type', 'administration_method',
            'low_stock_threshold', 'expiry_warning_days', 'packaging', 'units_per_box', 'packaging_unit', 'origin'
        ]
        
        for field in update_fields:
            if field in data:
                setattr(medicine, field, data[field])
        
        # Handle is_imported separately (checkbox value)
        if 'is_imported' in data:
            medicine.is_imported = data['is_imported'] == True or str(data['is_imported']).lower() == 'true'
        
        db.commit()
        db.refresh(medicine)
        emit_inventory_changed('medicine_updated', entity='medicine', entity_id=medicine.id)
        
        return jsonify({
            "message": "Cập nhật thuốc thành công",
            "medicine": medicine.to_dict()
        })
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating medicine: {e}")
        return jsonify({"error": "Lỗi khi cập nhật thuốc"}), 500
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
        
        # Tính tổng giá trị tồn kho từ batches
        total_value = 0
        for batch in all_batches:
            if batch.remaining_quantity and batch.import_price:
                total_value += float(batch.remaining_quantity) * float(batch.import_price)
        
        # Tính cảnh báo từ batches đã load sẵn (tránh lazy loading)
        warning_count = 0
        
        # Cảnh báo từ batches đã load
        for batch in all_batches:
            # Cảnh báo sắp hết hạn từ batch
            if batch.expiry_date:
                try:
                    days_to_expiry = (batch.expiry_date - today).days
                    if days_to_expiry <= 30 and days_to_expiry >= 0:
                        warning_count += 1
                    elif days_to_expiry < 0:
                        warning_count += 1
                except Exception:
                    pass
            
            # Cảnh báo lô sắp hết
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
            
            # Cảnh báo sắp hết hạn (từ medicine)
            if medicine.expiry_warning_days and medicine.expiry_date:
                try:
                    days_to_expiry = (medicine.expiry_date - today).days
                    if days_to_expiry <= medicine.expiry_warning_days and days_to_expiry >= 0:
                        warning_count += 1
                except Exception:
                    pass
        
        return jsonify({
            'total_medicines': total_medicines,
            'total_value': total_value,
            'total_batches': total_batches,
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


@medicine_router.route('/medicines/import', methods=['POST'])
@require_auth
def import_medicines(user):
    """Import danh sách thuốc từ file Excel"""
    try:
        db = next(get_db())
        
        # Kiểm tra file upload
        if 'file' not in request.files:
            return jsonify({
                'success': False,
                'detail': 'Không có file được upload'
            }), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({
                'success': False,
                'detail': 'Không có file được chọn'
            }), 400
        
        # Đọc file Excel
        import pandas as pd
        import io
        import openpyxl  # Đảm bảo openpyxl được import để pandas có thể đọc Excel
        
        # Đọc file Excel
        df = pd.read_excel(file, engine='openpyxl')
        logger.info(f"File Excel có {len(df)} dòng, {len(df.columns)} cột")
        logger.info(f"Các cột trong file: {list(df.columns)}")
        
        # Chuyển đổi tất cả dữ liệu thành string để tránh lỗi kiểu dữ liệu
        for col in df.columns:
            df[col] = df[col].astype(str)
            df[col] = df[col].replace('nan', '')
        
        logger.info(f"Dữ liệu sau khi chuyển đổi: {df.head().to_dict()}")
        
        # Mapping tên cột cũ sang tên mới (hỗ trợ cả hai)
        # Hỗ trợ cả tên cũ và tên mới để backward compatibility
        column_mapping = {
            'Đơn vị tính': 'Đơn vị dùng',
            'Đơn vị sử dụng/lần': 'Đơn vị dùng',  # Map tên cũ sang tên mới
            'Tên thuốc': 'Tên thuốc/dụng cụ',
            'Đơn giá': 'Đơn giá bán',
            'Đơn giá nhập': 'Đơn giá vốn nhập',
            'Đơn giá vốn': 'Đơn giá vốn nhập',  # Map tên cũ sang tên mới
            'Hàm lượng': 'Hàm lượng',
            'Dạng thuốc/Hàm lượng': 'Hàm lượng',  # Map tên cũ sang tên mới
            'Mô tả': 'Ghi chú',
            'Ghi chú thuốc': 'Ghi chú',  # Map tên cũ sang tên mới
            'Đơn vị đóng gói': 'Đóng gói',  # Map tên cũ sang tên mới
            'Quy cách đóng gói': 'Quy cách',  # Map tên cũ sang tên mới
            'Thuốc nội/ngoại': 'Thuốc Nội/Ngoại',  # Map tên cũ sang tên mới
            'Thông báo khi SL tồn nhỏ hơn': 'Cảnh báo SL tồn',  # Map tên cũ sang tên mới
            'Thông báo thuốc hết hạn (x ngày)': 'Cảnh báo hết hạn'  # Map tên cũ sang tên mới
        }
        
        # Đổi tên cột nếu có mapping
        df.rename(columns=column_mapping, inplace=True)
        
        # Normalize tên cột: xóa dấu * và khoảng trắng thừa (để xử lý cả header có * và không có *)
        df.columns = df.columns.str.replace(r'\s*\*\s*$', '', regex=True).str.strip()
        
        logger.info(f"Các cột sau khi normalize: {list(df.columns)}")
        logger.info(f"Kiểm tra cột 'Đóng gói' có trong danh sách: {'Đóng gói' in df.columns}")
        logger.info(f"Kiểm tra cột 'Tổng tồn (viên)' có trong danh sách: {'Tổng tồn (viên)' in df.columns}")
        
        # Kiểm tra cột bắt buộc (KHỚP 100% VỚI UI MÀN HÌNH THÊM MỚI)
        required_columns = [
            'Tên thuốc/dụng cụ',  # name - bắt buộc
            'Thể loại',  # category_type - bắt buộc
            'Loại đơn thuốc',  # prescription_type - bắt buộc
            'Đơn vị dùng',  # unit - bắt buộc (UI: "Đơn vị dùng")
            'Phương thức dùng',  # administration_method - bắt buộc
            'Tổng tồn (viên)'  # stock_quantity - bắt buộc (tên mới)
            # 'Đơn giá vốn nhập' - không bắt buộc (có thể để trống hoặc = 0)
            # 'Đơn giá bán' - không bắt buộc (có thể để trống hoặc = 0)
            # 'Tổng (viên)' - tên cũ (backward compatibility, không bắt buộc trong required_columns)
            # 'Số lượng tồn' - tên cũ (backward compatibility, không bắt buộc trong required_columns)
            # 'Ngày hết hạn' - không bắt buộc (có thể để trống)
        ]
        
        # Các cột tùy chọn (KHỚP 100% VỚI UI MÀN HÌNH THÊM MỚI)
        optional_columns = [
            'Tên gốc/Biệt dược',  # generic_name
            'Mã thuốc',  # internal_code
            'Mã DQG',  # national_code
            'Thuốc Nội/Ngoại',  # is_imported (UI: "Thuốc Nội/Ngoại")
            'Đóng gói',  # packaging_unit (UI: "Đóng gói")
            'Số đơn vị',  # units_per_box
            'Đơn giá vốn nhập',  # import_price - không bắt buộc
            'Đơn giá bán',  # unit_price - không bắt buộc
            'Hộp/Lọ/Vỉ/Chai Tồn',  # Tùy chọn: Số lượng theo đơn vị đóng gói
            'Viên/Gói/Chai/Ống Tồn',  # Tùy chọn: Số lượng lẻ theo đơn vị dùng
            '{Đơn vị đóng gói} tồn',  # Tên cũ (backward compatibility)
            '{Đơn vị dùng} tồn',  # Tên cũ (backward compatibility)
            'Hàm lượng',  # strength (UI: "Hàm lượng")
            'Ngày hết hạn',  # expiry_date - tùy chọn
            'Cảnh báo SL tồn',  # low_stock_threshold (UI: "Cảnh báo SL tồn")
            'Cảnh báo hết hạn',  # expiry_warning_days (UI: "Cảnh báo hết hạn")
            'Quy cách',  # packaging (UI: "Quy cách")
            'Nguồn gốc',  # origin
            'Ghi chú'  # description (UI: "Ghi chú")
        ]
        
        # Kiểm tra cột bắt buộc
        missing_required = []
        for col in required_columns:
            if col not in df.columns:
                # Xử lý đặc biệt cho "Tổng tồn (viên)": cho phép tên cũ "Tổng (viên)" hoặc "Số lượng tồn"
                if col == 'Tổng tồn (viên)':
                    if 'Tổng (viên)' not in df.columns and 'Số lượng tồn' not in df.columns:
                        missing_required.append(col)
                else:
                    missing_required.append(col)
        
        if missing_required:
            logger.error(f"Thiếu các cột bắt buộc: {missing_required}")
            missing_list = "\n- ".join(missing_required)
            return jsonify({
                'success': False,
                'detail': f'Thiếu các cột BẮT BUỘC sau:\n- {missing_list}\n\nVui lòng tải lại file mẫu Excel và đảm bảo có đầy đủ các cột trên.'
            }), 400
        
        # Kiểm tra cột không hợp lệ (cảnh báo nhưng không chặn)
        all_valid_columns = required_columns + optional_columns
        invalid_columns = [col for col in df.columns if col not in all_valid_columns]
        if invalid_columns:
            logger.warning(f"Các cột không hợp lệ (sẽ bị bỏ qua): {invalid_columns}")
        
        imported_count = 0
        errors = []
        
        # Helper function để lấy giá trị từ row và strip an toàn
        def get_row_value(row, key, default=''):
            """Lấy giá trị từ pandas row và chuyển sang string, strip"""
            try:
                value = row.get(key, default)
                if pd.isna(value) or value == '' or value == 'nan':
                    return default
                return str(value).strip()
            except Exception:
                return default
        
        # Xử lý từng dòng
        total_rows = len(df)
        skipped_count = 0
        logger.info(f"Bắt đầu xử lý {total_rows} dòng dữ liệu")
        for index, row in df.iterrows():
            try:
                row_num = index + 2  # Dòng trong Excel (bắt đầu từ 2 vì có header)
                medicine_name = get_row_value(row, 'Tên thuốc/dụng cụ', '')
                
                if not medicine_name or medicine_name == '':
                    error_msg = f"Dòng {row_num}: Thiếu 'Tên thuốc/dụng cụ' (bắt buộc) - ĐÃ BỎ QUA"
                    logger.warning(error_msg)
                    errors.append(error_msg)
                    skipped_count += 1
                    continue
                
                logger.info(f"Xử lý dòng {row_num}: {medicine_name}")
                
                # Xử lý thể loại (category_type) - bắt buộc
                category_type_raw = get_row_value(row, 'Thể loại', '')
                category_type_map = {
                    'Thuốc': 'DRUG',
                    'TPCN': 'SUPPLEMENT',
                    'Y dụng cụ': 'EQUIPMENT',
                    'DRUG': 'DRUG',
                    'SUPPLEMENT': 'SUPPLEMENT',
                    'EQUIPMENT': 'EQUIPMENT'
                }
                category_type = category_type_map.get(category_type_raw, 'DRUG')
                
                # Xử lý loại đơn thuốc (prescription_type) - bắt buộc
                prescription_type_raw = get_row_value(row, 'Loại đơn thuốc', '')
                if not prescription_type_raw or prescription_type_raw.strip() == '':
                    error_msg = f"Dòng {row_num}: Thiếu 'Loại đơn thuốc' (bắt buộc) - ĐÃ BỎ QUA"
                    errors.append(error_msg)
                    skipped_count += 1
                    continue
                prescription_type_map = {
                    'Cơ bản': 'BASIC',
                    'Thuốc H': 'H',
                    'Thuốc N': 'N',
                    'thuốc độc': 'TOXIC',  # Thuốc độc là loại riêng
                    'Thuốc độc': 'TOXIC',
                    'BASIC': 'BASIC',
                    'H': 'H',
                    'N': 'N',
                    'TOXIC': 'TOXIC'
                }
                prescription_type = prescription_type_map.get(prescription_type_raw.strip(), None)
                if prescription_type is None:
                    error_msg = f"Dòng {row_num}: 'Loại đơn thuốc' không hợp lệ. Chỉ chấp nhận: Cơ bản, Thuốc H, Thuốc N, Thuốc độc - ĐÃ BỎ QUA"
                    errors.append(error_msg)
                    skipped_count += 1
                    continue
                
                # Xử lý đơn vị dùng (unit) - bắt buộc (UI: "Đơn vị dùng")
                unit_raw = get_row_value(row, 'Đơn vị dùng', '') or get_row_value(row, 'Đơn vị sử dụng/lần', '')  # Hỗ trợ cả tên cũ
                if not unit_raw or unit_raw == '':
                    error_msg = f"Dòng {row_num}: Thiếu 'Đơn vị sử dụng/lần' (bắt buộc) - ĐÃ BỎ QUA"
                    errors.append(error_msg)
                    skipped_count += 1
                    continue
                # Lưu trực tiếp tiếng Việt vào database (không convert sang tiếng Anh)
                # Giữ backward compatibility: nếu có dữ liệu cũ bằng tiếng Anh thì convert sang tiếng Việt
                unit_mapping_to_vietnamese = {
                    'tablet': 'viên', 'tablets': 'viên',
                    'bottle': 'chai', 'bottles': 'chai',
                    'pack': 'gói', 'packet': 'gói', 'packets': 'gói',
                    'tube': 'tuýp', 'tubes': 'tuýp',
                    'ampoule': 'ống', 'ampoules': 'ống',
                    'drop': 'giọt', 'drops': 'giọt',
                    'syringe': 'bơm tiêm', 'syringes': 'bơm tiêm',
                    'dose': 'liều',
                    'bag': 'túi',
                    'blister': 'vỉ', 'blisters': 'vỉ',
                    'kit': 'dụng cụ',
                    'liter': 'lít', 'litre': 'lít',
                    'piece': 'miếng',
                    'pen': 'bút tiêm',
                    'vial': 'lọ', 'vials': 'lọ',
                    'capsule': 'viên nang', 'capsules': 'viên nang'
                }
                unit_raw_lower = unit_raw.lower().strip()
                # Nếu đã là tiếng Việt, dùng trực tiếp
                if unit_raw_lower in ['viên', 'chai', 'gói', 'tuýp', 'ống', 'vỉ', 'hộp', 'lọ', 'giọt', 'viên nang', 'miếng dán', 'bơm tiêm', 'liều', 'túi', 'dụng cụ', 'lít', 'miếng', 'bút tiêm', 'ml', 'g', 'mg', 'mcg']:
                    unit_value = unit_raw_lower
                else:
                    # Convert từ tiếng Anh sang tiếng Việt (backward compatibility)
                    unit_value = unit_mapping_to_vietnamese.get(unit_raw_lower, unit_raw_lower)
                
                # Xử lý phương thức dùng (administration_method) - bắt buộc
                administration_method = get_row_value(row, 'Phương thức dùng', '')
                if not administration_method or administration_method == '':
                    error_msg = f"Dòng {row_num}: Thiếu 'Phương thức dùng' (bắt buộc) - ĐÃ BỎ QUA"
                    errors.append(error_msg)
                    skipped_count += 1
                    continue
                
                # Xử lý thuốc nội/ngoại (UI: "Thuốc Nội/Ngoại")
                is_imported_raw = get_row_value(row, 'Thuốc Nội/Ngoại', '') or get_row_value(row, 'Thuốc nội/ngoại', '')  # Hỗ trợ cả tên cũ
                is_imported = is_imported_raw.lower() in ['ngoại', 'ngoại nhập', 'true', '1']
                
                # Xử lý giá vốn - không bắt buộc (UI: "Đơn giá vốn nhập")
                import_price = None
                try:
                    import_price_raw = get_row_value(row, 'Đơn giá vốn nhập', '') or get_row_value(row, 'Đơn giá vốn', '') or get_row_value(row, 'Đơn giá nhập', '')  # Hỗ trợ cả tên cũ
                    if import_price_raw and import_price_raw.strip() and import_price_raw != '':
                        import_price = float(import_price_raw)
                        if import_price < 0:
                            error_msg = f"Dòng {row_num}: 'Đơn giá vốn' không được âm - ĐÃ BỎ QUA"
                            errors.append(error_msg)
                            skipped_count += 1
                            continue
                        # Cho phép = 0
                except (ValueError, TypeError):
                    # Nếu không parse được, để None (không bắt buộc)
                    import_price = None
                
                # Xử lý đơn giá bán - không bắt buộc
                unit_price = None
                try:
                    unit_price_raw = get_row_value(row, 'Đơn giá bán', '')
                    if unit_price_raw and unit_price_raw.strip() and unit_price_raw != '':
                        unit_price = float(unit_price_raw)
                        if unit_price < 0:
                            error_msg = f"Dòng {row_num}: 'Đơn giá bán' không được âm - ĐÃ BỎ QUA"
                            errors.append(error_msg)
                            skipped_count += 1
                            continue
                        # Cho phép = 0
                    else:
                        unit_price = None  # Cho phép để trống
                except (ValueError, TypeError):
                    # Nếu không parse được, để None (không bắt buộc)
                    unit_price = None
                
                # Xử lý số lượng tồn - ưu tiên "Tổng tồn (viên)", nếu không có thì dùng tên cũ (backward compatibility)
                # Hoặc tính từ "{Đơn vị đóng gói} tồn" và "{Đơn vị dùng} tồn" nếu có
                # Cho phép giá trị 0 (thuốc hết tồn)
                stock_quantity = None
                try:
                    # Ưu tiên 1: Đọc "Tổng tồn (viên)" (tên mới)
                    stock_quantity_raw = get_row_value(row, 'Tổng tồn (viên)', '') or get_row_value(row, 'Tổng (viên)', '') or get_row_value(row, 'Số lượng tồn', '')
                    logger.info(f"Dòng {row_num}: Đọc 'Tổng tồn (viên)' từ Excel: raw='{stock_quantity_raw}'")
                    
                    # Nếu có giá trị (kể cả '0'), parse trực tiếp
                    if stock_quantity_raw and stock_quantity_raw.strip():
                        stock_quantity = float(stock_quantity_raw)
                        logger.info(f"Dòng {row_num}: Đã parse 'Tổng tồn (viên)' = {stock_quantity}")
                    # Nếu không có giá trị, thử tính từ boxes/remaining
                    elif not stock_quantity_raw or not stock_quantity_raw.strip():
                        # Ưu tiên 2: Tính từ "{Đơn vị đóng gói} tồn" và "{Đơn vị dùng} tồn"
                        # Logic này giống với UI: Tổng (viên) = ({Đơn vị đóng gói} tồn × Số đơn vị) + {Đơn vị dùng} tồn
                        packaging_unit_raw = get_row_value(row, 'Đóng gói', '') or get_row_value(row, 'Đơn vị đóng gói', '')
                        units_per_box_raw = get_row_value(row, 'Số đơn vị', '')
                        
                        # Tìm cột tồn kho - hỗ trợ nhiều tên cột
                        boxes_raw = None
                        remaining_raw = None
                        
                        # Thử đọc với tên mới: "Hộp/Lọ/Vỉ/Chai Tồn"
                        boxes_raw = get_row_value(row, 'Hộp/Lọ/Vỉ/Chai Tồn', '')
                        # Thử đọc với tên cũ: "{Đơn vị đóng gói} tồn" (backward compatibility)
                        if not boxes_raw:
                            boxes_raw = get_row_value(row, '{Đơn vị đóng gói} tồn', '')
                        # Thử đọc với tên cụ thể dựa trên "Đóng gói" (ví dụ: "Vỉ tồn", "Hộp tồn")
                        if not boxes_raw and packaging_unit_raw:
                            possible_box_column = f"{packaging_unit_raw.strip()} tồn"
                            boxes_raw = get_row_value(row, possible_box_column, '')
                            logger.info(f"Dòng {row_num}: Tìm cột '{possible_box_column}' cho {packaging_unit_raw}, kết quả: {boxes_raw}")
                        
                        # Thử đọc với tên mới: "Viên/Gói/Chai/Ống Tồn"
                        remaining_raw = get_row_value(row, 'Viên/Gói/Chai/Ống Tồn', '')
                        # Thử đọc với tên cũ: "{Đơn vị dùng} tồn" (backward compatibility)
                        if not remaining_raw:
                            remaining_raw = get_row_value(row, '{Đơn vị dùng} tồn', '')
                        # Thử đọc với tên cụ thể dựa trên "Đơn vị dùng" (ví dụ: "Viên tồn", "Gói tồn")
                        if not remaining_raw:
                            unit_raw = get_row_value(row, 'Đơn vị dùng', '') or get_row_value(row, 'Đơn vị sử dụng/lần', '')
                            if unit_raw:
                                possible_remaining_column = f"{unit_raw.strip()} tồn"
                                remaining_raw = get_row_value(row, possible_remaining_column, '')
                                logger.info(f"Dòng {row_num}: Tìm cột '{possible_remaining_column}' cho {unit_raw}, kết quả: {remaining_raw}")
                        
                        if packaging_unit_raw and units_per_box_raw and (boxes_raw or remaining_raw):
                            try:
                                units_per_box = int(float(units_per_box_raw))
                                boxes = float(boxes_raw) if boxes_raw and boxes_raw.strip() and boxes_raw != '0' else 0.0
                                remaining = float(remaining_raw) if remaining_raw and remaining_raw.strip() and remaining_raw != '0' else 0.0
                                
                                # Tính toán giống UI: Tổng = (Boxes × UnitsPerBox) + Remaining
                                stock_quantity = (boxes * units_per_box) + remaining
                                logger.info(f"Dòng {row_num}: Auto parse 'Tổng tồn (viên)' từ ({boxes} {packaging_unit_raw} × {units_per_box}) + {remaining} = {stock_quantity}")
                            except (ValueError, TypeError) as e:
                                logger.warning(f"Dòng {row_num}: Lỗi parse số lượng từ boxes/remaining: {e}")
                                pass
                        
                        # Nếu vẫn không có, dùng giá trị mặc định 0
                        if stock_quantity is None:
                            stock_quantity = 0.0
                    
                    if stock_quantity < 0:
                        error_msg = f"Dòng {row_num}: 'Tổng tồn (viên)' không được âm - ĐÃ BỎ QUA"
                        errors.append(error_msg)
                        skipped_count += 1
                        continue
                except (ValueError, TypeError):
                    error_msg = f"Dòng {row_num}: 'Tổng tồn (viên)' không hợp lệ - ĐÃ BỎ QUA"
                    errors.append(error_msg)
                    skipped_count += 1
                    continue
                
                # Xử lý ngày hết hạn (tùy chọn - có thể để trống)
                expiry_date_str = get_row_value(row, 'Ngày hết hạn', '')
                expiry_date = validate_date(expiry_date_str)
                # Không bắt buộc ngày hết hạn, nếu không có hoặc không hợp lệ thì để None
                if not expiry_date and expiry_date_str and expiry_date_str.strip():
                    # Chỉ cảnh báo nếu có giá trị nhưng không parse được
                    logger.warning(f"Dòng {row_num}: 'Ngày hết hạn' không hợp lệ, sẽ để trống. Giá trị: {expiry_date_str}")
                
                # Xử lý các trường tùy chọn (KHỚP 100% VỚI UI)
                generic_name = get_row_value(row, 'Tên gốc/Biệt dược', '') or None
                internal_code = get_row_value(row, 'Mã thuốc', '') or None
                national_code = get_row_value(row, 'Mã DQG', '') or None
                # UI: "Hàm lượng" (hỗ trợ cả tên cũ "Dạng thuốc/Hàm lượng")
                strength = get_row_value(row, 'Hàm lượng', '') or get_row_value(row, 'Dạng thuốc/Hàm lượng', '') or None
                # UI: "Quy cách" (hỗ trợ cả tên cũ "Quy cách đóng gói")
                packaging = get_row_value(row, 'Quy cách', '') or get_row_value(row, 'Quy cách đóng gói', '') or None
                origin = get_row_value(row, 'Nguồn gốc', '') or None
                
                # Xử lý Ghi chú - đọc trực tiếp từ cột "Ghi chú" (tên cột chính xác trong Excel template)
                description_raw = get_row_value(row, 'Ghi chú', '')
                if description_raw and description_raw.strip() and description_raw.lower() != 'nan':
                    description = description_raw.strip()
                else:
                    description = None
                logger.info(f"Dòng {row_num}: Đọc 'Ghi chú' từ Excel: '{description_raw}' -> '{description}'")
                
                # Xử lý đơn vị đóng gói và số đơn vị - đảm bảo lưu được (UI: "Đóng gói")
                packaging_unit_raw = get_row_value(row, 'Đóng gói', '') or get_row_value(row, 'Đơn vị đóng gói', '')  # Hỗ trợ cả tên cũ
                packaging_unit = packaging_unit_raw.strip() if packaging_unit_raw and packaging_unit_raw.strip() and packaging_unit_raw != 'nan' else None
                logger.info(f"Dòng {row_num}: Đọc 'Đóng gói' từ Excel: raw='{packaging_unit_raw}', sau khi xử lý='{packaging_unit}'")
                
                units_per_box = None
                units_per_box_raw = get_row_value(row, 'Số đơn vị', '')
                if units_per_box_raw and units_per_box_raw.strip() and units_per_box_raw != 'nan':
                    try:
                        # Thử parse số nguyên (có thể là số thập phân trong Excel)
                        units_per_box = int(float(units_per_box_raw))  # Dùng float trước để xử lý số thập phân
                        logger.info(f"Dòng {row_num}: Đã parse Số đơn vị '{units_per_box_raw}' -> {units_per_box}")
                    except (ValueError, TypeError) as e:
                        logger.warning(f"Dòng {row_num}: Không thể parse Số đơn vị '{units_per_box_raw}': {e}")
                        units_per_box = None
                
                # Log để debug
                logger.info(f"Dòng {row_num}: Ghi chú thuốc = '{description}', Số đơn vị = {units_per_box}, Đơn vị đóng gói = '{packaging_unit}'")
                
                # Xử lý cảnh báo (UI: "Cảnh báo SL tồn", "Cảnh báo hết hạn")
                try:
                    low_stock_raw = get_row_value(row, 'Cảnh báo SL tồn', '') or get_row_value(row, 'Thông báo khi SL tồn nhỏ hơn', '')  # Hỗ trợ cả tên cũ
                    low_stock_threshold = int(low_stock_raw) if low_stock_raw and low_stock_raw != '' else None
                except (ValueError, TypeError):
                    low_stock_threshold = None
                
                try:
                    expiry_warning_raw = get_row_value(row, 'Cảnh báo hết hạn', '') or get_row_value(row, 'Thông báo thuốc hết hạn (x ngày)', '')  # Hỗ trợ cả tên cũ
                    expiry_warning_days = int(expiry_warning_raw) if expiry_warning_raw and expiry_warning_raw != '' else None
                except (ValueError, TypeError):
                    expiry_warning_days = None
                
                # Xử lý mã thuốc: tự động sinh nếu không có, hoặc kiểm tra trùng nếu có
                if not internal_code:
                    # Tự động sinh mã thuốc nếu Excel để trống
                    try:
                        internal_code = generate_medicine_code(db)
                        logger.info(f"Dòng {row_num}: Tự động sinh mã thuốc '{internal_code}' cho thuốc '{medicine_name}'")
                    except Exception as e:
                        error_msg = f"Dòng {row_num}: Không thể tạo mã thuốc tự động: {str(e)} - ĐÃ BỎ QUA"
                        logger.error(error_msg)
                        errors.append(error_msg)
                        skipped_count += 1
                        continue
                else:
                    # Kiểm tra mã thuốc trùng lặp nếu người dùng nhập mã
                    existing = db.query(Medicine).filter(Medicine.internal_code == internal_code).first()
                    if existing:
                        error_msg = f"Dòng {row_num}: Mã thuốc '{internal_code}' đã tồn tại - ĐÃ BỎ QUA"
                        logger.warning(error_msg)
                        errors.append(error_msg)
                        skipped_count += 1
                        continue
                
                # Tạo medicine mới
                medicine = Medicine(
                    name=truncate_string(medicine_name, 255),
                    generic_name=truncate_string(generic_name, 255) if generic_name else None,
                    internal_code=truncate_string(internal_code, 50) if internal_code else None,
                    national_code=truncate_string(national_code, 50) if national_code else None,
                    category_type=category_type,
                    unit_price=unit_price,
                    unit=truncate_string(unit_value, 50),
                    strength=truncate_string(strength, 100) if strength else None,
                    stock_quantity=stock_quantity,
                    expiry_date=expiry_date,
                    description=description,  # Lưu description (Ghi chú thuốc)
                    is_active=True,
                    prescription_type=prescription_type,
                    is_imported=is_imported,
                    administration_method=truncate_string(administration_method, 50),
                    low_stock_threshold=low_stock_threshold,
                    expiry_warning_days=expiry_warning_days,
                    packaging=truncate_string(packaging, 255) if packaging else None,
                    packaging_unit=truncate_string(packaging_unit, 50) if packaging_unit else None,  # Lưu Đơn vị đóng gói
                    units_per_box=units_per_box,  # Lưu Số đơn vị
                    origin=truncate_string(origin, 255) if origin else None,
                    import_price=import_price
                )
                
                # Log để debug
                logger.info(f"Dòng {row_num}: Đang tạo medicine với description='{description}', units_per_box={units_per_box}, packaging_unit='{packaging_unit}', stock_quantity={stock_quantity}")
                
                try:
                    db.add(medicine)
                    db.flush()  # Flush để kiểm tra lỗi ngay
                    imported_count += 1
                    logger.info(f"Đã thêm thuốc: {medicine_name}")
                except Exception as db_error:
                    # Rollback chỉ dòng này
                    db.rollback()
                    error_msg = f"Dòng {row_num}: {str(db_error)} - ĐÃ BỎ QUA"
                    logger.error(error_msg)
                    errors.append(error_msg)
                    skipped_count += 1
                    continue
                
            except Exception as e:
                row_num = index + 2
                error_msg = f"Dòng {row_num}: {str(e)} - ĐÃ BỎ QUA"
                logger.error(error_msg)
                errors.append(error_msg)
                skipped_count += 1
                continue
        
        # Commit transaction
        logger.info(f"Commit {imported_count} thuốc vào database")
        db.commit()
        emit_inventory_changed('medicine_imported', entity='medicine', extra={
            'imported_count': imported_count,
            'total_rows': total_rows,
            'skipped_count': skipped_count,
        })
        
        logger.info(f"Import hoàn thành: {imported_count}/{total_rows} thuốc đã import, {skipped_count} dòng bị bỏ qua, {len(errors)} lỗi")
        return jsonify({
            'success': True,
            'imported_count': imported_count,
            'total_rows': total_rows,
            'skipped_count': skipped_count,
            'errors': errors  # Trả về TẤT CẢ lỗi để người dùng biết dòng nào bị bỏ qua
        }), 200
        
    except Exception as e:
        logger.error(f"Error importing medicines: {e}")
        db.rollback()
        return jsonify({
            'success': False,
            'detail': f'Lỗi khi import: {str(e)}'
        }), 500
    finally:
        db.close()


@medicine_router.route('/medicines/reports/<report_type>', methods=['GET'])
@require_auth
def get_report(user, report_type):
    """Lấy dữ liệu báo cáo"""
    db = next(get_db())
    try:
        from_date = request.args.get('from_date')
        to_date = request.args.get('to_date')
        
        if report_type == 'nxt':
            # Báo cáo Nhập - Xuất - Tồn
            return get_nxt_report(db, from_date, to_date)
        elif report_type == 'expiry':
            # Báo cáo thuốc sắp hết hạn
            return get_expiry_report(db)
        elif report_type == 'stock_value':
            # Báo cáo giá trị tồn kho
            return get_stock_value_report(db)
        elif report_type == 'low_stock':
            # Báo cáo thuốc sắp hết
            return get_low_stock_report(db)
        else:
            return jsonify({'detail': 'Loại báo cáo không hợp lệ'}), 400
            
    except Exception as e:
        logger.error(f"Error getting report: {e}")
        return jsonify({'success': False, 'detail': str(e)}), 500
    finally:
        db.close()


def get_nxt_report(db, from_date, to_date):
    """Báo cáo Nhập - Xuất - Tồn"""
    try:
        medicines = db.query(Medicine).filter(Medicine.is_active == True).all()
        data = []
        
        for med in medicines:
            # Tồn đầu kỳ (giả sử là stock_quantity hiện tại nếu không có from_date)
            opening_stock = float(med.stock_quantity) if med.stock_quantity else 0
            
            # Nhập trong kỳ
            import_query = db.query(func.sum(MedicineBatch.quantity)).filter(
                MedicineBatch.medicine_id == med.id
            )
            if from_date:
                try:
                    from_date_obj = datetime.strptime(from_date, '%Y-%m-%d').date()
                    import_query = import_query.filter(MedicineBatch.import_date >= from_date_obj)
                except ValueError:
                    pass
            if to_date:
                try:
                    to_date_obj = datetime.strptime(to_date, '%Y-%m-%d').date()
                    import_query = import_query.filter(MedicineBatch.import_date <= to_date_obj)
                except ValueError:
                    pass
            
            import_quantity = float(import_query.scalar() or 0)
            
            # Xuất trong kỳ (tạm thời = 0 vì chưa có model xuất kho)
            export_quantity = 0
            
            # Tồn cuối kỳ
            closing_stock = opening_stock + import_quantity - export_quantity
            
            data.append({
                'medicine_name': med.name,
                'opening_stock': opening_stock,
                'import_quantity': import_quantity,
                'export_quantity': export_quantity,
                'closing_stock': closing_stock,
                'unit': 'viên'
            })
        
        return jsonify({'success': True, 'data': data}), 200
        
    except Exception as e:
        logger.error(f"Error generating NXT report: {e}")
        return jsonify({'success': False, 'detail': str(e)}), 500


def get_expiry_report(db):
    """Báo cáo thuốc sắp hết hạn"""
    try:
        today = date.today()
        batches = db.query(MedicineBatch).filter(
            MedicineBatch.remaining_quantity > 0,
            MedicineBatch.expiry_date <= today + timedelta(days=90)  # Trong 90 ngày tới
        ).order_by(MedicineBatch.expiry_date.asc()).all()
        
        data = []
        for batch in batches:
            days_left = (batch.expiry_date - today).days
            
            data.append({
                'medicine_name': batch.medicine.name if batch.medicine else '-',
                'batch_number': batch.batch_number,
                'remaining_quantity': float(batch.remaining_quantity) if batch.remaining_quantity else 0,
                'expiry_date': batch.expiry_date.isoformat() if batch.expiry_date else None,
                'days_to_expiry': days_left
            })
        
        return jsonify({'success': True, 'data': data}), 200
        
    except Exception as e:
        logger.error(f"Error generating expiry report: {e}")
        return jsonify({'success': False, 'detail': str(e)}), 500


def get_stock_value_report(db):
    """Báo cáo giá trị tồn kho"""
    try:
        medicines = db.query(Medicine).filter(Medicine.is_active == True).all()
        data = []
        
        for med in medicines:
            # Lấy giá vốn từ batch gần nhất hoặc import_price
            latest_batch = db.query(MedicineBatch).filter(
                MedicineBatch.medicine_id == med.id
            ).order_by(MedicineBatch.import_date.desc()).first()
            
            import_price = 0
            if latest_batch and latest_batch.import_price:
                import_price = float(latest_batch.import_price)
            elif med.import_price:
                import_price = float(med.import_price)
            
            data.append({
                'medicine_name': med.name,
                'stock_quantity': float(med.stock_quantity) if med.stock_quantity else 0,
                'import_price': import_price,
                'unit': 'viên'
            })
        
        return jsonify({'success': True, 'data': data}), 200
        
    except Exception as e:
        logger.error(f"Error generating stock value report: {e}")
        return jsonify({'success': False, 'detail': str(e)}), 500


def get_low_stock_report(db):
    """Báo cáo thuốc sắp hết"""
    try:
        medicines = db.query(Medicine).filter(
            Medicine.is_active == True,
            Medicine.low_stock_threshold > 0,
            Medicine.stock_quantity <= Medicine.low_stock_threshold
        ).all()
        
        data = []
        for med in medicines:
            data.append({
                'medicine_name': med.name,
                'stock_quantity': float(med.stock_quantity) if med.stock_quantity else 0,
                'low_stock_threshold': float(med.low_stock_threshold) if med.low_stock_threshold else 0,
                'unit': 'viên'
            })
        
        return jsonify({'success': True, 'data': data}), 200
        
    except Exception as e:
        logger.error(f"Error generating low stock report: {e}")
        return jsonify({'success': False, 'detail': str(e)}), 500


@medicine_router.route('/medicines/reports/<report_type>/export/excel', methods=['GET'])
@require_auth
def export_report_excel(user, report_type):
    """Xuất báo cáo ra Excel"""
    from flask import send_file
    from io import BytesIO
    import pandas as pd
    from datetime import datetime
    
    db = next(get_db())
    try:
        from_date = request.args.get('from_date')
        to_date = request.args.get('to_date')
        
        # Lấy dữ liệu báo cáo
        if report_type == 'nxt':
            result = get_nxt_report(db, from_date, to_date)
        elif report_type == 'expiry':
            result = get_expiry_report(db)
        elif report_type == 'stock_value':
            result = get_stock_value_report(db)
        elif report_type == 'low_stock':
            result = get_low_stock_report(db)
        else:
            return jsonify({'detail': 'Loại báo cáo không hợp lệ'}), 400
        
        # Parse JSON response để lấy data
        import json
        response_data = json.loads(result[0].get_data(as_text=True))
        data = response_data.get('data', [])
        
        if not data:
            return jsonify({'detail': 'Không có dữ liệu để xuất'}), 400
        
        # Tạo DataFrame và xuất Excel
        df = pd.DataFrame(data)
        output = BytesIO()
        
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Báo cáo')
        
        output.seek(0)
        
        date_str = datetime.now().strftime('%Y%m%d')
        report_names = {
            'nxt': 'bao_cao_nhap_xuat_ton',
            'expiry': 'bao_cao_thuoc_sap_het_han',
            'stock_value': 'bao_cao_gia_tri_ton_kho',
            'low_stock': 'bao_cao_thuoc_sap_het'
        }
        filename = f"{report_names.get(report_type, 'bao_cao')}_{date_str}.xlsx"
        
        return send_file(
            output,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            as_attachment=True,
            download_name=filename
        )
        
    except Exception as e:
        logger.error(f"Error exporting report to Excel: {e}")
        return jsonify({'success': False, 'detail': str(e)}), 500
    finally:
        db.close()


# ==================== MEDICINE STATISTICS APIs ====================

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
            search_normalized = remove_accents(search)
            prescriptions_query = prescriptions_query.filter(
                or_(
                    Patient.full_name.ilike(f'%{search}%'),
                    UserModel.full_name.ilike(f'%{search}%'),
                    Prescription.items.any(PrescriptionItem.medicine_name.ilike(f'%{search}%')),
                    _pg_unaccent(Patient.full_name).contains(search_normalized),
                    _pg_unaccent(UserModel.full_name).contains(search_normalized),
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
            search_normalized = remove_accents(search).lower()
            prescriptions_query = prescriptions_query.filter(
                or_(
                    # Exact accent match
                    Patient.full_name.ilike(f'%{search}%'),
                    UserModel.full_name.ilike(f'%{search}%'),
                    Prescription.items.any(PrescriptionItem.medicine_name.ilike(f'%{search}%')),
                    # Accent-insensitive (gõ không dấu vẫn tìm được)
                    _pg_unaccent(Patient.full_name).contains(search_normalized),
                    _pg_unaccent(UserModel.full_name).contains(search_normalized),
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
            search_normalized = remove_accents(search).lower()
            query = query.filter(
                or_(
                    Medicine.name.ilike(f'%{search}%'),
                    Medicine.internal_code.ilike(f'%{search}%'),
                    # Accent-insensitive
                    _pg_unaccent(Medicine.name).contains(search_normalized),
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
            search_normalized = remove_accents(search).lower()
            items_query = items_query.filter(
                or_(
                    PrescriptionItem.medicine_name.ilike(f'%{search}%'),
                    Patient.full_name.ilike(f'%{search}%'),
                    UserModel.full_name.ilike(f'%{search}%'),
                    _pg_unaccent(PrescriptionItem.medicine_name).contains(search_normalized),
                    _pg_unaccent(Patient.full_name).contains(search_normalized),
                    _pg_unaccent(UserModel.full_name).contains(search_normalized),
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
