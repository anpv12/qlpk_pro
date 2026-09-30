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
from app.services.notification_service import NotificationService
from app.realtime.events import emit_order_changed
from app.modules.orders.services.survey_lifecycle import expire_due_order_surveys, finish_order_survey, SurveyLifecycleError
from app.utils.api_error_contract import api_error_boundary

router = Blueprint('chi_dinh', __name__)
logger = logging.getLogger(__name__)
notification_service = NotificationService()


@router.before_app_request
def reconcile_survey_deadlines():
    # One deadline owner for list/detail, clinician forms and public submission.
    if not request.path.startswith(('/api/chi-dinh', '/api/survey-sessions', '/api/survey-responses')):
        return
    db = next(get_db())
    try:
        changed = expire_due_order_surveys(db)
        db.commit()
        for order in changed:
            emit_order_changed('survey_expired', order=order)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


@router.route('/<int:chi_dinh_id>/finish-survey', methods=['POST'])
@require_auth
def finish_survey(user, chi_dinh_id):
    db = next(get_db())
    try:
        role = user.role.value if hasattr(user.role, 'value') else str(user.role)
        if role.lower() not in ('admin', 'doctor', 'psychologist'):
            return jsonify(detail='Bạn không có quyền kết thúc khảo sát'), 403
        _, access_error = _get_accessible_chi_dinh(db, user, chi_dinh_id)
        if access_error:
            return jsonify(detail=access_error), 403
        order, changed = finish_order_survey(db, chi_dinh_id, actor_id=user.id)
        db.commit()
        if changed:
            emit_order_changed('survey_finished', order=order)
        return jsonify(success=True, data=order.to_dict())
    except (ChiDinhNotFound, SurveyLifecycleError) as exc:
        db.rollback()
        return jsonify(detail=str(exc)), getattr(exc, 'status', 404)
    finally:
        db.close()


def _emit_order_assignment_notifications(
    db,
    appointment,
    assignments,
    actor_user,
):
    """Persist assignment notifications after the order mutation is committed."""
    if not assignments:
        return
    try:
        notifications = notification_service.create_clinical_order_assignment_notifications(
            db,
            appointment,
            assignments,
            actor_user=actor_user,
        )
        payloads = notification_service.build_realtime_payloads(db, notifications)
        db.commit()
        notification_service.emit_realtime_payloads(payloads)
    except Exception:
        # A notification failure must not undo a successful clinical order save.
        db.rollback()
        logger.exception('Không thể tạo thông báo giao chỉ định')


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
    if access_error and chi_dinh.in_house_unit_id != user.id:
        return None, access_error
    return chi_dinh, None

@router.route('/appointment/<int:appointment_id>', methods=['GET'])
@require_auth
@api_error_boundary(detail='Lỗi server: {error}')
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
    finally:
        db.close()


@router.route('/appointment/<int:appointment_id>', methods=['POST'])
@require_auth
@api_error_boundary(detail='Lỗi server: {error}')
def save_chi_dinh_by_appointment(user, appointment_id):
    """Lưu danh sách chỉ định của appointment (UPSERT - giữ nguyên created_at cho record cũ)"""
    db = next(get_db())
    try:
        appointment, access_error = _get_accessible_appointment(db, user, appointment_id)
        if access_error:
            return jsonify({'detail': access_error}), 403
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            raise InvalidChiDinhPayload('Dữ liệu chỉ định không hợp lệ')
        if 'chi_dinh' not in data:
            raise InvalidChiDinhPayload('Thiếu danh sách chỉ định')
        chi_dinh_list = data['chi_dinh']

        existing_orders = get_chi_dinh_for_appointment(db, appointment_id)
        existing_performers = {
            item.id: item.in_house_unit_id
            for item in existing_orders
            if item.id is not None
        }
        result_list = sync_chi_dinh_for_appointment(db, appointment_id, chi_dinh_list)
        assignments = []
        for item in result_list:
            if item.id is None or item.id not in existing_performers:
                assignments.append({'order': item, 'kind': 'created'})
            elif existing_performers[item.id] != item.in_house_unit_id:
                assignments.append({
                    'order': item,
                    'kind': 'assigned' if not existing_performers[item.id] else 'reassigned',
                })

        db.commit()

        for item in result_list:
            db.refresh(item)

        emit_order_changed('saved_for_appointment', appointment_id=appointment_id, extra={
            'order_count': len(result_list),
        })
        _emit_order_assignment_notifications(db, appointment, assignments, user)

        return jsonify({
            'message': 'Lưu chỉ định thành công',
            'chi_dinh': [item.to_dict() for item in result_list]
        }), 200
    except AppointmentNotFound:
        return jsonify({'detail': 'Không tìm thấy lịch hẹn'}), 404
    except InvalidChiDinhPayload as e:
        db.rollback()
        return jsonify({'detail': str(e)}), 400
    finally:
        db.close()


@router.route('/patient/<int:patient_id>', methods=['GET'])
@require_auth
@api_error_boundary(detail='Không thể tải lịch sử chỉ định')
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
    finally:
        db.close()


@router.route('', methods=['GET'])
@require_auth
@api_error_boundary(detail='Lỗi server: {error}')
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
            'total_pages': chi_dinh_result.total_pages,
            'group_counts': chi_dinh_result.group_counts,
            'next_expiry_at': chi_dinh_result.next_expiry_at,
        }), 200

    except InvalidPagination as e:
        return jsonify({'detail': str(e)}), 400
    finally:
        db.close()


@router.route('/<int:chi_dinh_id>', methods=['GET'])
@require_auth
@api_error_boundary(detail='Lỗi server: {error}')
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
    finally:
        db.close()


@router.route('/<int:chi_dinh_id>', methods=['PUT'])
@require_auth
@api_error_boundary(detail='Lỗi server: {error}')
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
    finally:
        db.close()


@router.route('/<int:chi_dinh_id>', methods=['DELETE'])
@require_auth
@api_error_boundary(detail='Lỗi server: {error}')
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
    finally:
        db.close()


@router.route('/<int:chi_dinh_id>/upload-result', methods=['POST'])
@require_auth
@api_error_boundary(detail='Lỗi server: {error}')
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
    finally:
        db.close()


@router.route('/<int:chi_dinh_id>/result-files/<file_id>', methods=['DELETE'])
@require_auth
@api_error_boundary(detail='Lỗi server: {error}')
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
    finally:
        db.close()


@router.route('/batch-delete', methods=['POST'])
@require_auth
@api_error_boundary(detail='Lỗi server: {error}')
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
    finally:
        db.close()


@router.route('/<int:chi_dinh_id>/result-files/<file_id>/download', methods=['GET'])
@require_auth
@api_error_boundary(detail='Lỗi server: {error}')
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
    finally:
        db.close()


@router.route('/<int:chi_dinh_id>/survey-result', methods=['GET'])
@require_auth
def get_order_survey_result(user, chi_dinh_id):
    from app.models.survey_response import SurveyResponse
    from app.models.survey_session import SurveySession
    from app.modules.orders.services.survey_draft import session_snapshot
    db = next(get_db())
    try:
        order, error = _get_accessible_chi_dinh(db, user, chi_dinh_id)
        if error:
            return jsonify(success=False, message=error), 403
        result = db.query(SurveyResponse).filter_by(order_id=order.id).order_by(
            SurveyResponse.created_at.desc(), SurveyResponse.id.desc()).first()
        if not result:
            if not order.survey_template_id:
                return jsonify(success=False, message='Chỉ định không có mẫu khảo sát'), 404
            session = db.query(SurveySession).filter_by(order_id=order.id).order_by(SurveySession.id.desc()).first()
            snapshot = session_snapshot(db, session) if session else {
                'name': order.survey_template.name, 'content': order.survey_template.content}
            patient = order.appointment.patient
            return jsonify(success=True, data={
                'order_id': order.id, 'order_status': order.status,
                'survey_template_id': order.survey_template_id,
                'patient': {'full_name': patient.full_name, 'phone': patient.phone},
                'template_name': snapshot['name'], 'template_content': snapshot['content'],
                'responses': session.draft_responses or {} if session else {},
                'total_scores': None, 'review_state': 'draft' if session and session.draft_responses else 'empty',
                'review_updated_at': session.draft_updated_at.isoformat() if session and session.draft_updated_at else None,
                'can_live': order.status != 'completed',
            })
        snapshot = result.template_snapshot or {}
        return jsonify(success=True, data={
            **result.to_dict(), 'order_status': order.status,
            'review_state': 'submitted', 'can_live': order.status != 'completed',
            'review_updated_at': result.created_at.isoformat() if result.created_at else None,
            'patient': {'full_name': result.patient.full_name, 'phone': result.patient.phone},
            'template_name': snapshot.get('name', result.survey_template.name),
            'template_content': snapshot.get('content', result.survey_template.content),
        })
    except ChiDinhNotFound:
        return jsonify(success=False, message='Không tìm thấy chỉ định'), 404
    finally:
        db.close()
