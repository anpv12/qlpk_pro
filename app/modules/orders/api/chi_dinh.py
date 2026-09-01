"""Clinical indication routes for appointment orders."""

import logging

from flask import Blueprint, current_app, jsonify, request, send_file

from app.core.database import get_db
from app.api.auth import require_auth
from app.models.appointment import Appointment
from app.modules.orders.services.clinical_order_mutation import (
    AppointmentNotFound,
    ChiDinhNotFound,
    InvalidBatchDelete,
    InvalidChiDinhPayload,
    delete_chi_dinh_batch,
    delete_chi_dinh_by_id,
    get_chi_dinh_batch_for_delete,
    get_chi_dinh_by_id,
    get_chi_dinh_for_appointment,
    sync_chi_dinh_for_appointment,
    update_chi_dinh_fields,
)
from app.modules.orders.services.clinical_order_query import (
    InvalidPagination,
    get_chi_dinh_for_patient,
    get_chi_dinh_list_result,
)
from app.modules.orders.view_models.clinical_order import build_chi_dinh_history_item
from app.utils.clinical_access import appointment_access_error, patient_access_error
from app.modules.orders.services.result_file_service import (
    ChiDinhNotFound as ResultChiDinhNotFound,
    NoFileSelected,
    NoResultFiles,
    ResultFileMissingOnDisk,
    ResultFileNotFound,
    UnsupportedFileType,
    FileTooLarge,
    delete_result_file_for_chi_dinh,
    delete_result_files_for_chi_dinh_list,
    get_result_file_download,
    upload_result_file_for_chi_dinh,
)
from app.modules.orders.view_models.clinical_order import (
    build_chi_dinh_detail_response,
    build_chi_dinh_list_item,
)
from app.realtime.events import emit_order_changed

router = Blueprint('chi_dinh', __name__)
logger = logging.getLogger(__name__)


def _get_accessible_appointment(db, user, appointment_id):
    appointment = db.query(Appointment).filter(Appointment.id == appointment_id).first()
    if not appointment:
        raise AppointmentNotFound()
    access_error = appointment_access_error(user, appointment)
    if access_error:
        return None, access_error
    return appointment, None


def _get_accessible_chi_dinh(db, user, chi_dinh_id):
    chi_dinh = get_chi_dinh_by_id(db, chi_dinh_id)
    appointment = chi_dinh.appointment
    if not appointment:
        return None, 'Không tìm thấy lịch hẹn của chỉ định này.'
    access_error = appointment_access_error(user, appointment)
    if access_error:
        return None, access_error
    return chi_dinh, None

@router.route('/appointment/<int:appointment_id>', methods=['GET'])
@require_auth
def get_chi_dinh_by_appointment(user, appointment_id):
    """Lấy danh sách chỉ định của appointment"""
    db = next(get_db())
    try:
        _, access_error = _get_accessible_appointment(db, user, appointment_id)
        if access_error:
            return jsonify({'detail': access_error}), 403
        chi_dinh_list = get_chi_dinh_for_appointment(db, appointment_id)
        return jsonify({
            'chi_dinh': [item.to_dict() for item in chi_dinh_list]
        }), 200
    except AppointmentNotFound:
        return jsonify({'detail': 'Không tìm thấy lịch hẹn'}), 404
    except Exception as e:
        logger.error(f"Error getting chi_dinh: {e}")
        return jsonify({'detail': f'Lỗi server: {str(e)}'}), 500
    finally:
        db.close()


@router.route('/appointment/<int:appointment_id>', methods=['POST'])
@require_auth
def save_chi_dinh_by_appointment(user, appointment_id):
    """Lưu danh sách chỉ định của appointment (UPSERT - giữ nguyên created_at cho record cũ)"""
    db = next(get_db())
    try:
        _, access_error = _get_accessible_appointment(db, user, appointment_id)
        if access_error:
            return jsonify({'detail': access_error}), 403
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            raise InvalidChiDinhPayload('Dữ liệu chỉ định không hợp lệ')
        if 'chi_dinh' not in data:
            raise InvalidChiDinhPayload('Thiếu danh sách chỉ định')
        chi_dinh_list = data['chi_dinh']

        result_list = sync_chi_dinh_for_appointment(db, appointment_id, chi_dinh_list)
        db.commit()

        for item in result_list:
            db.refresh(item)

        emit_order_changed('saved_for_appointment', appointment_id=appointment_id, extra={
            'order_count': len(result_list),
        })

        return jsonify({
            'message': 'Lưu chỉ định thành công',
            'chi_dinh': [item.to_dict() for item in result_list]
        }), 200
    except AppointmentNotFound:
        return jsonify({'detail': 'Không tìm thấy lịch hẹn'}), 404
    except InvalidChiDinhPayload as e:
        db.rollback()
        return jsonify({'detail': str(e)}), 400
    except Exception as e:
        db.rollback()
        logger.error(f"Error saving chi_dinh: {e}")
        return jsonify({'detail': f'Lỗi server: {str(e)}'}), 500
    finally:
        db.close()


@router.route('/patient/<int:patient_id>', methods=['GET'])
@require_auth
def get_patient_chi_dinh_history(user, patient_id):
    """Lấy lịch sử chỉ định của bệnh nhân trong phạm vi quyền hiện tại."""
    db = next(get_db())
    try:
        access_error = patient_access_error(db, user, patient_id)
        if access_error:
            return jsonify({'detail': access_error}), 403

        exclude_appointment_id = request.args.get('exclude_appointment_id', type=int)
        history = get_chi_dinh_for_patient(
            db,
            patient_id,
            exclude_appointment_id=exclude_appointment_id,
        )
        return jsonify({
            'patient_id': patient_id,
            'chi_dinh': [build_chi_dinh_history_item(item) for item in history],
        }), 200
    except Exception as e:
        logger.error(f"Error getting patient chi_dinh history: {e}")
        return jsonify({'detail': 'Không thể tải lịch sử chỉ định'}), 500
    finally:
        db.close()


@router.route('', methods=['GET'])
@require_auth
def get_chi_dinh_list(user):
    """Lấy danh sách chỉ định với filter và pagination"""
    
    db = next(get_db())
    try:
        chi_dinh_result = get_chi_dinh_list_result(db, user, request.args, logger=logger)
        result = [build_chi_dinh_list_item(db, chi_dinh) for chi_dinh in chi_dinh_result.items]

        return jsonify({
            'chi_dinh': result,
            'total': chi_dinh_result.total,
            'page': chi_dinh_result.page,
            'per_page': chi_dinh_result.per_page,
            'total_pages': chi_dinh_result.total_pages
        }), 200

    except InvalidPagination as e:
        return jsonify({'detail': str(e)}), 400
    except Exception as e:
        logger.error(f"Error in get_chi_dinh_list: {e}", exc_info=True)
        return jsonify({'detail': f'Lỗi server: {str(e)}'}), 500
    finally:
        db.close()


@router.route('/<int:chi_dinh_id>', methods=['GET'])
@require_auth
def get_chi_dinh_detail(user, chi_dinh_id):
    """Lấy chi tiết chỉ định"""
    db = next(get_db())
    try:
        chi_dinh, access_error = _get_accessible_chi_dinh(db, user, chi_dinh_id)
        if access_error:
            return jsonify({'detail': access_error}), 403
        result = build_chi_dinh_detail_response(db, chi_dinh)
        return jsonify(result), 200
    except ChiDinhNotFound:
        return jsonify({'detail': 'Không tìm thấy chỉ định'}), 404
    except Exception as e:
        logger.error(f"Error getting chi_dinh detail: {e}")
        return jsonify({'detail': f'Lỗi server: {str(e)}'}), 500
    finally:
        db.close()


@router.route('/<int:chi_dinh_id>', methods=['PUT'])
@require_auth
def update_chi_dinh(user, chi_dinh_id):
    """Cập nhật chỉ định"""
    db = next(get_db())
    try:
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            raise InvalidChiDinhPayload('Dữ liệu cập nhật chỉ định không hợp lệ')
        chi_dinh, access_error = _get_accessible_chi_dinh(db, user, chi_dinh_id)
        if access_error:
            return jsonify({'detail': access_error}), 403
        chi_dinh = update_chi_dinh_fields(db, chi_dinh_id, data)
        db.commit()
        db.refresh(chi_dinh)
        emit_order_changed('updated', order=chi_dinh)

        return jsonify({
            'message': 'Cập nhật chỉ định thành công',
            'chi_dinh': chi_dinh.to_dict()
        }), 200
    except ChiDinhNotFound:
        return jsonify({'detail': 'Không tìm thấy chỉ định'}), 404
    except InvalidChiDinhPayload as e:
        db.rollback()
        return jsonify({'detail': str(e)}), 400
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating chi_dinh: {e}")
        return jsonify({'detail': f'Lỗi server: {str(e)}'}), 500
    finally:
        db.close()


@router.route('/<int:chi_dinh_id>', methods=['DELETE'])
@require_auth
def delete_chi_dinh(user, chi_dinh_id):
    """Xóa chỉ định"""
    db = next(get_db())
    try:
        chi_dinh, access_error = _get_accessible_chi_dinh(db, user, chi_dinh_id)
        if access_error:
            return jsonify({'detail': access_error}), 403
        appointment_id = chi_dinh.appointment_id
        delete_chi_dinh_by_id(db, chi_dinh_id)
        db.commit()
        emit_order_changed('deleted', order_id=chi_dinh_id, appointment_id=appointment_id)
        return jsonify({'message': 'Xóa chỉ định thành công'}), 200
    except ChiDinhNotFound:
        return jsonify({'detail': 'Không tìm thấy chỉ định'}), 404
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting chi_dinh: {e}")
        return jsonify({'detail': f'Lỗi server: {str(e)}'}), 500
    finally:
        db.close()


@router.route('/<int:chi_dinh_id>/upload-result', methods=['POST'])
@require_auth
def upload_result_file(user, chi_dinh_id):
    """Upload file kết quả cho chỉ định"""
    db = next(get_db())
    try:
        chi_dinh, access_error = _get_accessible_chi_dinh(db, user, chi_dinh_id)
        if access_error:
            return jsonify({'detail': access_error}), 403
        file = request.files.get('file')
        file_info, chi_dinh = upload_result_file_for_chi_dinh(
            db,
            chi_dinh_id,
            file,
            user,
            current_app.root_path,
        )
        db.commit()
        db.refresh(chi_dinh)
        emit_order_changed('result_uploaded', order=chi_dinh)

        return jsonify({
            'message': 'Upload file thành công',
            'file': file_info,
            'chi_dinh': chi_dinh.to_dict()
        }), 200
    except (ResultChiDinhNotFound, ChiDinhNotFound):
        return jsonify({'detail': 'Không tìm thấy chỉ định'}), 404
    except NoFileSelected:
        return jsonify({"detail": "Không có file được chọn"}), 400
    except UnsupportedFileType:
        return jsonify({"detail": "Loại file không được hỗ trợ"}), 400
    except InvalidChiDinhPayload as e:
        db.rollback()
        return jsonify({'detail': str(e)}), 400
    except FileTooLarge:
        return jsonify({'detail': 'File không được vượt quá 25MB'}), 400
    except Exception as e:
        db.rollback()
        logger.error(f"Error uploading result file: {e}")
        return jsonify({'detail': f'Lỗi server: {str(e)}'}), 500
    finally:
        db.close()


@router.route('/<int:chi_dinh_id>/result-files/<file_id>', methods=['DELETE'])
@require_auth
def delete_result_file(user, chi_dinh_id, file_id):
    """Xóa file kết quả của chỉ định"""
    db = next(get_db())
    try:
        chi_dinh, access_error = _get_accessible_chi_dinh(db, user, chi_dinh_id)
        if access_error:
            return jsonify({'detail': access_error}), 403
        chi_dinh = delete_result_file_for_chi_dinh(
            db,
            chi_dinh_id,
            file_id,
            current_app.root_path,
            logger=logger,
        )
        db.commit()
        emit_order_changed('result_file_deleted', order=chi_dinh)

        return jsonify({
            'message': 'Xóa file thành công',
            'chi_dinh': chi_dinh.to_dict()
        }), 200
    except (ResultChiDinhNotFound, ChiDinhNotFound):
        return jsonify({'detail': 'Không tìm thấy chỉ định'}), 404
    except NoResultFiles:
        return jsonify({'detail': 'Không có file nào để xóa'}), 404
    except ResultFileNotFound:
        return jsonify({'detail': 'Không tìm thấy file'}), 404
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting result file: {e}")
        return jsonify({'detail': f'Lỗi server: {str(e)}'}), 500
    finally:
        db.close()


@router.route('/batch-delete', methods=['POST'])
@require_auth
def batch_delete_chi_dinh(user):
    """Xóa nhiều chỉ định cùng lúc"""
    db = next(get_db())
    try:
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            raise InvalidBatchDelete()
        chi_dinh_ids = data.get('ids', [])

        chi_dinh_list = get_chi_dinh_batch_for_delete(db, chi_dinh_ids)
        for chi_dinh in chi_dinh_list:
            access_error = appointment_access_error(user, chi_dinh.appointment)
            if access_error:
                return jsonify({'detail': access_error}), 403
        appointment_ids = sorted({item.appointment_id for item in chi_dinh_list if item.appointment_id})
        delete_result_files_for_chi_dinh_list(chi_dinh_list, current_app.root_path, logger=logger)
        deleted_count = delete_chi_dinh_batch(db, chi_dinh_list)
        db.commit()
        emit_order_changed('batch_deleted', extra={
            'order_ids': chi_dinh_ids,
            'appointment_ids': appointment_ids,
            'deleted_count': deleted_count,
        })

        return jsonify({
            'message': f'Đã xóa {deleted_count} chỉ định thành công',
            'deleted_count': deleted_count
        }), 200
    except InvalidBatchDelete:
        return jsonify({'detail': 'Danh sách ID không hợp lệ'}), 400
    except ChiDinhNotFound:
        return jsonify({'detail': 'Không tìm thấy chỉ định nào để xóa'}), 404
    except Exception as e:
        db.rollback()
        logger.error(f"Error batch deleting chi_dinh: {e}")
        return jsonify({'detail': f'Lỗi server: {str(e)}'}), 500
    finally:
        db.close()


@router.route('/<int:chi_dinh_id>/result-files/<file_id>/download', methods=['GET'])
@require_auth
def download_result_file(user, chi_dinh_id, file_id):
    """Download file kết quả"""
    db = next(get_db())
    try:
        chi_dinh, access_error = _get_accessible_chi_dinh(db, user, chi_dinh_id)
        if access_error:
            return jsonify({'detail': access_error}), 403
        file_path, original_filename = get_result_file_download(
            db,
            chi_dinh_id,
            file_id,
            current_app.root_path,
        )
        return send_file(
            file_path,
            as_attachment=True,
            download_name=original_filename
        )
    except (ResultChiDinhNotFound, ChiDinhNotFound):
        return jsonify({'detail': 'Không tìm thấy chỉ định'}), 404
    except NoResultFiles:
        return jsonify({'detail': 'Không có file nào'}), 404
    except ResultFileNotFound:
        return jsonify({'detail': 'Không tìm thấy file'}), 404
    except ResultFileMissingOnDisk:
        return jsonify({'detail': 'File không tồn tại'}), 404
    except Exception as e:
        logger.error(f"Error downloading result file: {e}")
        return jsonify({'detail': f'Lỗi server: {str(e)}'}), 500
    finally:
        db.close()
