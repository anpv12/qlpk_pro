from flask import Blueprint, request, jsonify
from app.core.database import get_db
from app.models.province import Province
from app.models.district import District
from app.models.ward import Ward
from app.models.administrative_region import AdministrativeRegion
from app.models.administrative_unit import AdministrativeUnit
from app.api.auth import require_auth
from app.realtime.events import emit_catalog_changed
from app.utils.search_normalization import normalize_search_text, normalized_contains
import requests
import logging
from app.utils.api_error_contract import api_error_boundary

logger = logging.getLogger(__name__)

vietnam_address_bp = Blueprint('vietnam_address', __name__)

# --- New 2-Level API Endpoints (AddressKit Standard) ---

@vietnam_address_bp.route('/vietnam-address/regions', methods=['GET'])
@api_error_boundary(success=False, detail='Internal server error')
def get_regions():
    """Lấy danh sách Tỉnh/Thành phố (Cấp 1)"""
    try:
        db = next(get_db())
        search = request.args.get('search', '')
        
        query = db.query(AdministrativeRegion)
        
        if search:
            query = query.filter(normalized_contains(AdministrativeRegion.name, search))
        
        regions = query.order_by(AdministrativeRegion.name).all()
        result = [region.to_dict() for region in regions]
        
        # Fallback: Nếu bảng mới chưa có dữ liệu, lấy từ bảng cũ nhưng trả về format mới
        if not result:
            logger.info("AdministrativeRegion empty, falling back to Province table")
            provinces = db.query(Province).order_by(Province.name).all()
            result = [{
                'code': p.code,
                'name': p.name,
                'name_en': p.name_en,
                'administrative_level': 'Tỉnh' # Giả định
            } for p in provinces]

        return jsonify({
            'success': True,
            'data': result
        }), 200
    finally:
        db.close()

@vietnam_address_bp.route('/vietnam-address/regions/<region_code>/units', methods=['GET'])
@api_error_boundary(success=False, detail='Internal server error')
def get_units_by_region(region_code):
    """Lấy danh sách Đơn vị hành chính (Cấp 2) theo Tỉnh"""
    try:
        db = next(get_db())
        search = request.args.get('search', '')
        
        query = db.query(AdministrativeUnit).filter(AdministrativeUnit.province_code == region_code)
        
        if search:
            query = query.filter(normalized_contains(AdministrativeUnit.name, search))
        
        units = query.order_by(AdministrativeUnit.name).all()
        result = [unit.to_dict() for unit in units]
        
        return jsonify({
            'success': True,
            'data': result
        }), 200
    finally:
        db.close()

@vietnam_address_bp.route('/vietnam-address/sync-addresskit', methods=['POST'])
@require_auth
@api_error_boundary(success=False, detail='{error}')
def sync_address_kit_data(user):
    """Đồng bộ dữ liệu từ AddressKit (bảng 2 cấp)"""
    try:
        db = next(get_db())
        
        # 1. Sync Provinces (Regions)
        logger.info("Syncing Regions from AddressKit...")
        resp = requests.get("https://production.cas.so/address-kit/latest/provinces")
        if resp.status_code != 200:
             return jsonify({'success': False, 'detail': 'Failed to fetch provinces from AddressKit'}), 502
        
        data = resp.json() 
        # Cấu trúc trả về: {"requestId": "...", "provinces": [...]}
        provinces_list = data.get('provinces', [])
        
        region_count = 0
        unit_count = 0
        
        for p_data in provinces_list:
            p_code = p_data['code']
            
            # Upsert Region
            region = db.query(AdministrativeRegion).filter(AdministrativeRegion.code == p_code).first()
            if not region:
                region = AdministrativeRegion(code=p_code)
                db.add(region)
            
            region.name = p_data['name']
            region.name_en = p_data.get('englishName', '')
            region.administrative_level = p_data.get('administrativeLevel', '')
            region_count += 1
            
            # 2. Sync Units (Communes - Level 2 direct under Province)
            # URL: /latest/provinces/{code}/communes
            units_url = f"https://production.cas.so/address-kit/latest/provinces/{p_code}/communes"
            u_resp = requests.get(units_url)
            
            if u_resp.status_code == 200:
                u_data = u_resp.json()
                communes_list = u_data.get('communes', [])
                
                for c_data in communes_list:
                    # c_data mẫu: {"code":"00004", "name":"Phường Ba Đình", "provinceCode":"01", ...}
                    c_code = c_data['code']
                    
                    unit = db.query(AdministrativeUnit).filter(AdministrativeUnit.code == c_code).first()
                    if not unit:
                        unit = AdministrativeUnit(code=c_code)
                        db.add(unit)
                    
                    unit.name = c_data['name']
                    unit.name_en = c_data.get('englishName', '')
                    unit.administrative_level = c_data.get('administrativeLevel', '')
                    unit.province_code = p_code  # Link to parent
                    unit_count += 1
            
            # Commit từng tỉnh để tránh transaction quá lớn
            db.commit()
        emit_catalog_changed('addresskit_synced', entity='vietnam_address', extra={
            'regions': region_count,
            'units': unit_count,
        })
            
        return jsonify({
            'success': True, 
            'message': f'Synced {region_count} regions and {unit_count} units from AddressKit',
            'data': {'regions': region_count, 'units': unit_count}
        }), 200

    finally:
        db.close()


# --- Old 3-Level API Endpoints (Kept for compatibility) ---

@vietnam_address_bp.route('/vietnam-address/provinces', methods=['GET'])
@api_error_boundary(success=False, detail='Internal server error')
def get_provinces():
    """Lấy danh sách tỉnh/thành phố"""
    try:
        db = next(get_db())
        
        # Get query parameters
        search = request.args.get('search', '')
        
        # Build query
        query = db.query(Province)
        
        # Apply search filter
        if search:
            query = query.filter(normalized_contains(Province.name, search))
        
        # Order by name
        provinces = query.order_by(Province.name).all()
        
        result = [province.to_dict() for province in provinces]
        
        return jsonify({
            'success': True,
            'data': result
        }), 200
        
    finally:
        db.close()

@vietnam_address_bp.route('/vietnam-address/districts', methods=['GET'])
@api_error_boundary(success=False, detail='Internal server error')
def get_districts_by_province_name():
    """Lấy danh sách quận/huyện theo tên tỉnh/thành phố (query parameter)"""
    try:
        db = next(get_db())
        
        # Get query parameters
        province_name = request.args.get('province', '').strip()
        search = request.args.get('search', '')
        
        if not province_name:
            return jsonify({
                'success': False,
                'detail': 'Thiếu tham số province'
            }), 400
        
        # Find province by name
        province = db.query(Province).filter(normalized_contains(Province.name, province_name)).first()
        if not province:
            return jsonify({
                'success': False,
                'detail': f'Không tìm thấy tỉnh/thành phố: {province_name}'
            }), 404
        
        # Build query for districts
        query = db.query(District).filter(District.province_code == province.code)
        
        # Apply search filter
        if search:
            query = query.filter(normalized_contains(District.name, search))
        
        # Order by name
        districts = query.order_by(District.name).all()
        
        result = [district.to_dict() for district in districts]
        
        return jsonify({
            'success': True,
            'data': result
        }), 200
        
    finally:
        db.close()

@vietnam_address_bp.route('/vietnam-address/districts/<province_code>', methods=['GET'])
@api_error_boundary(success=False, detail='Internal server error')
def get_districts_by_province_code(province_code):
    """Lấy danh sách quận/huyện theo tỉnh/thành phố"""
    try:
        db = next(get_db())
        
        # Get query parameters
        search = request.args.get('search', '')
        
        # Build query
        query = db.query(District).filter(District.province_code == province_code)
        
        # Apply search filter
        if search:
            query = query.filter(normalized_contains(District.name, search))
        
        # Order by name
        districts = query.order_by(District.name).all()
        
        result = [district.to_dict() for district in districts]
        
        return jsonify({
            'success': True,
            'data': result
        }), 200
        
    finally:
        db.close()

@vietnam_address_bp.route('/vietnam-address/wards', methods=['GET'])
@api_error_boundary(success=False, detail='Internal server error')
def get_wards_by_district_name():
    """Lấy danh sách phường/xã theo tên quận/huyện (query parameter)"""
    try:
        db = next(get_db())
        
        # Get query parameters
        province_name = request.args.get('province', '').strip()
        district_name = request.args.get('district', '').strip()
        search = request.args.get('search', '')
        
        if not district_name:
            return jsonify({
                'success': False,
                'detail': 'Thiếu tham số district'
            }), 400
        
        # Find district by name
        district_query = db.query(District).filter(normalized_contains(District.name, district_name))
        
        # If province is provided, filter by province
        if province_name:
            province = db.query(Province).filter(normalized_contains(Province.name, province_name)).first()
            if province:
                district_query = district_query.filter(District.province_code == province.code)
        
        district = district_query.first()
        if not district:
            return jsonify({
                'success': False,
                'detail': f'Không tìm thấy quận/huyện: {district_name}'
            }), 404
        
        # Build query for wards
        query = db.query(Ward).filter(Ward.district_code == district.code)
        
        # Apply search filter
        if search:
            query = query.filter(normalized_contains(Ward.name, search))
        
        # Order by name
        wards = query.order_by(Ward.name).all()
        
        result = [ward.to_dict() for ward in wards]
        
        return jsonify({
            'success': True,
            'data': result
        }), 200
        
    finally:
        db.close()

@vietnam_address_bp.route('/vietnam-address/wards/<district_code>', methods=['GET'])
@api_error_boundary(success=False, detail='Internal server error')
def get_wards_by_district_code(district_code):
    """Lấy danh sách phường/xã theo quận/huyện"""
    try:
        db = next(get_db())
        
        # Get query parameters
        search = request.args.get('search', '')
        
        # Build query
        query = db.query(Ward).filter(Ward.district_code == district_code)
        
        # Apply search filter
        if search:
            query = query.filter(normalized_contains(Ward.name, search))
        
        # Order by name
        wards = query.order_by(Ward.name).all()
        
        result = [ward.to_dict() for ward in wards]
        
        return jsonify({
            'success': True,
            'data': result
        }), 200
        
    finally:
        db.close()

# Tra cứu phường/xã theo tên để suy ra quận/huyện (và đối chiếu theo tỉnh nếu truyền vào)
@vietnam_address_bp.route('/vietnam-address/ward-by-name', methods=['GET'])
@api_error_boundary(success=False, detail='Internal server error')
def get_ward_by_name():
    """Tìm phường/xã theo tên. Tham số: name (bắt buộc), province (tuỳ chọn, tên tỉnh/thành phố)
    Trả về: ward {code, name, district_code} và district {code, name, province_code}
    """
    try:
        name = request.args.get('name', '').strip()
        province_name = request.args.get('province', '').strip()
        if not name:
            return jsonify({'success': False, 'detail': 'Thiếu tham số name'}), 400

        db = next(get_db())

        # Tìm tất cả phường/xã trùng tên (không phân biệt hoa thường)
        wards = db.query(Ward).filter(normalized_contains(Ward.name, name)).all()
        if not wards:
            return jsonify({'success': True, 'data': None}), 200

        # Nếu có tham số province, ưu tiên bản ghi thuộc tỉnh đó
        selected = None
        if province_name:
            for w in wards:
                d = db.query(District).filter(District.code == w.district_code).first()
                if not d:
                    continue
                p = db.query(Province).filter(Province.code == d.province_code).first()
                if p and p.name and normalize_search_text(p.name) == normalize_search_text(province_name):
                    selected = (w, d, p)
                    break

        # Nếu không tìm thấy theo tỉnh, lấy bản ghi đầu tiên
        if not selected:
            w = wards[0]
            d = db.query(District).filter(District.code == w.district_code).first()
            p = db.query(Province).filter(Province.code == d.province_code).first() if d else None
            selected = (w, d, p)

        w, d, p = selected
        return jsonify({
            'success': True,
            'data': {
                'ward': {
                    'code': w.code,
                    'name': w.name,
                    'district_code': w.district_code
                },
                'district': {
                    'code': d.code if d else None,
                    'name': d.name if d else None,
                    'province_code': d.province_code if d else None
                },
                'province': {
                    'code': p.code if p else None,
                    'name': p.name if p else None
                }
            }
        }), 200
    finally:
        try:
            db.close()
        except Exception as exc:
            logger.warning('Không đóng được session DB: %s', exc)

def _import_wards(base_url, db):
    # 3. Lấy danh sách phường/xã
    logger.info("Đang lấy danh sách phường/xã...")
    wards_response = requests.get(f"{base_url}w/")
    wards_data = wards_response.json()

    ward_count = 0
    for ward_data in wards_data:
        # Kiểm tra xem phường/xã đã tồn tại chưa
        existing_ward = db.query(Ward).filter(Ward.code == ward_data['code']).first()
        if not existing_ward:
            ward = Ward(
                code=ward_data['code'],
                name=ward_data['name'],
                name_en=ward_data.get('name_en'),
                full_name=ward_data.get('full_name'),
                full_name_en=ward_data.get('full_name_en'),
                code_name=ward_data.get('code_name'),
                district_code=ward_data['district_code'],
                administrative_unit_id=ward_data.get('administrative_unit_id')
            )
            db.add(ward)
            ward_count += 1

    db.commit()
    logger.info(f"Đã import {ward_count} phường/xã")
    return ward_count


def _import_districts(base_url, db):
    # 2. Lấy danh sách quận/huyện
    logger.info("Đang lấy danh sách quận/huyện...")
    districts_response = requests.get(f"{base_url}d/")
    districts_data = districts_response.json()

    district_count = 0
    for district_data in districts_data:
        # Kiểm tra xem quận/huyện đã tồn tại chưa
        existing_district = db.query(District).filter(District.code == district_data['code']).first()
        if not existing_district:
            district = District(
                code=district_data['code'],
                name=district_data['name'],
                name_en=district_data.get('name_en'),
                full_name=district_data.get('full_name'),
                full_name_en=district_data.get('full_name_en'),
                code_name=district_data.get('code_name'),
                province_code=district_data['province_code'],
                administrative_unit_id=district_data.get('administrative_unit_id')
            )
            db.add(district)
            district_count += 1

    db.commit()
    logger.info(f"Đã import {district_count} quận/huyện")
    return district_count


@vietnam_address_bp.route('/vietnam-address/import-data', methods=['POST'])
@require_auth
@api_error_boundary(success=False, detail='Lỗi khi import dữ liệu: {error}')
def import_address_data(user):
    """Cào và import dữ liệu địa chỉ từ Province Open API"""
    try:
        db = next(get_db())
        
        # API endpoint
        base_url = "https://provinces.open-api.vn/api/"
        
        # 1. Lấy danh sách tỉnh/thành phố
        logger.info("Đang lấy danh sách tỉnh/thành phố...")
        provinces_response = requests.get(f"{base_url}p/")
        provinces_data = provinces_response.json()
        
        province_count = 0
        for province_data in provinces_data:
            # Kiểm tra xem tỉnh đã tồn tại chưa
            existing_province = db.query(Province).filter(Province.code == province_data['code']).first()
            if not existing_province:
                province = Province(
                    code=province_data['code'],
                    name=province_data['name'],
                    name_en=province_data.get('name_en'),
                    full_name=province_data.get('full_name'),
                    full_name_en=province_data.get('full_name_en'),
                    code_name=province_data.get('code_name'),
                    administrative_unit_id=province_data.get('administrative_unit_id'),
                    administrative_region_id=province_data.get('administrative_region_id')
                )
                db.add(province)
                province_count += 1
        
        db.commit()
        logger.info(f"Đã import {province_count} tỉnh/thành phố")
        
        district_count = _import_districts(base_url, db)
        
        ward_count = _import_wards(base_url, db)
        emit_catalog_changed('vietnam_address_imported', entity='vietnam_address', extra={
            'provinces': province_count,
            'districts': district_count,
            'wards': ward_count,
        })
        
        return jsonify({
            'success': True,
            'message': f'Đã import thành công: {province_count} tỉnh/thành phố, {district_count} quận/huyện, {ward_count} phường/xã',
            'data': {
                'provinces': province_count,
                'districts': district_count,
                'wards': ward_count
            }
        }), 200
        
    finally:
        db.close()
