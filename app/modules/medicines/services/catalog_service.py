"""DAV identity and clinic settings share one writer for forms and Excel."""
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
import re
from sqlalchemy.orm import object_session

from app.models.medicine import Medicine
from app.models.medicine_reference_catalog import MedicineReferenceCatalog
from app.models.medicine_batch import MedicineBatch
from app.models.medicine_transaction import MedicineTransaction
from app.utils.patient_utils import generate_medicine_code
from app.modules.medicines.services.catalog_mapping import clinic_defaults, normalized

IDENTITY_FIELDS = {'name': 'name', 'generic_name': 'active_ingredient', 'strength': 'strength', 'origin': 'manufacturer_country'}
SOURCE_FIELDS = ('source', 'source_id', 'name', 'active_ingredient', 'strength', 'dosage_form', 'packaging', 'route', 'manufacturer_name', 'manufacturer_country', 'registration_number')
TEXT_SETTINGS = {'unit': 50, 'internal_code': 50, 'national_code': 50, 'administration_method': 50, 'packaging': 255, 'packaging_unit': 50, 'description': None}
FIELD_LABELS = {'unit': 'Đơn vị dùng', 'internal_code': 'Mã thuốc', 'national_code': 'Mã DQG',
                'administration_method': 'Đường dùng', 'packaging': 'Quy đổi đóng gói',
                'packaging_unit': 'Đơn vị đóng gói', 'description': 'Ghi chú',
                'unit_price': 'Giá bán', 'low_stock_threshold': 'Ngưỡng cảnh báo tồn',
                'expiry_warning_days': 'Số ngày cảnh báo hết hạn', 'units_per_box': 'Số đơn vị trong một gói'}


def conversion_locked(medicine):
    if medicine.stock_quantity:
        return True
    db = object_session(medicine)
    return bool(db and medicine.id and (
        db.query(MedicineBatch.id).filter_by(medicine_id=medicine.id).first()
        or db.query(MedicineTransaction.id).filter_by(medicine_id=medicine.id).first()))


def source_settings(identity):
    from types import SimpleNamespace
    defaults = clinic_defaults(SimpleNamespace(**{key: identity.get(key) for key in SOURCE_FIELDS}))
    return {key: defaults[key] for key in ('administration_method', 'is_imported') if defaults[key] not in (None, '')}


class CatalogValidationError(ValueError):
    def __init__(self, message, status=400, existing_medicine_id=None):
        super().__init__(message)
        self.status = status
        self.existing_medicine_id = existing_medicine_id


def source_identity(reference):
    return {field: getattr(reference, field) for field in SOURCE_FIELDS}


def reference_preview(medicine, reference, *, human_review=False):
    """Preview catalog identity; existing inventory conversion stays unchanged."""
    labels = {'name': 'Tên thuốc', 'generic_name': 'Hoạt chất', 'strength': 'Hàm lượng', 'origin': 'Nước sản xuất'}
    rows = [{'label': labels[field], 'before': getattr(medicine, field),
             'after': getattr(reference, source_field)} for field, source_field in IDENTITY_FIELDS.items()]
    defaults = clinic_defaults(reference)
    message = ''
    # Reject an obviously misplaced quantity; never swap clinical source fields by guessing.
    ingredient = normalized(reference.active_ingredient)
    misplaced_quantity = bool(re.fullmatch(r'\d+(?:[.,]\d+)?\s*(?:mg|mcg|µg|g|ml|iu|%)', ingredient))
    if misplaced_quantity:
        message = f'Danh mục đang ghi Hoạt chất là “{reference.active_ingredient}”, chưa có tên hoạt chất hợp lệ. Chưa thể cập nhật. Hãy hủy và báo người quản lý kiểm tra dữ liệu danh mục.'
    incompatible = False
    if medicine.reference_catalog_id and conversion_locked(medicine):
        old = (medicine.reference_snapshot or {}).get('identity') or {}
        for key in ('active_ingredient', 'strength', 'dosage_form'):
            before, after = old.get(key), getattr(reference, key)
            if before and (not after or normalized(before) != normalized(after)):
                incompatible = True
        if incompatible and not misplaced_quantity:
            message = 'Thuốc đã có tồn hoặc lịch sử nhập xuất. Hoạt chất, hàm lượng hoặc dạng bào chế không khớp; hãy kiểm tra lại thuốc được chọn.'
            if human_review:
                message = 'Hoạt chất, hàm lượng hoặc dạng bào chế khác thông tin đang lưu. Chỉ xác nhận sau khi đã đối chiếu đúng thuốc thực tế; lịch sử cấp thuốc được giữ nguyên.'
    settings = {key: defaults[key] for key in ('administration_method', 'is_imported') if defaults[key] not in (None, '')}
    for field, label in (('administration_method', 'Đường dùng'), ('is_imported', 'Thuốc Nội/Ngoại')):
        if field in settings:
            before, after = getattr(medicine, field), settings[field]
            if field == 'is_imported':
                before, after = ('Ngoại' if before else 'Nội'), ('Ngoại' if after else 'Nội')
            rows.append({'label': label, 'before': before, 'after': after})
    return {'rows': rows, 'can_apply': not misplaced_quantity and (not incompatible or human_review), 'message': message,
            'medicine_version': medicine.updated_at.isoformat() if medicine.updated_at else None}


def selectable_reference(reference):
    return bool(reference and reference.source == 'DAV' and reference.source_id and reference.is_active
                and not reference.is_expired and not reference.is_deleted and not reference.is_registration_withdrawn)


def reference_state(medicine):
    snapshot = medicine.reference_snapshot or {}
    reference = medicine.reference_catalog
    changed = bool(reference and snapshot.get('identity') != source_identity(reference))
    unavailable = bool(reference and not selectable_reference(reference))
    return {
        'reference_catalog_id': medicine.reference_catalog_id,
        'reference_source_id': reference.source_id if reference else None,
        'reference_status': 'unlinked' if not reference else ('review_required' if changed or unavailable else 'linked'),
        'reference_review_status': ('unlinked' if not reference else
                                    'stale' if changed or unavailable else
                                    'confirmed' if snapshot.get('human_review') or snapshot.get('mapping_acceptance') else 'pending'),
        'reference_identity': snapshot.get('identity'),
        'reference_current': source_identity(reference) if reference else None,
        'reference_available': selectable_reference(reference),
        'catalog_locked_fields': list(source_settings(snapshot.get('identity') or {})) if reference else [],
        'conversion_locked': conversion_locked(medicine),
    }


def nonnegative_number(value, field, *, integer=False, default=None):
    label = FIELD_LABELS.get(field, 'Giá trị')
    if value is None or value == '':
        return default
    try:
        number = Decimal(str(value))
    except (InvalidOperation, ValueError):
        raise CatalogValidationError(f'{label} không hợp lệ.')
    if not number.is_finite() or number < 0 or (integer and number != number.to_integral_value()):
        raise CatalogValidationError(f'{label} phải là ' + ('số nguyên không âm.' if integer else 'số không âm.'))
    if not integer and number.as_tuple().exponent < -2:
        raise CatalogValidationError(f'{label} chỉ hỗ trợ tối đa 2 chữ số thập phân.')
    return int(number) if integer else number


def write_clinic_medicine(db, data, actor_id, medicine=None, *, allow_reference_mapping=False, human_review=False):
    """Reference migration is opt-in for internal callers, never request data."""
    if not isinstance(data, dict):
        raise CatalogValidationError('Thông tin thuốc không hợp lệ. Hãy mở lại và thử lại.')
    creating = medicine is None
    if not creating and 'unit_price' in data:
        price = nonnegative_number(data['unit_price'], 'unit_price', default=0)
        if price != medicine.unit_price:
            raise CatalogValidationError('Hãy dùng Cập nhật giá để xác nhận và lưu lịch sử thay đổi.', 409)
    if 'is_imported' in data and data['is_imported'] is not None:
        raw_imported = data['is_imported']
        if not isinstance(raw_imported, bool) and raw_imported not in ('true', 'false'):
            raise CatalogValidationError('Hãy chọn thuốc Nội hoặc Ngoại.')
        data = dict(data, is_imported=raw_imported is True or raw_imported == 'true')
    if any(field in data for field in ('stock_quantity', 'import_price')):
        raise CatalogValidationError('Không nhập tồn hoặc giá vốn trên danh mục thuốc. Hãy dùng phiếu nhập kho.')
    if 'category_type' in data and data['category_type'] != 'DRUG':
        raise CatalogValidationError('Chỉ thêm thuốc vào Tủ thuốc.')
    if 'expiry_date' in data:
        raise CatalogValidationError('Hạn dùng được ghi nhận khi nhập lô, không sửa trong danh mục thuốc.')
    if creating:
        medicine = Medicine(stock_quantity=0, category_type='DRUG', unit_price=0, prescription_type='BASIC')

    requested_id = data.get('reference_catalog_id', medicine.reference_catalog_id)
    if requested_id is not None and (isinstance(requested_id, bool) or not isinstance(requested_id, int) or requested_id <= 0):
        raise CatalogValidationError('Hãy chọn thuốc hợp lệ trong danh mục DAV.')
    if creating and not requested_id:
        raise CatalogValidationError('Hãy chọn thuốc từ danh mục DAV trước khi thêm vào Tủ thuốc.')
    if not creating and not allow_reference_mapping and (
        requested_id != medicine.reference_catalog_id
        or any(field in data for field in ('reference_link_confirmed', 'reference_registration_number', 'reference_medicine_version'))
    ):
        raise CatalogValidationError('Thông tin danh mục của thuốc không được thay đổi tại đây.', 409)
    if medicine.reference_catalog_id and requested_id is None:
        raise CatalogValidationError('Hãy chọn thuốc danh mục thay thế; không bỏ trống liên kết hiện có.', 409)
    relinking = not creating and data.get('reference_link_confirmed') is True
    if relinking and medicine.reference_catalog_id and 'reference_version' not in data:
        raise CatalogValidationError('Hãy tìm lại thuốc danh mục trước khi xác nhận liên kết.', 409)
    if medicine.reference_catalog_id and requested_id != medicine.reference_catalog_id and not relinking:
        raise CatalogValidationError('Hãy dùng Liên kết lại DAV để đối chiếu trước khi đổi thuốc danh mục.', 409)
    linking = requested_id is not None and (medicine.reference_catalog_id is None or relinking)
    if linking:
        if isinstance(requested_id, bool) or not isinstance(requested_id, int) or requested_id <= 0:
            raise CatalogValidationError('Thuốc DAV được chọn không hợp lệ.')
        reference = db.query(MedicineReferenceCatalog).filter_by(id=requested_id).populate_existing().with_for_update().first()
        if not selectable_reference(reference):
            raise CatalogValidationError('Không tìm thấy thuốc DAV còn hiệu lực. Hãy đồng bộ và chọn lại.')
        if creating:
            preview = reference_preview(medicine, reference, human_review=human_review)
            if not preview['can_apply']:
                raise CatalogValidationError(preview['message'])
        if 'reference_version' in data and data['reference_version'] != (reference.updated_at.isoformat() if reference.updated_at else None):
            raise CatalogValidationError('Dữ liệu DAV đã thay đổi sau khi chọn. Hãy tìm và đối chiếu lại.', 409)
        duplicate = db.query(Medicine).filter(Medicine.reference_catalog_id == requested_id, Medicine.id != medicine.id).first() if medicine.id else db.query(Medicine).filter_by(reference_catalog_id=requested_id).first()
        if duplicate:
            raise CatalogValidationError('Thuốc DAV này đã có trong Tủ thuốc. Hãy mở bản ghi hiện có.', 409, duplicate.id)
        if not creating and data.get('reference_link_confirmed') is not True:
            raise CatalogValidationError('Hãy dùng Liên kết DAV để tìm và đối chiếu thuốc trước khi xác nhận.')
        if not creating:
            allowed = {'reference_catalog_id', 'reference_version', 'reference_link_confirmed',
                       'reference_registration_number', 'reference_medicine_version'}
            if set(data) - allowed:
                raise CatalogValidationError('Hãy lưu phần thông tin phòng khám riêng trước khi liên kết DAV.')
            registration = str(data.get('reference_registration_number') or '').strip().upper()
            numbers = {str(value).strip().upper() for value in (reference.registration_number, reference.old_registration_number) if value}
            if not registration or registration not in numbers:
                raise CatalogValidationError('Số đăng ký không khớp thuốc đã chọn. Hãy kiểm tra số trên hộp thuốc.')
            preview = reference_preview(medicine, reference, human_review=human_review)
            if 'reference_medicine_version' not in data or data['reference_medicine_version'] != preview['medicine_version']:
                raise CatalogValidationError('Thông tin trong kho vừa thay đổi. Hãy mở lại Liên kết DAV để xem bản mới.', 409)
            if not preview['can_apply']:
                raise CatalogValidationError(preview['message'], 409)
        previous = {field: getattr(medicine, field) for field in IDENTITY_FIELDS} if not creating else None
        previous_reference_id = medicine.reference_catalog_id
        history = list((medicine.reference_snapshot or {}).get('mapping_history') or [])
        if not creating:
            history.append({'reference_catalog_id': previous_reference_id, 'identity': previous,
                            'source_identity': (medicine.reference_snapshot or {}).get('identity'),
                            'human_review': (medicine.reference_snapshot or {}).get('human_review'),
                            'mapping_acceptance': (medicine.reference_snapshot or {}).get('mapping_acceptance'),
                            'changed_by': actor_id, 'changed_at': datetime.now(timezone.utc).isoformat()})
        for field, source_field in IDENTITY_FIELDS.items():
            value = getattr(reference, source_field)
            if field in data and (data[field] or None) != (value or None):
                raise CatalogValidationError('Thông tin nhận diện phải lấy từ DAV, không nhập tên hoặc hàm lượng khác.')
            setattr(medicine, field, value)
        medicine.reference_catalog = reference
        medicine.reference_catalog_id = reference.id
        medicine.reference_snapshot = {'identity': source_identity(reference), 'linked_by': actor_id,
                                       'linked_at': datetime.now(timezone.utc).isoformat(), 'previous_identity': previous,
                                       'previous_category_type': medicine.category_type, 'mapping_history': history}
        if human_review or creating:
            medicine.reference_snapshot['human_review'] = {
                'reviewed_by': actor_id, 'reviewed_at': datetime.now(timezone.utc).isoformat()}
        medicine.category_type = 'DRUG'
        mapped_settings = source_settings(source_identity(reference))
        for field, value in mapped_settings.items():
            if field in data and data[field] != value:
                raise CatalogValidationError('Thông tin từ danh mục không được sửa trực tiếp. Hãy kiểm tra thuốc đã chọn.')
            setattr(medicine, field, value)
        if creating:
            defaults = clinic_defaults(reference)
            data = dict(data)
            if not data.get('administration_method') and defaults['administration_method']:
                data['administration_method'] = defaults['administration_method']
            # The current DB requires a boolean. Missing source country must
            # be classified explicitly, never silently treated as domestic.
            if defaults['is_imported'] is not None:
                data['is_imported'] = defaults['is_imported']
            elif data.get('is_imported') is not True and data.get('is_imported') is not False:
                raise CatalogValidationError('DAV chưa có nước sản xuất. Hãy xác nhận thuốc Nội/Ngoại trước khi lưu.')
    else:
        for field in source_settings((medicine.reference_snapshot or {}).get('identity') or {}):
            if field in data and data[field] != getattr(medicine, field):
                raise CatalogValidationError('Thông tin từ danh mục không được sửa trực tiếp.', 409)
        for field in IDENTITY_FIELDS:
            if field in data and (data[field] or None) != (getattr(medicine, field) or None):
                raise CatalogValidationError('Thông tin nhận diện thuốc không được sửa trực tiếp.', 409)
        if 'category_type' in data and data['category_type'] != medicine.category_type:
            raise CatalogValidationError('Phân loại thuốc này cần được quản trị kiểm tra.', 409)

    for field, limit in TEXT_SETTINGS.items():
        if field not in data:
            continue
        value = (str(data[field]).strip() or None) if data[field] is not None else None
        if limit and value and len(value) > limit:
            raise CatalogValidationError(f'{FIELD_LABELS[field]} quá dài (tối đa {limit} ký tự).')
        if not creating and field in ('unit', 'packaging_unit') and value != getattr(medicine, field):
            if conversion_locked(medicine):
                raise CatalogValidationError('Không đổi đơn vị của thuốc đã có lô hoặc giao dịch.', 409)
        setattr(medicine, field, value or None)
    if not medicine.unit:
        raise CatalogValidationError('Đơn vị quản lý là bắt buộc.')
    for field in ('unit_price', 'low_stock_threshold', 'expiry_warning_days', 'units_per_box'):
        if field in data:
            value = nonnegative_number(data[field], field, integer=field != 'unit_price', default=0 if field == 'unit_price' else None)
            if not creating and field == 'units_per_box' and value != medicine.units_per_box and conversion_locked(medicine):
                raise CatalogValidationError('Không đổi quy đổi đóng gói của thuốc đã có lô.', 409)
            setattr(medicine, field, value)
    if 'prescription_type' in data:
        if data['prescription_type'] not in ('BASIC', 'H', 'N'):
            raise CatalogValidationError('Hãy chọn loại đơn Cơ bản, Thuốc H hoặc Thuốc N.')
        medicine.prescription_type = data['prescription_type']
    if not medicine.internal_code:
        medicine.internal_code = generate_medicine_code(db)
    duplicate_code = db.query(Medicine).filter(Medicine.internal_code == medicine.internal_code)
    if medicine.id:
        duplicate_code = duplicate_code.filter(Medicine.id != medicine.id)
    if duplicate_code.first():
        raise CatalogValidationError('Mã thuốc nội bộ đã tồn tại.', 409)
    if 'is_imported' in data:
        if data['is_imported'] is None:
            raise CatalogValidationError('Hãy chọn thuốc Nội/Ngoại trước khi lưu.')
        medicine.is_imported = data['is_imported'] is True or str(data['is_imported']).lower() == 'true'
    if any(field in data for field in ('unit', 'packaging_unit', 'units_per_box')):
        if medicine.packaging_unit and medicine.units_per_box:
            medicine.packaging = f'1 {medicine.packaging_unit} = {medicine.units_per_box} {medicine.unit}'
        else:
            medicine.packaging = f'1 {medicine.packaging_unit}' if medicine.packaging_unit else None
    db.add(medicine)
    db.flush()
    if creating:
        from .price_history import record_price
        record_price(db, medicine, actor_id, None)
    return medicine
