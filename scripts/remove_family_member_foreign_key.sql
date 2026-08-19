-- Script để gỡ foreign key constraint giữa appointment_relatives và family_members
-- Cho phép xóa family_member mà không cần xóa hoặc cập nhật appointment_relatives trước

-- Tìm tên constraint (có thể là fk_family_member hoặc appointment_relatives_family_members)
-- Drop constraint nếu tồn tại

-- Cách 1: Drop bằng tên constraint nếu biết chính xác
ALTER TABLE appointment_relatives 
DROP CONSTRAINT IF EXISTS fk_family_member;

-- Cách 2: Drop bằng tên constraint tự động (PostgreSQL tự tạo)
ALTER TABLE appointment_relatives 
DROP CONSTRAINT IF EXISTS appointment_relatives_family_member_id_fkey;

-- Cách 3: Drop tất cả constraint liên quan đến family_member_id
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT constraint_name
        FROM information_schema.table_constraints
        WHERE table_name = 'appointment_relatives'
        AND constraint_type = 'FOREIGN KEY'
        AND constraint_name LIKE '%family_member%'
    ) LOOP
        EXECUTE 'ALTER TABLE appointment_relatives DROP CONSTRAINT IF EXISTS ' || quote_ident(r.constraint_name);
    END LOOP;
END $$;

-- Xác nhận đã gỡ constraint
SELECT 
    tc.constraint_name, 
    tc.table_name, 
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name 
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.table_name = 'appointment_relatives' 
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'family_member_id';

