-- Thêm cột emergency_contact và joint_exam_date vào bảng family_members
-- Để đồng bộ với model Python sau khi restore database production

-- Thêm cột emergency_contact (Boolean, default False)
ALTER TABLE family_members 
ADD COLUMN IF NOT EXISTS emergency_contact BOOLEAN DEFAULT FALSE;

-- Thêm cột joint_exam_date (Date)
ALTER TABLE family_members 
ADD COLUMN IF NOT EXISTS joint_exam_date DATE;

-- Cập nhật giá trị mặc định cho các bản ghi cũ (nếu có)
UPDATE family_members 
SET emergency_contact = FALSE 
WHERE emergency_contact IS NULL;

-- Thêm comment cho các cột
COMMENT ON COLUMN family_members.emergency_contact IS 'Liên hệ khẩn cấp (true/false)';
COMMENT ON COLUMN family_members.joint_exam_date IS 'Ngày khám cùng';

-- Kiểm tra kết quả
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'family_members' 
AND column_name IN ('emergency_contact', 'joint_exam_date')
ORDER BY column_name;
