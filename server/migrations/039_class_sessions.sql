CREATE TABLE IF NOT EXISTS class_sessions (
  id SERIAL PRIMARY KEY,
  university_id INTEGER NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
  term_id INTEGER NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  offering_id INTEGER NOT NULL REFERENCES course_offerings(id) ON DELETE CASCADE,
  section_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  meeting_id INTEGER REFERENCES section_meetings(id) ON DELETE SET NULL,
  kind TEXT NOT NULL DEFAULT 'regular' CHECK (kind IN ('regular', 'makeup')),
  makeup_for_session_id INTEGER REFERENCES class_sessions(id) ON DELETE SET NULL,
  session_date DATE NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  room TEXT,
  staff_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'held', 'late', 'absent', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_class_sessions_regular
  ON class_sessions (meeting_id, session_date) WHERE kind = 'regular';

CREATE INDEX IF NOT EXISTS idx_class_sessions_offering
  ON class_sessions (offering_id, session_date, start_time);

CREATE INDEX IF NOT EXISTS idx_class_sessions_staff
  ON class_sessions (staff_user_id, session_date);

CREATE TABLE IF NOT EXISTS staff_session_attendance (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL UNIQUE REFERENCES class_sessions(id) ON DELETE CASCADE,
  staff_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('present', 'late', 'absent', 'excused')),
  checked_in_at TIMESTAMPTZ,
  late_minutes INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'check_in' CHECK (source IN ('check_in', 'vda', 'auto')),
  note TEXT,
  recorded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS staff_session_requests (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
  staff_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('absence_notice', 'makeup')),
  reason TEXT,
  proposed_date DATE,
  proposed_start TEXT,
  proposed_end TEXT,
  proposed_room TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  decision_note TEXT,
  decided_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  makeup_session_id INTEGER REFERENCES class_sessions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_session_requests_pending
  ON staff_session_requests (session_id, kind) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS staff_absence_reports (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
  student_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (session_id, student_user_id)
);

ALTER TABLE attendance_sessions ADD COLUMN IF NOT EXISTS class_session_id INTEGER REFERENCES class_sessions(id) ON DELETE SET NULL;

ALTER TABLE college_academic_settings ADD COLUMN IF NOT EXISTS staff_grace_minutes INTEGER NOT NULL DEFAULT 10;
ALTER TABLE college_academic_settings ADD COLUMN IF NOT EXISTS staff_late_absent_minutes INTEGER NOT NULL DEFAULT 30;
ALTER TABLE college_academic_settings ADD COLUMN IF NOT EXISTS staff_check_in_before_minutes INTEGER NOT NULL DEFAULT 15;
ALTER TABLE college_academic_settings ADD COLUMN IF NOT EXISTS makeup_request_days INTEGER NOT NULL DEFAULT 7;
ALTER TABLE college_academic_settings ADD COLUMN IF NOT EXISTS student_report_after_minutes INTEGER NOT NULL DEFAULT 15;
