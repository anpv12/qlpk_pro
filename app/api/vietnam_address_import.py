"""vietnam_address helpers split out by topic (import); re-exported by app.api.vietnam_address."""

import logging
from app.models.district import District
from app.models.ward import Ward
import requests

logger = logging.getLogger('app.api.vietnam_address')


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
