from flask import Blueprint, request, jsonify, Response
import json

from app.core.database import get_db
from app.api.auth import require_auth
from app.models.appointment import Appointment
from app.services.notification_service import NotificationService
from app.realtime.events import emit_appointment_changed, emit_examination_changed
from app.utils.allergy_contract import AllergyContractError
from app.utils.medical_history_contract import MedicalHistoryContractError
from app.utils.risk_assessment import RiskAssessmentContractError
from app.utils.clinical_access import appointment_access_error
from app.modules.appointments.services.calendar_transfer import schedule_calendar_transfer_drain
from app.modules.appointments.services import (
    AppointmentAdminValidationError,
    AppointmentConfirmationNotFound,
    AppointmentConfirmationValidationError,
    AppointmentCreationDuplicateError,
    AppointmentCreationRequiresConfirmation,
    AppointmentCreationValidationError,
    AppointmentDeletionBlocked,
    AppointmentDeletionNotFound,
    AppointmentDeletionRequiresForce,
    AppointmentImportNoData,
    AppointmentStatusTransitionNotFound,
    apply_appointment_admin_updates,
    apply_appointment_update_side_effects,
    apply_examination_clinical_updates_from_appointment_payload,
    apply_psychologist_detail_updates_from_appointment_payload,
    apply_patient_updates_from_appointment_payload,
    build_appointments_export_file,
    confirm_scheduled_appointment,
    create_appointment_from_payload,
    create_re_examination_from_payload,
    create_re_examination_from_prescription as create_re_examination_from_prescription_service,
    cancel_re_examination_appointment as cancel_re_examination_appointment_service,
    ensure_examination_for_confirmed_appointment,
    get_appointment_list,
    get_appointment_stats as get_appointment_stats_service,
    get_re_examination_appointment as get_re_examination_appointment_service,
    hard_delete_appointment_record,
    import_appointments_batch,
    move_appointment_back_to_scheduled,
    return_appointment_to_doctor,
    return_appointment_to_receptionist,
    ReExaminationError,
    soft_delete_appointment,
    sync_calendar_for_appointment as sync_calendar_for_appointment_service,
    AppointmentTransferValidationError,
    transfer_appointments_between_roles,
)
from app.modules.appointments.view_models import (
    AppointmentEditNotFound,
    build_appointment_edit_response,
)
from app.utils.appointment_helpers import format_appointment_response
import logging
# Import pandas và os trong function để tránh lỗi import

logger = logging.getLogger(__name__)

def sync_calendar_for_appointment(appt, db, action='update'):
    """Compatibility wrapper for legacy callers in this route module."""
    return sync_calendar_for_appointment_service(appt, db, action=action, logger_override=logger)

# Initialize notification service
notification_service = NotificationService()

router = Blueprint('appointments', __name__)


def _commit_workflow_notifications(db, create_notifications):
    """Create realtime inbox notifications without breaking the clinical mutation."""
    try:
        notifications = create_notifications() or []
        payloads = notification_service.build_realtime_payloads(db, notifications)
        db.commit()
        notification_service.emit_realtime_payloads(payloads)
    except Exception as error:
        db.rollback()
        logger.error("Error creating workflow notifications: %s", error, exc_info=True)

def _is_receptionist_list_request(args):
    return args.get('receptionist', 'false').lower() == 'true'

def _mark_latest_edited_appointment(result, appointment_list, args):
    """Mark today's latest update in the filtered list, independent of page order."""
    if not _is_receptionist_list_request(args):
        return
    for item in result:
        item['is_latest_edited'] = (
            appointment_list.latest_edited_id is not None
            and item.get('id') == appointment_list.latest_edited_id
        )

# Lấy danh sách lịch hẹn (filter theo ngày, bác sĩ, trạng thái, phân trang)
@router.route('/', methods=['GET'])
@require_auth
def list_appointments(user):
    db = next(get_db())
    try:
        appointment_list = get_appointment_list(db, user, request.args, logger=logger)
        result = [format_appointment_response(a, db=db) for a in appointment_list.appointments]
        _mark_latest_edited_appointment(result, appointment_list, request.args)

        response_data = {
            'appointments': result,
            'pagination': appointment_list.pagination,
        }

        return jsonify(response_data), 200, {'Content-Type': 'application/json; charset=utf-8'}
    except Exception as e:
        # Catch any unexpected errors during the process
        logger.error(f"Error in list_appointments: {e}")
        return jsonify({'detail': f'Internal server error: {str(e)}'}), 500, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()

# Lấy chi tiết lịch hẹn
@router.route('/<int:appt_id>', methods=['GET'])
@require_auth
def get_appointment(user, appt_id):
    db = next(get_db())
    try:
        from sqlalchemy.orm import joinedload
        from app.models.examination import Examination
        appt = db.query(Appointment).options(
            joinedload(Appointment.examinations).joinedload(Examination.details)
        ).filter(Appointment.id == appt_id).first()
        if not appt:
            return jsonify({'detail': 'Appointment not found'}), 404, {'Content-Type': 'application/json; charset=utf-8'}
        access_error = appointment_access_error(user, appt)
        if access_error:
            return jsonify({'detail': access_error}), 403, {'Content-Type': 'application/json; charset=utf-8'}
            
        result = format_appointment_response(appt, db=db)
            
        return jsonify(result), 200, {'Content-Type': 'application/json; charset=utf-8'}
    except Exception as e:
        logger.error(f"Error in get_appointment: {e}")
        return jsonify({'detail': f'Internal server error: {str(e)}'}), 500, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()



# Lấy thông tin lịch hẹn để edit
@router.route('/<int:appt_id>/edit', methods=['GET'])
@require_auth
def get_appointment_for_edit(user, appt_id):
    """Lấy thông tin lịch hẹn để edit"""
    db = next(get_db())
    try:
        appointment = db.query(Appointment).filter(Appointment.id == appt_id).first()
        if not appointment:
            raise AppointmentEditNotFound()
        access_error = appointment_access_error(user, appointment)
        if access_error:
            return jsonify({'error': access_error}), 403
        result = build_appointment_edit_response(db, appt_id)
        return jsonify(result)
    except AppointmentEditNotFound:
        return jsonify({'error': 'Không tìm thấy lịch hẹn'}), 404
    except Exception as e:
        logger.error(f"Error getting appointment for edit: {str(e)}")
        return jsonify({'error': 'Lỗi server'}), 500
    finally:
        db.close()

# Tạo mới lịch hẹn
@router.route('/', methods=['POST'])
@require_auth
def create_appointment(user):
    db = next(get_db())
    try:
        data = request.get_json()
        creation_result = create_appointment_from_payload(
            db,
            data,
            notification_service,
            sync_calendar_for_appointment,
            logger=logger,
        )

        result = format_appointment_response(creation_result.appointment, db=db)
        emit_appointment_changed('created', appointment=creation_result.appointment)
        return jsonify(result), 201, {'Content-Type': 'application/json; charset=utf-8'}
    except AppointmentCreationRequiresConfirmation as e:
        return jsonify(e.payload), 200, {'Content-Type': 'application/json; charset=utf-8'}
    except AppointmentCreationDuplicateError as e:
        db.rollback()
        return Response(
            json.dumps({'detail': e.detail}, ensure_ascii=False),
            status=400,
            mimetype='application/json; charset=utf-8'
        )
    except AppointmentCreationValidationError as e:
        db.rollback()
        return jsonify({'detail': e.detail}), e.status_code, {'Content-Type': 'application/json; charset=utf-8'}
    except AllergyContractError as e:
        db.rollback()
        return jsonify({'detail': str(e)}), 400, {'Content-Type': 'application/json; charset=utf-8'}
    except (MedicalHistoryContractError, RiskAssessmentContractError) as e:
        db.rollback()
        return jsonify({'detail': str(e)}), 400, {'Content-Type': 'application/json; charset=utf-8'}
    except Exception as e:
        db.rollback()
        logger.info(f"Error in create_appointment: {e}")
        return jsonify({'detail': f'Internal server error: {str(e)}'}), 500, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()

# Cập nhật lịch hẹn
@router.route('/<int:appt_id>', methods=['PUT'])
@require_auth
def update_appointment(user, appt_id):
    db = next(get_db())
    try:
        data = request.get_json()
        logger.debug(
            "update_appointment appt_id=%s user_id=%s keys=%s",
            appt_id,
            getattr(user, 'id', None),
            sorted((data or {}).keys()),
        )
        appt = db.query(Appointment).filter(Appointment.id == appt_id).first()
        if not appt:
            return jsonify({'detail': 'Appointment not found'}), 404, {'Content-Type': 'application/json; charset=utf-8'}
        access_error = appointment_access_error(user, appt)
        if access_error:
            return jsonify({'detail': access_error}), 403, {'Content-Type': 'application/json; charset=utf-8'}
        
        try:
            admin_update = apply_appointment_admin_updates(db, appt, appt_id, data, logger=logger)
        except AppointmentAdminValidationError as e:
            db.rollback()
            return jsonify({'detail': e.detail}), 400, {'Content-Type': 'application/json; charset=utf-8'}

        doctor_changed = admin_update.doctor_changed
        appointment_date_updated = admin_update.appointment_date_updated
        update_fields = admin_update.update_fields
        ensure_examination_for_confirmed_appointment(db, appt, appt_id, update_fields)
            
        apply_patient_updates_from_appointment_payload(db, appt, data, logger=logger)
        
        # Update patient record - main_reason và main_symptoms đã chuyển sang examination
        # Không cần cập nhật patient record nữa vì main_reason và main_symptoms đã chuyển sang examination
        
        examination = apply_examination_clinical_updates_from_appointment_payload(
            db,
            appt,
            appt_id,
            data,
            logger=logger,
        )
                
        apply_psychologist_detail_updates_from_appointment_payload(
            db,
            examination,
            data,
            logger=logger,
        )

        db.commit()
        # Refresh và eager load examination để đảm bảo có dữ liệu mới nhất
        db.refresh(appt)
        
        apply_appointment_update_side_effects(
            db,
            appt,
            doctor_changed=doctor_changed,
            appointment_date_updated=appointment_date_updated,
            calendar_syncer=sync_calendar_for_appointment,
            notification_service=notification_service,
            logger_override=logger,
        )
        
        from sqlalchemy.orm import joinedload
        from app.models.examination import Examination
        appt = db.query(Appointment).options(
            joinedload(Appointment.examinations).joinedload(Examination.details)
        ).filter(Appointment.id == appt.id).first()
            
        result = format_appointment_response(appt, db=db)
        emit_appointment_changed('updated', appointment=appt)
            
        return jsonify(result), 200, {'Content-Type': 'application/json; charset=utf-8'}
    except AllergyContractError as e:
        db.rollback()
        return jsonify({'detail': str(e)}), 400, {'Content-Type': 'application/json; charset=utf-8'}
    except (MedicalHistoryContractError, RiskAssessmentContractError) as e:
        db.rollback()
        return jsonify({'detail': str(e)}), 400, {'Content-Type': 'application/json; charset=utf-8'}
    except Exception as e:
        db.rollback() # Rollback changes in case of an error
        logger.info(f"Error in update_appointment: {e}")
        return jsonify({'detail': f'Internal server error: {str(e)}'}), 500, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()

# Xác nhận lịch hẹn và tạo examination
@router.route('/<int:appt_id>/confirm', methods=['PUT'])
@require_auth
def confirm_appointment(user, appt_id):
    db = next(get_db())
    try:
        result = confirm_scheduled_appointment(db, appt_id)
        db.commit()
        db.refresh(result.appointment)
        db.refresh(result.examination)
        emit_appointment_changed('confirmed', appointment=result.appointment)
        emit_examination_changed('created', examination=result.examination)
        
        return jsonify({
            'detail': 'Appointment confirmed and examination created successfully',
            'appointment': {
                'id': result.appointment.id,
                'status': result.appointment.status.value,
                'patient_name': result.appointment.patient.full_name,
                'doctor_name': result.appointment.doctor.full_name,
                'appointment_date': result.appointment.appointment_date.isoformat()
            },
            'examination': {
                'id': result.examination.id,
                'examination_code': result.examination.examination_code,
                'status': result.examination.status.value
            }
        }), 200, {'Content-Type': 'application/json; charset=utf-8'}
    except AppointmentConfirmationNotFound as e:
        return jsonify({'detail': str(e)}), 404, {'Content-Type': 'application/json; charset=utf-8'}
    except AppointmentConfirmationValidationError as e:
        return jsonify({'detail': str(e)}), 400, {'Content-Type': 'application/json; charset=utf-8'}
    except Exception as e:
        db.rollback()
        logger.info(f"Error in confirm_appointment: {e}")
        return jsonify({'detail': f'Internal server error: {str(e)}'}), 500, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()

# Xóa lịch hẹn (hard delete) - ĐÃ BỊ VÔ HIỆU HÓA
# Sử dụng soft delete ở endpoint DELETE /appointments/<appointment_id> thay thế

@router.route('/import', methods=['POST'])
@require_auth
def import_appointments(user):
    db = next(get_db())
    try:
        data = request.get_json()
        rows = data.get('data', [])
        result = import_appointments_batch(db, rows, logger=logger)

        db.commit() # Commit all successfully added appointments at the end for efficiency
        emit_appointment_changed('imported', extra={'imported_count': result.imported_count})
        return jsonify({
            'message': f'Successfully imported {result.imported_count} appointments!',
            'errors': result.errors
        }), 200, {'Content-Type': 'application/json; charset=utf-8'}
    except AppointmentImportNoData as e:
        return jsonify({'detail': str(e)}), 400, {'Content-Type': 'application/json; charset=utf-8'}
    except Exception as e:
        db.rollback() # Rollback all changes if any overall error occurs during the batch import
        logger.info(f"Error during import_appointments: {e}")
        return jsonify({'detail': f'Internal server error during import: {str(e)}'}), 500, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()


@router.route('/<int:appt_id>/back-to-appointment', methods=['PUT'])
@require_auth
def back_to_appointment(user, appt_id):
    """
    Xóa examination và chuyển appointment về trạng thái SCHEDULED (chờ xác nhận)
    """
    db = next(get_db())
    try:
        move_appointment_back_to_scheduled(db, appt_id, logger=logger)
        db.commit()
        emit_appointment_changed('back_to_appointment', appointment_id=appt_id)
        emit_examination_changed('deleted', appointment_id=appt_id)

        logger.info(f"Appointment {appt_id} moved back to SCHEDULED status")

        return jsonify({
            'message': 'Đã xóa lượt khám và chuyển về lịch hẹn chờ xác nhận thành công',
            'appointment_id': appt_id,
            'new_status': 'SCHEDULED'
        }), 200, {'Content-Type': 'application/json; charset=utf-8'}
    except AppointmentStatusTransitionNotFound as e:
        return jsonify({'detail': str(e)}), 404, {'Content-Type': 'application/json; charset=utf-8'}
    except Exception as e:
        db.rollback()
        logger.error(f"Error in back_to_appointment: {e}")
        return jsonify({'detail': f'Internal server error: {str(e)}'}), 500, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()

@router.route('/<int:appt_id>/return-to-doctor', methods=['PUT'])
@require_auth
def return_to_doctor(user, appt_id):
    """
    Chuyển examination về trạng thái DOCTOR_EXAM (trả về bác sĩ)
    """
    db = next(get_db())
    try:
        result = return_appointment_to_doctor(db, appt_id)
        db.commit()
        emit_examination_changed('returned_to_doctor', examination=result.examination)
        _commit_workflow_notifications(
            db,
            lambda: notification_service.create_return_to_doctor_notification(
                db,
                result.appointment,
                result.examination,
                actor_user=user,
            )
        )

        logger.info(f"Examination {result.examination.id} returned to DOCTOR_EXAM status")

        return jsonify({
            'message': 'Đã trả bệnh nhân về bác sĩ thành công',
            'appointment_id': appt_id,
            'examination_id': result.examination.id,
            'new_status': 'DOCTOR_EXAM'
        }), 200, {'Content-Type': 'application/json; charset=utf-8'}
    except AppointmentStatusTransitionNotFound as e:
        return jsonify({'detail': str(e)}), 404, {'Content-Type': 'application/json; charset=utf-8'}
    except Exception as e:
        db.rollback()
        logger.error(f"Error in return_to_doctor: {e}")
        return jsonify({'detail': f'Internal server error: {str(e)}'}), 500, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()

@router.route('/<int:appt_id>/return-to-receptionist', methods=['PUT'])
@require_auth
def return_to_receptionist(user, appt_id):
    """
    Chuyển examination về trạng thái WAITING_TRANSFER (chờ chuyển khám)
    """
    db = next(get_db())
    try:
        result = return_appointment_to_receptionist(db, appt_id)
        db.commit()
        emit_examination_changed('returned_to_receptionist', examination=result.examination)
        _commit_workflow_notifications(
            db,
            lambda: notification_service.create_return_to_receptionist_notifications(
                db,
                result.appointment,
                result.examination,
                actor_user=user,
            )
        )

        logger.info(f"Examination {result.examination.id} returned to WAITING_TRANSFER status")

        return jsonify({
            'message': 'Đã trả bệnh nhân về lễ tân thành công',
            'appointment_id': appt_id,
            'examination_id': result.examination.id,
            'new_status': 'WAITING_TRANSFER'
        }), 200, {'Content-Type': 'application/json; charset=utf-8'}
    except AppointmentStatusTransitionNotFound as e:
        return jsonify({'detail': str(e)}), 404, {'Content-Type': 'application/json; charset=utf-8'}
    except Exception as e:
        db.rollback()
        logger.error(f"Error in return_to_receptionist: {e}")
        return jsonify({'detail': f'Internal server error: {str(e)}'}), 500, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()

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
