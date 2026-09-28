CREATE TABLE IF NOT EXISTS course_work_marks (
  id SERIAL PRIMARY KEY,
  college_id INTEGER NOT NULL,
  catalog_course_id INTEGER NOT NULL REFERENCES catalog_courses(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  component TEXT NOT NULL CHECK (component = ANY (ARRAY['midterm_theory'::text, 'sai_theory'::text, 'practical'::text])),
  score REAL,
  max_score REAL NOT NULL DEFAULT 100,
  practical_kind TEXT CHECK (practical_kind IS NULL OR practical_kind = ANY (ARRAY['exam'::text, 'project'::text, 'eval'::text])),
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (college_id, catalog_course_id, user_id, component)
);

CREATE INDEX IF NOT EXISTS idx_course_work_marks_course
  ON course_work_marks (college_id, catalog_course_id, user_id);
