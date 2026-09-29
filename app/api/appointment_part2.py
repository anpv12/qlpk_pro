"""app.api.appointment: phần 2 — tách từ appointment.py (import ở cuối appointment.py để đăng ký route/giữ tên cũ)."""

from flask import request, jsonify
from app.core.database import get_db
from app.api.auth import require_auth
from app.realtime.events import emit_appointment_changed
from app.modules.appointments.services.calendar_transfer import schedule_calendar_transfer_drain
from app.modules.appointments.services import AppointmentDeletionBlocked, AppointmentDeletionNotFound, AppointmentDeletionRequiresForce, build_appointments_export_file, create_re_examination_from_payload, create_re_examination_from_prescription as create_re_examination_from_prescription_service, cancel_re_examination_appointment as cancel_re_examination_appointment_service, get_appointment_stats as get_appointment_stats_service, get_re_examination_appointment as get_re_examination_appointment_service, hard_delete_appointment_record, ReExaminationError, soft_delete_appointment, AppointmentTransferValidationError, transfer_appointments_between_roles
from app.utils.appointment_helpers import format_appointment_response
from app.api.appointment import (  # noqa: E402 — module gốc đã khởi tạo xong các tên này
    _commit_workflow_notifications,
    logger,
    notification_service,
    router,
    sync_calendar_for_appointment,
)


# Tạo lịch hẹn tái khám
@router.route('/re-examination', methods=['POST'])
@require_auth
def create_re_examination(user):
    db = next(get_db())
    try:
        data = request.get_json()
        logger.info(
            "Creating re-examination appointment user_id=%s keys=%s",
            getattr(user, 'id', None),
            sorted((data or {}).keys()),
        )

        creation_result = create_re_examination_from_payload(
            db,
            data,
            notification_service,
            logger=logger,
        )

        # Format response
        result = format_appointment_response(creation_result.appointment, db=db)
        result['success'] = True
        result['message'] = 'Đặt lịch tái khám thành công'
        emit_appointment_changed('re_examination_created', appointment=creation_result.appointment)

        return jsonify(result), 201, {'Content-Type': 'application/json; charset=utf-8'}
    except ReExaminationError as e:
        return jsonify({'detail': e.detail}), e.status_code, {'Content-Type': 'application/json; charset=utf-8'}
    except Exception as e:
        db.rollback()
        logger.error(f"Error in create_re_examination: {e}")
        return jsonify({'detail': f'Internal server error: {str(e)}'}), 500, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()


# Helper function: Tìm appointment tái khám từ appointment gốc
def get_re_examination_appointment(db, original_appointment_id):
    """Tìm appointment tái khám chưa khám (status = SCHEDULED) từ appointment gốc"""
    return get_re_examination_appointment_service(db, original_appointment_id)


# Helper function: Tạo appointment tái khám từ prescription
def create_re_examination_from_prescription(db, original_appointment_id, re_examination_date, re_examination_time, doctor_id, examination_type, package_service_id):
    """Tạo appointment tái khám từ prescription data"""
    return create_re_examination_from_prescription_service(
        db,
        original_appointment_id,
        re_examination_date,
        re_examination_time,
        doctor_id,
        examination_type,
        package_service_id,
        logger=logger,
    )


# Helper function: Cancel appointment tái khám
def cancel_re_examination_appointment(db, appointment_id):
    """Cancel appointment tái khám (chỉ khi status = SCHEDULED)"""
    return cancel_re_examination_appointment_service(db, appointment_id)


@router.route('/stats', methods=['GET'])
@require_auth
def get_appointment_stats(user):
    """Lấy thống kê appointments theo trạng thái examination"""
    db = next(get_db())
    try:
        stats = get_appointment_stats_service(db, user, request.args, logger=logger)
        return jsonify(stats), 200, {'Content-Type': 'application/json; charset=utf-8'}

    except Exception as e:
        logger.error(f"Error getting appointment stats: {e}")
        return jsonify({"detail": "Failed to retrieve appointment stats", "error": str(e)}), 500, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()


@router.route('/export', methods=['POST'])
@require_auth
def export_appointments(user):
    """Xuất danh sách appointments ra file Excel với format chuyên nghiệp"""
    db = next(get_db())
    try:
        from flask import send_file
        data = request.get_json() or {}
        export_result = build_appointments_export_file(db, data, logger=logger)

        return send_file(
            export_result.output,
            as_attachment=True,
            download_name=export_result.filename,
            mimetype=export_result.mimetype,
        )

    except Exception as e:
        logger.error(f"Lỗi xuất dữ liệu appointments: {str(e)}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({'detail': f'Có lỗi xảy ra khi xuất dữ liệu: {str(e)}'}), 500
    finally:
        db.close()


# Xóa lịch hẹn (soft delete) - Đổi route để tránh xung đột với GET
@router.route('/<int:appointment_id>/cancel', methods=['DELETE', 'POST'])
@require_auth
def delete_appointment(user, appointment_id):
    db = next(get_db())
    try:
        force = _get_delete_force_flag()
        result = soft_delete_appointment(db, appointment_id, force=force, logger=logger)
        db.commit()

        # Xóa event trên Google Calendar
        sync_calendar_for_appointment(result.appointment, db, action='delete')
        emit_appointment_changed('cancelled', appointment=result.appointment)

        logger.info(f"Appointment {appointment_id} và {result.deactivated_examination_count} examination(s) đã được đánh dấu xóa")
        return jsonify({'success': True, 'message': 'Đã xóa lịch hẹn thành công'}), 200
    except AppointmentDeletionNotFound as e:
        return jsonify({'detail': str(e)}), 404
    except AppointmentDeletionBlocked as e:
        return jsonify({
            'detail': str(e),
            'blocked': True,
            'examination_status': e.examination_status
        }), 400
    except AppointmentDeletionRequiresForce as e:
        return jsonify({
            'detail': str(e),
            'requires_force': True,
            'examination_status': e.examination_status
        }), 409
    except Exception as e:
        db.rollback()
        logger.error(f"Lỗi khi xóa appointment {appointment_id}: {str(e)}")
        return jsonify({'detail': f'Có lỗi xảy ra khi xóa lịch hẹn: {str(e)}'}), 500
    finally:
        db.close()


def _get_delete_force_flag():
    force = False
    if request.is_json and request.get_json(silent=True):
        force = request.get_json(silent=True).get('force', False)
    else:
        force = request.args.get('force', 'false').lower() == 'true'
    return force


@router.route('/<int:appt_id>/hard-delete', methods=['DELETE'])
@require_auth
def hard_delete_appointment(user, appt_id):
    db = next(get_db())
    try:
        hard_delete_appointment_record(
            db,
            appt_id,
            calendar_syncer=sync_calendar_for_appointment,
        )
        db.commit()
        emit_appointment_changed('hard_deleted', appointment_id=appt_id)
        return jsonify({'detail': f'Appointment with ID {appt_id} deleted successfully'}), 204 # 204 No Content for successful deletion
    except AppointmentDeletionNotFound as e:
        return jsonify({'detail': str(e)}), 404, {'Content-Type': 'application/json; charset=utf-8'}
    except Exception as e:
        db.rollback() # Rollback changes in case of an error
        logger.info(f"Error in hard_delete_appointment: {e}")
        return jsonify({'detail': f'Internal server error: {str(e)}'}), 500, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()


@router.route('/transfer', methods=['POST'])
@require_auth
def transfer_appointments(user):
    """Chuyển appointments giữa các role"""
    db = next(get_db())
    try:
        data = request.get_json(silent=True)
        result = transfer_appointments_between_roles(db, user, data, logger=logger)
        db.commit()
        schedule_calendar_transfer_drain(result.calendar_appointment_ids)
        if result.updated_count:
            emit_appointment_changed('transferred', extra={
                'appointment_ids': result.appointment_ids,
                'to_role': data.get('to_role'),
                'to_person_id': data.get('to_person_id'),
                'updated_count': result.updated_count,
            })
        if result.updated_count:
            _commit_workflow_notifications(
                db,
                lambda: notification_service.create_transfer_notifications(
                    db,
                    result.appointment_ids,
                    data.get('to_role'),
                    data.get('to_person_id'),
                    actor_user=user,
                )
            )

        return jsonify({
            "success": True,
            "message": f"Đã chuyển {result.updated_count} lịch hẹn thành công",
            "updated_count": result.updated_count
        }), 200, {'Content-Type': 'application/json; charset=utf-8'}
    except AppointmentTransferValidationError as e:
        db.rollback()
        return jsonify({"detail": str(e)}), e.status_code, {'Content-Type': 'application/json; charset=utf-8'}
    except Exception as e:
        db.rollback()
        logger.error(f"Error in transfer_appointments: {e}")
        return jsonify({"detail": "Failed to transfer appointments", "error": str(e)}), 500, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()
