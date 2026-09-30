from flask import Blueprint, request, jsonify
from sqlalchemy import or_, and_
from app.core.database import get_db
from app.models.icd import ICD
from app.api.auth import require_auth
from app.realtime.events import emit_catalog_changed
from app.utils.search_normalization import normalized_contains
import logging
from datetime import datetime
from app.utils.api_error_contract import api_error_boundary

logger = logging.getLogger(__name__)

icd_router = Blueprint('icd', __name__)

DEFAULT_PAGE_SIZE = 100
MAX_PAGE_SIZE = 1000


def _parse_pagination_params():
    """Parse and validate the public ICD pagination contract."""
    try:
        skip = int(request.args.get('skip', 0))
        limit = int(request.args.get('limit', DEFAULT_PAGE_SIZE))
    except (TypeError, ValueError):
        raise ValueError('Tham số phân trang ICD không hợp lệ')

    if skip < 0 or limit < 1 or limit > MAX_PAGE_SIZE:
        raise ValueError(
            f'Tham số phân trang ICD phải có skip >= 0 và limit từ 1 đến {MAX_PAGE_SIZE}'
        )
    return skip, limit

@icd_router.route("/", methods=['GET'])
@require_auth
@api_error_boundary(error='Lỗi khi lấy danh sách ICD')
def get_icd_list(user):
    """Lấy danh sách ICD với phân trang và tìm kiếm"""
    db = None
    try:
        db = next(get_db())
        
        # Lấy tham số từ query string
        try:
            skip, limit = _parse_pagination_params()
        except ValueError as error:
            return jsonify({'error': str(error)}), 400
        search = request.args.get('search', '').strip()
        disease_group = request.args.get('disease_group', '').strip()
        
        ids_str = request.args.get('ids', '').strip()
        
        query = db.query(ICD).filter(ICD.is_deleted == False)
        
        # Lọc theo danh sách ID
        if ids_str:
            try:
                ids = [int(x.strip()) for x in ids_str.split(',') if x.strip()]
                if ids:
                    query = query.filter(ICD.id.in_(ids))
            except ValueError as exc:
                logger.warning("Bỏ qua danh sách ICD id không hợp lệ: %s", exc)
        
        # Lọc theo danh sách mã ICD
        codes_str = request.args.get('codes', '').strip()
        if codes_str:
            codes = [x.strip() for x in codes_str.split(',') if x.strip()]
            if codes:
                query = query.filter(ICD.icd_code.in_(codes))
        
        # Tìm kiếm theo mã ICD, tên bệnh
        if search:
            search_filter = or_(
                normalized_contains(ICD.icd_code, search),
                normalized_contains(ICD.disease_name, search),
            )
            query = query.filter(search_filter)
        
        # Lọc theo nhóm bệnh
        if disease_group:
            query = query.filter(normalized_contains(ICD.disease_group, disease_group))
        
        # Sắp xếp theo mã ICD
        query = query.order_by(ICD.icd_code)
        
        # Đếm trên cùng bộ lọc nhưng bỏ ORDER BY để không sort toàn bộ tập kết quả.
        total_count = query.order_by(None).count()
        
        # Phân trang
        icd_list = query.offset(skip).limit(limit).all()
        
        # Convert to dict
        result = []
        for icd in icd_list:
            result.append({
                'id': icd.id,
                'icd_code': icd.icd_code,
                'disease_name': icd.disease_name,
                'description': icd.description,
                'disease_group': icd.disease_group,
                'created_at': icd.created_at.isoformat() if icd.created_at else None
            })
        
        # Trả về với thông tin phân trang
        return jsonify({
            'data': result,
            'pagination': {
                'current_page': (skip // limit) + 1,
                'per_page': limit,
                'total_count': total_count,
                'total_pages': (total_count + limit - 1) // limit,
                'has_next': skip + limit < total_count,
                'has_prev': skip > 0
            }
        })
        
    finally:
        if db is not None:
            db.close()

@icd_router.route("/<int:icd_id>", methods=['GET'])
@require_auth
@api_error_boundary(error='Lỗi khi lấy thông tin ICD')
def get_icd(user, icd_id):
    """Lấy thông tin chi tiết một ICD"""
    db = None
    try:
        db = next(get_db())
        
        icd = db.query(ICD).filter(
            and_(ICD.id == icd_id, ICD.is_deleted == False)
        ).first()
        
        if not icd:
            return jsonify({'error': 'Không tìm thấy mã ICD'}), 404
        
        result = {
            'id': icd.id,
            'icd_code': icd.icd_code,
            'disease_name': icd.disease_name,
            'description': icd.description,
            'disease_group': icd.disease_group,
            'is_deleted': icd.is_deleted,
            'deleted_at': icd.deleted_at.isoformat() if icd.deleted_at else None,
            'created_at': icd.created_at.isoformat() if icd.created_at else None,
            'updated_at': icd.updated_at.isoformat() if icd.updated_at else None
        }
        
        return jsonify(result)
        
    finally:
        if db is not None:
            db.close()

@icd_router.route("/", methods=['POST'])
@require_auth
@api_error_boundary(error='Lỗi khi tạo mã ICD')
def create_icd(user):
    """Tạo mới một mã ICD"""
    db = None
    try:
        db = next(get_db())
        
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Dữ liệu không hợp lệ'}), 400
        
        # Validate required fields
        if not data.get('icd_code') or not data.get('disease_name'):
            return jsonify({'error': 'Mã ICD và tên bệnh là bắt buộc'}), 400
        
        # Kiểm tra mã ICD đã tồn tại chưa
        existing_icd = db.query(ICD).filter(
            and_(ICD.icd_code == data['icd_code'], ICD.is_deleted == False)
        ).first()
        
        if existing_icd:
            return jsonify({'error': 'Mã ICD đã tồn tại'}), 400
        
        # Tạo ICD mới
        new_icd = ICD(
            icd_code=data['icd_code'],
            disease_name=data['disease_name'],
            description=data.get('description', ''),
            disease_group=data.get('disease_group', '')
        )
        
        db.add(new_icd)
        db.commit()
        db.refresh(new_icd)
        emit_catalog_changed('icd_created', entity='icd', entity_id=new_icd.id)
        
        result = {
            'id': new_icd.id,
            'icd_code': new_icd.icd_code,
            'disease_name': new_icd.disease_name,
            'description': new_icd.description,
            'disease_group': new_icd.disease_group,
            'is_deleted': new_icd.is_deleted,
            'deleted_at': new_icd.deleted_at.isoformat() if new_icd.deleted_at else None,
            'created_at': new_icd.created_at.isoformat() if new_icd.created_at else None,
            'updated_at': new_icd.updated_at.isoformat() if new_icd.updated_at else None
        }
        
        return jsonify(result), 201
        
    finally:
        if db is not None:
            db.close()

@icd_router.route("/<int:icd_id>", methods=['PUT'])
@require_auth
@api_error_boundary(error='Lỗi khi cập nhật mã ICD')
def update_icd(user, icd_id):
    """Cập nhật thông tin ICD"""
    db = None
    try:
        db = next(get_db())
        
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Dữ liệu không hợp lệ'}), 400
        
        icd = db.query(ICD).filter(
            and_(ICD.id == icd_id, ICD.is_deleted == False)
        ).first()
        
        if not icd:
            return jsonify({'error': 'Không tìm thấy mã ICD'}), 404
        
        # Kiểm tra mã ICD mới có trùng với ICD khác không
        if 'icd_code' in data and data['icd_code'] != icd.icd_code:
            existing_icd = db.query(ICD).filter(
                and_(ICD.icd_code == data['icd_code'], ICD.is_deleted == False, ICD.id != icd_id)
            ).first()
            
            if existing_icd:
                return jsonify({'error': 'Mã ICD đã tồn tại'}), 400
        
        # Cập nhật thông tin
        if 'icd_code' in data:
            icd.icd_code = data['icd_code']
        if 'disease_name' in data:
            icd.disease_name = data['disease_name']
        if 'description' in data:
            icd.description = data['description']
        if 'disease_group' in data:
            icd.disease_group = data['disease_group']
        
        db.commit()
        db.refresh(icd)
        emit_catalog_changed('icd_updated', entity='icd', entity_id=icd.id)
        
        result = {
            'id': icd.id,
            'icd_code': icd.icd_code,
            'disease_name': icd.disease_name,
            'description': icd.description,
            'disease_group': icd.disease_group,
            'is_deleted': icd.is_deleted,
            'deleted_at': icd.deleted_at.isoformat() if icd.deleted_at else None,
            'created_at': icd.created_at.isoformat() if icd.created_at else None,
            'updated_at': icd.updated_at.isoformat() if icd.updated_at else None
        }
        
        return jsonify(result)
        
    finally:
        if db is not None:
            db.close()

@icd_router.route("/<int:icd_id>", methods=['DELETE'])
@require_auth
@api_error_boundary(error='Lỗi khi xóa mã ICD')
def delete_icd(user, icd_id):
    """Xóa ICD (soft delete)"""
    db = None
    try:
        db = next(get_db())
        
        icd = db.query(ICD).filter(
            and_(ICD.id == icd_id, ICD.is_deleted == False)
        ).first()
        
        if not icd:
            return jsonify({'error': 'Không tìm thấy mã ICD'}), 404
        
        # Soft delete
        icd.is_deleted = True
        icd.deleted_at = datetime.utcnow()
        
        db.commit()
        emit_catalog_changed('icd_deleted', entity='icd', entity_id=icd_id)
        
        return jsonify({'message': 'Xóa mã ICD thành công'})
        
    finally:
        if db is not None:
            db.close()

@icd_router.route("/groups/list", methods=['GET'])
@require_auth
@api_error_boundary(error='Lỗi khi lấy danh sách nhóm bệnh')
def get_disease_groups(user):
    """Lấy danh sách các nhóm bệnh"""
    db = None
    try:
        db = next(get_db())
        
        groups = db.query(ICD.disease_group).filter(
            and_(ICD.is_deleted == False, ICD.disease_group.isnot(None))
        ).distinct().all()
        
        result = [group[0] for group in groups if group[0]]
        
        return jsonify(result)
        
    finally:
        if db is not None:
            db.close()

@icd_router.route('/import', methods=['POST'])
@require_auth
@api_error_boundary(error='Lỗi khi import dữ liệu ICD')
def import_icd(user):
    """Import danh sách ICD từ Excel"""
    db = None
    try:
        data = request.get_json()
        icd_list = data.get('icd_list', [])
        
        if not icd_list:
            return jsonify({'error': 'Không có dữ liệu để import'}), 400
        
        db = next(get_db())
        imported_count = 0
        errors = []
        
        for i, icd_data in enumerate(icd_list):
            try:
                # Validate required fields
                if not icd_data.get('icd_code') or not icd_data.get('disease_name'):
                    errors.append(f"Dòng {i+2}: Thiếu mã ICD hoặc tên bệnh")
                    continue
                
                # Check if ICD code already exists
                existing = db.query(ICD).filter(
                    and_(
                        ICD.icd_code == icd_data['icd_code'],
                        ICD.is_deleted == False
                    )
                ).first()
                
                if existing:
                    errors.append(f"Dòng {i+2}: Mã ICD '{icd_data['icd_code']}' đã tồn tại")
                    continue
                
                # Create new ICD
                new_icd = ICD(
                    icd_code=icd_data['icd_code'].strip(),
                    disease_name=icd_data['disease_name'].strip(),
                    description=icd_data.get('description', '').strip() or None,
                    disease_group=icd_data.get('disease_group', '').strip() or None
                )
                
                db.add(new_icd)
                db.commit()  # Commit từng record để tránh lỗi batch
                imported_count += 1
                
            except Exception as e:
                logger.warning('ICD import row %s failed', i + 2, exc_info=True)
                errors.append(f"Dòng {i+2}: Lỗi - {str(e)}")
                db.rollback()  # Rollback nếu có lỗi
                continue
        
        result = {
            'success_count': imported_count,
            'total_count': len(icd_list),
            'error_count': len(errors),
            'errors': errors
        }
        if imported_count:
            emit_catalog_changed('icd_imported', entity='icd', extra={'success_count': imported_count})
        
        return jsonify(result)
        
    finally:
        if db is not None:
            db.close()
