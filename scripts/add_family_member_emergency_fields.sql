-- Thêm các field mới vào bảng family_members
-- emergency_contact: Liên hệ khẩn cấp
-- joint_exam_date: Ngày khám cùng

ALTER TABLE family_members 
ADD COLUMN IF NOT EXISTS emergency_contact VARCHAR(20),
ADD COLUMN IF NOT EXISTS joint_exam_date DATE;

-- Thêm comment cho các cột mới
COMMENT ON COLUMN family_members.emergency_contact IS 'Liên hệ khẩn cấp của người thân';
COMMENT ON COLUMN family_members.joint_exam_date IS 'Ngày khám cùng với bệnh nhân';
