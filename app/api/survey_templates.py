from flask import Blueprint, request, jsonify
from sqlalchemy.orm import Session
from sqlalchemy import desc, or_
from app.core.database import get_db
from app.models.survey_template import SurveyTemplate
from app.models.survey_response import SurveyResponse
from app.models.survey_session import SurveySession
from app.models.user import User
from app.api.auth import require_auth
from app.realtime.events import emit_catalog_changed
from app.utils.search_normalization import normalized_contains
from app.utils.survey_scoring import normalize_survey_content, validate_survey_content, validate_survey_identity_update, SurveyIdentityConflict
from app.utils.survey_template_policy import can_manage_survey_templates, require_survey_manager, survey_template_readiness
import os
import uuid
from datetime import datetime
from werkzeug.utils import secure_filename
import json
from copy import deepcopy

survey_templates_router = Blueprint('survey_templates', __name__)

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


@survey_templates_router.route('/survey-templates/access', methods=['GET'])
@require_auth
def survey_template_access(user):
    db = next(get_db())
    try:
        return jsonify(success=True, can_manage=can_manage_survey_templates(db, user))
    finally:
        db.close()

@survey_templates_router.route('/survey-templates', methods=['GET'])
@require_auth
def get_survey_templates(user):
    """Lấy danh sách mẫu khảo sát với phân trang và tìm kiếm"""
    db: Session = next(get_db())
    try:
        # Lấy parameters
        page = max(1, request.args.get('page', 1, type=int))
        per_page = min(100, max(1, request.args.get('per_page', 10, type=int)))
        search = request.args.get('search', '').strip()
        
        # Query cơ bản
        query = db.query(SurveyTemplate).filter(SurveyTemplate.is_active == True)
        
        # Tìm kiếm
        if search:
            query = query.filter(
                or_(
                    normalized_contains(SurveyTemplate.name, search),
                    normalized_contains(SurveyTemplate.description, search),
                )
            )
        
        # Sắp xếp theo thời gian tạo mới nhất
        query = query.order_by(desc(SurveyTemplate.created_at), desc(SurveyTemplate.id))
        
        # Phân trang
        total = query.count()
        pages = max(1, (total + per_page - 1) // per_page)
        page = min(page, pages)
        templates = query.offset((page - 1) * per_page).limit(per_page).all()
        
        # Convert to dict
        templates_data = [{**template.to_dict(), **survey_template_readiness(template)} for template in templates]
        
        return jsonify({
            'success': True,
            'data': templates_data,
            'can_manage': can_manage_survey_templates(db, user),
            'pagination': {
                'page': page,
                'per_page': per_page,
                'total': total,
                'pages': pages
            }
        }), 200
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Lỗi khi lấy danh sách mẫu khảo sát: {str(e)}'
        }), 500
    finally:
        db.close()

@survey_templates_router.route('/survey-templates/<int:template_id>', methods=['GET'])
@require_auth
def get_survey_template(user, template_id):
    """Lấy chi tiết một mẫu khảo sát"""
    db: Session = next(get_db())
    try:
        template = db.query(SurveyTemplate).filter(
            SurveyTemplate.id == template_id,
            SurveyTemplate.is_active == True
        ).first()
        
        if not template:
            return jsonify({
                'success': False,
                'message': 'Không tìm thấy mẫu khảo sát'
            }), 404
        
        return jsonify({
            'success': True,
            'data': {**template.to_dict(), **survey_template_readiness(template),
                     'validation_message': template_validation_message(template.content)}
        }), 200
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Lỗi khi lấy chi tiết mẫu khảo sát: {str(e)}'
        }), 500
    finally:
        db.close()

@survey_templates_router.route('/survey-templates/<int:template_id>/public', methods=['GET'])
def get_survey_template_public(template_id):
    """Lấy chi tiết một mẫu khảo sát (public route for preview)"""
    db: Session = next(get_db())
    try:
        template = db.query(SurveyTemplate).filter(
            SurveyTemplate.id == template_id,
            SurveyTemplate.is_active == True
        ).first()
        
        if not template:
            return jsonify({
                'success': False,
                'message': 'Mẫu khảo sát không tồn tại'
            }), 404

        template_data = template.to_dict()
        template_data['questions_by_criteria'] = _questions_by_criteria(template.content)

        return jsonify({
            'success': True,
            'data': template_data
        }), 200
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Lỗi khi lấy chi tiết mẫu khảo sát: {str(e)}'
        }), 500
    finally:
        db.close()

@survey_templates_router.route('/survey-templates', methods=['POST'])
@require_auth
@require_survey_manager
def create_survey_template(user):
    """Tạo mẫu khảo sát mới"""
    db: Session = next(get_db())
    try:
        data = survey_request_data()
        
        # Validate required fields
        if not data.get('name'):
            return jsonify({
                'success': False,
                'message': 'Tên mẫu khảo sát là bắt buộc'
            }), 400
        
        # Kiểm tra tên đã tồn tại chưa
        existing = db.query(SurveyTemplate).filter(
            SurveyTemplate.name == data['name'],
            SurveyTemplate.is_active == True
        ).first()
        
        if existing:
            return jsonify({
                'success': False,
                'message': 'Tên mẫu khảo sát đã tồn tại'
            }), 400

        default_performer_id = resolve_default_performer_id(
            db, data.get('default_performer_id')
        )
        
        content = normalize_survey_content(data.get('content'))
        validate_survey_content(content)
        # Tạo mẫu khảo sát mới
        template = SurveyTemplate(
            name=data['name'],
            description=data.get('description', ''),
            content=content,
            created_by=user.id,  # Từ user object
            default_performer_id=default_performer_id,
        )
        
        db.add(template)
        db.commit()
        db.refresh(template)
        emit_catalog_changed('survey_template_created', entity='survey_template', entity_id=template.id)
        
        return jsonify({
            'success': True,
            'message': 'Tạo mẫu khảo sát thành công',
            'data': template.to_dict()
        }), 201
        
    except ValueError as e:
        db.rollback()
        return jsonify({
            'success': False,
            'message': str(e)
        }), 400
    except Exception as e:
        db.rollback()
        return jsonify({
            'success': False,
            'message': f'Lỗi khi tạo mẫu khảo sát: {str(e)}'
        }), 500
    finally:
        db.close()

@survey_templates_router.route('/survey-templates/<int:template_id>', methods=['PUT'])
@require_auth
@require_survey_manager
def update_survey_template(user, template_id):
    """Cập nhật mẫu khảo sát"""
    db: Session = next(get_db())
    try:
        template = db.query(SurveyTemplate).filter(
            SurveyTemplate.id == template_id,
            SurveyTemplate.is_active == True
        ).first()
        
        if not template:
            return jsonify({
                'success': False,
                'message': 'Không tìm thấy mẫu khảo sát'
            }), 404
        
        data = survey_request_data()
        
        # Validate required fields
        if not data.get('name'):
            return jsonify({
                'success': False,
                'message': 'Tên mẫu khảo sát là bắt buộc'
            }), 400
        
        # Kiểm tra tên đã tồn tại chưa (trừ chính nó)
        existing = db.query(SurveyTemplate).filter(
            SurveyTemplate.name == data['name'],
            SurveyTemplate.id != template_id,
            SurveyTemplate.is_active == True
        ).first()
        
        if existing:
            return jsonify({
                'success': False,
                'message': 'Tên mẫu khảo sát đã tồn tại'
            }), 400

        preserve_legacy_template_snapshots(db, template)
        if 'default_performer_id' in data:
            template.default_performer_id = resolve_default_performer_id(
                db, data.get('default_performer_id')
            )
        
        # Cập nhật thông tin
        template.name = data['name']
        template.description = data.get('description', template.description)
        if 'content' in data:
            content = normalize_survey_content(data['content'])
            validate_survey_content(content)
            if db.query(SurveyResponse.id).filter(SurveyResponse.survey_template_id == template.id).first():
                validate_survey_identity_update(template.content, content)
            template.content = content
        template.updated_at = datetime.utcnow()
        
        db.commit()
        db.refresh(template)
        emit_catalog_changed('survey_template_updated', entity='survey_template', entity_id=template.id)
        
        return jsonify({
            'success': True,
            'message': 'Cập nhật mẫu khảo sát thành công',
            'data': template.to_dict()
        }), 200
        
    except SurveyIdentityConflict:
        db.rollback()
        return jsonify({'success': False, 'code': 'SURVEY_TEMPLATE_IDENTITY_CONFLICT',
                        'message': 'Mẫu đã có kết quả cần giữ mã câu hỏi và đáp án. Vui lòng tạo mẫu mới.'}), 400
    except ValueError as e:
        db.rollback()
        return jsonify({
            'success': False,
            'message': str(e)
        }), 400
    except Exception as e:
        db.rollback()
        return jsonify({
            'success': False,
            'message': f'Lỗi khi cập nhật mẫu khảo sát: {str(e)}'
        }), 500
    finally:
        db.close()

@survey_templates_router.route('/survey-templates/<int:template_id>', methods=['DELETE'])
@require_auth
@require_survey_manager
def delete_survey_template(user, template_id):
    """Xóa mẫu khảo sát (soft delete)"""
    db: Session = next(get_db())
    try:
        template = db.query(SurveyTemplate).filter(
            SurveyTemplate.id == template_id,
            SurveyTemplate.is_active == True
        ).first()
        
        if not template:
            return jsonify({
                'success': False,
                'message': 'Không tìm thấy mẫu khảo sát'
            }), 404
        
        # Soft delete
        template.is_active = False
        template.updated_at = datetime.utcnow()

        db.commit()
        emit_catalog_changed('survey_template_deleted', entity='survey_template', entity_id=template_id)
        
        return jsonify({
            'success': True,
            'message': 'Xóa mẫu khảo sát thành công'
        }), 200
        
    except Exception as e:
        db.rollback()
        return jsonify({
            'success': False,
            'message': f'Lỗi khi xóa mẫu khảo sát: {str(e)}'
        }), 500
    finally:
        db.close()

@survey_templates_router.route('/survey-templates/upload', methods=['POST'])
@require_auth
@require_survey_manager
def upload_survey_template(user):
    """Upload file mẫu khảo sát"""
    db: Session = next(get_db())
    try:
        ensure_upload_folder()
        
        # Kiểm tra file
        if 'file' not in request.files:
            return jsonify({
                'success': False,
                'message': 'Không có file được chọn'
            }), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({
                'success': False,
                'message': 'Không có file được chọn'
            }), 400
        
        if not allowed_file(file.filename):
            return jsonify({
                'success': False,
                'message': 'Loại file không được hỗ trợ'
            }), 400
        
        # Lấy thông tin từ form
        name = validate_survey_name(request.form.get('name'))
        description = request.form.get('description', '').strip()
        default_performer_id = resolve_default_performer_id(
            db, request.form.get('default_performer_id')
        )
        
        if not name:
            return jsonify({
                'success': False,
                'message': 'Tên mẫu khảo sát là bắt buộc'
            }), 400
        
        # Kiểm tra tên đã tồn tại chưa
        existing = db.query(SurveyTemplate).filter(
            SurveyTemplate.name == name,
            SurveyTemplate.is_active == True
        ).first()
        
        if existing:
            return jsonify({
                'success': False,
                'message': 'Tên mẫu khảo sát đã tồn tại'
            }), 400
        
        # Lưu file
        filename = secure_filename(file.filename)
        unique_filename = f"{uuid.uuid4()}_{filename}"
        file_path = os.path.join(UPLOAD_FOLDER, unique_filename)
        file.save(file_path)
        
        # Tạo record trong database
        template = SurveyTemplate(
            name=name,
            description=description,
            file_path=file_path,
            file_name=filename,
            file_size=os.path.getsize(file_path),
            file_type=filename.rsplit('.', 1)[1].lower(),
            created_by=user.id,
            default_performer_id=default_performer_id,
        )
        
        db.add(template)
        db.commit()
        db.refresh(template)
        emit_catalog_changed('survey_template_uploaded', entity='survey_template', entity_id=template.id)
        
        return jsonify({
            'success': True,
            'message': 'Upload mẫu khảo sát thành công',
            'data': template.to_dict()
        }), 201
        
    except ValueError as e:
        db.rollback()
        return jsonify({
            'success': False,
            'message': str(e)
        }), 400
    except Exception as e:
        db.rollback()
        return jsonify({
            'success': False,
            'message': f'Lỗi khi upload mẫu khảo sát: {str(e)}'
        }), 500
    finally:
        db.close()

@survey_templates_router.route('/survey-templates/download/<int:template_id>', methods=['GET'])
@require_auth
def download_survey_template(user, template_id):
    """Download file mẫu khảo sát"""
    db: Session = next(get_db())
    try:
        template = db.query(SurveyTemplate).filter(
            SurveyTemplate.id == template_id,
            SurveyTemplate.is_active == True
        ).first()
        
        if not template:
            return jsonify({
                'success': False,
                'message': 'Không tìm thấy mẫu khảo sát'
            }), 404
        
        if not template.file_path or not os.path.exists(template.file_path):
            return jsonify({
                'success': False,
                'message': 'File không tồn tại'
            }), 404
        
        # Trả về file để download
        from flask import send_file
        return send_file(
            os.path.abspath(template.file_path),
            as_attachment=True,
            download_name=template.file_name
        )
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Lỗi khi download mẫu khảo sát: {str(e)}'
        }), 500
    finally:
        db.close()
