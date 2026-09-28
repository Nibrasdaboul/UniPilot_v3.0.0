CREATE TABLE IF NOT EXISTS course_work_sheets (
  id SERIAL PRIMARY KEY,
  college_id INTEGER NOT NULL,
  catalog_course_id INTEGER NOT NULL REFERENCES catalog_courses(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'staff_draft',
  theory_midterm_automated INTEGER NOT NULL DEFAULT 0,
  submitted_at TIMESTAMPTZ,
  submitted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (college_id, catalog_course_id)
);

CREATE INDEX IF NOT EXISTS idx_course_work_sheets_college
  ON course_work_sheets (college_id, status);
