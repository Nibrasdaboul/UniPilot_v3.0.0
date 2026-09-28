CREATE TABLE IF NOT EXISTS student_project_requests (
  id SERIAL PRIMARY KEY,
  college_id INTEGER NOT NULL,
  student_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  vda_note TEXT,
  decided_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_student_project_requests_student
  ON student_project_requests (student_user_id, kind, id DESC);

CREATE INDEX IF NOT EXISTS idx_student_project_requests_college
  ON student_project_requests (college_id, status, id DESC);
