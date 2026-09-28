-- Shared profile fields for every role. Existing users stay valid (nullable / defaults).
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name_ar TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name_en TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS national_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_date DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_place TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS nationality TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_official TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_personal TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS home_address TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active';

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_national_id
  ON users (national_id)
  WHERE national_id IS NOT NULL AND btrim(national_id) <> '';

-- Role-specific files. GPA / completed hours stay on the official academic record.
CREATE TABLE IF NOT EXISTS student_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  college_id INTEGER,
  department_id INTEGER,
  major TEXT,
  study_year INTEGER,
  admission_type TEXT,
  academic_status TEXT NOT NULL DEFAULT 'new',
  high_school_score NUMERIC,
  high_school_track TEXT,
  high_school_year INTEGER,
  emergency_name TEXT,
  emergency_relation TEXT,
  emergency_phone TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS faculty_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  employee_code TEXT,
  academic_rank TEXT,
  department_id INTEGER,
  general_specialty TEXT,
  specific_specialty TEXT,
  highest_degree TEXT,
  degree_university TEXT,
  degree_year INTEGER,
  thesis_title TEXT,
  contract_type TEXT,
  teaching_load_hours NUMERIC,
  start_date DATE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ta_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  employee_code TEXT,
  department_id INTEGER,
  specialty TEXT,
  supervisor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  bachelor_gpa NUMERIC,
  bachelor_year INTEGER,
  postgraduate_studying INTEGER NOT NULL DEFAULT 0,
  postgraduate_program TEXT,
  assigned_labs TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS staff_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  employee_code TEXT,
  job_title TEXT,
  office_unit TEXT,
  college_id INTEGER,
  access_permissions TEXT,
  hire_date DATE,
  employment_type TEXT,
  work_shift TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
