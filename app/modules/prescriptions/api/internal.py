"""Internal prescription API routes used by authenticated clinical screens."""

from flask import Blueprint, request, jsonify
from app.core.database import get_db
from app.api.auth import require_auth
from app.models.appointment import Appointment, AppointmentCategory, AppointmentStatus
from app.models.prescription import Prescription
from app.utils.clinical_access import appointment_access_error, patient_access_error
from app.realtime.events import emit_examination_changed, emit_inventory_changed
from datetime import datetime
import logging
from app.modules.prescriptions.services import (
    build_appointment_prescription_payload,
    build_patient_prescription_history_payload,
    normalize_prescription_medicines,
    PrescriptionAppointmentNotFound,
    PrescriptionStockValidationError,
    save_prescription_transaction,
    sync_re_examination_after_prescription_save,
)
from app.modules.prescriptions.view_models.print_prescription import (
    PrescriptionPrintAppointmentNotFound,
    build_internal_prescription_print_view_model,
)

logger = logging.getLogger(__name__)

router = Blueprint('prescription_api', __name__)

logger.debug("Prescription router created with name 'prescription_api'")

@router.route('/save', methods=['POST'])
@require_auth
def save_prescription(user):
    """Save one prescription aggregate and its inventory delta atomically."""
    db = None
    try:
        db = next(get_db())
        data = request.get_json() or {}
        
        appointment_id = data.get('appointment_id')
        medicines = normalize_prescription_medicines(data.get('medicines', []))
        usage_instructions = data.get('usage_instructions', '')
        re_exam_date_raw = data.get('re_examination_date')
        re_exam_time_raw = data.get('re_examination_time', '09:00')  # Mặc định 09:00 nếu không có
        
        logger.info(f"save_prescription: appointment_id={appointment_id}, medicines_count={len(medicines)}")
        if not appointment_id:
            return jsonify({'detail': 'appointment_id is required'}), 400
        appointment = db.query(Appointment).filter(Appointment.id == appointment_id).first()
        if not appointment:
            return jsonify({'detail': 'Appointment not found'}), 404
        access_error = appointment_access_error(user, appointment)
        if access_error:
            return jsonify({'detail': access_error}), 403

        # Only a CONFIRMED re-examination schedule is server-owned. A SCHEDULED
        # child remains editable from the Doctor prescription workflow.
        active_re_appointment = db.query(Appointment).filter(
            Appointment.original_appointment_id == appointment_id,
            Appointment.appointment_category == AppointmentCategory.RE_EXAMINATION,
            Appointment.is_deleted == False,
            Appointment.status != AppointmentStatus.CANCELLED,
        ).order_by(Appointment.appointment_date.desc(), Appointment.id.desc()).first()
        if (
            active_re_appointment
            and active_re_appointment.status == AppointmentStatus.CONFIRMED
            and active_re_appointment.appointment_date
        ):
            re_exam_date_raw = active_re_appointment.appointment_date.date().isoformat()
            re_exam_time_raw = active_re_appointment.appointment_date.strftime('%H:%M')

        re_examination_date = None
        if re_exam_date_raw:
            try:
                re_examination_date = datetime.strptime(re_exam_date_raw, '%Y-%m-%d').date()
            except Exception:
                return jsonify({'detail': 'Invalid re_examination_date format, expected YYYY-MM-DD'}), 400
        
        save_result = save_prescription_transaction(
            db,
            appointment_id=appointment_id,
            user_id=user.id,
            medicines=medicines,
            usage_instructions=usage_instructions,
            re_examination_date=re_examination_date,
        )
        prescription_id = save_result['prescription_id']
        stock_updates = save_result['stock_updates']
        stock_allocation_states = save_result['stock_allocation_states']
        emit_examination_changed('prescription_saved', appointment_id=appointment_id, extra={
            'entity': 'prescription',
            'prescription_id': prescription_id,
        })
        if stock_updates:
            emit_inventory_changed('prescription_saved', entity='prescription', extra={
                'appointment_id': appointment_id,
                'medicine_ids': [item.get('medicine_id') for item in stock_updates if item.get('medicine_id')],
                'stock_updates_count': len(stock_updates),
            })
        
        re_examination_sync_result = sync_re_examination_after_prescription_save(
            db=db,
            data=data,
            appointment_id=appointment_id,
            re_examination_date=re_examination_date,
            re_exam_time_raw=re_exam_time_raw,
            logger=logger,
        )
        
        return jsonify({
            'message': 'Prescription saved successfully',
            'prescription_id': prescription_id,
            'stock_updates': stock_updates,
            'stock_allocation_states': stock_allocation_states,
            'prescription_codes_by_type': save_result['prescription_codes_by_type'],
            # The prescription is already committed; expose scheduling as a
            # separate result so the UI can report a truthful partial save.
            're_examination_sync_result': re_examination_sync_result or {'ok': True}
        }), 200
        
    except PrescriptionStockValidationError as e:
        if db:
            db.rollback()
        return jsonify({
            'code': 'inventory.insufficient',
            'detail': 'Không đủ tồn kho',
            'errors': e.errors,
        }), 400
    except PrescriptionAppointmentNotFound:
        if db:
            db.rollback()
        return jsonify({'detail': 'Appointment not found'}), 404
    except Exception as e:
        if db:
            db.rollback()
        logger.exception("Error saving prescription for appointment_id=%s", locals().get('appointment_id'))
        return jsonify({'detail': 'Internal server error', 'error': str(e)}), 500
    finally:
        if db:
            db.close()

@router.route('/appointment/<int:appointment_id>', methods=['GET'])
@require_auth
def get_prescription(user, appointment_id):
    """Get prescriptions for an appointment (grouped by type)"""
    try:
        db = next(get_db())
        appointment = db.query(Appointment).filter(Appointment.id == appointment_id).first()
        if not appointment:
            return jsonify({'detail': 'Appointment not found'}), 404
        access_error = appointment_access_error(user, appointment)
        if access_error:
            return jsonify({'detail': access_error}), 403
        return jsonify(build_appointment_prescription_payload(db, appointment_id)), 200
        
    except Exception as e:
        logger.exception("Error getting prescription for appointment_id=%s", appointment_id)
        return jsonify({'detail': 'Internal server error'}), 500
    finally:
        db.close()

@router.route('/appointment/<int:appointment_id>/print-view-model', methods=['GET'])
@require_auth
def get_prescription_print_view_model(user, appointment_id):
    """Build prescription print/preview data from backend-owned contracts."""
    try:
        db = next(get_db())
        appointment = db.query(Appointment).filter(Appointment.id == appointment_id).first()
        if not appointment:
            return jsonify({'detail': 'Appointment not found'}), 404
        access_error = appointment_access_error(user, appointment)
        if access_error:
            return jsonify({'detail': access_error}), 403
        return jsonify(build_internal_prescription_print_view_model(db, appointment_id)), 200

    except PrescriptionPrintAppointmentNotFound as e:
        return jsonify({'detail': str(e)}), 404
    except Exception as e:
        logger.exception("Error getting prescription print view model for appointment_id=%s", appointment_id)
        return jsonify({'detail': 'Internal server error'}), 500
    finally:
        db.close()

@router.route('/usage', methods=['POST'])
@require_auth
def save_prescription_usage(user):
    """Save prescription usage instructions only"""
    try:
        db = next(get_db())
        data = request.get_json()
        
        appointment_id = data.get('appointment_id')
        usage_instructions = data.get('usage_instructions', '')
        
        if not appointment_id:
            return jsonify({'detail': 'appointment_id is required'}), 400
        appointment = db.query(Appointment).filter(Appointment.id == appointment_id).first()
        if not appointment:
            return jsonify({'detail': 'Appointment not found'}), 404
        access_error = appointment_access_error(user, appointment)
        if access_error:
            return jsonify({'detail': access_error}), 403
        
        # Check if prescription exists
        prescription = db.query(Prescription).filter(
            Prescription.appointment_id == appointment_id
        ).first()
        
        if prescription:
            # Update existing prescription usage instructions
            prescription.usage_instructions = usage_instructions
            prescription.updated_at = datetime.now()
        else:
            # Create new prescription with only usage instructions
            prescription = Prescription(
                appointment_id=appointment_id,
                total_amount=0,
                usage_instructions=usage_instructions,
                created_at=datetime.now(),
                updated_at=datetime.now()
            )
            db.add(prescription)
        
        db.commit()
        emit_examination_changed('prescription_usage_saved', appointment_id=appointment_id, extra={
            'entity': 'prescription',
            'prescription_id': prescription.id,
        })

        return jsonify({'message': 'Usage instructions saved successfully'}), 200
        
    except Exception as e:
        db.rollback()
        logger.exception("Error saving prescription usage instructions")
        return jsonify({'detail': 'Internal server error'}), 500
    finally:
        db.close()

@router.route('/get-next-sequence', methods=['GET'])
@require_auth
def get_next_prescription_sequence(user):
    """Lấy số thứ tự đơn thuốc tiếp theo trong ngày hiện tại"""
    try:
        db = next(get_db())
        from datetime import date
        
        # Lấy ngày hiện tại
        today = date.today()
        
        # Đếm số đơn thuốc đã tạo trong ngày hôm nay
        count = db.query(Prescription).filter(
            Prescription.created_at >= datetime.combine(today, datetime.min.time()),
            Prescription.created_at < datetime.combine(today, datetime.max.time())
        ).count()
        
        # Số thứ tự tiếp theo
        next_sequence = count + 1
        
        return jsonify({
            'sequence': next_sequence,
            'date': today.strftime('%Y-%m-%d')
        }), 200
        
    except Exception as e:
        logger.error(f"Error getting prescription sequence: {str(e)}")
        return jsonify({'detail': 'Internal server error', 'error': str(e)}), 500
    finally:
        db.close()


@router.route("/patient/<int:patient_id>/history", methods=["GET"])
@require_auth
def get_patient_prescription_history(user, patient_id):
    """Lay lich su kham cua benh nhan, group theo luot kham (appointment).
    Bao gom: benh su (examination_details.bac_si_kham_tien_su.medical_history),
    chan doan, va don thuoc (neu co).
    """
    try:
        db = next(get_db())
        access_error = patient_access_error(db, user, patient_id)
        if access_error:
            return jsonify({'detail': access_error}), 403
        return jsonify(build_patient_prescription_history_payload(db, patient_id)), 200

    except Exception as e:
        logger.error(f"Error getting patient prescription history: {str(e)}")
        return jsonify({"detail": "Internal server error", "error": str(e)}), 500
    finally:
        db.close()
