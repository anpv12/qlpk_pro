-- Tạo bảng lưu kết nối Google Calendar của từng user
CREATE TABLE IF NOT EXISTS google_calendar_connections (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- Tạo bảng lưu mapping giữa appointment và Google Calendar event
CREATE TABLE IF NOT EXISTS google_calendar_events (
    id SERIAL PRIMARY KEY,
    appointment_id INTEGER NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
    event_id VARCHAR(255) NOT NULL,  -- Google Calendar event ID
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(appointment_id)
);

-- Tạo index để tăng tốc query
CREATE INDEX IF NOT EXISTS idx_google_calendar_connections_user_id ON google_calendar_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_google_calendar_connections_is_active ON google_calendar_connections(is_active);
CREATE INDEX IF NOT EXISTS idx_google_calendar_events_appointment_id ON google_calendar_events(appointment_id);
CREATE INDEX IF NOT EXISTS idx_google_calendar_events_event_id ON google_calendar_events(event_id);

