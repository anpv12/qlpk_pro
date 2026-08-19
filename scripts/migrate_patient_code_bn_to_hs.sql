-- Script migration: Đổi mã bệnh nhân từ BN sang HS
-- Thực hiện: Đổi tất cả patient_code từ format "BNxxxxx" sang "HSxxxxx"
-- 
-- Lưu ý: 
-- 1. Backup database trước khi chạy script này
-- 2. Kiểm tra kỹ kết quả sau khi chạy
-- 3. Script này chỉ đổi mã có prefix "BN", các mã khác sẽ không bị ảnh hưởng

-- Bước 1: Kiểm tra số lượng bệnh nhân có mã BN
SELECT COUNT(*) as total_bn_codes 
FROM patients 
WHERE patient_code LIKE 'BN%';

-- Bước 2: Xem trước các mã sẽ bị thay đổi (chạy để kiểm tra trước)
SELECT id, patient_code, full_name 
FROM patients 
WHERE patient_code LIKE 'BN%'
ORDER BY patient_code;

-- Bước 3: Thực hiện đổi mã từ BN sang HS
UPDATE patients 
SET patient_code = REPLACE(patient_code, 'BN', 'HS')
WHERE patient_code LIKE 'BN%';

-- Bước 4: Kiểm tra kết quả sau khi đổi
SELECT COUNT(*) as total_hs_codes 
FROM patients 
WHERE patient_code LIKE 'HS%';

-- Bước 5: Xác nhận không còn mã BN nào
SELECT COUNT(*) as remaining_bn_codes 
FROM patients 
WHERE patient_code LIKE 'BN%';
-- Kết quả phải là 0

-- Bước 6: Xem một số ví dụ mã đã được đổi
SELECT id, patient_code, full_name 
FROM patients 
WHERE patient_code LIKE 'HS%'
ORDER BY patient_code
LIMIT 10;

