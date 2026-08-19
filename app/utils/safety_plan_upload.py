"""Validation and storage helpers for signed safety-plan uploads."""

from __future__ import annotations

import os
from pathlib import Path

from werkzeug.utils import secure_filename

from app.core.config import settings
from app.utils.upload_storage import upload_dir, upload_path, upload_url


ALLOWED_EXTENSIONS = {"pdf", "png", "jpg", "jpeg"}
ALLOWED_MIME_TYPES = {
    "pdf": {"application/pdf"},
    "png": {"image/png"},
    "jpg": {"image/jpeg"},
    "jpeg": {"image/jpeg"},
}
MAGIC_BYTES = {
    "pdf": (b"%PDF",),
    "png": (b"\x89PNG\r\n\x1a\n",),
    "jpg": (b"\xff\xd8\xff",),
    "jpeg": (b"\xff\xd8\xff",),
}


class SafetyPlanUploadError(ValueError):
    """Raised when an uploaded safety-plan file is invalid."""


def max_size_bytes() -> int:
    try:
        megabytes = int(getattr(settings, "SAFETY_PLAN_MAX_SIZE_MB", 10) or 10)
    except (TypeError, ValueError):
        megabytes = 10
    return max(1, megabytes) * 1024 * 1024


def validate_safety_plan_file(file_storage) -> tuple[str, int]:
    filename = secure_filename(file_storage.filename or "")
    if not filename or "." not in filename:
        raise SafetyPlanUploadError("Kế hoạch an toàn chỉ hỗ trợ PDF, PNG hoặc JPG.")

    extension = filename.rsplit(".", 1)[1].lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise SafetyPlanUploadError("Kế hoạch an toàn chỉ hỗ trợ PDF, PNG hoặc JPG.")

    mimetype = (file_storage.mimetype or "").lower()
    if mimetype and mimetype not in ALLOWED_MIME_TYPES[extension]:
        raise SafetyPlanUploadError("MIME của file không khớp với phần mở rộng.")

    try:
        file_storage.stream.seek(0, os.SEEK_END)
        size = file_storage.stream.tell()
        file_storage.stream.seek(0)
    except (AttributeError, OSError) as exc:
        raise SafetyPlanUploadError("Không thể xác định kích thước file.") from exc
    if size <= 0:
        raise SafetyPlanUploadError("File kế hoạch an toàn đang rỗng.")
    if size > max_size_bytes():
        max_mb = max_size_bytes() // (1024 * 1024)
        raise SafetyPlanUploadError(f"File vượt quá giới hạn {max_mb}MB.")

    header = file_storage.stream.read(16)
    file_storage.stream.seek(0)
    if not any(header.startswith(signature) for signature in MAGIC_BYTES[extension]):
        raise SafetyPlanUploadError("Nội dung file không khớp với định dạng đã chọn.")
    return extension, size


def save_safety_plan_file(file_storage, patient_id: int) -> tuple[str, Path]:
    extension, _size = validate_safety_plan_file(file_storage)
    upload_dir("safety_plans")
    filename = f"patient_{int(patient_id)}.{extension}"
    target_path = upload_path("safety_plans", filename)
    file_storage.save(str(target_path))
    return upload_url("safety_plans", filename), target_path
