-- Tăng độ dài của cột emergency_contact từ VARCHAR(20) lên VARCHAR(100)
-- để cho phép nhập cả tên và số điện thoại

ALTER TABLE family_members 
ALTER COLUMN emergency_contact TYPE VARCHAR(100);

-- Thêm comment cập nhật
COMMENT ON COLUMN family_members.emergency_contact IS 'Liên hệ khẩn cấp của người thân (có thể chứa tên và số điện thoại)';
