-- Migration: Đổi PrescriptionItem.quantity từ Integer sang Numeric(10,3)
-- Hỗ trợ bốc thuốc số lẻ (1/2, 1/4, 1/5 viên)

-- Backup dữ liệu hiện có (nếu cần)
CREATE TABLE IF NOT EXISTS prescription_items_backup AS 
SELECT * FROM prescription_items;

-- Đổi kiểu dữ liệu quantity từ INTEGER sang NUMERIC(10,3)
ALTER TABLE prescription_items 
ALTER COLUMN quantity TYPE NUMERIC(10, 3) USING quantity::numeric(10, 3);

-- Verify
-- SELECT column_name, data_type, numeric_precision, numeric_scale 
-- FROM information_schema.columns 
-- WHERE table_name = 'prescription_items' AND column_name = 'quantity';

