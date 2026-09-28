from flask import Blueprint, request, jsonify, send_file
from app.core.database import SessionLocal
from app.models.active_ingredient import ActiveIngredient
from app.api.auth import require_auth
from app.realtime.events import emit_inventory_changed
from app.utils.search_normalization import normalized_contains
import pandas as pd
import io

active_ingredient_bp = Blueprint('active_ingredient', __name__, url_prefix='/api/active-ingredient')

@active_ingredient_bp.route('', methods=['GET'])
@require_auth
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
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500
    finally:
        db.close()

@active_ingredient_bp.route('', methods=['POST'])
@require_auth
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
    except Exception as e:
        db.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500
    finally:
        db.close()

@active_ingredient_bp.route('/<int:id>', methods=['PUT'])
@require_auth
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
    except Exception as e:
        db.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500
    finally:
        db.close()

@active_ingredient_bp.route('/<int:id>', methods=['DELETE'])
@require_auth
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
    except Exception as e:
        db.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500
    finally:
        db.close()

@active_ingredient_bp.route('/template', methods=['GET'])
@require_auth
def download_template(user):
    try:
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
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@active_ingredient_bp.route('/import', methods=['POST'])
@require_auth
def import_excel(user):
    db = SessionLocal()
    try:
        if 'file' not in request.files:
            return jsonify({'success': False, 'message': 'Không tìm thấy file'}), 400
            
        file = request.files['file']
        if file.filename == '':
            return jsonify({'success': False, 'message': 'Tên file rỗng'}), 400
            
        if not file.filename.endswith('.xlsx') and not file.filename.endswith('.xls'):
            return jsonify({'success': False, 'message': 'Chỉ hỗ trợ định dạng Excel (.xlsx, .xls)'}), 400
            
        df = pd.read_excel(file)
        
        cols = df.columns.tolist()
        name_col = next((c for c in cols if 'tên hoạt chất' in str(c).lower() or 'hoạt chất' in str(c).lower()), None)
        desc_col = next((c for c in cols if 'mô tả' in str(c).lower()), None)
        
        if not name_col:
            return jsonify({'success': False, 'message': 'File không đúng định dạng. Thiếu cột Tên hoạt chất.'}), 400
            
        added_count = 0
        skipped_count = 0
        
        for index, row in df.iterrows():
            ten_hoat_chat = str(row[name_col]).strip() if pd.notna(row[name_col]) else ''
            if not ten_hoat_chat or ten_hoat_chat.lower() == 'nan':
                continue
                
            mo_ta = str(row[desc_col]).strip() if desc_col and pd.notna(row[desc_col]) else ''
            if mo_ta.lower() == 'nan':
                mo_ta = ''
                
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
                
        db.commit()
        emit_inventory_changed('active_ingredients_imported', entity='active_ingredient', extra={
            'added_count': added_count,
            'skipped_count': skipped_count,
        })
        return jsonify({
            'success': True,
            'message': f'Đã thêm/khôi phục {added_count} hoạt chất. Bỏ qua {skipped_count} hoạt chất trùng lặp.'
        })
    except Exception as e:
        db.rollback()
        return jsonify({'success': False, 'message': f'Lỗi khi xử lý file: {str(e)}'}), 500
    finally:
        db.close()
