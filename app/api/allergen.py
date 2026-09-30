from flask import Blueprint, request, jsonify, send_file
from app.core.database import SessionLocal
from app.models.allergen import Allergen
from app.api.auth import require_auth
from app.realtime.events import emit_inventory_changed
from app.utils.search_normalization import normalized_contains
from sqlalchemy import or_
import pandas as pd
import io
from app.utils.api_error_contract import api_error_boundary

allergen_bp = Blueprint('allergen', __name__, url_prefix='/api/allergen')


@allergen_bp.route('', methods=['GET'])
@require_auth
@api_error_boundary(success=False, message='{error}')
def get_allergens(user):
    db = SessionLocal()
    try:
        search = request.args.get('search', '')
        page = int(request.args.get('page', 1))
        limit = int(request.args.get('limit', 20))
        offset = (page - 1) * limit

        query = db.query(Allergen).filter(Allergen.is_active == True)

        if search:
            query = query.filter(or_(
                normalized_contains(Allergen.ten_di_nguyen, search),
                normalized_contains(Allergen.mo_ta, search)
            ))

        total = query.count()
        items = query.order_by(Allergen.ten_di_nguyen).offset(offset).limit(limit).all()

        return jsonify({
            'success': True,
            'data': [item.to_dict() for item in items],
            'total': total,
            'page': page,
            'limit': limit
        })
    finally:
        db.close()


@allergen_bp.route('', methods=['POST'])
@require_auth
@api_error_boundary(success=False, message='{error}')
def create_allergen(user):
    db = SessionLocal()
    try:
        data = request.json
        ten_di_nguyen = data.get('ten_di_nguyen', '').strip()

        if not ten_di_nguyen:
            return jsonify({'success': False, 'message': 'Tên dị nguyên không được để trống'}), 400

        existing = db.query(Allergen).filter(Allergen.ten_di_nguyen.ilike(ten_di_nguyen)).first()
        if existing:
            if not existing.is_active:
                existing.is_active = True
                existing.mo_ta = data.get('mo_ta', existing.mo_ta)
                db.commit()
                emit_inventory_changed('allergen_restored', entity='allergen', entity_id=existing.id)
                return jsonify({'success': True, 'data': existing.to_dict()})
            return jsonify({'success': False, 'message': 'Dị nguyên này đã tồn tại'}), 400

        new_item = Allergen(
            ten_di_nguyen=ten_di_nguyen,
            mo_ta=data.get('mo_ta', '')
        )
        db.add(new_item)
        db.commit()
        db.refresh(new_item)
        emit_inventory_changed('allergen_created', entity='allergen', entity_id=new_item.id)
        return jsonify({'success': True, 'data': new_item.to_dict()})
    finally:
        db.close()


@allergen_bp.route('/<int:id>', methods=['PUT'])
@require_auth
@api_error_boundary(success=False, message='{error}')
def update_allergen(user, id):
    db = SessionLocal()
    try:
        data = request.json
        ten_di_nguyen = data.get('ten_di_nguyen', '').strip()

        if not ten_di_nguyen:
            return jsonify({'success': False, 'message': 'Tên dị nguyên không được để trống'}), 400

        item = db.query(Allergen).filter(Allergen.id == id).first()
        if not item:
            return jsonify({'success': False, 'message': 'Không tìm thấy dị nguyên'}), 404

        existing = db.query(Allergen).filter(
            Allergen.ten_di_nguyen.ilike(ten_di_nguyen),
            Allergen.id != id
        ).first()
        if existing:
            return jsonify({'success': False, 'message': 'Tên dị nguyên đã tồn tại'}), 400

        item.ten_di_nguyen = ten_di_nguyen
        if 'mo_ta' in data:
            item.mo_ta = data['mo_ta']

        db.commit()
        emit_inventory_changed('allergen_updated', entity='allergen', entity_id=item.id)
        return jsonify({'success': True, 'data': item.to_dict()})
    finally:
        db.close()


@allergen_bp.route('/<int:id>', methods=['DELETE'])
@require_auth
@api_error_boundary(success=False, message='{error}')
def delete_allergen(user, id):
    db = SessionLocal()
    try:
        item = db.query(Allergen).filter(Allergen.id == id).first()
        if not item:
            return jsonify({'success': False, 'message': 'Không tìm thấy dị nguyên'}), 404

        item.is_active = False
        db.commit()
        emit_inventory_changed('allergen_deleted', entity='allergen', entity_id=item.id)
        return jsonify({'success': True})
    finally:
        db.close()


@allergen_bp.route('/template', methods=['GET'])
@require_auth
@api_error_boundary(success=False, message='{error}')
def download_template(user):
    db = SessionLocal()
    try:
        items = db.query(Allergen).filter(Allergen.is_active == True).order_by(Allergen.ten_di_nguyen).all()
        df = pd.DataFrame([
            {'Tên dị nguyên (Bắt buộc)': item.ten_di_nguyen, 'Mô tả': item.mo_ta or ''}
            for item in items
        ])
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='DiNguyen')
            ws = writer.sheets['DiNguyen']
            ws.column_dimensions['A'].width = 40
            ws.column_dimensions['B'].width = 30
        output.seek(0)
        return send_file(
            output,
            as_attachment=True,
            download_name='di_nguyen_export.xlsx',
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
    finally:
        db.close()


@allergen_bp.route('/import', methods=['POST'])
@require_auth
@api_error_boundary(success=False, message='Lỗi khi xử lý file: {error}')
def import_excel(user):
    db = SessionLocal()
    try:
        if 'file' not in request.files:
            return jsonify({'success': False, 'message': 'Không tìm thấy file'}), 400

        file = request.files['file']
        if file.filename == '':
            return jsonify({'success': False, 'message': 'Tên file rỗng'}), 400

        if not (file.filename.endswith('.xlsx') or file.filename.endswith('.xls')):
            return jsonify({'success': False, 'message': 'Chỉ hỗ trợ định dạng Excel (.xlsx, .xls)'}), 400

        df = pd.read_excel(file)
        cols = df.columns.tolist()
        name_col = next((c for c in cols if 'dị nguyên' in str(c).lower()), None)
        desc_col = next((c for c in cols if 'mô tả' in str(c).lower()), None)

        if not name_col:
            return jsonify({'success': False, 'message': 'File không đúng định dạng. Thiếu cột Tên dị nguyên.'}), 400

        added_count = 0
        skipped_count = 0

        for _, row in df.iterrows():
            ten_di_nguyen = str(row[name_col]).strip() if pd.notna(row[name_col]) else ''
            if not ten_di_nguyen or ten_di_nguyen.lower() == 'nan':
                continue

            mo_ta = str(row[desc_col]).strip() if desc_col and pd.notna(row[desc_col]) else ''
            if mo_ta.lower() == 'nan':
                mo_ta = ''

            existing = db.query(Allergen).filter(Allergen.ten_di_nguyen.ilike(ten_di_nguyen)).first()
            if existing:
                if not existing.is_active:
                    existing.is_active = True
                    if mo_ta:
                        existing.mo_ta = mo_ta
                    added_count += 1
                else:
                    skipped_count += 1
            else:
                db.add(Allergen(ten_di_nguyen=ten_di_nguyen, mo_ta=mo_ta))
                added_count += 1

        db.commit()
        emit_inventory_changed('allergens_imported', entity='allergen', extra={
            'added_count': added_count,
            'skipped_count': skipped_count,
        })
        return jsonify({
            'success': True,
            'message': f'Đã thêm/khôi phục {added_count} dị nguyên. Bỏ qua {skipped_count} dị nguyên trùng lặp.'
        })
    finally:
        db.close()
