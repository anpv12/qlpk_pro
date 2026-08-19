from flask import Blueprint, request, jsonify
from app.core.database import get_db
from app.models.appointment_relative import AppointmentRelative
from app.models.appointment import Appointment
from app.models.examination import Examination
from app.models.patient import Patient
from app.models.family_member import FamilyMember
from app.api.auth import require_auth
from app.realtime.events import emit_patient_changed
from datetime import datetime

appointment_relative_router = Blueprint('appointment_relative', __name__)


def cleanup_family_member_from_deleted_appointment_relative(db, family_member_id, deleted_relative_id):
    """Remove a family member created only by a joint-exam row.

    Appointment relatives create/link a FamilyMember so the receptionist can see the
    companion in the patient relatives block. When the user deletes that joint-exam
    row immediately, keeping an otherwise-unused FamilyMember leaves incorrect
    patient profile data behind.
    """
    if not family_member_id:
        return None

    family_member = db.query(FamilyMember).filter(FamilyMember.id == family_member_id).first()
    if not family_member:
        return None

    remaining_refs = db.query(AppointmentRelative).filter(
        AppointmentRelative.family_member_id == family_member_id,
        AppointmentRelative.id != deleted_relative_id
    ).count()

    if remaining_refs == 0:
        deleted_id = family_member.id
        db.delete(family_member)
        return deleted_id

    return None

@appointment_relative_router.route('/appointment-relatives/appointment/<int:appointment_id>', methods=['GET'])
@require_auth
def get_appointment_relatives(user, appointment_id):
    """Lấy danh sách người đi khám cùng của một appointment"""
    try:
        db = next(get_db())
        
        # Kiểm tra appointment có tồn tại không
        appointment = db.query(Appointment).filter(Appointment.id == appointment_id).first()
        if not appointment:
            return jsonify({
                'success': False,
                'message': 'Không tìm thấy lịch hẹn'
            }), 404
        
        relatives = db.query(AppointmentRelative).filter(
            AppointmentRelative.appointment_id == appointment_id
        ).order_by(AppointmentRelative.created_at.asc()).all()
        
        # Thêm appointment_date, relative_patient_id và joint_date vào response
        relatives_data = []
        for relative in relatives:
            rel_dict = relative.to_dict()
            if appointment and appointment.appointment_date:
                rel_dict['appointment_date'] = appointment.appointment_date.isoformat()
            # Lấy relative_patient_id và joint_date từ family_member nếu có
            if relative.family_member_id:
                family_member = db.query(FamilyMember).filter(FamilyMember.id == relative.family_member_id).first()
                if family_member:
                    rel_dict['relative_patient_id'] = family_member.relative_patient_id
                    # Lấy joint_date từ FamilyMember (chỉ date, không có time)
                    if family_member.joint_exam_date:
                        rel_dict['joint_date'] = family_member.joint_exam_date.strftime('%Y-%m-%d')
            relatives_data.append(rel_dict)
        
        return jsonify({
            'success': True,
            'data': relatives_data
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Lỗi khi lấy danh sách người đi khám cùng: {str(e)}'
        }), 500
    finally:
        db.close()

@appointment_relative_router.route('/appointment-relatives/<int:relative_id>', methods=['GET'])
@require_auth
def get_appointment_relative(user, relative_id):
    """Lấy thông tin một người đi khám cùng"""
    try:
        db = next(get_db())
        
        appointment_relative = db.query(AppointmentRelative).filter(
            AppointmentRelative.id == relative_id
        ).first()
        
        if not appointment_relative:
            return jsonify({
                'success': False,
                'message': 'Không tìm thấy người đi khám cùng'
            }), 404
        
        # Lấy appointment_date nếu có
        relative_data = appointment_relative.to_dict()
        if appointment_relative.appointment_id:
            appointment = db.query(Appointment).filter(Appointment.id == appointment_relative.appointment_id).first()
            if appointment and appointment.appointment_date:
                relative_data['appointment_date'] = appointment.appointment_date.isoformat()
        
        # Lấy relative_patient_id và joint_date từ family_member nếu có
        if appointment_relative.family_member_id:
            family_member = db.query(FamilyMember).filter(FamilyMember.id == appointment_relative.family_member_id).first()
            if family_member:
                relative_data['relative_patient_id'] = family_member.relative_patient_id
                # Lấy joint_date từ FamilyMember (chỉ date, không có time)
                if family_member.joint_exam_date:
                    relative_data['joint_date'] = family_member.joint_exam_date.strftime('%Y-%m-%d')
        
        return jsonify({
            'success': True,
            'data': relative_data
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Lỗi khi lấy thông tin người đi khám cùng: {str(e)}'
        }), 500
    finally:
        db.close()

@appointment_relative_router.route('/appointment-relatives', methods=['POST'])
@require_auth
def create_appointment_relative(user):
    """Tạo người đi khám cùng mới"""
    try:
        db = next(get_db())
        data = request.get_json()
        
        # Validate required fields
        if not data.get('appointment_id'):
            return jsonify({
                'success': False,
                'message': 'appointment_id là bắt buộc'
            }), 400
        
        if not data.get('name'):
            return jsonify({
                'success': False,
                'message': 'Họ tên là bắt buộc'
            }), 400
        
        # Validate kinship (Quan hệ) là bắt buộc
        if not data.get('kinship') or not str(data.get('kinship', '')).strip():
            return jsonify({
                'success': False,
                'message': 'Quan hệ là bắt buộc'
            }), 400
        
        # Chỉ require CCCD/CMND nếu không chọn từ hệ thống
        relative_patient_id = data.get('relative_patient_id')
        if not relative_patient_id and not data.get('id_number'):
            return jsonify({
                'success': False,
                'message': 'CCCD/CMND là bắt buộc khi nhập thủ công'
            }), 400
        
        # Kiểm tra appointment có tồn tại không
        appointment = db.query(Appointment).filter(Appointment.id == data['appointment_id']).first()
        if not appointment:
            return jsonify({
                'success': False,
                'message': 'Không tìm thấy lịch hẹn'
            }), 404
        
        # Lấy examination_id nếu có
        examination_id = data.get('examination_id')
        if examination_id:
            examination = db.query(Examination).filter(Examination.id == examination_id).first()
            if not examination:
                return jsonify({
                    'success': False,
                    'message': 'Không tìm thấy examination'
                }), 404
        else:
            examination = db.query(Examination).filter(
                Examination.appointment_id == data['appointment_id'],
                Examination.is_active == True
            ).order_by(Examination.created_at.desc()).first()
            if examination:
                examination_id = examination.id
        
        # Xử lý relative_patient_id (chọn từ hệ thống)
        family_member_id = data.get('family_member_id')
        family_member = None  # Khởi tạo biến để theo dõi
        # relative_patient_id đã được lấy ở trên
        
        # Nếu có relative_patient_id, tìm hoặc tạo family_member
        if relative_patient_id:
            from app.models.patient import Patient
            relative_patient = db.query(Patient).filter(Patient.id == relative_patient_id).first()
            if not relative_patient:
                return jsonify({
                    'success': False,
                    'message': 'Không tìm thấy bệnh nhân được chọn'
                }), 404
            
            # Tìm family_member đã có
            family_member = db.query(FamilyMember).filter(
                FamilyMember.patient_id == appointment.patient_id,
                FamilyMember.relative_patient_id == relative_patient_id
            ).first()
            
            # Lấy joint_date từ data hoặc dùng ngày hôm nay
            joint_date = None
            if data.get('joint_date'):
                try:
                    joint_date = datetime.strptime(data['joint_date'], '%Y-%m-%d').date()
                except (ValueError, TypeError):
                    pass
            if not joint_date:
                # Dùng ngày hôm nay thay vì appointment_date
                from datetime import date
                joint_date = date.today()
            
            # Nếu chưa có, tạo mới với đầy đủ thông tin
            if not family_member:
                family_member = FamilyMember(
                    patient_id=appointment.patient_id,
                    relative_patient_id=relative_patient_id,
                    name=relative_patient.full_name,
                    kinship=data.get('kinship') or 'Khác',
                    phone=relative_patient.phone,
                    id_number=relative_patient.id_number,
                    date_of_birth=relative_patient.date_of_birth,
                    gender=relative_patient.gender,
                    occupation=relative_patient.occupation,
                    address=relative_patient.address or (
                        f"{relative_patient.address_detail or ''}, "
                        f"{relative_patient.ward or ''}, "
                        f"{relative_patient.district or ''}, "
                        f"{relative_patient.province or ''}"
                    ).strip(', ').strip() or None,
                    emergency_contact=bool(data.get('emergency_contact', False)),
                    joint_exam_date=joint_date,
                    examine_together=True,  # Đánh dấu đã đi khám cùng
                    notes=data.get('notes')
                )
                db.add(family_member)
                db.flush()
            else:
                # Nếu đã có, cập nhật thông tin liên quan đến việc đi khám cùng
                if joint_date:
                    family_member.joint_exam_date = joint_date
                family_member.examine_together = True
                # Cập nhật thông tin nếu chưa có hoặc cần cập nhật
                if not family_member.name and relative_patient.full_name:
                    family_member.name = relative_patient.full_name
                if not family_member.phone and relative_patient.phone:
                    family_member.phone = relative_patient.phone
                if not family_member.id_number and relative_patient.id_number:
                    family_member.id_number = relative_patient.id_number
                if data.get('kinship'):
                    family_member.kinship = data['kinship']
                if data.get('emergency_contact') is not None:
                    family_member.emergency_contact = bool(data['emergency_contact'])
                if data.get('notes'):
                    family_member.notes = data['notes']
                db.flush()
            
            family_member_id = family_member.id
            
            # Lấy thông tin từ patient (ưu tiên hơn data từ frontend)
            name = relative_patient.full_name or data['name']
            phone = relative_patient.phone or data.get('phone')
            # Nếu chọn từ hệ thống, id_number sẽ lấy từ patient (có thể null)
            id_number = relative_patient.id_number or data.get('id_number') or None
        else:
            # Nhập thủ công - dùng data từ frontend (đã validate id_number ở trên)
            name = data['name']
            phone = data.get('phone')
            id_number = data.get('id_number') or None
            
            # Nếu chưa có family_member_id từ frontend, tạo FamilyMember mới
            if not family_member_id:
                # Lấy joint_date từ data hoặc dùng ngày hôm nay
                joint_date = None
                if data.get('joint_date'):
                    try:
                        joint_date = datetime.strptime(data['joint_date'], '%Y-%m-%d').date()
                    except (ValueError, TypeError):
                        pass
                if not joint_date:
                    # Dùng ngày hôm nay thay vì appointment_date
                    from datetime import date
                    joint_date = date.today()
                
                # Tìm xem đã có FamilyMember với cùng name và id_number chưa (tránh duplicate)
                existing_family_member = None
                if id_number:
                    existing_family_member = db.query(FamilyMember).filter(
                        FamilyMember.patient_id == appointment.patient_id,
                        FamilyMember.relative_patient_id.is_(None),  # Không chọn từ hệ thống
                        FamilyMember.id_number == id_number
                    ).first()
                else:
                    # Nếu không có id_number, tìm theo name và phone
                    if phone:
                        existing_family_member = db.query(FamilyMember).filter(
                            FamilyMember.patient_id == appointment.patient_id,
                            FamilyMember.relative_patient_id.is_(None),
                            FamilyMember.name == name,
                            FamilyMember.phone == phone
                        ).first()
                
                if existing_family_member:
                    # Nếu đã có, sử dụng và cập nhật thông tin
                    family_member = existing_family_member
                    if joint_date:
                        family_member.joint_exam_date = joint_date
                    family_member.examine_together = True
                    if data.get('kinship'):
                        family_member.kinship = data['kinship']
                    if data.get('emergency_contact') is not None:
                        family_member.emergency_contact = bool(data['emergency_contact'])
                    if data.get('notes'):
                        family_member.notes = data['notes']
                    db.flush()
                else:
                    # Tạo mới FamilyMember với thông tin nhập thủ công
                    family_member = FamilyMember(
                        patient_id=appointment.patient_id,
                        relative_patient_id=None,  # Không chọn từ hệ thống
                        name=name,
                        kinship=data.get('kinship') or 'Khác',
                        phone=phone,
                        id_number=id_number,
                        emergency_contact=bool(data.get('emergency_contact', False)),
                        joint_exam_date=joint_date,
                        examine_together=True,  # Đánh dấu đã đi khám cùng
                        notes=data.get('notes')
                    )
                    db.add(family_member)
                    db.flush()
                
                family_member_id = family_member.id
        
        # Kiểm tra family_member_id nếu có (từ frontend gửi trực tiếp)
        if family_member_id and not relative_patient_id and not family_member:
            # Chỉ kiểm tra nếu chưa được tạo ở trên
            family_member = db.query(FamilyMember).filter(FamilyMember.id == family_member_id).first()
            if not family_member:
                return jsonify({
                    'success': False,
                    'message': 'Không tìm thấy người thân'
                }), 404
            family_member_id = family_member.id
        
        # Tạo appointment_relative
        appointment_relative = AppointmentRelative(
            appointment_id=data['appointment_id'],
            examination_id=examination_id,
            patient_id=appointment.patient_id,
            family_member_id=family_member_id,
            name=name,
            kinship=data.get('kinship'),
            id_number=id_number,
            phone=phone,
            emergency_contact=bool(data.get('emergency_contact', False)),
            notes=data.get('notes')
        )
        
        db.add(appointment_relative)
        db.commit()
        db.refresh(appointment_relative)
        emit_patient_changed('appointment_relative_created', patient_id=appointment_relative.patient_id, appointment_id=appointment_relative.appointment_id, examination_id=appointment_relative.examination_id, extra={
            'appointment_relative_id': appointment_relative.id,
            'family_member_id': appointment_relative.family_member_id,
        })
        
        return jsonify({
            'success': True,
            'message': 'Đã thêm người đi khám cùng thành công',
            'data': appointment_relative.to_dict()
        })
    except Exception as e:
        db.rollback()
        return jsonify({
            'success': False,
            'message': f'Lỗi khi thêm người đi khám cùng: {str(e)}'
        }), 500
    finally:
        db.close()

@appointment_relative_router.route('/appointment-relatives/<int:relative_id>', methods=['PUT'])
@require_auth
def update_appointment_relative(user, relative_id):
    """Cập nhật thông tin người đi khám cùng"""
    try:
        db = next(get_db())
        data = request.get_json()
        
        appointment_relative = db.query(AppointmentRelative).filter(
            AppointmentRelative.id == relative_id
        ).first()
        
        if not appointment_relative:
            return jsonify({
                'success': False,
                'message': 'Không tìm thấy người đi khám cùng'
            }), 404
        
        # Validate kinship (Quan hệ) là bắt buộc nếu có trong data
        if 'kinship' in data:
            if not data.get('kinship') or not str(data.get('kinship', '')).strip():
                return jsonify({
                    'success': False,
                    'message': 'Quan hệ là bắt buộc'
                }), 400
        
        # Update fields
        if data.get('name'):
            appointment_relative.name = data['name']
        if data.get('kinship') is not None:
            appointment_relative.kinship = data['kinship']
        if data.get('id_number'):
            appointment_relative.id_number = data['id_number']
        if data.get('phone') is not None:
            appointment_relative.phone = data['phone']
        if data.get('emergency_contact') is not None:
            appointment_relative.emergency_contact = bool(data['emergency_contact'])
        if data.get('notes') is not None:
            appointment_relative.notes = data['notes']
        
        # Xử lý relative_patient_id (chọn từ hệ thống)
        relative_patient_id = data.get('relative_patient_id')
        if relative_patient_id is not None:
            relative_patient = db.query(Patient).filter(Patient.id == relative_patient_id).first()
            if not relative_patient:
                return jsonify({
                    'success': False,
                    'message': 'Không tìm thấy bệnh nhân được chọn'
                }), 404
            
            # Lấy appointment để có appointment_date
            appointment = db.query(Appointment).filter(Appointment.id == appointment_relative.appointment_id).first()
            
            # Lấy joint_date từ data hoặc dùng ngày hôm nay
            joint_date = None
            if data.get('joint_date'):
                try:
                    joint_date = datetime.strptime(data['joint_date'], '%Y-%m-%d').date()
                except (ValueError, TypeError):
                    pass
            if not joint_date:
                # Dùng ngày hôm nay thay vì appointment_date
                from datetime import date
                joint_date = date.today()
            
            # Tìm hoặc tạo family_member
            family_member = db.query(FamilyMember).filter(
                FamilyMember.patient_id == appointment_relative.patient_id,
                FamilyMember.relative_patient_id == relative_patient_id
            ).first()
            
            if not family_member:
                # Tạo mới với đầy đủ thông tin
                family_member = FamilyMember(
                    patient_id=appointment_relative.patient_id,
                    relative_patient_id=relative_patient_id,
                    name=relative_patient.full_name,
                    kinship=data.get('kinship') or appointment_relative.kinship or 'Khác',
                    phone=relative_patient.phone,
                    id_number=relative_patient.id_number,
                    date_of_birth=relative_patient.date_of_birth,
                    gender=relative_patient.gender,
                    occupation=relative_patient.occupation,
                    address=relative_patient.address or (
                        f"{relative_patient.address_detail or ''}, "
                        f"{relative_patient.ward or ''}, "
                        f"{relative_patient.district or ''}, "
                        f"{relative_patient.province or ''}"
                    ).strip(', ').strip() or None,
                    emergency_contact=bool(data.get('emergency_contact', appointment_relative.emergency_contact)),
                    joint_exam_date=joint_date,
                    examine_together=True,
                    notes=data.get('notes') or appointment_relative.notes
                )
                db.add(family_member)
                db.flush()
            else:
                # Cập nhật thông tin nếu cần
                if joint_date:
                    family_member.joint_exam_date = joint_date
                family_member.examine_together = True
                if not family_member.name and relative_patient.full_name:
                    family_member.name = relative_patient.full_name
                if not family_member.phone and relative_patient.phone:
                    family_member.phone = relative_patient.phone
                if not family_member.id_number and relative_patient.id_number:
                    family_member.id_number = relative_patient.id_number
                if data.get('kinship'):
                    family_member.kinship = data['kinship']
                if data.get('emergency_contact') is not None:
                    family_member.emergency_contact = bool(data['emergency_contact'])
                if data.get('notes'):
                    family_member.notes = data['notes']
                db.flush()
            
            appointment_relative.family_member_id = family_member.id
            
            # Cập nhật thông tin từ patient
            if relative_patient.full_name:
                appointment_relative.name = relative_patient.full_name
            if relative_patient.phone:
                appointment_relative.phone = relative_patient.phone
            if relative_patient.id_number:
                appointment_relative.id_number = relative_patient.id_number
        
        if data.get('family_member_id') is not None and not relative_patient_id:
            appointment_relative.family_member_id = data['family_member_id']
        
        # Update examination_id nếu có
        if data.get('examination_id') is not None:
            examination_id = data['examination_id']
            if examination_id:
                examination = db.query(Examination).filter(Examination.id == examination_id).first()
                if not examination:
                    return jsonify({
                        'success': False,
                        'message': 'Không tìm thấy examination'
                    }), 404
            appointment_relative.examination_id = examination_id
        
        appointment_relative.updated_at = datetime.utcnow()
        db.commit()
        emit_patient_changed('appointment_relative_updated', patient_id=appointment_relative.patient_id, appointment_id=appointment_relative.appointment_id, examination_id=appointment_relative.examination_id, extra={
            'appointment_relative_id': appointment_relative.id,
            'family_member_id': appointment_relative.family_member_id,
        })
        
        return jsonify({
            'success': True,
            'message': 'Đã cập nhật thông tin thành công',
            'data': appointment_relative.to_dict()
        })
    except Exception as e:
        db.rollback()
        return jsonify({
            'success': False,
            'message': f'Lỗi khi cập nhật thông tin: {str(e)}'
        }), 500
    finally:
        db.close()

@appointment_relative_router.route('/appointment-relatives/<int:relative_id>', methods=['DELETE'])
@require_auth
def delete_appointment_relative(user, relative_id):
    """Xóa người đi khám cùng"""
    try:
        db = next(get_db())
        appointment_relative = db.query(AppointmentRelative).filter(
            AppointmentRelative.id == relative_id
        ).first()
        
        if not appointment_relative:
            return jsonify({
                'success': False,
                'message': 'Không tìm thấy người đi khám cùng'
            }), 404
        
        patient_id = appointment_relative.patient_id
        appointment_id = appointment_relative.appointment_id
        examination_id = appointment_relative.examination_id
        family_member_id = appointment_relative.family_member_id
        deleted_family_member_id = cleanup_family_member_from_deleted_appointment_relative(
            db,
            family_member_id,
            relative_id
        )
        db.delete(appointment_relative)
        db.commit()
        emit_patient_changed('appointment_relative_deleted', patient_id=patient_id, appointment_id=appointment_id, examination_id=examination_id, extra={
            'appointment_relative_id': relative_id,
            'family_member_id': family_member_id,
            'deleted_family_member_id': deleted_family_member_id,
        })
        
        return jsonify({
            'success': True,
            'message': 'Đã xóa người đi khám cùng thành công',
            'deleted_family_member_id': deleted_family_member_id
        })
    except Exception as e:
        db.rollback()
        return jsonify({
            'success': False,
            'message': f'Lỗi khi xóa người đi khám cùng: {str(e)}'
        }), 500
    finally:
        db.close()
