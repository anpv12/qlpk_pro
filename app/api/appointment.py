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

# Route/hàm còn lại nằm ở appointment_part2.py; import để đăng ký route và giữ tên cũ trên module này.
from app.api.appointment_part2 import (  # noqa: E402,F401
    create_re_examination,
    get_re_examination_appointment,
    create_re_examination_from_prescription,
    cancel_re_examination_appointment,
    get_appointment_stats,
    export_appointments,
    delete_appointment,
    _get_delete_force_flag,
    hard_delete_appointment,
    transfer_appointments,
)
