-- Tạo bảng appointment_relatives để lưu thông tin người đi khám cùng cho từng lần khám
-- Mỗi record đại diện cho một người đi cùng trong một appointment cụ thể

CREATE TABLE IF NOT EXISTS appointment_relatives (
    id SERIAL PRIMARY KEY,
    appointment_id INTEGER NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
    examination_id INTEGER REFERENCES examinations(id) ON DELETE SET NULL,
    patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    
    -- Link với family_member nếu người đi cùng là người thân
    family_member_id INTEGER REFERENCES family_members(id) ON DELETE SET NULL,
    
    -- Thông tin người đi cùng (có thể là người thân hoặc người khác)
    name VARCHAR(255) NOT NULL,
    kinship VARCHAR(100),  -- Quan hệ (VD: Bạn, Người quen, Mẹ, Vợ...)
    id_number VARCHAR(20) NOT NULL,  -- CCCD/CMND (BẮT BUỘC)
    phone VARCHAR(20),
    emergency_contact BOOLEAN DEFAULT FALSE,
    notes TEXT,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes để query nhanh
    CONSTRAINT fk_appointment FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
    CONSTRAINT fk_examination FOREIGN KEY (examination_id) REFERENCES examinations(id) ON DELETE SET NULL,
    CONSTRAINT fk_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
    CONSTRAINT fk_family_member FOREIGN KEY (family_member_id) REFERENCES family_members(id) ON DELETE SET NULL
);

-- Tạo indexes để query nhanh
CREATE INDEX IF NOT EXISTS idx_appointment_relatives_appointment_id ON appointment_relatives(appointment_id);
CREATE INDEX IF NOT EXISTS idx_appointment_relatives_patient_id ON appointment_relatives(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointment_relatives_family_member_id ON appointment_relatives(family_member_id);
CREATE INDEX IF NOT EXISTS idx_appointment_relatives_examination_id ON appointment_relatives(examination_id);

-- Comment cho bảng và các cột
COMMENT ON TABLE appointment_relatives IS 'Bảng lưu thông tin người đi khám cùng cho từng lần khám (appointment)';
COMMENT ON COLUMN appointment_relatives.appointment_id IS 'ID của appointment (lần khám)';
COMMENT ON COLUMN appointment_relatives.examination_id IS 'ID của examination (có thể null nếu chưa có examination)';
COMMENT ON COLUMN appointment_relatives.patient_id IS 'ID của bệnh nhân chính';
COMMENT ON COLUMN appointment_relatives.family_member_id IS 'ID của family_member nếu người đi cùng là người thân (có thể null)';
COMMENT ON COLUMN appointment_relatives.name IS 'Họ tên người đi cùng';
COMMENT ON COLUMN appointment_relatives.kinship IS 'Quan hệ với bệnh nhân';
COMMENT ON COLUMN appointment_relatives.id_number IS 'CCCD/CMND của người đi cùng (BẮT BUỘC)';
COMMENT ON COLUMN appointment_relatives.phone IS 'Số điện thoại người đi cùng';
COMMENT ON COLUMN appointment_relatives.emergency_contact IS 'Có phải liên hệ khẩn cấp không';

-- Trigger để tự động cập nhật updated_at
CREATE OR REPLACE FUNCTION update_appointment_relatives_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_appointment_relatives_updated_at
    BEFORE UPDATE ON appointment_relatives
    FOR EACH ROW
    EXECUTE FUNCTION update_appointment_relatives_updated_at();

