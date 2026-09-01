"""Result file services for clinical indications."""

from datetime import datetime
import os
import unicodedata
import uuid
from pathlib import Path

from werkzeug.utils import secure_filename

from app.models.chi_dinh import ChiDinh

ALLOWED_EXTENSIONS = {'pdf', 'png', 'jpg', 'jpeg', 'doc', 'docx'}
UPLOAD_FOLDER = 'uploads/chi_dinh_results'
MAX_FILE_SIZE = 25 * 1024 * 1024

class ChiDinhNotFound(Exception):
    """Raised when a clinical indication does not exist."""

class NoFileSelected(Exception):
    """Raised when upload request has no selected file."""

class UnsupportedFileType(Exception):
    """Raised when upload file type is not allowed."""


class FileTooLarge(Exception):
    """Raised when an uploaded result file exceeds the workflow limit."""

class NoResultFiles(Exception):
    """Raised when a clinical indication has no result files."""

class ResultFileNotFound(Exception):
    """Raised when a requested result file is not registered."""

class ResultFileMissingOnDisk(Exception):
    """Raised when result file metadata exists but the file is missing."""

def upload_result_file_for_chi_dinh(db, chi_dinh_id, file, user, root_path):
    chi_dinh = _get_chi_dinh_or_raise(db, chi_dinh_id)

    if not file or not file.filename:
        raise NoFileSelected()

    declared_size = getattr(file, 'content_length', None)
    if declared_size and declared_size > MAX_FILE_SIZE:
        raise FileTooLarge()

    if not allowed_file(file.filename):
        raise UnsupportedFileType()

    original_filename = normalize_filename(file.filename)
    storage_filename = secure_filename(original_filename)
    if not storage_filename or not allowed_file(storage_filename):
        raise UnsupportedFileType()
    file_extension = storage_filename.rsplit('.', 1)[1].lower()
    unique_filename = f"{uuid.uuid4()}_{storage_filename}"

    upload_path = os.path.join(root_path, UPLOAD_FOLDER)
    os.makedirs(upload_path, exist_ok=True)

    file_path = os.path.join(upload_path, unique_filename)
    file.save(file_path)

    file_size = os.path.getsize(file_path)
    if file_size > MAX_FILE_SIZE:
        try:
            os.remove(file_path)
        finally:
            raise FileTooLarge()

    file_info = {
        'id': str(uuid.uuid4()),
        'filename': unique_filename,
        'original_filename': original_filename,
        'file_size': file_size,
        'file_type': file_extension,
        'upload_date': datetime.now().isoformat(),
        'uploaded_by': user.full_name if hasattr(user, 'full_name') else user.name if hasattr(user, 'name') else 'Unknown'
    }

    existing_files = chi_dinh.result_files if isinstance(chi_dinh.result_files, list) else []
    chi_dinh.result_files = existing_files + [file_info]
    return file_info, chi_dinh

def delete_result_file_for_chi_dinh(db, chi_dinh_id, file_id, root_path, logger=None):
    chi_dinh = _get_chi_dinh_or_raise(db, chi_dinh_id)
    file_to_delete = _find_result_file_or_raise(chi_dinh, file_id)

    file_path = _safe_result_path(root_path, file_to_delete.get('filename'))
    if os.path.exists(file_path):
        try:
            os.remove(file_path)
        except Exception as exc:
            if logger:
                logger.warning(f"Could not delete file {file_path}: {exc}")

    chi_dinh.result_files = [f for f in chi_dinh.result_files if f.get('id') != file_id]
    return chi_dinh

def delete_result_files_for_chi_dinh_list(chi_dinh_list, root_path, logger=None):
    for chi_dinh in chi_dinh_list:
        if chi_dinh.result_files and isinstance(chi_dinh.result_files, list):
            for file_info in chi_dinh.result_files:
                try:
                    file_path = _safe_result_path(root_path, file_info.get('filename'))
                except ResultFileMissingOnDisk:
                    continue
                if os.path.exists(file_path):
                    try:
                        os.remove(file_path)
                    except Exception as exc:
                        if logger:
                            logger.warning(f"Could not delete file {file_path}: {exc}")

def get_result_file_download(db, chi_dinh_id, file_id, root_path):
    chi_dinh = _get_chi_dinh_or_raise(db, chi_dinh_id)
    file_info = _find_result_file_or_raise(chi_dinh, file_id, no_files_error=NoResultFiles)

    file_path = _safe_result_path(root_path, file_info.get('filename'))
    if not os.path.exists(file_path):
        raise ResultFileMissingOnDisk()

    return file_path, file_info['original_filename']

def allowed_file(filename):
    return (
        isinstance(filename, str)
        and '.' in filename
        and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS
    )

def normalize_filename(filename):
    normalized = unicodedata.normalize('NFC', str(filename or ''))
    normalized = normalized.replace('\\', '/')
    normalized = normalized.rsplit('/', 1)[-1]
    return normalized.replace('\x00', '').strip()


def _safe_result_path(root_path, filename):
    if not filename:
        raise ResultFileMissingOnDisk()
    upload_root = Path(root_path, UPLOAD_FOLDER).resolve()
    candidate = (upload_root / str(filename)).resolve()
    if candidate.parent != upload_root:
        raise ResultFileMissingOnDisk()
    return str(candidate)

def _get_chi_dinh_or_raise(db, chi_dinh_id):
    chi_dinh = db.query(ChiDinh).filter(ChiDinh.id == chi_dinh_id).first()
    if not chi_dinh:
        raise ChiDinhNotFound()
    return chi_dinh

def _find_result_file_or_raise(chi_dinh, file_id, no_files_error=NoResultFiles):
    if not chi_dinh.result_files or not isinstance(chi_dinh.result_files, list):
        raise no_files_error()

    for file_info in chi_dinh.result_files:
        if file_info.get('id') == file_id:
            return file_info
    raise ResultFileNotFound()
