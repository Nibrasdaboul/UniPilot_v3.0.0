ALTER TABLE student_project_requests ADD COLUMN IF NOT EXISTS team_size INTEGER;
ALTER TABLE student_project_requests ADD COLUMN IF NOT EXISTS pdf_url TEXT;
ALTER TABLE student_project_requests ADD COLUMN IF NOT EXISTS pdf_name TEXT;

CREATE TABLE IF NOT EXISTS student_project_request_members (
  id SERIAL PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES student_project_requests(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  university_id TEXT NOT NULL,
  gpa NUMERIC,
  completed_hours NUMERIC,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_student_project_request_members_request
  ON student_project_request_members (request_id, sort_order);
