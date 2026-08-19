-- Migration script: Bắt buộc trường kinship (Quan hệ) trong bảng appointment_relatives
-- Script này sẽ:
-- 1. Cập nhật tất cả các bản ghi có kinship là NULL hoặc rỗng thành 'Khác'
-- 2. Thay đổi constraint để kinship NOT NULL

-- Bước 1: Cập nhật dữ liệu cũ (nếu có)
UPDATE appointment_relatives
SET kinship = 'Khác'
WHERE kinship IS NULL OR TRIM(kinship) = '';

-- Bước 2: Thay đổi constraint để kinship NOT NULL
ALTER TABLE appointment_relatives
ALTER COLUMN kinship SET NOT NULL;

-- Bước 3: Thêm comment để ghi chú
COMMENT ON COLUMN appointment_relatives.kinship IS 'Quan hệ với bệnh nhân (Bắt buộc)';

