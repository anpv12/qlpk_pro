from flask import Blueprint, request, jsonify, send_file
from app.core.database import SessionLocal
from app.models.active_ingredient import ActiveIngredient
from app.api.auth import require_auth
from app.realtime.events import emit_inventory_changed
from app.utils.search_normalization import normalized_contains
import pandas as pd
import io
from app.utils.api_error_contract import api_error_boundary
from app.utils.catalog_excel_upload import catalog_excel_upload

active_ingredient_bp = Blueprint('active_ingredient', __name__, url_prefix='/api/active-ingredient')

@active_ingredient_bp.route('', methods=['GET'])
@require_auth
@api_error_boundary(success=False, message='{error}')
def get_active_ingredients(user):
    db = SessionLocal()
    try:
        search = request.args.get('search', '')
        page = int(request.args.get('page', 1))
        limit = int(request.args.get('limit', 10))
        offset = (page - 1) * limit

        query = db.query(ActiveIngredient).filter(ActiveIngredient.is_active == True)
        
        if search:
            query = query.filter(normalized_contains(ActiveIngredient.ten_hoat_chat, search))
            
        total = query.count()
        items = query.order_by(ActiveIngredient.ten_hoat_chat).offset(offset).limit(limit).all()
            
        return jsonify({
            'success': True,
            'data': [item.to_dict() for item in items],
            'total': total,
            'page': page,
            'limit': limit
        })
    finally:
        db.close()

@active_ingredient_bp.route('', methods=['POST'])
@require_auth
@api_error_boundary(success=False, message='{error}')
def create_active_ingredient(user):
    db = SessionLocal()
    try:
        data = request.json
        ten_hoat_chat = data.get('ten_hoat_chat', '').strip()
        
        if not ten_hoat_chat:
            return jsonify({'success': False, 'message': 'Tên hoạt chất không được để trống'}), 400
            
        # Check duplicate
        existing = db.query(ActiveIngredient).filter(ActiveIngredient.ten_hoat_chat.ilike(ten_hoat_chat)).first()
        if existing:
            if not existing.is_active:
                # Reactivate
                existing.is_active = True
                existing.mo_ta = data.get('mo_ta', existing.mo_ta)
                db.commit()
                emit_inventory_changed('active_ingredient_restored', entity='active_ingredient', entity_id=existing.id)
                return jsonify({'success': True, 'data': existing.to_dict()})
            return jsonify({'success': False, 'message': 'Hoạt chất này đã tồn tại'}), 400
            
        new_item = ActiveIngredient(
            ten_hoat_chat=ten_hoat_chat,
            mo_ta=data.get('mo_ta', '')
        )
        db.add(new_item)
        db.commit()
        db.refresh(new_item)
        emit_inventory_changed('active_ingredient_created', entity='active_ingredient', entity_id=new_item.id)
        
        return jsonify({'success': True, 'data': new_item.to_dict()})
    finally:
        db.close()

@active_ingredient_bp.route('/<int:id>', methods=['PUT'])
@require_auth
@api_error_boundary(success=False, message='{error}')
def update_active_ingredient(user, id):
    db = SessionLocal()
    try:
        data = request.json
        ten_hoat_chat = data.get('ten_hoat_chat', '').strip()
        
        if not ten_hoat_chat:
            return jsonify({'success': False, 'message': 'Tên hoạt chất không được để trống'}), 400
            
        item = db.query(ActiveIngredient).filter(ActiveIngredient.id == id).first()
        if not item:
            return jsonify({'success': False, 'message': 'Không tìm thấy hoạt chất'}), 404
            
        # Check duplicate name with other id
        existing = db.query(ActiveIngredient).filter(
            ActiveIngredient.ten_hoat_chat.ilike(ten_hoat_chat),
            ActiveIngredient.id != id
        ).first()
        if existing:
            return jsonify({'success': False, 'message': 'Tên hoạt chất đã tồn tại'}), 400
            
        item.ten_hoat_chat = ten_hoat_chat
        if 'mo_ta' in data:
            item.mo_ta = data['mo_ta']
            
        db.commit()
        emit_inventory_changed('active_ingredient_updated', entity='active_ingredient', entity_id=item.id)
        return jsonify({'success': True, 'data': item.to_dict()})
    finally:
        db.close()

@active_ingredient_bp.route('/<int:id>', methods=['DELETE'])
@require_auth
@api_error_boundary(success=False, message='{error}')
def delete_active_ingredient(user, id):
    db = SessionLocal()
    try:
        item = db.query(ActiveIngredient).filter(ActiveIngredient.id == id).first()
        if not item:
            return jsonify({'success': False, 'message': 'Không tìm thấy hoạt chất'}), 404
            
        item.is_active = False
        db.commit()
        emit_inventory_changed('active_ingredient_deleted', entity='active_ingredient', entity_id=item.id)
        
        return jsonify({'success': True})
    finally:
        db.close()

@active_ingredient_bp.route('/template', methods=['GET'])
@require_auth
@api_error_boundary(success=False, message='{error}')
def download_template(user):
    df = pd.DataFrame({
        'Tên hoạt chất (Bắt buộc)': ['Paracetamol', 'Ibuprofen'],
        'Mô tả': ['Giảm đau, hạ sốt', 'Kháng viêm không steroid']
    })
        
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='HoatChat')
            
        # Formatting
        worksheet = writer.sheets['HoatChat']
        worksheet.column_dimensions['A'].width = 35
        worksheet.column_dimensions['B'].width = 50
            
    output.seek(0)
    return send_file(
        output,
        as_attachment=True,
        download_name='hoat_chat_mau.xlsx',
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )

def _upsert_imported_active_ingredient(added_count, db, mo_ta, skipped_count, ten_hoat_chat):
    existing = db.query(ActiveIngredient).filter(ActiveIngredient.ten_hoat_chat.ilike(ten_hoat_chat)).first()
    if existing:
        if not existing.is_active:
            existing.is_active = True
            if mo_ta:
                existing.mo_ta = mo_ta
            added_count += 1
        else:
            skipped_count += 1
    else:
        new_item = ActiveIngredient(
            ten_hoat_chat=ten_hoat_chat,
            mo_ta=mo_ta
        )
        db.add(new_item)
        added_count += 1
    return added_count, skipped_count


@active_ingredient_bp.route('/import', methods=['POST'])
@require_auth
@api_error_boundary(success=False, message='Lỗi khi xử lý file: {error}')
def import_excel(user):
    db = SessionLocal()
    try:
        file, upload_error = catalog_excel_upload()
        if upload_error:
            return upload_error
            
        df = pd.read_excel(file)
        
        cols = df.columns.tolist()
        name_col = next((c for c in cols if 'tên hoạt chất' in str(c).lower() or 'hoạt chất' in str(c).lower()), None)
        desc_col = next((c for c in cols if 'mô tả' in str(c).lower()), None)
        
        if not name_col:
            return jsonify({'success': False, 'message': 'File không đúng định dạng. Thiếu cột Tên hoạt chất.'}), 400
            
        added_count = 0
        skipped_count = 0
        
        for _, row in df.iterrows():
            ten_hoat_chat = str(row[name_col]).strip() if pd.notna(row[name_col]) else ''
            if not ten_hoat_chat or ten_hoat_chat.lower() == 'nan':
                continue
                
            mo_ta = str(row[desc_col]).strip() if desc_col and pd.notna(row[desc_col]) else ''
            if mo_ta.lower() == 'nan':
                mo_ta = ''
                
            added_count, skipped_count = _upsert_imported_active_ingredient(added_count, db, mo_ta, skipped_count, ten_hoat_chat)
                
        db.commit()
        emit_inventory_changed('active_ingredients_imported', entity='active_ingredient', extra={
            'added_count': added_count,
            'skipped_count': skipped_count,
        })
        return jsonify({
            'success': True,
            'message': f'Đã thêm/khôi phục {added_count} hoạt chất. Bỏ qua {skipped_count} hoạt chất trùng lặp.'
        })
    finally:
        db.close()
