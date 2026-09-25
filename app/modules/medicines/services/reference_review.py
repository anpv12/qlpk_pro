"""Explicit inventory staff review; migration links never imply human approval."""
import json

from app.models.user import User
from app.models.medicine import Medicine
from app.models.medicine_reference_catalog import MedicineReferenceCatalog
from .catalog_service import (
    CatalogValidationError, IDENTITY_FIELDS, reference_preview, reference_state,
    selectable_reference, source_identity, write_clinic_medicine,
)


def can_review_reference(db, actor_id):
    actor = db.get(User, actor_id)
    if not actor or not actor.is_active:
        return False
    if getattr(actor.role, 'value', actor.role) == 'admin':
        return True
    for membership in actor.groups:
        try:
            permissions = json.loads(membership.group.permissions or '[]')
        except (ValueError, TypeError):
            continue
        if isinstance(permissions, list) and {'ql-kho-thuoc', 'ql-thuoc'}.intersection(permissions):
            return True
    return False


def review_preview(db, medicine, reference_id=None):
    snapshot = medicine.reference_snapshot or {}
    history = snapshot.get('mapping_history') or []
    original = (history[0].get('identity') if history else snapshot.get('previous_identity'))
    result = {
        'medicine_id': medicine.id,
        'original': original or {field: getattr(medicine, field) for field in IDENTITY_FIELDS},
        'current': {field: getattr(medicine, field) for field in IDENTITY_FIELDS},
        'review_status': reference_state(medicine)['reference_review_status'],
        'human_review': snapshot.get('human_review'),
        'reference': None, 'can_apply': False,
        'message': 'Hãy tìm và chọn đúng thuốc trong danh mục DAV.',
        'medicine_version': medicine.updated_at.isoformat() if medicine.updated_at else None,
    }
    selected_id = reference_id if reference_id is not None else medicine.reference_catalog_id
    if selected_id is None:
        return result
    reference = db.get(MedicineReferenceCatalog, selected_id)
    if not reference:
        raise CatalogValidationError('Không tìm thấy thuốc đã chọn.', 404)
    preview = reference_preview(medicine, reference, human_review=True)
    result.update(preview)
    result['reference'] = dict(source_identity(reference), id=reference.id,
                               updated_at=reference.updated_at.isoformat() if reference.updated_at else None,
                               old_registration_number=reference.old_registration_number)
    duplicate = db.query(Medicine.id).filter(Medicine.reference_catalog_id == reference.id,
                                             Medicine.id != medicine.id).first()
    if duplicate:
        result.update(can_apply=False, message='Thuốc DAV này đã được liên kết với thuốc khác trong kho. Hãy báo người quản lý kiểm tra thuốc trùng.')
    elif not selectable_reference(reference):
        result.update(can_apply=False, message='Thuốc này hiện không còn được chọn trong danh mục. Hãy tìm thuốc phù hợp khác.')
    elif not (reference.registration_number or reference.old_registration_number):
        result.update(can_apply=False, message='Danh mục chưa có số đăng ký của thuốc này. Hãy báo người quản lý kiểm tra.')
    return result


def confirm_reference(db, medicine, data, actor_id):
    required = {'reference_catalog_id', 'reference_version', 'reference_medicine_version',
                'reference_registration_number', 'reference_link_confirmed'}
    if not isinstance(data, dict) or set(data) != required or data.get('reference_link_confirmed') is not True:
        raise CatalogValidationError('Hãy chọn thuốc và xác nhận đã đối chiếu trước khi lưu.')
    return write_clinic_medicine(db, data, actor_id, medicine,
                                allow_reference_mapping=True, human_review=True)
