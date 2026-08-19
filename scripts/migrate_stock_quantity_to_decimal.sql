-- Migration: Đổi stock_quantity từ Integer sang Numeric(10, 2) để hỗ trợ số thập phân (0.5, 0.25 viên)
-- Ngày tạo: 2024
-- Mô tả: Cho phép lưu số lượng tồn kho dưới dạng số thập phân (ví dụ: 100.5 viên, 0.25 viên)

-- Bước 1: Kiểm tra kiểu dữ liệu hiện tại
-- SELECT column_name, data_type, numeric_precision, numeric_scale
-- FROM information_schema.columns
-- WHERE table_name = 'medicines' AND column_name = 'stock_quantity';

-- Bước 2: Đổi kiểu dữ liệu từ Integer sang Numeric(10, 2)
-- Lưu ý: PostgreSQL sẽ tự động convert Integer sang Numeric, không mất dữ liệu
ALTER TABLE medicines 
ALTER COLUMN stock_quantity TYPE NUMERIC(10, 2) USING stock_quantity::NUMERIC(10, 2);

-- Bước 3: Kiểm tra lại kiểu dữ liệu sau khi migrate
-- SELECT column_name, data_type, numeric_precision, numeric_scale
-- FROM information_schema.columns
-- WHERE table_name = 'medicines' AND column_name = 'stock_quantity';

-- Bước 4: (Tùy chọn) Cập nhật default value nếu cần
-- ALTER TABLE medicines ALTER COLUMN stock_quantity SET DEFAULT 0.00;

-- Lưu ý:
-- - Migration này an toàn, không mất dữ liệu
-- - Các giá trị Integer hiện tại sẽ được convert sang Numeric (ví dụ: 100 → 100.00)
-- - Sau khi migrate, có thể lưu số thập phân (ví dụ: 100.5, 0.25)
-- - Nếu có lỗi, có thể rollback bằng cách đổi lại về Integer (nhưng sẽ mất phần thập phân)

