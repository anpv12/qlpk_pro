from flask import Blueprint, request, jsonify
from app.core.database import SessionLocal
from app.models.survey_template import SurveyTemplate
from app.api.survey_templates import validate_survey_name
from app.utils.survey_scoring import normalize_survey_content, validate_survey_content
from app.utils.survey_template_policy import require_survey_manager, survey_template_readiness
from app.api.auth import require_auth
from app.realtime.events import emit_catalog_changed
from app.utils.search_normalization import normalized_contains

router = Blueprint('survey_template_management', __name__)





@router.route("/survey-templates/<int:template_id>/duplicate", methods=['POST'])
@require_auth
@require_survey_manager
def duplicate_survey_template(user, template_id):
    """Sao chép mẫu khảo sát"""
    try:
        db = SessionLocal()
        original_template = db.query(SurveyTemplate).filter(SurveyTemplate.id == template_id, SurveyTemplate.is_active.is_(True)).first()
        
        if not original_template:
            db.close()
            return jsonify({'success': False, 'error': 'Template not found'}), 404
        
        data = request.get_json(silent=True)
        if data is None:
            data = {}
        if not isinstance(data, dict):
            raise ValueError('Thông tin mẫu khảo sát không hợp lệ.')
        new_name = validate_survey_name(data.get('new_name', f"{original_template.name} (Copy)"))
        if not new_name or db.query(SurveyTemplate.id).filter(SurveyTemplate.name == new_name, SurveyTemplate.is_active.is_(True)).first():
            db.close()
            return jsonify(success=False, message='Vui lòng nhập tên mẫu chưa được sử dụng.'), 400
        content = normalize_survey_content(original_template.content)
        validate_survey_content(content)
        created_by = user.id
        
        # Create duplicate
        template = SurveyTemplate(
            name=new_name,
            description=original_template.description,
            content=content,
            created_by=created_by,
            default_performer_id=original_template.default_performer_id,
            is_active=True
        )
        
        db.add(template)
        db.commit()
        db.refresh(template)
        emit_catalog_changed('survey_template_duplicated', entity='survey_template', entity_id=template.id)
        
        result = {
            'message': 'Template duplicated successfully',
            'template_id': template.id,
            'template_name': template.name
        }
        
        db.close()
        return jsonify({'success': True, 'data': result})
        
    except ValueError as e:
        db.rollback()
        db.close()
        return jsonify(success=False, message=str(e)), 400
    except Exception as e:
        db.close()
        return jsonify({'success': False, 'error': str(e)}), 500

# Endpoint test không cần authentication
@router.route("/public/survey-templates", methods=['GET'])
def public_get_survey_templates():
    """Lấy danh sách mẫu khảo sát (public) — có hỗ trợ pagination + search"""
    try:
        page     = max(1, request.args.get('page', 1, type=int))
        per_page = min(100, max(1, request.args.get('per_page', 10, type=int)))
        search   = request.args.get('search', '').strip()

        db    = SessionLocal()
        query = db.query(SurveyTemplate).filter(SurveyTemplate.is_active == True)

        if search:
            query = query.filter(normalized_contains(SurveyTemplate.name, search))

        total   = query.count()
        pages   = max(1, (total + per_page - 1) // per_page)
        page    = max(1, min(page, pages))
        offset  = (page - 1) * per_page

        templates = query.order_by(SurveyTemplate.created_at.desc()).offset(offset).limit(per_page).all()

        result = []
        for template in templates:
            result.append({
                **survey_template_readiness(template),
                'file_name': template.file_name,
                'file_type': template.file_type,
                'id':           template.id,
                'name':         template.name,
                'description':  template.description,
                'created_at':   template.created_at.isoformat() if template.created_at else None,
                'creator_name': template.creator.full_name if template.creator else None,
                'default_performer_id': template.default_performer_id,
                'default_performer_name': template.default_performer.full_name if template.default_performer else None,
            })

        db.close()
        return jsonify({
            'success': True,
            'data': result,
            'pagination': {
                'total':    total,
                'page':     page,
                'pages':    pages,
                'per_page': per_page
            }
        })
        
    except Exception as e:
        db.close()
        return jsonify({'success': False, 'error': str(e)}), 500
