from flask import Blueprint, request, jsonify
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.examination import Examination
from app.models.appointment import Appointment
from app.api.auth import require_auth
from app.realtime.events import emit_examination_changed
from app.modules.examinations.services.details_service import (
    AppointmentIdRequired,
    ExaminationNotFound,
    MissingRequiredFields,
    NoDataProvided,
    delete_examination_details_result,
    get_details_by_appointment_result,
    get_examination_details_result,
    get_examination_id_payload_by_appointment,
    get_psychological_examination_result,
    get_section_details_result,
    load_modal_data_result,
    replace_examination_details,
    save_detail_by_appointment_result,
    save_modal_data_result,
    save_psychological_examination_result,
    save_section_details_result,
)
from app.utils.examination_utils import build_icd_display_contract
from app.utils.clinical_access import appointment_access_error, examination_access_error

router = Blueprint("examination_details", __name__)


def _examination_access_error(db, user, examination_id):
    if not examination_id:
        return None
    examination = db.query(Examination).filter(Examination.id == examination_id).first()
    return examination_access_error(db, user, examination) if examination else None


def _appointment_access_error(db, user, appointment_id):
    if not appointment_id:
        return None
    appointment = db.query(Appointment).filter(Appointment.id == appointment_id).first()
    return appointment_access_error(user, appointment) if appointment else None


@router.route("/examination-details/<int:examination_id>", methods=["GET"])
@require_auth
def get_examination_details(user, examination_id: int):
    """Lấy chi tiết khám bệnh theo examination_id và section"""
    db = next(get_db())
    try:
        access_error = _examination_access_error(db, user, examination_id)
        if access_error:
            return jsonify({"error": access_error}), 403
        return jsonify(get_examination_details_result(db, examination_id, request.args.get('section')))
    except ExaminationNotFound:
        return jsonify({"error": "Examination not found"}), 404
    except Exception as e:
        db.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        db.close()


@router.route("/examination-details/<int:examination_id>", methods=["POST"])
@require_auth
def save_examination_details(user, examination_id: int):
    """Lưu chi tiết khám bệnh"""
    db = next(get_db())
    try:
        access_error = _examination_access_error(db, user, examination_id)
        if access_error:
            return jsonify({"error": access_error}), 403
        data = request.get_json()
        replace_examination_details(db, examination_id, data)
        emit_examination_changed('details_replaced', examination_id=examination_id)
        return jsonify({"message": "Examination details saved successfully"})
    except ExaminationNotFound:
        return jsonify({"error": "Examination not found"}), 404
    except NoDataProvided:
        return jsonify({"error": "No data provided"}), 400
    except Exception as e:
        db.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        db.close()


@router.route("/examination-details/<int:examination_id>/section/<section>", methods=["GET"])
@require_auth
def get_examination_section_details(user, examination_id: int, section: str):
    """Lấy chi tiết khám bệnh cho một section cụ thể"""
    db = next(get_db())
    try:
        access_error = _examination_access_error(db, user, examination_id)
        if access_error:
            return jsonify({"error": access_error}), 403
        return jsonify({"data": get_section_details_result(db, examination_id, section)})
    except ExaminationNotFound:
        return jsonify({"error": "Examination not found"}), 404
    except Exception as e:
        db.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        db.close()


@router.route("/examination-details/<int:examination_id>/section/<section>", methods=["POST"])
@require_auth
def save_examination_section_details(user, examination_id: int, section: str):
    """Lưu chi tiết khám bệnh cho một section cụ thể"""
    db = next(get_db())
    try:
        access_error = _examination_access_error(db, user, examination_id)
        if access_error:
            return jsonify({"error": access_error}), 403
        data = request.get_json()
        result = save_section_details_result(db, examination_id, section, data)
        new_section = result.get("section")
        emit_examination_changed(
            'section_details_saved',
            examination_id=result.get('examination_id') or examination_id,
            appointment_id=result.get('appointment_id'),
            extra={
                'section': new_section,
                'saved_fields': result.get('saved_fields'),
            },
        )
        return jsonify({"message": f"Section '{new_section}' saved successfully"})
    except ExaminationNotFound:
        return jsonify({"error": "Examination not found"}), 404
    except NoDataProvided:
        return jsonify({"error": "No data provided"}), 400
    except Exception as e:
        db.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        db.close()


@router.route("/examination-details/<int:examination_id>", methods=["DELETE"])
@require_auth
def delete_examination_details(user, examination_id: int):
    """Xóa tất cả chi tiết khám bệnh cho một examination"""
    db = next(get_db())
    try:
        access_error = _examination_access_error(db, user, examination_id)
        if access_error:
            return jsonify({"error": access_error}), 403
        delete_examination_details_result(db, examination_id)
        emit_examination_changed('details_deleted', examination_id=examination_id)
        return jsonify({"message": "Examination details deleted successfully"})
    except ExaminationNotFound:
        return jsonify({"error": "Examination not found"}), 404
    except Exception as e:
        db.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        db.close()


@router.route("/examination-details/psychological/<int:examination_id>", methods=["GET"])
@require_auth
def get_psychological_examination(user, examination_id: int):
    """Lấy dữ liệu khám tâm lý"""
    db = next(get_db())
    try:
        access_error = _examination_access_error(db, user, examination_id)
        if access_error:
            return jsonify({"error": access_error}), 403
        return jsonify({"data": get_psychological_examination_result(db, examination_id)})
    except ExaminationNotFound:
        return jsonify({"error": "Examination not found"}), 404
    except Exception as e:
        db.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        db.close()


@router.route("/examination-details/psychological/<int:examination_id>", methods=["POST"])
@require_auth
def save_psychological_examination(user, examination_id: int):
    """Lưu dữ liệu khám tâm lý"""
    db = next(get_db())
    try:
        access_error = _examination_access_error(db, user, examination_id)
        if access_error:
            return jsonify({"error": access_error}), 403
        data = request.get_json()
        save_psychological_examination_result(db, examination_id, data)
        emit_examination_changed('psychological_details_saved', examination_id=examination_id)
        return jsonify({"message": "Psychological examination data saved successfully"})
    except ExaminationNotFound:
        return jsonify({"error": "Examination not found"}), 404
    except NoDataProvided:
        return jsonify({"error": "No data provided"}), 400
    except Exception as e:
        db.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        db.close()


@router.route("/examination-id/<int:appointment_id>", methods=["GET"])
@require_auth
def get_examination_id_by_appointment(user, appointment_id: int):
    """Lấy examination_id từ appointment_id"""
    db = next(get_db())
    try:
        access_error = _appointment_access_error(db, user, appointment_id)
        if access_error:
            return jsonify({"error": access_error}), 403
        return jsonify(get_examination_id_payload_by_appointment(db, appointment_id))
    except ExaminationNotFound:
        return jsonify({"error": "Examination not found for this appointment"}), 404
    except Exception as e:
        db.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        db.close()


@router.route("/examination-details", methods=["POST"])
@require_auth
def save_examination_detail_by_appointment(user):
    """Lưu một examination detail theo appointment_id"""
    db = next(get_db())
    try:
        data = request.get_json()
        access_error = _appointment_access_error(db, user, (data or {}).get('appointment_id'))
        if access_error:
            return jsonify({"error": access_error}), 403
        result = save_detail_by_appointment_result(db, data)
        emit_examination_changed(
            'detail_field_saved',
            examination_id=result.get('examination_id'),
            appointment_id=result.get('appointment_id'),
            extra={
                'section': result.get('section'),
                'field_name': result.get('field_name'),
            },
        )
        return jsonify({"message": "Examination detail saved successfully"})
    except NoDataProvided:
        return jsonify({"error": "No data provided"}), 400
    except MissingRequiredFields:
        return jsonify({"error": "Missing required fields"}), 400
    except ExaminationNotFound:
        return jsonify({"error": "Examination not found for this appointment"}), 404
    except Exception as e:
        db.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        db.close()


@router.route("/examination-details/modal-save", methods=["POST"])
@require_auth
def save_examination_modal_data(user):
    """Lưu dữ liệu modal Khám chi tiết theo appointment_id và sections"""
    db = next(get_db())
    try:
        data = request.get_json()
        access_error = _appointment_access_error(db, user, (data or {}).get('appointment_id'))
        if access_error:
            return jsonify({"error": access_error}), 403
        result = save_modal_data_result(db, data)
        emit_examination_changed('modal_details_saved', examination_id=result.get('examination_id'), appointment_id=data.get('appointment_id'), extra=result)
        return jsonify(result)
    except NoDataProvided:
        return jsonify({"error": "No data provided"}), 400
    except AppointmentIdRequired:
        return jsonify({"error": "appointment_id is required"}), 400
    except ExaminationNotFound:
        return jsonify({"error": "Examination not found for this appointment"}), 404
    except Exception as e:
        db.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        db.close()


@router.route("/examination-details/modal-load/<int:appointment_id>", methods=["GET"])
@require_auth
def load_examination_modal_data(user, appointment_id: int):
    """Load dữ liệu modal Khám chi tiết theo appointment_id"""
    db = next(get_db())
    try:
        access_error = _appointment_access_error(db, user, appointment_id)
        if access_error:
            return jsonify({"error": access_error}), 403
        return jsonify(load_modal_data_result(db, appointment_id))
    except ExaminationNotFound:
        return jsonify({"error": "Examination not found for this appointment"}), 404
    except Exception as e:
        db.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        db.close()


@router.route("/examination-details/appointment/<int:appointment_id>", methods=["GET"])
@require_auth
def get_examination_details_by_appointment(user, appointment_id: int):
    """Lấy tất cả examination details theo appointment_id"""
    db = next(get_db())
    try:
        access_error = _appointment_access_error(db, user, appointment_id)
        if access_error:
            return jsonify({"error": access_error}), 403
        return jsonify(get_details_by_appointment_result(db, appointment_id))
    except ExaminationNotFound:
        return jsonify({"error": "Examination not found for this appointment"}), 404
    except Exception as e:
        db.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        db.close()

@router.route("/examination-details/<int:examination_id>/info", methods=["GET"])
@require_auth
def get_examination_info(user, examination_id: int):
    """Lấy thông tin examination theo examination_id"""
    try:
        db: Session = next(get_db())
        
        # Tìm examination record theo examination_id
        examination = db.query(Examination).filter(Examination.id == examination_id).first()
        if not examination:
            return jsonify({"error": "Examination not found"}), 404
        access_error = examination_access_error(db, user, examination)
        if access_error:
            return jsonify({"error": access_error}), 403
        
        # Lấy thông tin psychologist nếu có (dựa vào appointment.psychologist)
        psychologist_name = "Tâm lý gia"
        psychologist = getattr(examination.appointment, 'psychologist', None)
        if psychologist and psychologist.full_name:
            psychologist_name = psychologist.full_name
        
        diagnosis_contract = build_icd_display_contract(db, examination.diagnosis)

        return jsonify({
            "id": examination.id,
            "appointment_id": examination.appointment_id,
            "examination_code": examination.examination_code,
            "status": examination.status.value if hasattr(examination.status, 'value') else (examination.status or None),
            "created_at": examination.created_at.isoformat() if examination.created_at else None,
            "psychologist_name": psychologist_name,
            "main_reason": None,  # Sẽ được lấy từ examination details
            "diagnosis": diagnosis_contract["text"],
            "diagnosis_ids": diagnosis_contract["ids"]
        })
        
    except Exception as e:
        db.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        db.close()
