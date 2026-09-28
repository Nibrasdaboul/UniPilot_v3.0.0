CREATE TABLE IF NOT EXISTS college_project_tracks (
  id SERIAL PRIMARY KEY,
  college_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  catalog_course_id INTEGER REFERENCES catalog_courses(id) ON DELETE SET NULL,
  request_min_hours INTEGER NOT NULL DEFAULT 90,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (college_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_college_project_tracks_college
  ON college_project_tracks (college_id, kind);
