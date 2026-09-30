"""survey_templates helpers split out by topic (helpers); re-exported by app.api.survey_templates."""

from flask import request
from app.models.survey_response import SurveyResponse
from app.models.survey_session import SurveySession
from app.models.user import User
from app.utils.survey_scoring import validate_survey_content
import os
from copy import deepcopy


# Cấu hình upload file
UPLOAD_FOLDER = 'uploads/survey_templates'


ALLOWED_EXTENSIONS = {'pdf', 'docx', 'xlsx', 'doc', 'xls'}


PERFORMER_ROLES = ('doctor', 'PSYCHOLOGIST')


def validate_survey_name(value):
    if not isinstance(value, str) or not value.strip():
        raise ValueError('Vui lòng nhập tên mẫu khảo sát.')
    name = value.strip()
    if len(name) > 255:
        raise ValueError('Tên mẫu khảo sát không được quá 255 ký tự.')
    return name


def survey_request_data():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ValueError('Thông tin mẫu khảo sát không hợp lệ.')
    return {**data, 'name': validate_survey_name(data.get('name'))}


def resolve_default_performer_id(db, raw_value):
    """Validate and normalize the optional default performer for a template."""
    if raw_value is None or str(raw_value).strip() == '':
        return None

    try:
        performer_id = int(raw_value)
    except (TypeError, ValueError) as exc:
        raise ValueError('Người thực hiện mặc định không hợp lệ') from exc

    performer = db.query(User).filter(
        User.id == performer_id,
        User.is_active.is_(True),
        User.role.in_(PERFORMER_ROLES),
    ).first()
    if not performer:
        raise ValueError('Người thực hiện mặc định không tồn tại hoặc đã ngừng hoạt động')
    return performer.id


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def ensure_upload_folder():
    if not os.path.exists(UPLOAD_FOLDER):
        os.makedirs(UPLOAD_FOLDER, exist_ok=True)


def _questions_by_criteria(content):
    from app.utils.survey_scoring import survey_questions_by_criteria
    return survey_questions_by_criteria(content)


def template_validation_message(content):
    if content is None:
        return None
    try:
        validate_survey_content(content)
    except ValueError as exc:
        return str(exc)
    return None


def preserve_legacy_template_snapshots(db, template):
    """Freeze missing historical snapshots before editing the catalog source."""
    snapshot = {'name': template.name, 'content': deepcopy(template.content)}
    for model in (SurveySession, SurveyResponse):
        for record in db.query(model).filter(model.survey_template_id == template.id).with_for_update():
            if not record.template_snapshot:
                record.template_snapshot = deepcopy(snapshot)
