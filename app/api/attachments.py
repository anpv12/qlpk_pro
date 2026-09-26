from flask import Blueprint, request, jsonify, send_file
from app.core.config import settings
from app.core.database import get_db
from app.models.patient import Patient
from app.models.attachment import Attachment
from app.api.auth import require_auth
from app.realtime.events import emit_document_changed
from app.utils.upload_storage import upload_dir, upload_path
from app.utils.clinical_access import appointment_access_error, patient_access_error
import os
import uuid
from datetime import datetime
import logging
import unicodedata

logger = logging.getLogger(__name__)

attachments_router = Blueprint('attachments', __name__)

# Cấu hình upload
ALLOWED_EXTENSIONS = {'pdf', 'png', 'jpg', 'jpeg', 'gif', 'doc', 'docx', 'xls', 'xlsx', 'txt'}
ATTACHMENTS_UPLOAD_CATEGORY = 'attachments'

def get_attachment_upload_dir():
    return upload_dir(ATTACHMENTS_UPLOAD_CATEGORY)

def get_attachment_file_path(filename):
    return upload_path(ATTACHMENTS_UPLOAD_CATEGORY, filename)


def get_max_attachment_size_bytes() -> int:
    """Lấy kích thước tối đa file đính kèm (bytes) từ config"""
    try:
        mb = int(getattr(settings, 'ATTACHMENT_MAX_SIZE_MB', 50) or 50)
    except (TypeError, ValueError):
        mb = 50
    return max(1, mb) * 1024 * 1024


def validate_file_size(file):
    """Validate kích thước file. Trả về tuple (is_valid, message)."""
    max_bytes = get_max_attachment_size_bytes()
    max_mb = max_bytes // (1024 * 1024)

    try:
        file.stream.seek(0, os.SEEK_END)
        size = file.stream.tell()
        file.stream.seek(0)
    except Exception:
        logger.warning('Không đọc được kích thước tập tin tải lên, bỏ qua kiểm tra dung lượng', exc_info=True)
        size = 0

    if size > max_bytes:
        return False, f"File {file.filename} quá lớn. Kích thước tối đa {max_mb}MB."
    return True, ''

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def normalize_filename(filename):
    """Normalize filename để giữ dấu tiếng Việt"""
    # Normalize unicode để đảm bảo encoding đúng
    normalized = unicodedata.normalize('NFC', filename)
    return normalized

def get_file_icon(filename):
    """Trả về icon Bootstrap tương ứng với loại file"""
    ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''
    
    icon_map = {
        'pdf': 'bi-file-pdf text-danger',
        'doc': 'bi-file-word text-primary',
        'docx': 'bi-file-word text-primary',
        'xls': 'bi-file-earmark-excel text-success',
        'xlsx': 'bi-file-earmark-excel text-success',
        'txt': 'bi-file-text text-secondary',
        'png': 'bi-file-image text-primary',
        'jpg': 'bi-file-image text-primary',
        'jpeg': 'bi-file-image text-primary',
        'gif': 'bi-file-image text-primary'
    }
    
    return icon_map.get(ext, 'bi-file-earmark text-secondary')


@attachments_router.route('/config', methods=['GET'])
@require_auth
def get_attachment_config(user):
    """Trả về cấu hình upload tài liệu cho frontend"""
    max_bytes = get_max_attachment_size_bytes()
    max_mb = max_bytes // (1024 * 1024)
    return jsonify({
        'attachment_max_size_mb': max_mb,
        'attachment_max_size_bytes': max_bytes
    }), 200


@attachments_router.route('/list', methods=['GET'])
@require_auth
def get_all_attachments(user):
    """Lấy danh sách tất cả tài liệu đính kèm"""
    db = next(get_db())
    try:
        # Lấy danh sách attachments (mới nhất trước)
        attachments = db.query(Attachment).order_by(Attachment.upload_date.desc()).all()
        
        result = []
        for attachment in attachments:
            result.append({
                'id': attachment.id,
                'filename': attachment.filename,
                'original_filename': attachment.original_filename,
                'file_size': attachment.file_size,
                'file_type': attachment.file_type,
                'upload_date': attachment.upload_date.isoformat() if attachment.upload_date else None,
                'description': attachment.description,
                'icon_class': get_file_icon(attachment.filename)
            })
        
        return jsonify(result), 200
        
    except Exception as e:
        logger.error(f"Error getting all attachments: {e}")
        return jsonify({"detail": "Lỗi khi lấy danh sách tài liệu"}), 500
    finally:
        db.close()

@attachments_router.route('/patients/<int:patient_id>/attachments', methods=['GET'])
@require_auth
def get_patient_attachments(user, patient_id):
    """Lấy danh sách tài liệu đính kèm của bệnh nhân"""
    db = next(get_db())
    try:
        # Kiểm tra bệnh nhân tồn tại
        patient = db.query(Patient).filter(Patient.id == patient_id).first()
        if not patient:
            return jsonify({"detail": "Bệnh nhân không tồn tại"}), 404
        access_error = patient_access_error(db, user, patient_id)
        if access_error:
            return jsonify({"detail": access_error}), 403
        
        # Lấy danh sách attachments
        attachments = db.query(Attachment).filter(Attachment.patient_id == patient_id).all()
        
        result = []
        for attachment in attachments:
            result.append({
                'id': attachment.id,
                'filename': attachment.filename,
                'original_filename': attachment.original_filename,
                'file_size': attachment.file_size,
                'file_type': attachment.file_type,
                'upload_date': attachment.upload_date.isoformat() if attachment.upload_date else None,
                'description': attachment.description,
                'icon_class': get_file_icon(attachment.filename)
            })
        
        return jsonify(result), 200
        
    except Exception as e:
        logger.error(f"Error getting patient attachments: {e}")
        return jsonify({"detail": "Lỗi khi lấy danh sách tài liệu"}), 500
    finally:
        db.close()

@attachments_router.route('/upload', methods=['POST'])
@require_auth
def upload_attachment_general(user):
    """Upload tài liệu đính kèm (cần appointment_id để lấy patient_id)"""
    db = next(get_db())
    try:
        # Kiểm tra file trong request
        if 'files' not in request.files:
            return jsonify({"detail": "Không có file được chọn"}), 400
        
        files = request.files.getlist('files')
        if not files or files[0].filename == '':
            return jsonify({"detail": "Không có file được chọn"}), 400
        
        # Lấy appointment_id từ form data
        appointment_id = request.form.get('appointment_id')
        if not appointment_id:
            return jsonify({"detail": "Thiếu appointment_id"}), 400
        
        # Lấy patient_id từ appointment
        from app.models.appointment import Appointment
        appointment = db.query(Appointment).filter(Appointment.id == appointment_id).first()
        if not appointment:
            return jsonify({"detail": "Lịch hẹn không tồn tại"}), 404
        access_error = appointment_access_error(user, appointment)
        if access_error:
            return jsonify({"detail": access_error}), 403
        
        patient_id = appointment.patient_id
        if not patient_id:
            return jsonify({"detail": "Lịch hẹn không có thông tin bệnh nhân"}), 400
        
        uploaded_files = []
        
        for file in files:
            if not allowed_file(file.filename):
                return jsonify({"detail": f"Loại file {file.filename} không được hỗ trợ"}), 400

            is_valid_size, size_message = validate_file_size(file)
            if not is_valid_size:
                return jsonify({"detail": size_message}), 413
            
            # Tạo tên file unique - giữ nguyên tên file gốc
            original_filename = normalize_filename(file.filename)
            unique_filename = f"{uuid.uuid4()}_{original_filename}"
            
            get_attachment_upload_dir()
            
            # Lưu file
            file_path = get_attachment_file_path(unique_filename)
            file.save(str(file_path))
            
            # Lưu thông tin vào database
            attachment = Attachment(
                patient_id=patient_id,
                filename=unique_filename,
                original_filename=file.filename,
                file_size=os.path.getsize(str(file_path)),
                file_type=file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else '',
                upload_date=datetime.now(),
                description=''
            )
            
            db.add(attachment)
            db.flush()  # Để lấy ID
            
            uploaded_files.append({
                'id': attachment.id,
                'filename': attachment.filename,
                'original_filename': attachment.original_filename,
                'file_size': attachment.file_size,
                'file_type': attachment.file_type,
                'upload_date': attachment.upload_date.isoformat(),
                'description': attachment.description,
                'icon_class': get_file_icon(attachment.filename)
            })
        
        db.commit()
        emit_document_changed('attachments_uploaded', entity='attachment', extra={
            'patient_id': patient_id,
            'appointment_id': int(appointment_id),
            'attachment_ids': [item['id'] for item in uploaded_files],
        }, rooms=[
            'workflow:operations',
            'page:receptionist-new',
            'page:doctor-examination',
            'page:psychologist-examination',
            'role:staff',
            'role:doctor',
            'role:psychologist',
        ])
        
        return jsonify({
            'message': f'Đã upload {len(uploaded_files)} file thành công',
            'files': uploaded_files
        }), 200
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error uploading attachment: {e}")
        return jsonify({"detail": "Lỗi khi upload file"}), 500
    finally:
        db.close()

@attachments_router.route('/patients/<int:patient_id>/attachments', methods=['POST'])
@require_auth
def upload_attachment(user, patient_id):
    """Upload tài liệu đính kèm cho bệnh nhân"""
    db = next(get_db())
    try:
        # Kiểm tra bệnh nhân tồn tại
        patient = db.query(Patient).filter(Patient.id == patient_id).first()
        if not patient:
            return jsonify({"detail": "Bệnh nhân không tồn tại"}), 404
        access_error = patient_access_error(db, user, patient_id)
        if access_error:
            return jsonify({"detail": access_error}), 403
        
        # Kiểm tra file trong request
        if 'file' not in request.files:
            return jsonify({"detail": "Không có file được chọn"}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({"detail": "Không có file được chọn"}), 400
        
        if not allowed_file(file.filename):
            return jsonify({"detail": "Loại file không được hỗ trợ"}), 400

        is_valid_size, size_message = validate_file_size(file)
        if not is_valid_size:
            return jsonify({"detail": size_message}), 413
        
        # Tạo tên file an toàn - giữ nguyên tên file gốc
        original_filename = normalize_filename(file.filename)
        file_extension = original_filename.rsplit('.', 1)[1].lower() if '.' in original_filename else ''
        unique_filename = f"{uuid.uuid4()}_{original_filename}"
        
        get_attachment_upload_dir()
        
        # Lưu file
        file_path = get_attachment_file_path(unique_filename)
        file.save(str(file_path))
        
        # Lưu thông tin vào database
        attachment = Attachment(
            patient_id=patient_id,
            filename=unique_filename,
            original_filename=original_filename,
            file_size=os.path.getsize(str(file_path)),
            file_type=file_extension,
            upload_date=datetime.now(),
            description=request.form.get('description', '')
        )
        
        db.add(attachment)
        db.commit()
        db.refresh(attachment)
        emit_document_changed('attachment_uploaded', entity='attachment', entity_id=attachment.id, extra={
            'patient_id': patient_id,
            'attachment_id': attachment.id,
        }, rooms=[
            'workflow:operations',
            'page:receptionist-new',
            'page:doctor-examination',
            'page:psychologist-examination',
            'role:staff',
            'role:doctor',
            'role:psychologist',
        ])
        
        return jsonify({
            'id': attachment.id,
            'filename': attachment.filename,
            'original_filename': attachment.original_filename,
            'file_size': attachment.file_size,
            'file_type': attachment.file_type,
            'upload_date': attachment.upload_date.isoformat(),
            'description': attachment.description,
            'icon_class': get_file_icon(attachment.filename)
        }), 201
        
    except Exception as e:
        logger.error(f"Error uploading attachment: {e}")
        return jsonify({"detail": "Lỗi khi upload file"}), 500
    finally:
        db.close()

@attachments_router.route('/<int:attachment_id>', methods=['DELETE'])
@require_auth
def delete_attachment(user, attachment_id):
    """Xóa tài liệu đính kèm"""
    db = next(get_db())
    try:
        # Tìm attachment
        attachment = db.query(Attachment).filter(Attachment.id == attachment_id).first()
        if not attachment:
            return jsonify({"detail": "Tài liệu không tồn tại"}), 404
        access_error = patient_access_error(db, user, attachment.patient_id)
        if access_error:
            return jsonify({"detail": access_error}), 403
        
        # Xóa file vật lý
        file_path = get_attachment_file_path(attachment.filename)
        if file_path.exists():
            file_path.unlink()
        
        # Xóa record trong database
        patient_id = attachment.patient_id
        db.delete(attachment)
        db.commit()
        emit_document_changed('attachment_deleted', entity='attachment', entity_id=attachment_id, extra={
            'patient_id': patient_id,
            'attachment_id': attachment_id,
        }, rooms=[
            'workflow:operations',
            'page:receptionist-new',
            'page:doctor-examination',
            'page:psychologist-examination',
            'role:staff',
            'role:doctor',
            'role:psychologist',
        ])
        
        return jsonify({"detail": "Đã xóa tài liệu thành công"}), 200
        
    except Exception as e:
        logger.error(f"Error deleting attachment: {e}")
        return jsonify({"detail": "Lỗi khi xóa tài liệu"}), 500
    finally:
        db.close()

@attachments_router.route('/<int:attachment_id>/download', methods=['GET'])
@require_auth
def download_attachment(user, attachment_id):
    """Download tài liệu đính kèm"""
    db = next(get_db())
    try:
        attachment = db.query(Attachment).filter(Attachment.id == attachment_id).first()
        if not attachment:
            return jsonify({"detail": "Tài liệu không tồn tại"}), 404
        access_error = patient_access_error(db, user, attachment.patient_id)
        if access_error:
            return jsonify({"detail": access_error}), 403

        file_path = get_attachment_file_path(attachment.filename)
        if not file_path.exists():
            return jsonify({"detail": "File không tồn tại"}), 404

        return send_file(
            str(file_path),
            as_attachment=True,
            download_name=attachment.original_filename
        )

    except Exception as e:
        logger.error(f"Error downloading attachment: {e}")
        return jsonify({"detail": "Lỗi khi download file"}), 500
    finally:
        db.close()


@attachments_router.route('/<int:attachment_id>/preview', methods=['GET'])
@require_auth
def preview_attachment(user, attachment_id):
    """Preview tài liệu: trả file trực tiếp nếu hỗ trợ, hoặc convert DOC/DOCX sang PDF."""
    db = next(get_db())
    try:
        attachment = db.query(Attachment).filter(Attachment.id == attachment_id).first()
        if not attachment:
            return jsonify({"detail": "Tài liệu không tồn tại"}), 404
        access_error = patient_access_error(db, user, attachment.patient_id)
        if access_error:
            return jsonify({"detail": access_error}), 403

        file_path = get_attachment_file_path(attachment.filename)
        if not file_path.exists():
            return jsonify({"detail": "File không tồn tại"}), 404

        file_ext = (attachment.file_type or '').lower()

        # Preview trực tiếp
        if file_ext in {'pdf', 'png', 'jpg', 'jpeg', 'gif', 'txt'}:
            return send_file(str(file_path), as_attachment=False, download_name=attachment.original_filename)

        # DOC/DOCX không preview - yêu cầu tải xuống
        if file_ext in {'doc', 'docx'}:
            return jsonify({"detail": "Định dạng này chưa hỗ trợ preview. Vui lòng tải xuống."}), 422

        return jsonify({"detail": "Định dạng này chưa hỗ trợ preview. Vui lòng tải xuống."}), 422

    except Exception as e:
        logger.error(f"Error previewing attachment: {e}")
        return jsonify({"detail": "Lỗi khi preview file"}), 500
    finally:
        db.close() 
