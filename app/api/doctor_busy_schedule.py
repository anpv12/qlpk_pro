from flask import Blueprint, request, jsonify
from app.core.database import get_db
from app.models.doctor_busy_schedule import DoctorBusySchedule
from app.api.auth import require_auth
from app.realtime.events import emit_busy_schedule_changed, emit_notification_changed
from app.modules.appointments.services.scheduling_conflict import (
    find_appointment_overlap,
    find_busy_schedule_overlap,
    to_local_aware,
)
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import joinedload
import pytz
import logging

logger = logging.getLogger(__name__)

doctor_busy_schedule_bp = Blueprint('doctor_busy_schedule', __name__)

# Lấy danh sách lịch bận của bác sĩ
@doctor_busy_schedule_bp.route('/doctor-busy-schedules', methods=['GET'])
@require_auth
def get_doctor_busy_schedules(current_user):
    """Lấy danh sách lịch bận của bác sĩ"""
    db = next(get_db())
    try:
        # Lấy tham số filter
        doctor_id = request.args.get('doctor_id', type=int)
        date_from = request.args.get('date_from')
        date_to = request.args.get('date_to')
        status = request.args.get('status', 'active')
        
        # Query cơ bản
        query = db.query(DoctorBusySchedule).options(
            joinedload(DoctorBusySchedule.doctor)
        ).filter(DoctorBusySchedule.status == status)
        
        # Filter theo bác sĩ
        if doctor_id:
            query = query.filter(DoctorBusySchedule.doctor_id == doctor_id)
        
        # Filter theo khoảng thời gian bằng overlap:
        # schedule giao với range nếu start <= range_end và end >= range_start.
        range_start = None
        range_end = None
        if date_from:
            range_start = datetime.fromisoformat(date_from)
        if date_to:
            range_end = datetime.fromisoformat(date_to)

        if range_start and range_end:
            query = query.filter(
                DoctorBusySchedule.start_datetime <= range_end,
                DoctorBusySchedule.end_datetime >= range_start
            )
        elif range_start:
            query = query.filter(DoctorBusySchedule.end_datetime >= range_start)
        elif range_end:
            query = query.filter(DoctorBusySchedule.start_datetime <= range_end)
        
        # Chỉ lấy các lịch bận chưa kết thúc (end_datetime >= now)
        # Trừ khi có date_to được chỉ định (để xem lịch sử)
        if not date_to:
            now = datetime.now(timezone.utc)
            query = query.filter(DoctorBusySchedule.end_datetime >= now)
        
        # Sắp xếp theo thời gian
        busy_schedules = query.order_by(DoctorBusySchedule.start_datetime).all()
        
        # Format kết quả
        result = [schedule.to_dict() for schedule in busy_schedules]
        
        return jsonify({
            'success': True,
            'data': result,
            'total': len(result)
        }), 200
        
    except Exception as e:
        logger.error(f"Error getting doctor busy schedules: {e}")
        return jsonify({'error': 'Lỗi server'}), 500
    finally:
        db.close()

def _notify_staff_of_busy_schedule(busy_schedule):
    from app.models.notification import Notification
    from app.models.user import User

    # Tạo session mới cho notification
    notification_db = next(get_db())

    # Lấy danh sách lễ tân (role = 'staff' trong database)
    receptionists = notification_db.query(User).filter(User.role == 'staff').all()

    for receptionist in receptionists:
        notification = Notification(
            user_id=receptionist.id,
            title='Bác sĩ báo lịch bận',
            message=f'Bác sĩ {busy_schedule.doctor.full_name} đã báo lịch bận từ {busy_schedule.start_datetime.strftime("%d/%m/%Y %H:%M")} đến {busy_schedule.end_datetime.strftime("%d/%m/%Y %H:%M")}',
            type='doctor_busy_schedule',
            data={
                'busy_schedule_id': busy_schedule.id,
                'doctor_id': busy_schedule.doctor_id,
                'doctor_name': busy_schedule.doctor.full_name,
                'start_datetime': busy_schedule.start_datetime.isoformat(),
                'end_datetime': busy_schedule.end_datetime.isoformat(),
                'reason': busy_schedule.reason
            }
        )
        notification_db.add(notification)

    notification_db.commit()
    notification_db.close()
    emit_notification_changed('created', role='staff', extra={
        'type': 'doctor_busy_schedule',
        'busy_schedule_id': busy_schedule.id,
        'doctor_id': busy_schedule.doctor_id,
    })
    logger.info("Successfully created notifications")


def _busy_schedule_conflict_response(data, db, end_datetime, start_datetime):
    # Kiểm tra xung đột với lịch hẹn hiện có
    conflict_appointment = find_appointment_overlap(
        db,
        data['doctor_id'],
        start_datetime,
        end_datetime,
    )

    if conflict_appointment:
        return jsonify({
            'error': 'Xung đột với lịch hẹn hiện có',
            'conflicts': [{
                'id': conflict_appointment.id,
                'patient_name': conflict_appointment.patient.full_name if conflict_appointment.patient else 'N/A',
                'appointment_date': conflict_appointment.appointment_date.isoformat(),
                'status': conflict_appointment.status.value if hasattr(conflict_appointment.status, 'value') else conflict_appointment.status
            }]
        }), 409

    # Kiểm tra xung đột với lịch bận khác
    existing_busy = find_busy_schedule_overlap(
        db,
        data['doctor_id'],
        start_datetime,
        end_datetime,
    )

    if existing_busy:
        return jsonify({
            'error': 'Xung đột với lịch bận khác',
            'conflict_schedule': existing_busy.to_dict()
        }), 409
    return None


# Tạo lịch bận mới
@doctor_busy_schedule_bp.route('/doctor-busy-schedules', methods=['POST'])
@require_auth
def create_doctor_busy_schedule(current_user):
    """Tạo lịch bận mới"""
    db = next(get_db())
    try:
        data = request.get_json()
        logger.info(
            "Creating busy schedule doctor_id=%s keys=%s",
            data.get('doctor_id') if data else None,
            sorted((data or {}).keys()),
        )
        
        # Validation
        required_fields = ['doctor_id', 'start_datetime', 'end_datetime']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Thiếu trường {field}'}), 400
        
        # Parse datetime
        try:
            start_datetime = datetime.fromisoformat(data['start_datetime'].replace('Z', '+00:00'))
            end_datetime = datetime.fromisoformat(data['end_datetime'].replace('Z', '+00:00'))
        except ValueError as e:
            return jsonify({'error': f'Định dạng thời gian không hợp lệ: {str(e)}'}), 400
        
        # Validation thời gian
        if start_datetime >= end_datetime:
            return jsonify({'error': 'Thời gian bắt đầu phải nhỏ hơn thời gian kết thúc'}), 400
        
        error_response = _busy_schedule_conflict_response(data, db, end_datetime, start_datetime)
        if error_response is not None:
            return error_response
        
        # Tạo lịch bận mới
        logger.info(f"Creating DoctorBusySchedule with doctor_id: {data['doctor_id']}")
        busy_schedule = DoctorBusySchedule(
            doctor_id=data['doctor_id'],
            start_datetime=start_datetime,
            end_datetime=end_datetime,
            reason=data.get('reason', 'Không có lý do'),
            description='',  # Trường description luôn để trống
            created_by=current_user.id
        )
        
        db.add(busy_schedule)
        logger.info("Added busy_schedule to database, committing...")
        db.commit()
        db.refresh(busy_schedule)
        logger.info(f"Successfully created busy schedule with ID: {busy_schedule.id}")
        
        # Tạo notification cho lễ tân (sử dụng session mới)
        try:
            _notify_staff_of_busy_schedule(busy_schedule)
        except Exception as e:
            logger.warning(f"Could not create notifications: {e}")
            # Không rollback nếu notification lỗi

        emit_busy_schedule_changed('created', schedule=busy_schedule)
        
        return jsonify({
            'success': True,
            'data': busy_schedule.to_dict(),
            'message': 'Tạo lịch bận thành công'
        }), 201
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating doctor busy schedule: {e}")
        return jsonify({'error': 'Lỗi server'}), 500
    finally:
        try:
            db.close()
        except Exception as exc:
            logger.warning('Không đóng được session DB: %s', exc)

# Cập nhật lịch bận
@doctor_busy_schedule_bp.route('/doctor-busy-schedules/<int:schedule_id>', methods=['PUT'])
@require_auth
def update_doctor_busy_schedule(current_user, schedule_id):
    """Cập nhật lịch bận"""
    db = next(get_db())
    try:
        busy_schedule = db.query(DoctorBusySchedule).filter(
            DoctorBusySchedule.id == schedule_id
        ).first()
        
        if not busy_schedule:
            return jsonify({'error': 'Không tìm thấy lịch bận'}), 404
        
        data = request.get_json()
        
        # Cập nhật các trường
        if 'start_datetime' in data:
            busy_schedule.start_datetime = datetime.fromisoformat(data['start_datetime'].replace('Z', '+00:00'))
        if 'end_datetime' in data:
            busy_schedule.end_datetime = datetime.fromisoformat(data['end_datetime'].replace('Z', '+00:00'))
        if 'reason' in data:
            busy_schedule.reason = data['reason']
        if 'status' in data:
            busy_schedule.status = data['status']
        
        # Validation thời gian
        if busy_schedule.start_datetime >= busy_schedule.end_datetime:
            return jsonify({'error': 'Thời gian bắt đầu phải nhỏ hơn thời gian kết thúc'}), 400

        conflict_appointment = find_appointment_overlap(
            db,
            busy_schedule.doctor_id,
            busy_schedule.start_datetime,
            busy_schedule.end_datetime,
        )
        if conflict_appointment:
            return jsonify({
                'error': 'Xung đột với lịch hẹn hiện có',
                'conflicts': [{
                    'id': conflict_appointment.id,
                    'patient_name': conflict_appointment.patient.full_name if conflict_appointment.patient else 'N/A',
                    'appointment_date': conflict_appointment.appointment_date.isoformat(),
                    'status': conflict_appointment.status.value if hasattr(conflict_appointment.status, 'value') else conflict_appointment.status
                }]
            }), 409

        existing_busy = find_busy_schedule_overlap(
            db,
            busy_schedule.doctor_id,
            busy_schedule.start_datetime,
            busy_schedule.end_datetime,
            exclude_schedule_id=schedule_id,
        )
        if existing_busy:
            return jsonify({
                'error': 'Xung đột với lịch bận khác',
                'conflict_schedule': existing_busy.to_dict()
            }), 409
        
        db.commit()
        db.refresh(busy_schedule)
        emit_busy_schedule_changed('updated', schedule=busy_schedule)
        
        return jsonify({
            'success': True,
            'data': busy_schedule.to_dict(),
            'message': 'Cập nhật lịch bận thành công'
        }), 200
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating doctor busy schedule: {e}")
        return jsonify({'error': 'Lỗi server'}), 500
    finally:
        db.close()

# Xóa lịch bận
@doctor_busy_schedule_bp.route('/doctor-busy-schedules/<int:schedule_id>', methods=['DELETE'])
@require_auth
def delete_doctor_busy_schedule(current_user, schedule_id):
    """Xóa lịch bận"""
    db = next(get_db())
    try:
        busy_schedule = db.query(DoctorBusySchedule).filter(
            DoctorBusySchedule.id == schedule_id
        ).first()
        
        if not busy_schedule:
            return jsonify({'error': 'Không tìm thấy lịch bận'}), 404
        
        # Soft delete - chỉ đổi status
        busy_schedule.status = 'cancelled'
        db.commit()
        db.refresh(busy_schedule)
        emit_busy_schedule_changed('deleted', schedule=busy_schedule)
        
        return jsonify({
            'success': True,
            'message': 'Xóa lịch bận thành công'
        }), 200
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting doctor busy schedule: {e}")
        return jsonify({'error': 'Lỗi server'}), 500
    finally:
        db.close()

# Lấy danh sách lý do bận phổ biến
@doctor_busy_schedule_bp.route('/doctor-busy-schedules/busy-reasons', methods=['GET'])
@require_auth
def get_busy_reasons(current_user):
    """Lấy danh sách lý do bận phổ biến"""
    db = next(get_db())
    try:
        # Lấy top 10 lý do mới nhất
        recent_reasons = db.query(DoctorBusySchedule.reason).filter(
            DoctorBusySchedule.status == 'active'
        ).order_by(DoctorBusySchedule.created_at.desc()).limit(10).all()
        
        # Lấy tất cả lý do unique để đếm frequency
        all_reasons = db.query(DoctorBusySchedule.reason).filter(
            DoctorBusySchedule.status == 'active',
            DoctorBusySchedule.reason.isnot(None),
            DoctorBusySchedule.reason != ''
        ).all()
        
        # Đếm frequency của mỗi lý do
        reason_count = {}
        for reason_tuple in all_reasons:
            reason = reason_tuple[0]
            if reason:
                reason_count[reason] = reason_count.get(reason, 0) + 1
        
        # Sắp xếp theo frequency (giảm dần)
        popular_reasons = sorted(reason_count.items(), key=lambda x: x[1], reverse=True)[:10]
        
        # Kết hợp recent và popular reasons
        recent_reasons_list = [reason[0] for reason in recent_reasons if reason[0]]
        popular_reasons_list = [reason[0] for reason in popular_reasons]
        
        # Loại bỏ duplicate và giữ thứ tự
        combined_reasons = []
        seen = set()
        
        # Thêm recent reasons trước
        for reason in recent_reasons_list:
            if reason not in seen:
                combined_reasons.append(reason)
                seen.add(reason)
        
        # Thêm popular reasons
        for reason in popular_reasons_list:
            if reason not in seen:
                combined_reasons.append(reason)
                seen.add(reason)
        
        # Thêm default reasons nếu chưa đủ
        default_reasons = [
            'Họp định kỳ', 'Nghỉ phép', 'Khám ngoài', 'Đào tạo', 
            'Hội nghị', 'Nghỉ ốm', 'Công tác', 'Nghỉ lễ'
        ]
        
        for reason in default_reasons:
            if reason not in seen and len(combined_reasons) < 15:
                combined_reasons.append(reason)
                seen.add(reason)
        
        return jsonify({
            'success': True,
            'reasons': combined_reasons[:15]  # Giới hạn 15 lý do
        }), 200
        
    except Exception as e:
        logger.error(f"Error getting busy reasons: {e}")
        return jsonify({'error': 'Lỗi server'}), 500
    finally:
        db.close()

# Kiểm tra bác sĩ có rảnh không
@doctor_busy_schedule_bp.route('/check-doctor-availability', methods=['POST'])
@require_auth
def check_doctor_availability(current_user):
    """Kiểm tra bác sĩ có rảnh không"""
    db = next(get_db())
    try:
        data = request.get_json()
        doctor_id = data.get('doctor_id')
        appointment_datetime_str = data.get('appointment_datetime')
        if not doctor_id:
            return jsonify({'error': 'Thiếu doctor_id'}), 400
        if not appointment_datetime_str:
            return jsonify({'error': 'Thiếu appointment_datetime'}), 400
        server_tz = pytz.timezone('Asia/Ho_Chi_Minh')
        
        # Handle datetime without timezone (assume it's local time)
        if 'T' in appointment_datetime_str and not ('+' in appointment_datetime_str or 'Z' in appointment_datetime_str):
            # No timezone info, assume it's local time
            appointment_datetime = datetime.fromisoformat(appointment_datetime_str)
            # Make it timezone-aware with server timezone
            appointment_datetime = server_tz.localize(appointment_datetime)
        else:
            # Has timezone info, parse normally
            appointment_datetime = datetime.fromisoformat(appointment_datetime_str.replace('Z', '+00:00'))
        
        try:
            duration_minutes = int(data.get('duration_minutes') or 30)
        except (TypeError, ValueError):
            duration_minutes = 30

        end_datetime = appointment_datetime + timedelta(minutes=duration_minutes)

        busy_schedule = find_busy_schedule_overlap(db, doctor_id, appointment_datetime, end_datetime)
        if busy_schedule:
            busy_start = to_local_aware(busy_schedule.start_datetime)
            busy_end = to_local_aware(busy_schedule.end_datetime)
            return jsonify({
                'available': False,
                'conflict_type': 'busy_schedule',
                'conflict_info': {
                    'time_range': f"{busy_start.strftime('%d/%m/%Y %H:%M')} - {busy_end.strftime('%d/%m/%Y %H:%M')}",
                    'reason': busy_schedule.reason
                }
            }), 200

        exclude_id = data.get('appointment_id')

        existing_appointment = find_appointment_overlap(
            db,
            doctor_id,
            appointment_datetime,
            end_datetime,
            exclude_appointment_id=exclude_id,
        )
        if existing_appointment:
            return jsonify({
                'available': False,
                'conflict_type': 'appointment',
                'conflict_info': {
                    'patient_name': existing_appointment.patient.full_name if existing_appointment.patient else 'N/A',
                    'appointment_date': existing_appointment.appointment_date.strftime('%d/%m/%Y %H:%M'),
                    'status': existing_appointment.status.value if hasattr(existing_appointment.status, 'value') else existing_appointment.status
                }
            }), 200

        return jsonify({
            'available': True,
            'message': 'Bác sĩ rảnh trong khoảng thời gian này'
        }), 200
        
    except Exception as e:
        logger.error(f"Error checking doctor availability: {e}")
        return jsonify({'error': 'Lỗi server'}), 500
    finally:
        db.close()

# Lấy lịch bận của bác sĩ hiện tại
@doctor_busy_schedule_bp.route('/doctor-busy-schedules/my-busy-schedules', methods=['GET'])
@require_auth
def get_my_busy_schedules(current_user):
    """Lấy lịch bận của bác sĩ hiện tại"""
    db = next(get_db())
    try:
        # Lấy tham số filter
        date_from = request.args.get('date_from')
        date_to = request.args.get('date_to')
        status = request.args.get('status', 'active')
        
        # Query lịch bận của bác sĩ hiện tại
        query = db.query(DoctorBusySchedule).filter(
            DoctorBusySchedule.doctor_id == current_user.id
        )
        if status != 'all':
            query = query.filter(DoctorBusySchedule.status == status)
        
        # Filter theo khoảng thời gian
        if date_from:
            query = query.filter(DoctorBusySchedule.start_datetime >= datetime.fromisoformat(date_from))
        if date_to:
            query = query.filter(DoctorBusySchedule.end_datetime <= datetime.fromisoformat(date_to))
        
        # Mặc định chỉ hiện lịch đang hoạt động sắp tới; Tất cả/Đã hủy
        # phải đọc được lịch sử của chính người dùng này.
        if status == 'active' and not date_to:
            now = datetime.now(timezone.utc)
            query = query.filter(DoctorBusySchedule.end_datetime >= now)
        
        # Sắp xếp theo thời gian
        busy_schedules = query.order_by(DoctorBusySchedule.start_datetime).all()
        
        # Format kết quả
        result = [schedule.to_dict() for schedule in busy_schedules]
        
        return jsonify({
            'success': True,
            'data': result,
            'total': len(result)
        }), 200
        
    except Exception as e:
        logger.error(f"Error getting my busy schedules: {e}")
        return jsonify({'error': 'Lỗi server'}), 500
    finally:
        db.close()
