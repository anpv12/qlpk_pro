#!/usr/bin/env python3
"""
Migration script: Convert đơn vị tính từ tiếng Anh sang tiếng Việt trong database.

Chạy:
    python scripts/migrate_medicine_units_to_vietnamese.py
"""

import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from app.core.database import SessionLocal
from app.models.medicine import Medicine


# Mapping từ tiếng Anh sang tiếng Việt
UNIT_MAPPING = {
    # Đơn vị dùng
    'tablet': 'viên',
    'tablets': 'viên',
    'pill': 'viên',
    'pills': 'viên',
    'capsule': 'viên nang',
    'capsules': 'viên nang',
    'cap': 'viên nang',
    'vial': 'lọ',
    'vials': 'lọ',
    'bottle': 'chai',
    'bottles': 'chai',
    'jar': 'lọ',
    'jars': 'lọ',
    'pack': 'gói',
    'packet': 'gói',
    'packets': 'gói',
    'sachet': 'gói',
    'sachets': 'gói',
    'tube': 'tuýp',
    'tubes': 'tuýp',
    'ampoule': 'ống',
    'ampoules': 'ống',
    'syringe': 'bơm tiêm',
    'syringes': 'bơm tiêm',
    'strip': 'vỉ',
    'strips': 'vỉ',
    'blister': 'vỉ',
    'blisters': 'vỉ',
    'box': 'hộp',
    'boxes': 'hộp',
    'drop': 'giọt',
    'drops': 'giọt',
    'patch': 'miếng dán',
    'patches': 'miếng dán',
    # Đơn vị đo lường
    'milliliter': 'ml',
    'millilitre': 'ml',
    'milligram': 'mg',
    'milligrams': 'mg',
    'microgram': 'mcg',
    'micrograms': 'mcg',
    'gram': 'g',
    'grams': 'g',
    'liter': 'lít',
    'litre': 'lít',
    'l': 'lít',
    # Các đơn vị khác
    'dose': 'liều',
    'bag': 'túi',
    'kit': 'dụng cụ',
    'piece': 'miếng',
    'pen': 'bút tiêm',
    'sheet': 'vỉ'
}


def convert_unit(unit_value):
    """
    Convert đơn vị tính từ tiếng Anh sang tiếng Việt.
    Nếu đã là tiếng Việt hoặc không có trong mapping, return nguyên giá trị.
    """
    if not unit_value:
        return unit_value
    
    unit_lower = unit_value.lower().strip()
    
    # Nếu đã là tiếng Việt, return trực tiếp
    vietnamese_units = [
        'viên', 'chai', 'gói', 'tuýp', 'ống', 'vỉ', 'hộp', 'lọ', 'giọt',
        'viên nang', 'miếng dán', 'bơm tiêm', 'liều', 'túi', 'dụng cụ',
        'lít', 'miếng', 'bút tiêm', 'ml', 'g', 'mg', 'mcg'
    ]
    if unit_lower in vietnamese_units:
        return unit_value
    
    # Convert từ tiếng Anh sang tiếng Việt
    return UNIT_MAPPING.get(unit_lower, unit_value)


def migrate():
    """Migration: Convert đơn vị tính từ tiếng Anh sang tiếng Việt"""
    session = SessionLocal()
    updated_unit_count = 0
    updated_packaging_unit_count = 0
    updated_storage_unit_count = 0
    skipped_count = 0
    
    try:
        # Lấy tất cả medicines
        medicines = session.query(Medicine).all()
        
        print(f"📊 Tìm thấy {len(medicines)} thuốc trong database...")
        print("🔄 Đang convert đơn vị tính...\n")
        
        for medicine in medicines:
            updated = False
            
            # Convert unit (đơn vị bán)
            if medicine.unit:
                original_unit = medicine.unit
                converted_unit = convert_unit(medicine.unit)
                if converted_unit != original_unit:
                    medicine.unit = converted_unit
                    updated = True
                    updated_unit_count += 1
                    print(f"  ✓ ID {medicine.id} ({medicine.name[:30]}...): '{original_unit}' → '{converted_unit}'")
            
            # Convert packaging_unit (đơn vị đóng gói)
            if medicine.packaging_unit:
                original_packaging_unit = medicine.packaging_unit
                converted_packaging_unit = convert_unit(medicine.packaging_unit)
                if converted_packaging_unit != original_packaging_unit:
                    medicine.packaging_unit = converted_packaging_unit
                    updated = True
                    updated_packaging_unit_count += 1
                    print(f"  ✓ ID {medicine.id} ({medicine.name[:30]}...): packaging_unit '{original_packaging_unit}' → '{converted_packaging_unit}'")
            
            # Convert storage_unit (đơn vị lưu kho)
            if medicine.storage_unit:
                original_storage_unit = medicine.storage_unit
                converted_storage_unit = convert_unit(medicine.storage_unit)
                if converted_storage_unit != original_storage_unit:
                    medicine.storage_unit = converted_storage_unit
                    updated = True
                    updated_storage_unit_count += 1
                    print(f"  ✓ ID {medicine.id} ({medicine.name[:30]}...): storage_unit '{original_storage_unit}' → '{converted_storage_unit}'")
            
            if not updated:
                skipped_count += 1
        
        # Commit tất cả thay đổi
        session.commit()
        
        print("\n" + "="*60)
        print("✅ Migration hoàn tất!")
        print("="*60)
        print(f"📈 Thống kê:")
        print(f"   - Đã convert 'unit': {updated_unit_count} bản ghi")
        print(f"   - Đã convert 'packaging_unit': {updated_packaging_unit_count} bản ghi")
        print(f"   - Đã convert 'storage_unit': {updated_storage_unit_count} bản ghi")
        print(f"   - Bỏ qua (đã là tiếng Việt hoặc không cần convert): {skipped_count} bản ghi")
        print(f"   - Tổng cộng: {len(medicines)} bản ghi")
        
    except Exception as exc:
        session.rollback()
        print(f"\n❌ Lỗi: {exc}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        session.close()


if __name__ == "__main__":
    print("="*60)
    print("🚀 Bắt đầu migration: Convert đơn vị tính sang tiếng Việt")
    print("="*60)
    print()
    
    # Xác nhận từ người dùng
    response = input("Bạn có chắc chắn muốn chạy migration này? (yes/no): ")
    if response.lower() not in ['yes', 'y']:
        print("❌ Migration đã bị hủy.")
        sys.exit(0)
    
    print()
    migrate()

