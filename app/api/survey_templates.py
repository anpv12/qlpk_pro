from flask import Blueprint, request, jsonify
from sqlalchemy.orm import Session
from sqlalchemy import desc, or_
from app.core.database import get_db
from app.models.survey_template import SurveyTemplate
from app.models.user import User
from app.api.auth import require_auth
from app.realtime.events import emit_catalog_changed
import os
import uuid
from datetime import datetime
from werkzeug.utils import secure_filename

survey_templates_router = Blueprint('survey_templates', __name__)

# Cấu hình upload file
UPLOAD_FOLDER = 'uploads/survey_templates'
ALLOWED_EXTENSIONS = {'pdf', 'docx', 'xlsx', 'doc', 'xls'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def ensure_upload_folder():
    if not os.path.exists(UPLOAD_FOLDER):
        os.makedirs(UPLOAD_FOLDER, exist_ok=True)

@survey_templates_router.route('/survey-templates', methods=['GET'])
@require_auth
def get_survey_templates(user):
    """Lấy danh sách mẫu khảo sát với phân trang và tìm kiếm"""
    db: Session = next(get_db())
    try:
        # Lấy parameters
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 10, type=int)
        search = request.args.get('search', '').strip()
        
        # Query cơ bản
        query = db.query(SurveyTemplate).filter(SurveyTemplate.is_active == True)
        
        # Tìm kiếm
        if search:
            query = query.filter(
                or_(
                    SurveyTemplate.name.ilike(f'%{search}%'),
                    SurveyTemplate.description.ilike(f'%{search}%')
                )
            )
        
        # Sắp xếp theo thời gian tạo mới nhất
        query = query.order_by(desc(SurveyTemplate.created_at))
        
        # Phân trang
        total = query.count()
        templates = query.offset((page - 1) * per_page).limit(per_page).all()
        
        # Convert to dict
        templates_data = [template.to_dict() for template in templates]
        
        return jsonify({
            'success': True,
            'data': templates_data,
            'pagination': {
                'page': page,
                'per_page': per_page,
                'total': total,
                'pages': (total + per_page - 1) // per_page
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
            'data': template.to_dict()
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
        
        return jsonify({
            'success': True,
            'data': template.to_dict()
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
def create_survey_template(user):
    """Tạo mẫu khảo sát mới"""
    db: Session = next(get_db())
    try:
        data = request.get_json()
        
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
        
        # Tạo mẫu khảo sát mới
        template = SurveyTemplate(
            name=data['name'],
            description=data.get('description', ''),
            content=data.get('content'),
            created_by=user.id  # Từ user object
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
        
        data = request.get_json()
        
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
        
        # Cập nhật thông tin
        template.name = data['name']
        template.description = data.get('description', template.description)
        template.content = data.get('content', template.content)
        template.updated_at = datetime.utcnow()
        
        db.commit()
        db.refresh(template)
        emit_catalog_changed('survey_template_updated', entity='survey_template', entity_id=template.id)
        
        return jsonify({
            'success': True,
            'message': 'Cập nhật mẫu khảo sát thành công',
            'data': template.to_dict()
        }), 200
        
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
        name = request.form.get('name', '').strip()
        description = request.form.get('description', '').strip()
        
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
            created_by=user.id
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
            template.file_path,
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
