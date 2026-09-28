CREATE TABLE IF NOT EXISTS course_staff_chat_messages (
  id SERIAL PRIMARY KEY,
  college_id INTEGER NOT NULL,
  catalog_course_id INTEGER NOT NULL REFERENCES catalog_courses(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_course_staff_chat_course
  ON course_staff_chat_messages (college_id, catalog_course_id, id);
