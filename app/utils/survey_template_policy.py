"""Access and readiness for the survey catalog, independent of patient sessions."""
import json
from functools import wraps

from flask import jsonify
from app.core.database import get_db
from app.models.user import User
from app.utils.survey_scoring import validate_survey_content


def can_manage_survey_templates(db, user):
    actor = db.query(User).filter(User.id == user.id, User.is_active.is_(True)).first()
    if not actor:
        return False
    if str(getattr(actor.role, 'value', actor.role)).lower() == 'admin':
        return True
    for membership in actor.groups:
        raw = membership.group.permissions if membership.group else None
        try:
            permissions = json.loads(raw) if isinstance(raw, str) else raw
        except (TypeError, ValueError):
            continue
        if isinstance(permissions, list) and 'ql-mau-khaosat' in permissions:
            return True
    return False


def require_survey_manager(handler):
    """Use after require_auth; permissions are read from current group membership."""
    @wraps(handler)
    def authorized(user, *args, **kwargs):
        db = next(get_db())
        try:
            allowed = can_manage_survey_templates(db, user)
        finally:
            db.close()
        if not allowed:
            return jsonify(success=False, code='SURVEY_MANAGEMENT_FORBIDDEN',
                           message='Bạn không có quyền quản lý mẫu khảo sát.'), 403
        return handler(user, *args, **kwargs)
    return authorized


def survey_template_readiness(template):
    if not template.content and template.file_path:
        return dict(template_kind='document', readiness='document',
                    readiness_label='Tài liệu', can_start_survey=False,
                    readiness_message='Tài liệu tải về, chưa có câu hỏi để làm khảo sát online.')
    try:
        validate_survey_content(template.content)
    except (ValueError, TypeError, KeyError, AttributeError):
        return dict(template_kind='online', readiness='needs_configuration',
                    readiness_label='Cần cấu hình', can_start_survey=False,
                    readiness_message='Cần hoàn thiện câu hỏi hoặc cấu hình điểm trước khi tạo link.')
    content = template.content
    if isinstance(content, str):
        content = json.loads(content)
    config = content.get('result_config', {}) if isinstance(content, dict) else {}
    conditions = config.get('conditions', []) if config.get('scoring_method', 'total') == 'total' else [
        condition for group in config.get('group_configs', {}).values()
        for condition in group.get('conditions', [])]
    configured = any(c.get('conclusion') or c.get('note') for c in conditions)
    return dict(template_kind='online', readiness='ready' if configured else 'scores_only',
                readiness_label='Có cấu hình kết quả' if configured else 'Chỉ tính điểm',
                can_start_survey=True,
                readiness_message='Đã cấu hình câu hỏi, điểm và kết luận.' if configured
                else 'Có thể tính điểm; chưa cấu hình kết luận tự động.')
