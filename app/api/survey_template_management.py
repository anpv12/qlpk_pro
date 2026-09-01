from flask import Blueprint, request, jsonify, current_app
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models.survey_template import SurveyTemplate
from app.models.user import User
from app.api.survey_templates import resolve_default_performer_id
from app.api.auth import require_auth
from app.realtime.events import emit_catalog_changed
from app.utils.search_normalization import normalized_contains
from typing import List, Optional
import json
import uuid
from datetime import datetime
import os

router = Blueprint('survey_template_management', __name__)

@router.route("/survey-templates", methods=['GET'])
@require_auth
def get_survey_templates(user):
    """Lấy danh sách mẫu khảo sát"""
    try:
        db = SessionLocal()
        skip = request.args.get('skip', 0, type=int)
        limit = request.args.get('limit', 100, type=int)
        search = request.args.get('search', '')
        
        query = db.query(SurveyTemplate)
        
        if search:
            query = query.filter(normalized_contains(SurveyTemplate.name, search))
        
        templates = query.offset(skip).limit(limit).all()
        
        result = []
        for template in templates:
            result.append({
                'id': template.id,
                'name': template.name,
                'description': template.description,
                'content': template.content,
                'created_by': template.created_by,
                'default_performer_id': template.default_performer_id,
                'default_performer_name': template.default_performer.full_name if template.default_performer else None,
                'created_at': template.created_at.isoformat() if template.created_at else None,
                'updated_at': template.updated_at.isoformat() if template.updated_at else None,
                'is_active': template.is_active
            })
        
        db.close()
        return jsonify({'success': True, 'data': result})
        
    except Exception as e:
        db.close()
        return jsonify({'success': False, 'error': str(e)}), 500

@router.route("/survey-templates/<int:template_id>", methods=['GET'])
@require_auth
def get_survey_template(user, template_id):
    """Lấy chi tiết mẫu khảo sát"""
    try:
        db = SessionLocal()
        template = db.query(SurveyTemplate).filter(SurveyTemplate.id == template_id).first()
        
        if not template:
            db.close()
            return jsonify({'success': False, 'error': 'Template not found'}), 404
        
        result = {
            'id': template.id,
            'name': template.name,
            'description': template.description,
            'content': template.content,
            'created_by': template.created_by,
            'default_performer_id': template.default_performer_id,
            'default_performer_name': template.default_performer.full_name if template.default_performer else None,
            'created_at': template.created_at.isoformat() if template.created_at else None,
            'updated_at': template.updated_at.isoformat() if template.updated_at else None,
            'is_active': template.is_active
        }
        
        db.close()
        return jsonify({'success': True, 'data': result})
        
    except Exception as e:
        db.close()
        return jsonify({'success': False, 'error': str(e)}), 500

@router.route("/survey-templates", methods=['POST'])
@require_auth
def create_survey_template(user):
    """Tạo mẫu khảo sát mới"""
    try:
        db = SessionLocal()
        data = request.get_json()
        
        if not data or not data.get('name') or not data.get('content'):
            db.close()
            return jsonify({'success': False, 'error': 'Name and content are required'}), 400
        
        template = SurveyTemplate(
            name=data['name'],
            description=data.get('description', ''),
            content=data['content'],
            created_by=data.get('created_by', 1),
            default_performer_id=resolve_default_performer_id(
                db, data.get('default_performer_id')
            ),
            is_active=data.get('is_active', True)
        )
        
        db.add(template)
        db.commit()
        db.refresh(template)
        emit_catalog_changed('survey_template_created', entity='survey_template', entity_id=template.id)
        
        result = {
            'id': template.id,
            'name': template.name,
            'description': template.description,
            'content': template.content,
            'created_by': template.created_by,
            'default_performer_id': template.default_performer_id,
            'default_performer_name': template.default_performer.full_name if template.default_performer else None,
            'created_at': template.created_at.isoformat() if template.created_at else None,
            'updated_at': template.updated_at.isoformat() if template.updated_at else None,
            'is_active': template.is_active
        }
        
        db.close()
        return jsonify({'success': True, 'data': result}), 201
        
    except ValueError as e:
        db.rollback()
        db.close()
        return jsonify({'success': False, 'error': str(e)}), 400
    except Exception as e:
        db.close()
        return jsonify({'success': False, 'error': str(e)}), 500

@router.route("/survey-templates/<int:template_id>", methods=['PUT'])
@require_auth
def update_survey_template(user, template_id):
    """Cập nhật mẫu khảo sát"""
    try:
        db = SessionLocal()
        template = db.query(SurveyTemplate).filter(SurveyTemplate.id == template_id).first()
        
        if not template:
            db.close()
            return jsonify({'success': False, 'error': 'Template not found'}), 404
        
        data = request.get_json()
        
        if data.get('name'):
            template.name = data['name']
        if data.get('description') is not None:
            template.description = data['description']
        if data.get('content'):
            template.content = data['content']
        if data.get('is_active') is not None:
            template.is_active = data['is_active']
        if 'default_performer_id' in data:
            template.default_performer_id = resolve_default_performer_id(
                db, data.get('default_performer_id')
            )
        
        template.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(template)
        emit_catalog_changed('survey_template_updated', entity='survey_template', entity_id=template.id)
        
        result = {
            'id': template.id,
            'name': template.name,
            'description': template.description,
            'content': template.content,
            'created_by': template.created_by,
            'default_performer_id': template.default_performer_id,
            'default_performer_name': template.default_performer.full_name if template.default_performer else None,
            'created_at': template.created_at.isoformat() if template.created_at else None,
            'updated_at': template.updated_at.isoformat() if template.updated_at else None,
            'is_active': template.is_active
        }
        
        db.close()
        return jsonify({'success': True, 'data': result})
        
    except ValueError as e:
        db.rollback()
        db.close()
        return jsonify({'success': False, 'error': str(e)}), 400
    except Exception as e:
        db.close()
        return jsonify({'success': False, 'error': str(e)}), 500

@router.route("/survey-templates/<int:template_id>", methods=['DELETE'])
@require_auth
def delete_survey_template(user, template_id):
    """Xóa mẫu khảo sát"""
    try:
        db = SessionLocal()
        template = db.query(SurveyTemplate).filter(SurveyTemplate.id == template_id).first()
        
        if not template:
            db.close()
            return jsonify({'success': False, 'error': 'Template not found'}), 404
        
        db.delete(template)
        db.commit()
        emit_catalog_changed('survey_template_deleted', entity='survey_template', entity_id=template_id)
        db.close()
        
        return jsonify({'success': True, 'message': 'Template deleted successfully'})
        
    except Exception as e:
        db.close()
        return jsonify({'success': False, 'error': str(e)}), 500




@router.route("/survey-templates/<int:template_id>/duplicate", methods=['POST'])
@require_auth
def duplicate_survey_template(user, template_id):
    """Sao chép mẫu khảo sát"""
    try:
        db = SessionLocal()
        original_template = db.query(SurveyTemplate).filter(SurveyTemplate.id == template_id).first()
        
        if not original_template:
            db.close()
            return jsonify({'success': False, 'error': 'Template not found'}), 404
        
        data = request.get_json() or {}
        new_name = data.get('new_name', f"{original_template.name} (Copy)")
        created_by = data.get('created_by', 2)  # Default to Admin QLPK
        
        # Create duplicate
        template = SurveyTemplate(
            name=new_name,
            description=original_template.description,
            content=original_template.content,
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
        
    except Exception as e:
        db.close()
        return jsonify({'success': False, 'error': str(e)}), 500

# Endpoint test không cần authentication
@router.route("/public/survey-templates", methods=['GET'])
def public_get_survey_templates():
    """Lấy danh sách mẫu khảo sát (public) — có hỗ trợ pagination + search"""
    try:
        page     = int(request.args.get('page', 1))
        per_page = int(request.args.get('per_page', 10))
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
                'id':           template.id,
                'name':         template.name,
                'description':  template.description,
                'created_at':   template.created_at.isoformat() if template.created_at else None,
                'creator_name': 'Admin QLPK',
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
