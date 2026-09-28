CREATE TABLE IF NOT EXISTS college_academic_settings (
  college_id INTEGER PRIMARY KEY,
  project_request_min_hours INTEGER NOT NULL DEFAULT 90,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
