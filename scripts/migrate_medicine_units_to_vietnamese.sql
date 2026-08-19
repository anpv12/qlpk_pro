-- Migration SQL: Convert đơn vị tính từ tiếng Anh sang tiếng Việt
-- Chạy từng câu UPDATE một, hoặc chạy tất cả cùng lúc

-- ============================================
-- 1. Convert 'unit' (đơn vị bán)
-- ============================================
UPDATE medicines
SET unit = CASE 
    -- Đơn vị dùng
    WHEN LOWER(TRIM(unit)) = 'tablet' THEN 'viên'
    WHEN LOWER(TRIM(unit)) = 'tablets' THEN 'viên'
    WHEN LOWER(TRIM(unit)) = 'pill' THEN 'viên'
    WHEN LOWER(TRIM(unit)) = 'pills' THEN 'viên'
    WHEN LOWER(TRIM(unit)) = 'capsule' THEN 'viên nang'
    WHEN LOWER(TRIM(unit)) = 'capsules' THEN 'viên nang'
    WHEN LOWER(TRIM(unit)) = 'cap' THEN 'viên nang'
    WHEN LOWER(TRIM(unit)) = 'vial' THEN 'lọ'
    WHEN LOWER(TRIM(unit)) = 'vials' THEN 'lọ'
    WHEN LOWER(TRIM(unit)) = 'bottle' THEN 'chai'
    WHEN LOWER(TRIM(unit)) = 'bottles' THEN 'chai'
    WHEN LOWER(TRIM(unit)) = 'jar' THEN 'lọ'
    WHEN LOWER(TRIM(unit)) = 'jars' THEN 'lọ'
    WHEN LOWER(TRIM(unit)) = 'pack' THEN 'gói'
    WHEN LOWER(TRIM(unit)) = 'packet' THEN 'gói'
    WHEN LOWER(TRIM(unit)) = 'packets' THEN 'gói'
    WHEN LOWER(TRIM(unit)) = 'sachet' THEN 'gói'
    WHEN LOWER(TRIM(unit)) = 'sachets' THEN 'gói'
    WHEN LOWER(TRIM(unit)) = 'tube' THEN 'tuýp'
    WHEN LOWER(TRIM(unit)) = 'tubes' THEN 'tuýp'
    WHEN LOWER(TRIM(unit)) = 'ampoule' THEN 'ống'
    WHEN LOWER(TRIM(unit)) = 'ampoules' THEN 'ống'
    WHEN LOWER(TRIM(unit)) = 'syringe' THEN 'bơm tiêm'
    WHEN LOWER(TRIM(unit)) = 'syringes' THEN 'bơm tiêm'
    WHEN LOWER(TRIM(unit)) = 'strip' THEN 'vỉ'
    WHEN LOWER(TRIM(unit)) = 'strips' THEN 'vỉ'
    WHEN LOWER(TRIM(unit)) = 'blister' THEN 'vỉ'
    WHEN LOWER(TRIM(unit)) = 'blisters' THEN 'vỉ'
    WHEN LOWER(TRIM(unit)) = 'box' THEN 'hộp'
    WHEN LOWER(TRIM(unit)) = 'boxes' THEN 'hộp'
    WHEN LOWER(TRIM(unit)) = 'drop' THEN 'giọt'
    WHEN LOWER(TRIM(unit)) = 'drops' THEN 'giọt'
    WHEN LOWER(TRIM(unit)) = 'patch' THEN 'miếng dán'
    WHEN LOWER(TRIM(unit)) = 'patches' THEN 'miếng dán'
    -- Đơn vị đo lường
    WHEN LOWER(TRIM(unit)) = 'milliliter' THEN 'ml'
    WHEN LOWER(TRIM(unit)) = 'millilitre' THEN 'ml'
    WHEN LOWER(TRIM(unit)) = 'milligram' THEN 'mg'
    WHEN LOWER(TRIM(unit)) = 'milligrams' THEN 'mg'
    WHEN LOWER(TRIM(unit)) = 'microgram' THEN 'mcg'
    WHEN LOWER(TRIM(unit)) = 'micrograms' THEN 'mcg'
    WHEN LOWER(TRIM(unit)) = 'gram' THEN 'g'
    WHEN LOWER(TRIM(unit)) = 'grams' THEN 'g'
    WHEN LOWER(TRIM(unit)) = 'liter' THEN 'lít'
    WHEN LOWER(TRIM(unit)) = 'litre' THEN 'lít'
    WHEN LOWER(TRIM(unit)) = 'l' THEN 'lít'
    -- Các đơn vị khác
    WHEN LOWER(TRIM(unit)) = 'dose' THEN 'liều'
    WHEN LOWER(TRIM(unit)) = 'bag' THEN 'túi'
    WHEN LOWER(TRIM(unit)) = 'kit' THEN 'dụng cụ'
    WHEN LOWER(TRIM(unit)) = 'piece' THEN 'miếng'
    WHEN LOWER(TRIM(unit)) = 'pen' THEN 'bút tiêm'
    WHEN LOWER(TRIM(unit)) = 'sheet' THEN 'vỉ'
    ELSE unit
END
WHERE unit IS NOT NULL 
  AND LOWER(TRIM(unit)) IN (
    'tablet', 'tablets', 'pill', 'pills', 'capsule', 'capsules', 'cap',
    'vial', 'vials', 'bottle', 'bottles', 'jar', 'jars',
    'pack', 'packet', 'packets', 'sachet', 'sachets',
    'tube', 'tubes', 'ampoule', 'ampoules', 'syringe', 'syringes',
    'strip', 'strips', 'blister', 'blisters', 'box', 'boxes',
    'drop', 'drops', 'patch', 'patches',
    'milliliter', 'millilitre', 'milligram', 'milligrams',
    'microgram', 'micrograms', 'gram', 'grams',
    'liter', 'litre', 'l',
    'dose', 'bag', 'kit', 'piece', 'pen', 'sheet'
  );

-- ============================================
-- 2. Convert 'packaging_unit' (đơn vị đóng gói)
-- ============================================
UPDATE medicines
SET packaging_unit = CASE 
    -- Đơn vị dùng
    WHEN LOWER(TRIM(packaging_unit)) = 'tablet' THEN 'viên'
    WHEN LOWER(TRIM(packaging_unit)) = 'tablets' THEN 'viên'
    WHEN LOWER(TRIM(packaging_unit)) = 'pill' THEN 'viên'
    WHEN LOWER(TRIM(packaging_unit)) = 'pills' THEN 'viên'
    WHEN LOWER(TRIM(packaging_unit)) = 'capsule' THEN 'viên nang'
    WHEN LOWER(TRIM(packaging_unit)) = 'capsules' THEN 'viên nang'
    WHEN LOWER(TRIM(packaging_unit)) = 'cap' THEN 'viên nang'
    WHEN LOWER(TRIM(packaging_unit)) = 'vial' THEN 'lọ'
    WHEN LOWER(TRIM(packaging_unit)) = 'vials' THEN 'lọ'
    WHEN LOWER(TRIM(packaging_unit)) = 'bottle' THEN 'chai'
    WHEN LOWER(TRIM(packaging_unit)) = 'bottles' THEN 'chai'
    WHEN LOWER(TRIM(packaging_unit)) = 'jar' THEN 'lọ'
    WHEN LOWER(TRIM(packaging_unit)) = 'jars' THEN 'lọ'
    WHEN LOWER(TRIM(packaging_unit)) = 'pack' THEN 'gói'
    WHEN LOWER(TRIM(packaging_unit)) = 'packet' THEN 'gói'
    WHEN LOWER(TRIM(packaging_unit)) = 'packets' THEN 'gói'
    WHEN LOWER(TRIM(packaging_unit)) = 'sachet' THEN 'gói'
    WHEN LOWER(TRIM(packaging_unit)) = 'sachets' THEN 'gói'
    WHEN LOWER(TRIM(packaging_unit)) = 'tube' THEN 'tuýp'
    WHEN LOWER(TRIM(packaging_unit)) = 'tubes' THEN 'tuýp'
    WHEN LOWER(TRIM(packaging_unit)) = 'ampoule' THEN 'ống'
    WHEN LOWER(TRIM(packaging_unit)) = 'ampoules' THEN 'ống'
    WHEN LOWER(TRIM(packaging_unit)) = 'syringe' THEN 'bơm tiêm'
    WHEN LOWER(TRIM(packaging_unit)) = 'syringes' THEN 'bơm tiêm'
    WHEN LOWER(TRIM(packaging_unit)) = 'strip' THEN 'vỉ'
    WHEN LOWER(TRIM(packaging_unit)) = 'strips' THEN 'vỉ'
    WHEN LOWER(TRIM(packaging_unit)) = 'blister' THEN 'vỉ'
    WHEN LOWER(TRIM(packaging_unit)) = 'blisters' THEN 'vỉ'
    WHEN LOWER(TRIM(packaging_unit)) = 'box' THEN 'hộp'
    WHEN LOWER(TRIM(packaging_unit)) = 'boxes' THEN 'hộp'
    WHEN LOWER(TRIM(packaging_unit)) = 'drop' THEN 'giọt'
    WHEN LOWER(TRIM(packaging_unit)) = 'drops' THEN 'giọt'
    WHEN LOWER(TRIM(packaging_unit)) = 'patch' THEN 'miếng dán'
    WHEN LOWER(TRIM(packaging_unit)) = 'patches' THEN 'miếng dán'
    -- Đơn vị đo lường
    WHEN LOWER(TRIM(packaging_unit)) = 'milliliter' THEN 'ml'
    WHEN LOWER(TRIM(packaging_unit)) = 'millilitre' THEN 'ml'
    WHEN LOWER(TRIM(packaging_unit)) = 'milligram' THEN 'mg'
    WHEN LOWER(TRIM(packaging_unit)) = 'milligrams' THEN 'mg'
    WHEN LOWER(TRIM(packaging_unit)) = 'microgram' THEN 'mcg'
    WHEN LOWER(TRIM(packaging_unit)) = 'micrograms' THEN 'mcg'
    WHEN LOWER(TRIM(packaging_unit)) = 'gram' THEN 'g'
    WHEN LOWER(TRIM(packaging_unit)) = 'grams' THEN 'g'
    WHEN LOWER(TRIM(packaging_unit)) = 'liter' THEN 'lít'
    WHEN LOWER(TRIM(packaging_unit)) = 'litre' THEN 'lít'
    WHEN LOWER(TRIM(packaging_unit)) = 'l' THEN 'lít'
    -- Các đơn vị khác
    WHEN LOWER(TRIM(packaging_unit)) = 'dose' THEN 'liều'
    WHEN LOWER(TRIM(packaging_unit)) = 'bag' THEN 'túi'
    WHEN LOWER(TRIM(packaging_unit)) = 'kit' THEN 'dụng cụ'
    WHEN LOWER(TRIM(packaging_unit)) = 'piece' THEN 'miếng'
    WHEN LOWER(TRIM(packaging_unit)) = 'pen' THEN 'bút tiêm'
    WHEN LOWER(TRIM(packaging_unit)) = 'sheet' THEN 'vỉ'
    ELSE packaging_unit
END
WHERE packaging_unit IS NOT NULL 
  AND LOWER(TRIM(packaging_unit)) IN (
    'tablet', 'tablets', 'pill', 'pills', 'capsule', 'capsules', 'cap',
    'vial', 'vials', 'bottle', 'bottles', 'jar', 'jars',
    'pack', 'packet', 'packets', 'sachet', 'sachets',
    'tube', 'tubes', 'ampoule', 'ampoules', 'syringe', 'syringes',
    'strip', 'strips', 'blister', 'blisters', 'box', 'boxes',
    'drop', 'drops', 'patch', 'patches',
    'milliliter', 'millilitre', 'milligram', 'milligrams',
    'microgram', 'micrograms', 'gram', 'grams',
    'liter', 'litre', 'l',
    'dose', 'bag', 'kit', 'piece', 'pen', 'sheet'
  );

-- ============================================
-- 3. Convert 'storage_unit' (đơn vị lưu kho)
-- ============================================
UPDATE medicines
SET storage_unit = CASE 
    -- Đơn vị dùng
    WHEN LOWER(TRIM(storage_unit)) = 'tablet' THEN 'viên'
    WHEN LOWER(TRIM(storage_unit)) = 'tablets' THEN 'viên'
    WHEN LOWER(TRIM(storage_unit)) = 'pill' THEN 'viên'
    WHEN LOWER(TRIM(storage_unit)) = 'pills' THEN 'viên'
    WHEN LOWER(TRIM(storage_unit)) = 'capsule' THEN 'viên nang'
    WHEN LOWER(TRIM(storage_unit)) = 'capsules' THEN 'viên nang'
    WHEN LOWER(TRIM(storage_unit)) = 'cap' THEN 'viên nang'
    WHEN LOWER(TRIM(storage_unit)) = 'vial' THEN 'lọ'
    WHEN LOWER(TRIM(storage_unit)) = 'vials' THEN 'lọ'
    WHEN LOWER(TRIM(storage_unit)) = 'bottle' THEN 'chai'
    WHEN LOWER(TRIM(storage_unit)) = 'bottles' THEN 'chai'
    WHEN LOWER(TRIM(storage_unit)) = 'jar' THEN 'lọ'
    WHEN LOWER(TRIM(storage_unit)) = 'jars' THEN 'lọ'
    WHEN LOWER(TRIM(storage_unit)) = 'pack' THEN 'gói'
    WHEN LOWER(TRIM(storage_unit)) = 'packet' THEN 'gói'
    WHEN LOWER(TRIM(storage_unit)) = 'packets' THEN 'gói'
    WHEN LOWER(TRIM(storage_unit)) = 'sachet' THEN 'gói'
    WHEN LOWER(TRIM(storage_unit)) = 'sachets' THEN 'gói'
    WHEN LOWER(TRIM(storage_unit)) = 'tube' THEN 'tuýp'
    WHEN LOWER(TRIM(storage_unit)) = 'tubes' THEN 'tuýp'
    WHEN LOWER(TRIM(storage_unit)) = 'ampoule' THEN 'ống'
    WHEN LOWER(TRIM(storage_unit)) = 'ampoules' THEN 'ống'
    WHEN LOWER(TRIM(storage_unit)) = 'syringe' THEN 'bơm tiêm'
    WHEN LOWER(TRIM(storage_unit)) = 'syringes' THEN 'bơm tiêm'
    WHEN LOWER(TRIM(storage_unit)) = 'strip' THEN 'vỉ'
    WHEN LOWER(TRIM(storage_unit)) = 'strips' THEN 'vỉ'
    WHEN LOWER(TRIM(storage_unit)) = 'blister' THEN 'vỉ'
    WHEN LOWER(TRIM(storage_unit)) = 'blisters' THEN 'vỉ'
    WHEN LOWER(TRIM(storage_unit)) = 'box' THEN 'hộp'
    WHEN LOWER(TRIM(storage_unit)) = 'boxes' THEN 'hộp'
    WHEN LOWER(TRIM(storage_unit)) = 'drop' THEN 'giọt'
    WHEN LOWER(TRIM(storage_unit)) = 'drops' THEN 'giọt'
    WHEN LOWER(TRIM(storage_unit)) = 'patch' THEN 'miếng dán'
    WHEN LOWER(TRIM(storage_unit)) = 'patches' THEN 'miếng dán'
    -- Đơn vị đo lường
    WHEN LOWER(TRIM(storage_unit)) = 'milliliter' THEN 'ml'
    WHEN LOWER(TRIM(storage_unit)) = 'millilitre' THEN 'ml'
    WHEN LOWER(TRIM(storage_unit)) = 'milligram' THEN 'mg'
    WHEN LOWER(TRIM(storage_unit)) = 'milligrams' THEN 'mg'
    WHEN LOWER(TRIM(storage_unit)) = 'microgram' THEN 'mcg'
    WHEN LOWER(TRIM(storage_unit)) = 'micrograms' THEN 'mcg'
    WHEN LOWER(TRIM(storage_unit)) = 'gram' THEN 'g'
    WHEN LOWER(TRIM(storage_unit)) = 'grams' THEN 'g'
    WHEN LOWER(TRIM(storage_unit)) = 'liter' THEN 'lít'
    WHEN LOWER(TRIM(storage_unit)) = 'litre' THEN 'lít'
    WHEN LOWER(TRIM(storage_unit)) = 'l' THEN 'lít'
    -- Các đơn vị khác
    WHEN LOWER(TRIM(storage_unit)) = 'dose' THEN 'liều'
    WHEN LOWER(TRIM(storage_unit)) = 'bag' THEN 'túi'
    WHEN LOWER(TRIM(storage_unit)) = 'kit' THEN 'dụng cụ'
    WHEN LOWER(TRIM(storage_unit)) = 'piece' THEN 'miếng'
    WHEN LOWER(TRIM(storage_unit)) = 'pen' THEN 'bút tiêm'
    WHEN LOWER(TRIM(storage_unit)) = 'sheet' THEN 'vỉ'
    ELSE storage_unit
END
WHERE storage_unit IS NOT NULL 
  AND LOWER(TRIM(storage_unit)) IN (
    'tablet', 'tablets', 'pill', 'pills', 'capsule', 'capsules', 'cap',
    'vial', 'vials', 'bottle', 'bottles', 'jar', 'jars',
    'pack', 'packet', 'packets', 'sachet', 'sachets',
    'tube', 'tubes', 'ampoule', 'ampoules', 'syringe', 'syringes',
    'strip', 'strips', 'blister', 'blisters', 'box', 'boxes',
    'drop', 'drops', 'patch', 'patches',
    'milliliter', 'millilitre', 'milligram', 'milligrams',
    'microgram', 'micrograms', 'gram', 'grams',
    'liter', 'litre', 'l',
    'dose', 'bag', 'kit', 'piece', 'pen', 'sheet'
  );

-- ============================================
-- 4. Kiểm tra kết quả (SELECT để xem trước khi UPDATE)
-- ============================================
-- Chạy các câu SELECT này trước để xem sẽ có bao nhiêu bản ghi bị ảnh hưởng:

-- Kiểm tra 'unit':
-- SELECT id, name, unit, 
--        CASE 
--            WHEN LOWER(TRIM(unit)) = 'tablet' THEN 'viên'
--            WHEN LOWER(TRIM(unit)) = 'bottle' THEN 'chai'
--            -- ... (copy từ UPDATE ở trên)
--        END as new_unit
-- FROM medicines
-- WHERE unit IS NOT NULL 
--   AND LOWER(TRIM(unit)) IN ('tablet', 'bottle', 'pack', 'tube', ...);

-- Kiểm tra 'packaging_unit':
-- SELECT id, name, packaging_unit,
--        CASE 
--            WHEN LOWER(TRIM(packaging_unit)) = 'tablet' THEN 'viên'
--            -- ... (copy từ UPDATE ở trên)
--        END as new_packaging_unit
-- FROM medicines
-- WHERE packaging_unit IS NOT NULL 
--   AND LOWER(TRIM(packaging_unit)) IN ('tablet', 'bottle', ...);

-- Kiểm tra 'storage_unit':
-- SELECT id, name, storage_unit,
--        CASE 
--            WHEN LOWER(TRIM(storage_unit)) = 'tablet' THEN 'viên'
--            -- ... (copy từ UPDATE ở trên)
--        END as new_storage_unit
-- FROM medicines
-- WHERE storage_unit IS NOT NULL 
--   AND LOWER(TRIM(storage_unit)) IN ('tablet', 'bottle', ...);

