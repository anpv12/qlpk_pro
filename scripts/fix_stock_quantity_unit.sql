-- Script kiểm tra và sửa stock_quantity nếu đang lưu theo đơn vị đóng gói thay vì đơn vị tồn kho
-- 
-- VẤN ĐỀ: stock_quantity phải lưu theo đơn vị tồn kho (viên), không phải đơn vị đóng gói (hộp/vỉ)
-- 
-- Ví dụ: Nếu có 10 hộp, mỗi hộp 10 viên, thì stock_quantity phải là 100 viên, không phải 10 hộp

-- 1. Kiểm tra các thuốc có thể bị lỗi (stock_quantity nhỏ hơn units_per_box)
SELECT 
    id,
    name,
    stock_quantity,
    units_per_box,
    packaging_unit,
    unit,
    CASE 
        WHEN units_per_box > 0 AND stock_quantity < units_per_box 
        THEN 'Có thể đang lưu theo số hộp'
        ELSE 'Có vẻ đúng'
    END as status,
    CASE 
        WHEN units_per_box > 0 AND stock_quantity < units_per_box 
        THEN stock_quantity * units_per_box
        ELSE stock_quantity
    END as suggested_stock_quantity
FROM medicines
WHERE units_per_box IS NOT NULL 
  AND units_per_box > 0
  AND stock_quantity > 0
ORDER BY stock_quantity ASC
LIMIT 20;

-- 2. Xem các thuốc có stock_quantity chia hết cho units_per_box (có thể đang lưu theo số hộp)
SELECT 
    id,
    name,
    stock_quantity,
    units_per_box,
    packaging_unit,
    unit,
    stock_quantity / units_per_box as so_hop,
    CASE 
        WHEN units_per_box > 0 AND stock_quantity % units_per_box = 0 AND stock_quantity < 1000
        THEN 'Có thể đang lưu theo số hộp (cần kiểm tra thủ công)'
        ELSE 'Có vẻ đúng'
    END as note
FROM medicines
WHERE units_per_box IS NOT NULL 
  AND units_per_box > 0
  AND stock_quantity > 0
  AND stock_quantity % units_per_box = 0
ORDER BY stock_quantity ASC
LIMIT 20;

-- 3. Nếu xác nhận stock_quantity đang lưu theo số hộp, cần nhân với units_per_box
-- UNCOMMENT và điều chỉnh theo nhu cầu:
-- 
-- Ví dụ: Nếu thuốc có ID = 1, stock_quantity = 10 (10 hộp), units_per_box = 10
-- Thì cần UPDATE: stock_quantity = 10 * 10 = 100 (100 viên)
--
-- UPDATE medicines
-- SET stock_quantity = stock_quantity * units_per_box
-- WHERE id = 1
--   AND units_per_box IS NOT NULL 
--   AND units_per_box > 0
--   AND stock_quantity > 0
--   AND stock_quantity < units_per_box * 10; -- Chỉ update nếu stock_quantity nhỏ hơn 10 lần units_per_box

-- 4. Kiểm tra sau khi update
-- SELECT 
--     id,
--     name,
--     stock_quantity,
--     units_per_box,
--     packaging_unit,
--     unit,
--     FLOOR(stock_quantity / units_per_box) as so_hop,
--     stock_quantity - (FLOOR(stock_quantity / units_per_box) * units_per_box) as so_le
-- FROM medicines
-- WHERE id = 1;

