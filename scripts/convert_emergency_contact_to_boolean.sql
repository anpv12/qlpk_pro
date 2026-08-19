-- Chuyển đổi cột emergency_contact từ VARCHAR thành BOOLEAN
-- Logic: Nếu có giá trị (không null và không rỗng) thì = true, ngược lại = false

-- Bước 1: Thêm cột mới tạm thời
ALTER TABLE family_members 
ADD COLUMN emergency_contact_new BOOLEAN DEFAULT FALSE;

-- Bước 2: Convert dữ liệu: nếu emergency_contact có giá trị thì = true
UPDATE family_members 
SET emergency_contact_new = CASE 
    WHEN emergency_contact IS NOT NULL AND emergency_contact != '' THEN TRUE
    ELSE FALSE
END;

-- Bước 3: Xóa cột cũ
ALTER TABLE family_members 
DROP COLUMN emergency_contact;

-- Bước 4: Đổi tên cột mới thành tên cũ
ALTER TABLE family_members 
RENAME COLUMN emergency_contact_new TO emergency_contact;

-- Bước 5: Thêm comment
COMMENT ON COLUMN family_members.emergency_contact IS 'Liên hệ khẩn cấp (true/false) - true hiển thị dấu tích xanh';
