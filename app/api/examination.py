from flask import Blueprint, request, jsonify
from app.api.auth import require_auth
from app.core.database import get_db
from app.models.examination import Examination
from app.realtime.events import emit_appointment_changed, emit_examination_changed
from app.modules.examinations.services import (
    CreateExaminationValidationError,
    InvalidStatusTransition,
    StatusTransitionExaminationNotFound,
    complete_psychologist_examination_result,
    confirm_examination_result,
    create_examination_result,
    LookupExaminationNotFound,
    HardDeleteExaminationNotFound,
    get_examination_doctors_result,
    get_examination_id_by_appointment_result,
    get_examination_packages_result,
    get_examination_services_result,
    hard_delete_examination_result,
    transfer_to_conclusion_result,
    transfer_to_payment_result,
)
import logging

examination_bp = Blueprint('examination', __name__)

@examination_bp.route('/examinations', methods=['POST'])
@require_auth
def create_examination(user):
    """Tạo lượt khám mới"""
    db = next(get_db())
    try:
        data = request.get_json()
        result = create_examination_result(db, data, logger=logging)
        emit_appointment_changed('created_from_examination', appointment_id=result.get('appointment_id'), extra=result)
        emit_examination_changed('created', appointment_id=result.get('appointment_id'), extra=result)
        return jsonify(result), 201
    except CreateExaminationValidationError as e:
        return jsonify({'detail': e.detail}), 400
    except Exception as e:
        db.rollback()
        logging.error(f"Lỗi tạo lượt khám: {str(e)}")
        return jsonify({'detail': 'Có lỗi xảy ra khi tạo lượt khám'}), 500
    finally:
        db.close()

@examination_bp.route('/doctors', methods=['GET'])
@require_auth
def get_doctors(user):
    """Lấy danh sách bác sĩ"""
    db = next(get_db())
    try:
        return jsonify(get_examination_doctors_result(db)), 200
    except Exception as e:
        logging.error(f"Lỗi lấy danh sách bác sĩ: {str(e)}")
        return jsonify({'detail': 'Có lỗi xảy ra khi lấy danh sách bác sĩ'}), 500
    finally:
        db.close()

@examination_bp.route('/packages', methods=['GET'])
@require_auth
def get_packages(user):
    """Lấy danh sách gói khám"""
    db = next(get_db())
    try:
        return jsonify(get_examination_packages_result(db)), 200
    except Exception as e:
        logging.error(f"Lỗi lấy danh sách gói: {str(e)}")
        return jsonify({'detail': 'Có lỗi xảy ra khi lấy danh sách gói'}), 500
    finally:
        db.close()

@examination_bp.route('/services', methods=['GET'])
@require_auth
def get_services(user):
    """Lấy danh sách dịch vụ"""
    db = next(get_db())
    try:
        return jsonify(get_examination_services_result(db)), 200
    except Exception as e:
        logging.error(f"Lỗi lấy danh sách dịch vụ: {str(e)}")
        return jsonify({'detail': 'Có lỗi xảy ra khi lấy danh sách dịch vụ'}), 500
    finally:
        db.close()

@examination_bp.route('/examinations/<int:examination_id>/transfer-to-conclusion', methods=['PUT'])
@require_auth
def transfer_to_conclusion(user, examination_id):
    """Chuyển khám từ tâm lý gia về bác sĩ để nhập kết luận.
    Chỉ có thể chuyển từ trạng thái PSYCHOLOGIST_EXAM sang CONCLUSION.
    """
    db = next(get_db())
    try:
        result = transfer_to_conclusion_result(db, examination_id)
        examination = db.query(Examination).filter(Examination.id == examination_id).first()
        emit_examination_changed('transfer_to_conclusion', examination=examination, extra=result)
        return jsonify(result), 200
    except StatusTransitionExaminationNotFound:
        return jsonify({'detail': 'Lượt khám không tồn tại'}), 404
    except InvalidStatusTransition as e:
        return jsonify({'detail': e.detail}), 400
    except Exception as e:
        db.rollback()
        logging.error(f"Lỗi chuyển kết luận: {str(e)}")
        return jsonify({'detail': 'Có lỗi xảy ra khi chuyển kết luận'}), 500
    finally:
        db.close()

@examination_bp.route('/examinations/appointment/<int:appointment_id>/id', methods=['GET'])
@require_auth
def get_examination_id_by_appointment(user, appointment_id):
    """Lấy examination_id từ appointment_id"""
    db = next(get_db())
    try:
        return jsonify(get_examination_id_by_appointment_result(db, appointment_id)), 200
    except LookupExaminationNotFound:
        return jsonify({'error': 'Examination not found for this appointment'}), 404
    except Exception as e:
        logging.error(f"Lỗi lấy examination_id: {str(e)}")
        return jsonify({'detail': 'Có lỗi xảy ra khi lấy examination_id'}), 500
    finally:
        db.close()

@examination_bp.route('/examinations/<int:examination_id>/transfer-to-payment', methods=['PUT'])
@require_auth
def transfer_to_payment(user, examination_id):
    """Chuyển từ trạng thái bác sĩ sang WAITING_PAYMENT (Chờ thanh toán).
    Ngầm hiểu là bác sĩ đã khám xong, bệnh nhân chờ thanh toán.
    """
    db = next(get_db())
    try:
        result = transfer_to_payment_result(db, examination_id)
        examination = db.query(Examination).filter(Examination.id == examination_id).first()
        emit_examination_changed('transfer_to_payment', examination=examination, extra=result)
        return jsonify(result), 200
    except StatusTransitionExaminationNotFound:
        return jsonify({'detail': 'Lượt khám không tồn tại'}), 404
    except InvalidStatusTransition as e:
        return jsonify({'detail': e.detail}), 400
    except Exception as e:
        db.rollback()
        logging.error(f"Lỗi chuyển sang chờ thanh toán: {str(e)}")
        return jsonify({'detail': 'Có lỗi xảy ra khi chuyển sang chờ thanh toán'}), 500
    finally:
        db.close()

@examination_bp.route('/examinations/<int:examination_id>/complete-psychologist-exam', methods=['PUT'])
@require_auth
def complete_psychologist_examination(user, examination_id):
    """Hoàn thành khám tâm lý gia, chuyển từ PSYCHOLOGIST_EXAM sang WAITING_PAYMENT.
    Ngầm hiểu là tâm lý gia đã khám xong, bệnh nhân chờ thanh toán.
    """
    db = next(get_db())
    try:
        result = complete_psychologist_examination_result(db, examination_id)
        examination = db.query(Examination).filter(Examination.id == examination_id).first()
        emit_examination_changed('complete_psychologist_exam', examination=examination, extra=result)
        return jsonify(result), 200
    except StatusTransitionExaminationNotFound:
        return jsonify({'detail': 'Lượt khám không tồn tại'}), 404
    except InvalidStatusTransition as e:
        return jsonify({'detail': e.detail}), 400
    except Exception as e:
        db.rollback()
        logging.error(f"Lỗi hoàn thành khám tâm lý gia: {str(e)}")
        return jsonify({'detail': 'Có lỗi xảy ra khi hoàn thành khám tâm lý gia'}), 500
    finally:
        db.close()

@examination_bp.route('/examinations/<int:examination_id>/confirm', methods=['PUT'])
@require_auth
def confirm_examination(user, examination_id):
    """Xác nhận hóa đơn - cập nhật trạng thái examination sang CONFIRMED"""
    db = next(get_db())
    try:
        result = confirm_examination_result(db, examination_id)
        examination = db.query(Examination).filter(Examination.id == examination_id).first()
        emit_examination_changed('confirmed', examination=examination, extra=result)
        return jsonify(result), 200
    except StatusTransitionExaminationNotFound:
        return jsonify({'detail': 'Lượt khám không tồn tại'}), 404
    except Exception as e:
        db.rollback()
        logging.error(f"Lỗi xác nhận hóa đơn: {str(e)}")
        return jsonify({'detail': 'Có lỗi xảy ra khi xác nhận hóa đơn'}), 500
    finally:
        db.close()

@examination_bp.route('/examinations/<int:examination_id>', methods=['DELETE'])
@require_auth
def delete_examination(user, examination_id):
    """Xóa hẳn examination và tất cả dữ liệu liên quan (hard delete)"""
    db = next(get_db())
    try:
        result = hard_delete_examination_result(db, examination_id, logger=logging)
        emit_examination_changed('hard_deleted', examination_id=examination_id, extra=result)
        return jsonify(result), 200
    except HardDeleteExaminationNotFound:
        return jsonify({'detail': 'Không tìm thấy lượt khám'}), 404
    except Exception as e:
        db.rollback()
        logging.error(f"Lỗi khi xóa examination {examination_id}: {str(e)}")
        return jsonify({'detail': f'Có lỗi xảy ra khi xóa lượt khám: {str(e)}'}), 500
    finally:
        db.close()
