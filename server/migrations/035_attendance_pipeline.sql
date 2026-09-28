CREATE TABLE IF NOT EXISTS attendance_sheets (
  id SERIAL PRIMARY KEY,
  college_id INTEGER NOT NULL,
  catalog_course_id INTEGER NOT NULL REFERENCES catalog_courses(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'staff_draft',
  submitted_at TIMESTAMPTZ,
  submitted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  exams_adopted_at TIMESTAMPTZ,
  exams_adopted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  instructor_confirmed_at TIMESTAMPTZ,
  ta_confirmed_at TIMESTAMPTZ,
  vda_confirmed_at TIMESTAMPTZ,
  vda_confirmed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (college_id, catalog_course_id)
);

CREATE TABLE IF NOT EXISTS course_deprivations (
  id SERIAL PRIMARY KEY,
  college_id INTEGER NOT NULL,
  catalog_course_id INTEGER NOT NULL REFERENCES catalog_courses(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active',
  note TEXT,
  applied_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (college_id, catalog_course_id, user_id)
);

CREATE TABLE IF NOT EXISTS deprivation_cancel_requests (
  id SERIAL PRIMARY KEY,
  deprivation_id INTEGER NOT NULL REFERENCES course_deprivations(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  decision_note TEXT,
  decided_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_attendance_sheets_college
  ON attendance_sheets (college_id, status);
CREATE INDEX IF NOT EXISTS idx_course_deprivations_catalog
  ON course_deprivations (college_id, catalog_course_id, status);
