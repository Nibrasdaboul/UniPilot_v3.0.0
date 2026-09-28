CREATE TABLE IF NOT EXISTS college_gpa_scale (
  id SERIAL PRIMARY KEY,
  college_id INTEGER NOT NULL,
  min_mark NUMERIC(5,2) NOT NULL,
  max_mark NUMERIC(5,2) NOT NULL,
  points NUMERIC(4,2) NOT NULL,
  letter TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_college_gpa_scale_college
  ON college_gpa_scale (college_id, min_mark DESC);
