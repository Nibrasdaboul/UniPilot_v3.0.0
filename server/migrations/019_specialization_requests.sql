CREATE TABLE IF NOT EXISTS student_specialization_requests (
  id SERIAL PRIMARY KEY,
  college_id INTEGER NOT NULL,
  student_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pending',
  vda_note TEXT,
  decided_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_student_specialization_student
  ON student_specialization_requests (student_user_id, id DESC);

CREATE INDEX IF NOT EXISTS idx_student_specialization_college
  ON student_specialization_requests (college_id, status, id DESC);
