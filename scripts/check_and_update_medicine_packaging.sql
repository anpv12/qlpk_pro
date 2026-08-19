-- Script kiểm tra và cập nhật thông tin quy cách đóng gói cho thuốc
-- Chạy để xem dữ liệu hiện tại và cập nhật nếu cần

-- 1. Kiểm tra các thuốc có packaging_unit và units_per_box
SELECT 
    id,
    name,
    unit,
    stock_quantity,
    packaging,
    packaging_unit,
    units_per_box,
    CASE 
        WHEN packaging_unit IS NULL OR units_per_box IS NULL OR units_per_box = 0 
        THEN 'Cần cập nhật'
        ELSE 'Đã có'
    END as status
FROM medicines
WHERE stock_quantity > 0
ORDER BY stock_quantity DESC
LIMIT 20;

-- 2. Cập nhật mẫu cho một số thuốc (ví dụ - bạn cần điều chỉnh theo dữ liệu thực tế)
-- Ví dụ: Nếu thuốc có 100 viên, có thể set 1 hộp = 10 viên hoặc 1 hộp = 20 viên tùy quy cách thực tế

-- UPDATE mẫu (uncomment và điều chỉnh theo nhu cầu):
-- UPDATE medicines
-- SET packaging_unit = 'hộp',
--     units_per_box = 10
-- WHERE id = 1 AND (packaging_unit IS NULL OR units_per_box IS NULL OR units_per_box = 0);

-- UPDATE mẫu cho thuốc có packaging string:
-- UPDATE medicines
-- SET packaging_unit = 'hộp',
--     units_per_box = 20
-- WHERE packaging LIKE '%20%' 
--   AND (packaging_unit IS NULL OR units_per_box IS NULL OR units_per_box = 0);

-- 3. Xem các giá trị packaging_unit và units_per_box phổ biến
SELECT 
    packaging_unit,
    units_per_box,
    COUNT(*) as count
FROM medicines
WHERE packaging_unit IS NOT NULL 
  AND units_per_box IS NOT NULL 
  AND units_per_box > 0
GROUP BY packaging_unit, units_per_box
ORDER BY count DESC;

