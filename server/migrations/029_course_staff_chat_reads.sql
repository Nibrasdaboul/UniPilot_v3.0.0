CREATE TABLE IF NOT EXISTS course_staff_chat_reads (
  id SERIAL PRIMARY KEY,
  college_id INTEGER NOT NULL,
  catalog_course_id INTEGER NOT NULL REFERENCES catalog_courses(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (college_id, catalog_course_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_course_staff_chat_reads_user
  ON course_staff_chat_reads (college_id, user_id);
