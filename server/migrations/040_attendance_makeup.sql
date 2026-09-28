CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_sessions_class_session
  ON attendance_sessions (class_session_id)
  WHERE class_session_id IS NOT NULL;
