from flask import Blueprint, request, jsonify, send_file
from app.core.database import SessionLocal
from app.models.drug_interaction import DrugInteraction
from app.models.medicine import Medicine
from app.api.auth import require_auth
from app.realtime.events import emit_inventory_changed
from itertools import combinations
from sqlalchemy import or_
import pandas as pd
import io

drug_interaction_bp = Blueprint('drug_interaction', __name__)

def _normalize_hoat_chat(hc1, hc2):
    """Chuẩn hóa và sắp xếp Alphabet để tránh trùng lặp 2 chiều"""
    hc1 = (hc1 or '').strip()
    hc2 = (hc2 or '').strip()
    return sorted([hc1, hc2])

@drug_interaction_bp.route('/drug-interactions', methods=['GET'])
@require_auth
def get_drug_interactions(user):
    """Lấy danh sách tương tác thuốc (theo hoạt chất)"""
    db = SessionLocal()
    try:
        interactions = db.query(DrugInteraction)\
            .order_by(DrugInteraction.id.desc())\
            .all()
        return jsonify([i.to_dict() for i in interactions])
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        db.close()


@drug_interaction_bp.route('/drug-interactions/active-ingredients', methods=['GET'])
@require_auth
def get_active_ingredients(user):
    """Lấy danh sách hoạt chất unique từ danh mục hoạt chất"""
    db = SessionLocal()
    try:
        from app.models.active_ingredient import ActiveIngredient
        ingredients_db = db.query(ActiveIngredient).filter(ActiveIngredient.is_active == True).all()
        ingredients = sorted([i.ten_hoat_chat.strip() for i in ingredients_db if i.ten_hoat_chat])
        return jsonify(ingredients)
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        db.close()


@drug_interaction_bp.route('/drug-interactions', methods=['POST'])
@require_auth
def create_drug_interaction(user):
    """Thêm tương tác thuốc mới"""
    db = SessionLocal()
    try:
        data = request.get_json()
        hc1 = data.get('hoat_chat_1')
        hc2 = data.get('hoat_chat_2')

        if not hc1 or not hc2:
            return jsonify({'error': 'Cần chọn đủ 2 hoạt chất'}), 400

        hc1, hc2 = _normalize_hoat_chat(hc1, hc2)

        if hc1.lower() == hc2.lower():
            return jsonify({'error': 'Không thể tạo tương tác với cùng 1 hoạt chất'}), 400

        # Kiểm tra trùng lặp
        existing = db.query(DrugInteraction).filter(
            (DrugInteraction.hoat_chat_1 == hc1) & (DrugInteraction.hoat_chat_2 == hc2)
        ).first()

        if existing:
            return jsonify({'error': 'Cặp tương tác hoạt chất này đã tồn tại'}), 400

        interaction = DrugInteraction(
            hoat_chat_1=hc1,
            hoat_chat_2=hc2,
            interaction_type=data.get('interaction_type', 'contraindicated'),
            consequence=data.get('consequence', ''),
            mechanism=data.get('mechanism', ''),
            management=data.get('management', ''),
            notes=data.get('notes', '')
        )
        db.add(interaction)
        db.commit()
        db.refresh(interaction)
        emit_inventory_changed('drug_interaction_created', entity='drug_interaction', entity_id=interaction.id)

        return jsonify(interaction.to_dict()), 201
    except Exception as e:
        db.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        db.close()


@drug_interaction_bp.route('/drug-interactions/<int:interaction_id>', methods=['PUT'])
@require_auth
def update_drug_interaction(user, interaction_id):
    """Cập nhật tương tác thuốc"""
    db = SessionLocal()
    try:
        interaction = db.query(DrugInteraction).get(interaction_id)
        if not interaction:
            return jsonify({'error': 'Không tìm thấy'}), 404

        data = request.get_json()
        hc1 = data.get('hoat_chat_1', interaction.hoat_chat_1)
        hc2 = data.get('hoat_chat_2', interaction.hoat_chat_2)

        hc1, hc2 = _normalize_hoat_chat(hc1, hc2)

        if hc1.lower() == hc2.lower():
            return jsonify({'error': 'Không thể tạo tương tác với cùng 1 hoạt chất'}), 400

        # Kiểm tra trùng lặp, loại trừ bản ghi hiện tại
        existing = db.query(DrugInteraction).filter(
            DrugInteraction.id != interaction_id,
            DrugInteraction.hoat_chat_1 == hc1,
            DrugInteraction.hoat_chat_2 == hc2
        ).first()

        if existing:
            return jsonify({'error': 'Cặp tương tác hoạt chất này đã tồn tại'}), 400

        interaction.hoat_chat_1 = hc1
        interaction.hoat_chat_2 = hc2
        interaction.interaction_type = data.get('interaction_type', interaction.interaction_type)
        interaction.consequence = data.get('consequence', interaction.consequence)
        interaction.mechanism = data.get('mechanism', interaction.mechanism)
        interaction.management = data.get('management', interaction.management)
        interaction.notes = data.get('notes', interaction.notes)

        db.commit()
        db.refresh(interaction)
        emit_inventory_changed('drug_interaction_updated', entity='drug_interaction', entity_id=interaction.id)

        return jsonify(interaction.to_dict())
    except Exception as e:
        db.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        db.close()


@drug_interaction_bp.route('/drug-interactions/<int:interaction_id>', methods=['DELETE'])
@require_auth
def delete_drug_interaction(user, interaction_id):
    """Xóa tương tác thuốc"""
    db = SessionLocal()
    try:
        interaction = db.query(DrugInteraction).get(interaction_id)
        if not interaction:
            return jsonify({'error': 'Không tìm thấy'}), 404

        db.delete(interaction)
        db.commit()
        emit_inventory_changed('drug_interaction_deleted', entity='drug_interaction', entity_id=interaction_id)
        return jsonify({'message': 'Đã xóa'}), 200
    except Exception as e:
        db.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        db.close()


@drug_interaction_bp.route('/drug-interactions/check', methods=['POST'])
@require_auth
def check_drug_interactions(user):
    """
    Kiểm tra tương tác thuốc cho danh sách thuốc trong đơn.
    Input: { "medicine_ids": [1, 2, 3, ...] }
    """
    db = SessionLocal()
    try:
        data = request.get_json()
        medicine_ids = data.get('medicine_ids', [])

        if len(medicine_ids) < 2:
            return jsonify([])

        # Trích xuất generic_name từ danh sách medicine_ids
        medicines = db.query(Medicine).filter(Medicine.id.in_(medicine_ids)).all()
        
        # Chỉ lấy các thuốc có generic_name
        active_ingredients = set()
        for med in medicines:
            if med.generic_name and med.generic_name.strip():
                active_ingredients.add(med.generic_name.strip())

        active_ingredients = list(active_ingredients)

        if len(active_ingredients) < 2:
            return jsonify([])

        # Tổ hợp chập 2 các hoạt chất
        pairs = list(combinations(active_ingredients, 2))

        # Query tương tác khớp với các cặp
        conditions = []
        for hc_a, hc_b in pairs:
            # Sắp xếp để query chính xác vì trong DB cũng lưu theo thứ tự Alphabet
            sorted_hc = sorted([hc_a, hc_b])
            conditions.append(
                (DrugInteraction.hoat_chat_1 == sorted_hc[0]) & 
                (DrugInteraction.hoat_chat_2 == sorted_hc[1])
            )

        interactions = db.query(DrugInteraction).filter(or_(*conditions)).all()

        # Vì kết quả trả về không còn chứa thông tin sản phẩm thuốc (chỉ chứa hoạt chất)
        # Frontend sẽ tự lo việc map hoạt chất -> tên thuốc để hiển thị cho bác sĩ
        return jsonify([i.to_dict() for i in interactions])
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        db.close()


@drug_interaction_bp.route('/drug-interactions/template', methods=['GET'])
@require_auth
def download_di_template(user):
    """Xuất toàn bộ dữ liệu tương tác thuốc hiện có thành file Excel mẫu"""
    db = SessionLocal()
    try:
        interactions = db.query(DrugInteraction).order_by(DrugInteraction.hoat_chat_1).all()

        type_map = {
            'contraindicated': 'Chống chỉ định',
            'approved': 'Được đồng thuận'
        }

        rows = []
        for i in interactions:
            rows.append({
                'Hoạt chất 1 (Bắt buộc)': i.hoat_chat_1 or '',
                'Hoạt chất 2 (Bắt buộc)': i.hoat_chat_2 or '',
                'Loại tương tác': type_map.get(i.interaction_type, i.interaction_type or ''),
                'Hậu quả': i.consequence or '',
                'Cơ chế tương tác': i.mechanism or '',
                'Cách xử trí': i.management or '',
                'Ghi chú': i.notes or ''
            })

        if not rows:
            rows.append({
                'Hoạt chất 1 (Bắt buộc)': 'Paracetamol',
                'Hoạt chất 2 (Bắt buộc)': 'Warfarin',
                'Loại tương tác': 'Chống chỉ định',
                'Hậu quả': 'Tăng nguy cơ chảy máu',
                'Cơ chế tương tác': 'Ức chế chuyển hóa',
                'Cách xử trí': 'Theo dõi INR',
                'Ghi chú': ''
            })

        df = pd.DataFrame(rows)

        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='TuongTacThuoc')
            worksheet = writer.sheets['TuongTacThuoc']
            worksheet.column_dimensions['A'].width = 25
            worksheet.column_dimensions['B'].width = 25
            worksheet.column_dimensions['C'].width = 20
            worksheet.column_dimensions['D'].width = 35
            worksheet.column_dimensions['E'].width = 35
            worksheet.column_dimensions['F'].width = 35
            worksheet.column_dimensions['G'].width = 25

        output.seek(0)
        return send_file(
            output,
            as_attachment=True,
            download_name='tuong_tac_thuoc.xlsx',
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        db.close()


@drug_interaction_bp.route('/drug-interactions/import', methods=['POST'])
@require_auth
def import_di_excel(user):
    """Import dữ liệu tương tác thuốc từ file Excel"""
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

        # Tìm cột theo tên
        hc1_col = next((c for c in cols if 'hoạt chất 1' in str(c).lower()), None)
        hc2_col = next((c for c in cols if 'hoạt chất 2' in str(c).lower()), None)
        type_col = next((c for c in cols if 'loại' in str(c).lower() and 'tương tác' in str(c).lower()), None)
        consequence_col = next((c for c in cols if 'hậu quả' in str(c).lower()), None)
        mechanism_col = next((c for c in cols if 'cơ chế' in str(c).lower()), None)
        management_col = next((c for c in cols if 'xử trí' in str(c).lower()), None)
        notes_col = next((c for c in cols if 'ghi chú' in str(c).lower()), None)

        if not hc1_col or not hc2_col:
            return jsonify({'success': False, 'message': 'File không đúng định dạng. Thiếu cột Hoạt chất 1 hoặc Hoạt chất 2.'}), 400

        type_map_reverse = {
            'chống chỉ định': 'contraindicated',
            'được đồng thuận': 'approved'
        }

        added_count = 0
        skipped_count = 0

        def safe_str(val):
            if pd.isna(val):
                return ''
            s = str(val).strip()
            return '' if s.lower() == 'nan' else s

        for index, row in df.iterrows():
            hc1_raw = safe_str(row[hc1_col])
            hc2_raw = safe_str(row[hc2_col])

            if not hc1_raw or not hc2_raw:
                continue

            hc1, hc2 = _normalize_hoat_chat(hc1_raw, hc2_raw)

            if hc1.lower() == hc2.lower():
                continue

            # Check duplicate
            existing = db.query(DrugInteraction).filter(
                DrugInteraction.hoat_chat_1 == hc1,
                DrugInteraction.hoat_chat_2 == hc2
            ).first()

            if existing:
                skipped_count += 1
                continue

            # Parse interaction type
            interaction_type = 'contraindicated'
            if type_col:
                type_val = safe_str(row[type_col]).lower()
                interaction_type = type_map_reverse.get(type_val, 'contraindicated')

            new_item = DrugInteraction(
                hoat_chat_1=hc1,
                hoat_chat_2=hc2,
                interaction_type=interaction_type,
                consequence=safe_str(row[consequence_col]) if consequence_col else '',
                mechanism=safe_str(row[mechanism_col]) if mechanism_col else '',
                management=safe_str(row[management_col]) if management_col else '',
                notes=safe_str(row[notes_col]) if notes_col else ''
            )
            db.add(new_item)
            added_count += 1

        db.commit()
        emit_inventory_changed('drug_interactions_imported', entity='drug_interaction', extra={
            'added_count': added_count,
            'skipped_count': skipped_count,
        })
        return jsonify({
            'success': True,
            'message': f'Đã thêm {added_count} cặp tương tác. Bỏ qua {skipped_count} cặp trùng lặp.'
        })
    except Exception as e:
        db.rollback()
        return jsonify({'success': False, 'message': f'Lỗi khi xử lý file: {str(e)}'}), 500
    finally:
        db.close()
