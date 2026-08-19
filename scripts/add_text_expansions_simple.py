#!/usr/bin/env python3
"""
Script đơn giản để thêm dữ liệu mẫu cho text expansions
"""

import psycopg2
from psycopg2.extras import RealDictCursor

# Kết nối database
conn = psycopg2.connect(
    host="localhost",
    database="qlpk_db",
    user="postgres",
    password="123456"
)

cur = conn.cursor()

# Tạo dữ liệu mẫu
sample_data = [
    ('bt', 'bình thường', 'general', 'Từ viết tắt cho bình thường'),
    ('tt', 'tình trạng', 'general', 'Từ viết tắt cho tình trạng'),
    ('kq', 'kết quả', 'general', 'Từ viết tắt cho kết quả'),
    ('bs', 'bác sĩ', 'medical', 'Từ viết tắt cho bác sĩ'),
    ('bn', 'bệnh nhân', 'medical', 'Từ viết tắt cho bệnh nhân'),
    ('cd', 'chẩn đoán', 'medical', 'Từ viết tắt cho chẩn đoán'),
    ('dt', 'điều trị', 'medical', 'Từ viết tắt cho điều trị'),
    ('tl', 'tâm lý', 'psychological', 'Từ viết tắt cho tâm lý'),
    ('pt', 'phân tích tâm lý', 'psychological', 'Từ viết tắt cho phân tích tâm lý'),
    ('tk', 'tư vấn tâm lý', 'psychological', 'Từ viết tắt cho tư vấn tâm lý')
]

try:
    added_count = 0
    for abbreviation, full_text, category, description in sample_data:
        # Kiểm tra xem đã tồn tại chưa
        cur.execute("SELECT id FROM text_expansions WHERE abbreviation = %s", (abbreviation,))
        if cur.fetchone() is None:
            cur.execute("""
                INSERT INTO text_expansions (abbreviation, full_text, category, description, is_active, created_at)
                VALUES (%s, %s, %s, %s, %s, NOW())
            """, (abbreviation, full_text, category, description, True))
            added_count += 1
            print(f"✅ Thêm: {abbreviation} → {full_text}")
        else:
            print(f"⚠️  Đã tồn tại: {abbreviation}")
    
    conn.commit()
    print(f'\n🎉 Hoàn thành! Đã thêm {added_count} từ viết tắt mới.')
    
except Exception as e:
    print(f'❌ Lỗi: {e}')
    conn.rollback()
finally:
    cur.close()
    conn.close()
