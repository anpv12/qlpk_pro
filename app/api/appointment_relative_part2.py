"""app.api.appointment_relative: phần 2 — tách từ appointment_relative.py (import ở cuối appointment_relative.py để đăng ký route/giữ tên cũ)."""

from flask import request, jsonify
from app.core.database import get_db
from app.models.appointment_relative import AppointmentRelative
from app.models.examination import Examination
from app.models.patient import Patient
from app.models.family_member import FamilyMember
from app.api.auth import require_auth
from app.realtime.events import emit_patient_changed
from datetime import datetime
from app.api.appointment_relative import (  # noqa: E402 — module gốc đã khởi tạo xong các tên này
    appointment_relative_router,
    cleanup_family_member_from_deleted_appointment_relative,
    logger,
)


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

            # Lấy joint_date từ data hoặc dùng ngày hôm nay
            joint_date = None
            if data.get('joint_date'):
                try:
                    joint_date = datetime.strptime(data['joint_date'], '%Y-%m-%d').date()
                except (ValueError, TypeError) as exc:
                    logger.warning("Bỏ qua ngày khám cùng không hợp lệ: %s", exc)
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
