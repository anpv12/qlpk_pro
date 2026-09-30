from flask import Blueprint, request, jsonify
from app.core.database import get_db
from app.models.family_member import FamilyMember
from app.models.patient import Patient
from app.models.appointment import Appointment
from app.models.examination import Examination
from app.api.auth import require_auth
from app.utils.clinical_access import patient_access_error, scoped_patient_ids
from app.utils.search_normalization import normalized_contains
from app.realtime.events import emit_patient_changed
from app.services.kinship_service import (
    FALLBACK_KINSHIP,
    normalize_kinship,
)
import logging
from app.utils.api_error_contract import api_error_boundary
from app.api.family_member_links import _create_family_link, _link_relative_patients, sync_appointment_relatives_from_family_member  # noqa: F401 — re-exported for callers of this module

family_member_router = Blueprint('family_member', __name__)
logger = logging.getLogger(__name__)


@family_member_router.route('/family-members/patient/<int:patient_id>', methods=['GET'])
@require_auth
@api_error_boundary(success=False, message='Lỗi khi lấy danh sách người thân: {error}')
def get_family_members(user, patient_id):
    """Lấy danh sách người thân của bệnh nhân"""
    try:
        db = next(get_db())
        access_error = patient_access_error(db, user, patient_id)
        if access_error:
            return jsonify({'success': False, 'message': access_error}), 403
        family_members = db.query(FamilyMember).filter(
            FamilyMember.patient_id == patient_id
        ).all()
        
        # Lấy thông tin chi tiết cho mỗi người thân
        family_members_data = []
        for member in family_members:
            member_data = member.to_dict()
            family_members_data.append(member_data)
        
        return jsonify({
            'success': True,
            'data': family_members_data
        })
    finally:
        db.close()

def _build_family_member_record(data, date_of_birth, db, joint_exam_date, kinship_value, user):
    # Create new family member
    # If relative_patient_id is provided, get patient info from database
    relative_patient_id = data.get('relative_patient_id')
    if relative_patient_id:
        access_error = patient_access_error(db, user, relative_patient_id)
        if access_error:
            return (jsonify({'success': False, 'message': access_error}), 403), None
        relative_patient = db.query(Patient).filter(Patient.id == relative_patient_id).first()
        if relative_patient:
            # Use patient info from database, but allow override with provided data
            family_member = FamilyMember(
                patient_id=data.get('patient_id'),
                relative_patient_id=relative_patient_id,
                name=data.get('name') or relative_patient.full_name,
                kinship=kinship_value,
                diagnosis=data.get('diagnosis', ''),
                examine_together=data.get('examine_together', True),
                date_of_birth=date_of_birth or relative_patient.date_of_birth,
                gender=data.get('gender') or relative_patient.gender,
                phone=data.get('phone') or relative_patient.phone,
                emergency_contact=bool(data.get('emergency_contact', False)),
                joint_exam_date=joint_exam_date,
                id_number=data.get('id_number') or relative_patient.id_number,
                occupation=data.get('occupation') or relative_patient.occupation,
                address=data.get('address') or relative_patient.address,
                notes=data.get('notes')
            )
        else:
            return (jsonify({
                'success': False,
                'message': 'Không tìm thấy bệnh nhân được liên kết'
            }), 404), None
    else:
        # Manual entry - no relative_patient_id
        family_member = FamilyMember(
            patient_id=data.get('patient_id'),
            relative_patient_id=None,
            name=data.get('name'),
            kinship=kinship_value,
            diagnosis=data.get('diagnosis', ''),
            examine_together=data.get('examine_together', False),
            date_of_birth=date_of_birth,
            gender=data.get('gender'),
            phone=data.get('phone'),
            emergency_contact=bool(data.get('emergency_contact', False)),  # Convert to boolean
            joint_exam_date=joint_exam_date,
            id_number=data.get('id_number'),
            occupation=data.get('occupation'),
            address=data.get('address'),
            notes=data.get('notes')
        )
    return None, family_member


def _parse_family_member_dates(data):
    # Parse date_of_birth if provided
    date_of_birth = None
    if data.get('date_of_birth'):
        try:
            from datetime import datetime
            date_of_birth = datetime.strptime(data['date_of_birth'], '%Y-%m-%d').date()
        except ValueError:
            return (jsonify({
                'success': False,
                'message': 'Định dạng ngày sinh không hợp lệ. Sử dụng YYYY-MM-DD'
            }), 400), None, None

    # Parse joint_exam_date if provided
    joint_exam_date = None
    if data.get('joint_exam_date'):
        try:
            from datetime import datetime
            joint_exam_date = datetime.strptime(data['joint_exam_date'], '%Y-%m-%d').date()
        except ValueError:
            return (jsonify({
                'success': False,
                'message': 'Định dạng ngày khám cùng không hợp lệ. Sử dụng YYYY-MM-DD'
            }), 400), None, None
    return None, date_of_birth, joint_exam_date


@family_member_router.route('/family-members', methods=['POST'])
@require_auth
@api_error_boundary(success=False, message='Lỗi khi thêm người thân: {error}')
def create_family_member(user):
    """Tạo người thân mới"""
    try:
        db = next(get_db())
        data = request.get_json()
        access_error = patient_access_error(db, user, (data or {}).get('patient_id'))
        if access_error:
            return jsonify({'success': False, 'message': access_error}), 403
        
        # Validate required fields
        if not data.get('name') or not data.get('kinship'):
            return jsonify({
                'success': False,
                'message': 'Họ tên và quan hệ là bắt buộc'
            }), 400
        
        early_response, date_of_birth, joint_exam_date = _parse_family_member_dates(data)
        if early_response is not None:
            return early_response
        
        # Chuẩn hoá quan hệ
        kinship_input = data.get('kinship') or FALLBACK_KINSHIP
        kinship_value = normalize_kinship(kinship_input) or kinship_input or FALLBACK_KINSHIP
        
        error_response, family_member = _build_family_member_record(data, date_of_birth, db, joint_exam_date, kinship_value, user)
        if error_response is not None:
            return error_response
        
        db.add(family_member)
        db.commit()
        db.refresh(family_member)
        emit_patient_changed('family_member_created', patient_id=family_member.patient_id, extra={
            'family_member_id': family_member.id,
            'relative_patient_id': family_member.relative_patient_id,
        })
        
        return jsonify({
            'success': True,
            'message': 'Đã thêm người thân thành công',
            'data': family_member.to_dict()
        })
    finally:
        db.close()

def _apply_family_member_fields(data, family_member):
    # Update fields
    if data.get('name'):
        family_member.name = data['name']
    if data.get('kinship'):
        family_member.kinship = data['kinship']
    if data.get('diagnosis') is not None:
        family_member.diagnosis = data['diagnosis']
    if data.get('examine_together') is not None:
        family_member.examine_together = data['examine_together']
    # Cho phép cập nhật số điện thoại nếu được gửi lên
    if data.get('phone') is not None:
        family_member.phone = data['phone']
    # Cho phép cập nhật CCCD/CMND nếu được gửi lên từ bảng người thân
    if data.get('id_number') is not None:
        family_member.id_number = data['id_number']
    # Cập nhật liên hệ khẩn cấp
    if data.get('emergency_contact') is not None:
        family_member.emergency_contact = bool(data['emergency_contact'])


@family_member_router.route('/family-members/<int:member_id>', methods=['PUT'])
@require_auth
@api_error_boundary(success=False, message='Lỗi khi cập nhật thông tin: {error}')
def update_family_member(user, member_id):
    """Cập nhật thông tin người thân"""
    try:
        db = next(get_db())
        data = request.get_json()
        
        family_member = db.query(FamilyMember).filter(FamilyMember.id == member_id).first()
        if not family_member:
            return jsonify({
                'success': False,
                'message': 'Không tìm thấy người thân'
            }), 404
        access_error = patient_access_error(db, user, family_member.patient_id)
        if access_error:
            return jsonify({'success': False, 'message': access_error}), 403
        
        _apply_family_member_fields(data, family_member)
        # Cập nhật ngày khám cùng
        if data.get('joint_exam_date'):
            try:
                from datetime import datetime
                family_member.joint_exam_date = datetime.strptime(data['joint_exam_date'], '%Y-%m-%d').date()
            except ValueError as exc:
                logger.warning("Bỏ qua ngày khám cùng không hợp lệ: %s", exc)
        elif 'joint_exam_date' in data and data['joint_exam_date'] is None:
            family_member.joint_exam_date = None
        
        family_member.updated_at = datetime.utcnow()
        synced_rows = sync_appointment_relatives_from_family_member(db, family_member)
        db.commit()
        emit_patient_changed('family_member_updated', patient_id=family_member.patient_id, extra={
            'family_member_id': family_member.id,
            'relative_patient_id': family_member.relative_patient_id,
            'appointment_relative_ids': [row.id for row in synced_rows],
            'data': family_member.to_dict(),
        })
        
        return jsonify({
            'success': True,
            'message': 'Đã cập nhật thông tin thành công',
            'data': family_member.to_dict()
        })
    finally:
        db.close()

@family_member_router.route('/family-members/<int:member_id>', methods=['DELETE'])
@require_auth
@api_error_boundary(success=False, message='Lỗi khi xóa người thân: {error}')
def delete_family_member(user, member_id):
    """Xóa người thân"""
    try:
        db = next(get_db())
        family_member = db.query(FamilyMember).filter(FamilyMember.id == member_id).first()
        if not family_member:
            return jsonify({
                'success': False,
                'message': 'Không tìm thấy người thân'
            }), 404
        access_error = patient_access_error(db, user, family_member.patient_id)
        if access_error:
            return jsonify({'success': False, 'message': access_error}), 403
        
        reverse_member = None
        if family_member.relative_patient_id:
            reverse_member = db.query(FamilyMember).filter(
                FamilyMember.patient_id == family_member.relative_patient_id,
                FamilyMember.relative_patient_id == family_member.patient_id
            ).first()

        patient_id = family_member.patient_id
        relative_patient_id = family_member.relative_patient_id
        family_member_id = family_member.id
        db.delete(family_member)
        if reverse_member:
            db.delete(reverse_member)
        db.commit()
        emit_patient_changed('family_member_deleted', patient_id=patient_id, extra={
            'family_member_id': family_member_id,
            'relative_patient_id': relative_patient_id,
        })
        
        return jsonify({
            'success': True,
            'message': 'Đã xóa người thân thành công'
        })
    finally:
        db.close()

@family_member_router.route('/family-members/search', methods=['GET'])
@require_auth
@api_error_boundary(success=False, message='Lỗi khi tìm kiếm: {error}')
def search_relatives(user):
    """Tìm kiếm người thân trong hệ thống"""
    try:
        db = next(get_db())
        
        # Get query parameters
        search_term = request.args.get('search', '').strip()
        page = int(request.args.get('page', 1))
        per_page = int(request.args.get('per_page', 10))
        
        logger.debug("Family member search term: %s", search_term)
        logger.debug("Database URL: %s", db.bind.url)
        
        # Build query
        query = db.query(Patient)
        scoped_ids = scoped_patient_ids(db, user)
        if scoped_ids is not None:
            query = query.filter(Patient.id.in_(scoped_ids or {-1}))
        
        # Check total patients first
        total_patients = db.query(Patient).count()
        logger.debug("Total patients in database: %s", total_patients)
        
        if search_term:
            query = query.filter(
                normalized_contains(Patient.full_name, search_term) |
                normalized_contains(Patient.phone, search_term) |
                normalized_contains(Patient.id_number, search_term)
            )
        
        # Get paginated results
        total = query.count()
        logger.debug("Total family member search matches: %s", total)
        patients = query.offset((page - 1) * per_page).limit(per_page).all()
        logger.debug("Family member search page size: %s", len(patients))
        
        def format_diagnosis_text(appointment):
            if not appointment:
                return None
            examination = db.query(Examination).filter(
                Examination.appointment_id == appointment.id
            ).order_by(Examination.id.desc()).first()
            if examination and examination.diagnosis:
                from app.utils.examination_utils import resolve_diagnosis_to_str
                return resolve_diagnosis_to_str(db, examination.diagnosis).strip() or None
            return None

        # Get latest appointment for each patient
        patient_data = []
        for patient in patients:
            latest_appointment = db.query(Appointment).filter(
                Appointment.patient_id == patient.id
            ).order_by(Appointment.appointment_date.desc()).first()
            
            patient_data.append({
                'id': patient.id,
                'full_name': patient.full_name,
                'date_of_birth': patient.date_of_birth.isoformat() if patient.date_of_birth else None,
                'phone': patient.phone,
                'address': patient.address,
                'id_number': patient.id_number,  # Thêm id_number để fill vào form
                'latest_appointment_date': latest_appointment.appointment_date.isoformat() if latest_appointment else None,
                'latest_diagnosis': format_diagnosis_text(latest_appointment)
            })
        
        return jsonify({
            'success': True,
            'data': patient_data,
            'pagination': {
                'page': page,
                'per_page': per_page,
                'total': total,
                'pages': (total + per_page - 1) // per_page
            }
        })
    finally:
        db.close()


@family_member_router.route('/family-members/link', methods=['POST'])
@require_auth
@api_error_boundary(success=False, message='Lỗi khi liên kết người thân: {error}')
def link_relatives(user):
    """Liên kết người thân với bệnh nhân hiện tại"""
    try:
        db = next(get_db())
        data = request.get_json()
        
        patient_id = data.get('patient_id')
        relative_ids = data.get('relative_ids', [])
        requested_kinship = data.get('kinship') or FALLBACK_KINSHIP
        forward_kinship = normalize_kinship(requested_kinship) or requested_kinship or FALLBACK_KINSHIP
        
        # Parse emergency_contact và joint_exam_date từ request
        emergency_contact = bool(data.get('emergency_contact', False))
        joint_exam_date = None
        if data.get('joint_exam_date'):
            try:
                from datetime import datetime
                joint_exam_date = datetime.strptime(data['joint_exam_date'], '%Y-%m-%d').date()
            except ValueError as exc:
                logger.warning("Bỏ qua ngày khám cùng không hợp lệ: %s", exc)
        
        if not patient_id or not relative_ids:
            return jsonify({
                'success': False,
                'message': 'Thiếu thông tin bệnh nhân hoặc người thân'
            }), 400
        access_error = patient_access_error(db, user, patient_id)
        if access_error:
            return jsonify({'success': False, 'message': access_error}), 403
        for relative_id in relative_ids:
            access_error = patient_access_error(db, user, relative_id)
            if access_error:
                return jsonify({'success': False, 'message': access_error}), 403
        
        error_response, linked_relatives = _link_relative_patients(db, emergency_contact, forward_kinship, joint_exam_date, patient_id, relative_ids)
        if error_response is not None:
            return error_response
        
        db.commit()
        emit_patient_changed('family_members_linked', patient_id=patient_id, extra={
            'relative_ids': relative_ids,
            'linked_count': len(linked_relatives),
        })
        
        return jsonify({
            'success': True,
            'message': f'Đã liên kết {len(linked_relatives)} người thân thành công',
            'data': [member.to_dict() for member in linked_relatives]
        })
    finally:
        db.close() 
