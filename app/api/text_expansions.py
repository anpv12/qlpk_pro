from flask import Blueprint, request, jsonify
from app.core.database import get_db
from app.models.text_expansion import TextExpansion
from app.api.auth import require_auth
from app.realtime.events import emit_catalog_changed
from app.utils.search_normalization import normalized_contains
from pydantic import BaseModel
from typing import Optional
import pandas as pd
import io

text_expansions_bp = Blueprint('text_expansions', __name__)

# Pydantic schemas
class TextExpansionCreate(BaseModel):
    abbreviation: str
    full_text: str
    category: str = "general"
    description: Optional[str] = None
    is_active: bool = True

class TextExpansionUpdate(BaseModel):
    abbreviation: Optional[str] = None
    full_text: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None

class TextExpansionResponse(BaseModel):
    id: int
    abbreviation: str
    full_text: str
    category: str
    description: Optional[str]
    is_active: bool
    created_by: Optional[int]
    created_at: str
    updated_at: Optional[str]

# GET /api/text-expansions/ - Lấy danh sách từ viết tắt
@text_expansions_bp.route('/api/text-expansions/', methods=['GET'])
@require_auth
def get_text_expansions(current_user):
    try:
        db = next(get_db())
        
        # Query parameters
        category = request.args.get('category')
        search = request.args.get('search')
        is_active = request.args.get('is_active')
        page = int(request.args.get('page', 1))
        per_page = int(request.args.get('per_page', 50))
        
        # Build query
        query = db.query(TextExpansion)
        
        if category and category != 'all':
            query = query.filter(TextExpansion.category == category)
        
        if search:
            query = query.filter(
                normalized_contains(TextExpansion.abbreviation, search) |
                normalized_contains(TextExpansion.full_text, search)
            )
        
        if is_active is not None:
            query = query.filter(TextExpansion.is_active == (is_active.lower() == 'true'))
        
        # Pagination
        total = query.count()
        text_expansions = query.order_by(TextExpansion.abbreviation).offset((page - 1) * per_page).limit(per_page).all()
        
        # Format response
        result = []
        for te in text_expansions:
            result.append({
                'id': te.id,
                'abbreviation': te.abbreviation,
                'full_text': te.full_text,
                'category': te.category,
                'description': te.description,
                'is_active': te.is_active,
                'created_by': te.created_by,
                'created_at': te.created_at.isoformat() if te.created_at else None,
                'updated_at': te.updated_at.isoformat() if te.updated_at else None
            })
        
        return jsonify({
            'success': True,
            'data': result,
            'pagination': {
                'page': page,
                'per_page': per_page,
                'total': total,
                'pages': (total + per_page - 1) // per_page
            }
        }), 200
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        db.close()

# GET /api/text-expansions/active - Lấy danh sách từ viết tắt đang hoạt động (cho frontend)
@text_expansions_bp.route('/api/text-expansions/active', methods=['GET'])
@require_auth
def get_active_text_expansions(current_user):
    try:
        db = next(get_db())
        
        text_expansions = db.query(TextExpansion).filter(TextExpansion.is_active == True).all()
        
        # Format as dictionary for easy lookup
        result = {}
        for te in text_expansions:
            result[te.abbreviation] = te.full_text
        
        return jsonify({
            'success': True,
            'data': result
        }), 200
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        db.close()

# GET /api/text-expansions/<id> - Lấy thông tin một từ viết tắt
@text_expansions_bp.route('/api/text-expansions/<int:expansion_id>', methods=['GET'])
@require_auth
def get_text_expansion(current_user, expansion_id):
    try:
        db = next(get_db())
        
        text_expansion = db.query(TextExpansion).filter(TextExpansion.id == expansion_id).first()
        if not text_expansion:
            return jsonify({'success': False, 'error': 'Không tìm thấy từ viết tắt'}), 404
        
        return jsonify({
            'success': True,
            'data': {
                'id': text_expansion.id,
                'abbreviation': text_expansion.abbreviation,
                'full_text': text_expansion.full_text,
                'category': text_expansion.category,
                'description': text_expansion.description,
                'is_active': text_expansion.is_active,
                'created_by': text_expansion.created_by,
                'created_at': text_expansion.created_at.isoformat() if text_expansion.created_at else None,
                'updated_at': text_expansion.updated_at.isoformat() if text_expansion.updated_at else None
            }
        }), 200
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        db.close()

# POST /api/text-expansions/ - Tạo từ viết tắt mới
@text_expansions_bp.route('/api/text-expansions/', methods=['POST'])
@require_auth
def create_text_expansion(current_user):
    try:
        db = next(get_db())
        data = request.get_json()
        
        # Validate required fields
        if not data.get('abbreviation') or not data.get('full_text'):
            return jsonify({'success': False, 'error': 'abbreviation và full_text là bắt buộc'}), 400
        
        # Check if abbreviation already exists
        existing = db.query(TextExpansion).filter(TextExpansion.abbreviation == data['abbreviation']).first()
        if existing:
            return jsonify({'success': False, 'error': 'Từ viết tắt đã tồn tại'}), 400
        
        # Create new text expansion
        text_expansion = TextExpansion(
            abbreviation=data['abbreviation'],
            full_text=data['full_text'],
            category=data.get('category', 'general'),
            description=data.get('description'),
            is_active=data.get('is_active', True),
            created_by=current_user.id
        )
        
        db.add(text_expansion)
        db.commit()
        db.refresh(text_expansion)
        emit_catalog_changed('text_expansion_created', entity='text_expansion', entity_id=text_expansion.id)
        
        return jsonify({
            'success': True,
            'data': {
                'id': text_expansion.id,
                'abbreviation': text_expansion.abbreviation,
                'full_text': text_expansion.full_text,
                'category': text_expansion.category,
                'description': text_expansion.description,
                'is_active': text_expansion.is_active,
                'created_by': text_expansion.created_by,
                'created_at': text_expansion.created_at.isoformat() if text_expansion.created_at else None
            }
        }), 201
        
    except Exception as e:
        db.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        db.close()

# PUT /api/text-expansions/<id> - Cập nhật từ viết tắt
@text_expansions_bp.route('/api/text-expansions/<int:expansion_id>', methods=['PUT'])
@require_auth
def update_text_expansion(current_user, expansion_id):
    try:
        db = next(get_db())
        data = request.get_json()
        
        text_expansion = db.query(TextExpansion).filter(TextExpansion.id == expansion_id).first()
        if not text_expansion:
            return jsonify({'success': False, 'error': 'Không tìm thấy từ viết tắt'}), 404
        
        # Check if new abbreviation already exists (if changed)
        if 'abbreviation' in data and data['abbreviation'] != text_expansion.abbreviation:
            existing = db.query(TextExpansion).filter(TextExpansion.abbreviation == data['abbreviation']).first()
            if existing:
                return jsonify({'success': False, 'error': 'Từ viết tắt đã tồn tại'}), 400
        
        # Update fields
        for field in ['abbreviation', 'full_text', 'category', 'description', 'is_active']:
            if field in data:
                setattr(text_expansion, field, data[field])
        
        db.commit()
        db.refresh(text_expansion)
        emit_catalog_changed('text_expansion_updated', entity='text_expansion', entity_id=text_expansion.id)
        
        return jsonify({
            'success': True,
            'data': {
                'id': text_expansion.id,
                'abbreviation': text_expansion.abbreviation,
                'full_text': text_expansion.full_text,
                'category': text_expansion.category,
                'description': text_expansion.description,
                'is_active': text_expansion.is_active,
                'created_by': text_expansion.created_by,
                'created_at': text_expansion.created_at.isoformat() if text_expansion.created_at else None,
                'updated_at': text_expansion.updated_at.isoformat() if text_expansion.updated_at else None
            }
        }), 200
        
    except Exception as e:
        db.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        db.close()

# DELETE /api/text-expansions/<id> - Xóa từ viết tắt
@text_expansions_bp.route('/api/text-expansions/<int:expansion_id>', methods=['DELETE'])
@require_auth
def delete_text_expansion(current_user, expansion_id):
    try:
        db = next(get_db())
        
        text_expansion = db.query(TextExpansion).filter(TextExpansion.id == expansion_id).first()
        if not text_expansion:
            return jsonify({'success': False, 'error': 'Không tìm thấy từ viết tắt'}), 404
        
        db.delete(text_expansion)
        db.commit()
        emit_catalog_changed('text_expansion_deleted', entity='text_expansion', entity_id=expansion_id)
        
        return jsonify({'success': True, 'message': 'Xóa từ viết tắt thành công'}), 200
        
    except Exception as e:
        db.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        db.close()

# POST /api/text-expansions/import - Import từ Excel
@text_expansions_bp.route('/api/text-expansions/import', methods=['POST'])
@require_auth
def import_text_expansions(current_user):
    try:
        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'Không có file được upload'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'success': False, 'error': 'Không có file được chọn'}), 400
        
        # Read Excel file
        df = pd.read_excel(file)
        
        # Validate columns
        required_columns = ['abbreviation', 'full_text']
        if not all(col in df.columns for col in required_columns):
            return jsonify({'success': False, 'error': f'File Excel phải có các cột: {", ".join(required_columns)}'}), 400
        
        db = next(get_db())
        imported_count = 0
        errors = []
        
        for index, row in df.iterrows():
            try:
                # Check if abbreviation already exists
                existing = db.query(TextExpansion).filter(TextExpansion.abbreviation == row['abbreviation']).first()
                if existing:
                    errors.append(f"Dòng {index + 2}: Từ viết tắt '{row['abbreviation']}' đã tồn tại")
                    continue
                
                # Create new text expansion
                text_expansion = TextExpansion(
                    abbreviation=str(row['abbreviation']).strip(),
                    full_text=str(row['full_text']).strip(),
                    category=str(row.get('category', 'general')).strip(),
                    description=str(row.get('description', '')).strip() if pd.notna(row.get('description')) else None,
                    is_active=bool(row.get('is_active', True)),
                    created_by=current_user.id
                )
                
                db.add(text_expansion)
                imported_count += 1
                
            except Exception as e:
                errors.append(f"Dòng {index + 2}: {str(e)}")
        
        db.commit()
        if imported_count:
            emit_catalog_changed('text_expansions_imported', entity='text_expansion', extra={'success_count': imported_count})
        
        return jsonify({
            'success': True,
            'message': f'Import thành công {imported_count} từ viết tắt',
            'imported_count': imported_count,
            'errors': errors
        }), 200
        
    except Exception as e:
        db.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        db.close()

# GET /api/text-expansions/export - Export ra Excel
@text_expansions_bp.route('/api/text-expansions/export', methods=['GET'])
@require_auth
def export_text_expansions(current_user):
    try:
        db = next(get_db())
        
        # Get all text expansions
        text_expansions = db.query(TextExpansion).order_by(TextExpansion.abbreviation).all()
        
        # Create DataFrame
        data = []
        for te in text_expansions:
            data.append({
                'abbreviation': te.abbreviation,
                'full_text': te.full_text,
                'category': te.category,
                'description': te.description or '',
                'is_active': te.is_active,
                'created_at': te.created_at.strftime('%Y-%m-%d %H:%M:%S') if te.created_at else ''
            })
        
        df = pd.DataFrame(data)
        
        # Create Excel file in memory
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, sheet_name='Text Expansions', index=False)
        
        output.seek(0)
        
        from flask import Response
        return Response(
            output.getvalue(),
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            headers={'Content-Disposition': 'attachment; filename=text_expansions.xlsx'}
        )
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        db.close()

# POST /api/text-expansions/reset - Reset toàn bộ (xóa tất cả)
@text_expansions_bp.route('/api/text-expansions/reset', methods=['POST'])
@require_auth
def reset_text_expansions(current_user):
    try:
        db = next(get_db())
        
        # Delete all text expansions
        db.query(TextExpansion).delete()
        db.commit()
        emit_catalog_changed('text_expansions_reset', entity='text_expansion')
        
        return jsonify({'success': True, 'message': 'Reset toàn bộ từ viết tắt thành công'}), 200
        
    except Exception as e:
        db.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        db.close()
