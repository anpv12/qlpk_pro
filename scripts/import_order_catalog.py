import json
import os
import sys
from typing import List, Dict, Any

import psycopg2

# Dữ liệu bảng 8 mục cha và 75 chỉ định
ORDER_CATALOG_DATA = [
    {
        "parent_group": "Chẩn đoán hình ảnh - Thăm dò chức năng",
        "name": "CHẨN ĐOÁN HÌNH ẢNH",
        "orders": [
            {"code": "XQ01", "name": "X-quang sọ não thẳng", "unit": "Lần"},
            {"code": "XQ02", "name": "X-quang sọ não nghiêng", "unit": "Lần"},
            {"code": "XQ03", "name": "X-quang tim phổi", "unit": "Lần"},
            {"code": "CT01", "name": "CT scan não không cản quang", "unit": "Lần"},
            {"code": "CT02", "name": "CT scan não có cản quang", "unit": "Lần"},
            {"code": "MRI01", "name": "MRI não không tiêm", "unit": "Lần"},
            {"code": "MRI02", "name": "MRI não có tiêm đối quang", "unit": "Lần"},
            {"code": "MRI03", "name": "MRI cột sống cổ", "unit": "Lần"},
            {"code": "MRI04", "name": "MRI cột sống thắt lưng", "unit": "Lần"},
            {"code": "SA01", "name": "Siêu âm tổng quát", "unit": "Lần"},
            {"code": "SA02", "name": "Siêu âm tim", "unit": "Lần"},
            {"code": "SA03", "name": "Siêu âm tuyến giáp", "unit": "Lần"},
            {"code": "SA04", "name": "Siêu âm bụng", "unit": "Lần"},
        ],
    },
    {
        "parent_group": "Chẩn đoán hình ảnh - Thăm dò chức năng",
        "name": "ĐIỆN – SINH LÝ HỌC",
        "orders": [
            {"code": "ECG01", "name": "Điện tâm đồ (ECG)", "unit": "Lần"},
            {"code": "EEG01", "name": "Điện não đồ thường", "unit": "Lần"},
            {"code": "EEG02", "name": "Điện não đồ giấc ngủ", "unit": "Lần"},
            {"code": "EEG03", "name": "Video EEG", "unit": "Lần"},
            {"code": "EEG04", "name": "Điện cơ (EMG)", "unit": "Lần"},
            {"code": "EEG05", "name": "Thính lực đồ", "unit": "Lần"},
            {"code": "EEG06", "name": "Đo lưu huyết não", "unit": "Lần"},
        ],
    },
    {
        "parent_group": "Xét nghiệm",
        "name": "XÉT NGHIỆM MÁU – HÓA SINH",
        "orders": [
            {"code": "XN01", "name": "Công thức máu (CBC)", "unit": "Lần"},
            {"code": "XN02", "name": "CRP định lượng", "unit": "Lần"},
            {"code": "XN03", "name": "Ure", "unit": "Lần"},
            {"code": "XN04", "name": "Creatinin", "unit": "Lần"},
            {"code": "XN05", "name": "AST", "unit": "Lần"},
            {"code": "XN06", "name": "ALT", "unit": "Lần"},
            {"code": "XN07", "name": "GGT", "unit": "Lần"},
            {"code": "XN08", "name": "Bilirubin toàn phần", "unit": "Lần"},
            {"code": "XN09", "name": "Bilirubin trực tiếp", "unit": "Lần"},
            {"code": "XN10", "name": "Glucose", "unit": "Lần"},
            {"code": "XN11", "name": "HbA1c", "unit": "Lần"},
            {"code": "XN12", "name": "Điện giải đồ (Na, K, Cl)", "unit": "Lần"},
            {"code": "XN13", "name": "Canxi toàn phần", "unit": "Lần"},
            {"code": "XN14", "name": "Magie", "unit": "Lần"},
            {"code": "XN15", "name": "Phospho", "unit": "Lần"},
            {"code": "XN16", "name": "Protein toàn phần", "unit": "Lần"},
            {"code": "XN17", "name": "Albumin", "unit": "Lần"},
        ],
    },
    {
        "parent_group": "Xét nghiệm",
        "name": "MIỄN DỊCH – NỘI TIẾT",
        "orders": [
            {"code": "ND01", "name": "TSH", "unit": "Lần"},
            {"code": "ND02", "name": "FT4", "unit": "Lần"},
            {"code": "ND03", "name": "FT3", "unit": "Lần"},
            {"code": "ND04", "name": "Cortisol buổi sáng", "unit": "Lần"},
            {"code": "ND05", "name": "ACTH", "unit": "Lần"},
            {"code": "ND06", "name": "Prolactin", "unit": "Lần"},
            {"code": "ND07", "name": "Testosterone", "unit": "Lần"},
            {"code": "ND08", "name": "Estradiol", "unit": "Lần"},
            {"code": "ND09", "name": "Vitamin B12", "unit": "Lần"},
            {"code": "ND10", "name": "Acid folic", "unit": "Lần"},
        ],
    },
    {
        "parent_group": "Xét nghiệm",
        "name": "XÉT NGHIỆM NƯỚC TIỂU – MA TÚY",
        "orders": [
            {"code": "NT01", "name": "Tổng phân tích nước tiểu", "unit": "Lần"},
            {"code": "NT02", "name": "Test ma túy nhanh (5 chất)", "unit": "Lần"},
            {"code": "NT03", "name": "Test ma túy nhanh (10 chất)", "unit": "Lần"},
            {"code": "NT04", "name": "Định lượng Amphetamine", "unit": "Lần"},
            {"code": "NT05", "name": "Định lượng Morphine", "unit": "Lần"},
            {"code": "NT06", "name": "Định lượng Methadone", "unit": "Lần"},
            {"code": "NT07", "name": "Định lượng Bromazepam / Diazepam", "unit": "Lần"},
        ],
    },
    {
        "parent_group": "Xét nghiệm",
        "name": "XÉT NGHIỆM ĐẶC HIỆU TÂM THẦN",
        "orders": [
            {"code": "DC01", "name": "Định lượng thuốc chống động kinh – Valproate", "unit": "Lần"},
            {"code": "DC02", "name": "Định lượng Carbamazepine", "unit": "Lần"},
            {"code": "DC03", "name": "Định lượng Lithium", "unit": "Lần"},
            {"code": "DC04", "name": "Clozapine – Nồng độ huyết tương", "unit": "Lần"},
            {"code": "DC05", "name": "Olanzapine – Nồng độ huyết tương", "unit": "Lần"},
        ],
    },
    {
        "parent_group": "Khám bệnh - Thủ thuật",
        "name": "TRẮC NGHIỆM TÂM LÝ",
        "orders": [
            {"code": "TL01", "name": "MMPI", "unit": "Lần"},
            {"code": "TL02", "name": "Test trí tuệ IQ", "unit": "Lần"},
            {"code": "TL03", "name": "Test trí nhớ", "unit": "Lần"},
            {"code": "TL04", "name": "Test lo âu – HAM-A", "unit": "Lần"},
            {"code": "TL05", "name": "Test trầm cảm – HAM-D", "unit": "Lần"},
            {"code": "TL06", "name": "PHQ-9", "unit": "Lần"},
            {"code": "TL07", "name": "GAD-7", "unit": "Lần"},
            {"code": "TL08", "name": "MoCA – Sàng lọc sa sút trí tuệ", "unit": "Lần"},
            {"code": "TL09", "name": "Mini-Mental State Examination (MMSE)", "unit": "Lần"},
            {"code": "TL10", "name": "Test hành vi – ADHD", "unit": "Lần"},
            {"code": "TL11", "name": "Test tự kỷ – CARS", "unit": "Lần"},
            {"code": "TL12", "name": "Test phát triển – Denver II", "unit": "Lần"},
        ],
    },
    {
        "parent_group": "Chẩn đoán hình ảnh - Thăm dò chức năng",
        "name": "KHÁC",
        "orders": [
            {"code": "KH01", "name": "Điện não đồ liên tục (24h)", "unit": "Lần"},
            {"code": "KH02", "name": "Theo dõi Holter ECG 24h", "unit": "Lần"},
            {"code": "KH03", "name": "Theo dõi huyết áp 24h", "unit": "Lần"},
            {"code": "KH04", "name": "Test dung nạp glucose", "unit": "Lần"},
        ],
    },
]

OUTPUT_JSON = "data/external/order_catalog_manual.json"


def get_or_create_parent_group(cur, parent_group_name: str) -> int:
    """Tìm hoặc tạo nhóm lớn (parent group) trong database."""
    # Tìm nhóm lớn theo tên (parent_id IS NULL)
    cur.execute(
        "SELECT id FROM order_categories WHERE name = %s AND parent_id IS NULL",
        (parent_group_name,),
    )
    result = cur.fetchone()
    
    if result:
        return result[0]
    
    # Nếu không tìm thấy, tạo mới
    # Lấy sort_order tiếp theo
    cur.execute(
        "SELECT COALESCE(MAX(sort_order), 0) + 1 FROM order_categories WHERE parent_id IS NULL"
    )
    next_sort_order = cur.fetchone()[0]
    
    description = f"Nhóm chỉ định: {parent_group_name}"
    cur.execute(
        """
        INSERT INTO order_categories (name, description, parent_id, sort_order, is_active)
        VALUES (%s, %s, NULL, %s, TRUE)
        RETURNING id
        """,
        (parent_group_name, description, next_sort_order),
    )
    return cur.fetchone()[0]


def insert_into_database(catalog_data: List[Dict[str, Any]]):
    """Nhập dữ liệu vào database."""
    database_url = os.environ.get(
        "DATABASE_URL", "postgresql://postgres:123456@localhost:5432/qlpk_db"
    )

    conn = psycopg2.connect(database_url)
    conn.autocommit = False

    try:
        with conn.cursor() as cur:
            # Xóa các category con và order_items cũ (chỉ xóa các category có parent_id)
            cur.execute("""
                DELETE FROM order_items WHERE category_id IN (
                    SELECT id FROM order_categories WHERE parent_id IS NOT NULL
                );
                DELETE FROM order_categories WHERE parent_id IS NOT NULL;
            """)

            # Lấy hoặc tạo các nhóm lớn
            parent_group_ids = {}
            for category_data in catalog_data:
                parent_group_name = category_data["parent_group"]
                if parent_group_name not in parent_group_ids:
                    parent_group_ids[parent_group_name] = get_or_create_parent_group(
                        cur, parent_group_name
                    )

            # Thêm các category con và order_items
            for cat_index, category_data in enumerate(catalog_data, start=1):
                parent_group_name = category_data["parent_group"]
                parent_category_id = parent_group_ids[parent_group_name]
                category_name = category_data["name"][:255]
                description = f"Nhóm chỉ định: {category_name}"

                # Tạo category con
                cur.execute(
                    """
                    INSERT INTO order_categories (name, description, parent_id, sort_order, is_active)
                    VALUES (%s, %s, %s, %s, TRUE)
                    RETURNING id
                    """,
                    (category_name, description, parent_category_id, cat_index),
                )
                category_id = cur.fetchone()[0]

                # Tạo order item đại diện cho nhóm con
                performer = "Khoa cận lâm sàng"[:255]
                cur.execute(
                    """
                    INSERT INTO order_items
                        (name, description, performer, is_in_house, category_id, sort_order, is_active)
                    VALUES
                        (%s, %s, %s, TRUE, %s, %s, TRUE)
                    RETURNING id
                    """,
                    (category_name, description, performer, category_id, 0),
                )
                group_order_id = cur.fetchone()[0]

                # Thêm các order items con
                for order_index, order in enumerate(category_data["orders"], start=1):
                    order_name = order["name"][:255]
                    order_code = order.get("code", "")
                    order_unit = order.get("unit", "Lần")
                    detail = f"Mã: {order_code}. Đơn vị: {order_unit}."[:1000]
                    cur.execute(
                        """
                        INSERT INTO order_items
                            (name, description, performer, is_in_house, category_id, sort_order, is_active, group_order_item_id)
                        VALUES
                            (%s, %s, %s, TRUE, %s, %s, TRUE, %s)
                        """,
                        (
                            order_name,
                            detail,
                            performer,
                            category_id,
                            order_index,
                            group_order_id,
                        ),
                    )

        conn.commit()
    except Exception as e:
        conn.rollback()
        print(f"Lỗi khi nhập dữ liệu: {e}", file=sys.stderr)
        raise
    finally:
        conn.close()


def save_json(catalog_data: List[Dict[str, Any]]):
    """Lưu dữ liệu vào file JSON."""
    os.makedirs(os.path.dirname(OUTPUT_JSON), exist_ok=True)
    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        payload = {"source": "Manual data entry", "locale": "vi", "categories": catalog_data}
        json.dump(payload, f, ensure_ascii=False, indent=2)


def main():
    """Hàm chính."""
    # Lưu dữ liệu vào file JSON
    save_json(ORDER_CATALOG_DATA)
    
    # Nhập dữ liệu vào database
    insert_into_database(ORDER_CATALOG_DATA)
    
    total_orders = sum(len(c["orders"]) for c in ORDER_CATALOG_DATA)
    total_categories = len(ORDER_CATALOG_DATA)
    print(f"Đã nhập {total_orders} chỉ định trong {total_categories} nhóm (locale=vi).")


if __name__ == "__main__":
    main()
