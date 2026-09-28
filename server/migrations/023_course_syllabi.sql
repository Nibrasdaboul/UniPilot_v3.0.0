CREATE TABLE IF NOT EXISTS college_course_syllabi (
  id SERIAL PRIMARY KEY,
  college_id INTEGER NOT NULL,
  catalog_course_id INTEGER NOT NULL REFERENCES catalog_courses(id) ON DELETE CASCADE,
  theory_syllabus TEXT,
  practical_syllabus TEXT,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (college_id, catalog_course_id)
);

CREATE INDEX IF NOT EXISTS idx_college_course_syllabi_college
  ON college_course_syllabi (college_id, catalog_course_id);
