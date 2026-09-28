ALTER TABLE course_work_sheets ADD COLUMN IF NOT EXISTS instructor_confirmed_at TIMESTAMPTZ;
ALTER TABLE course_work_sheets ADD COLUMN IF NOT EXISTS ta_confirmed_at TIMESTAMPTZ;
ALTER TABLE course_work_sheets ADD COLUMN IF NOT EXISTS exams_adopted_at TIMESTAMPTZ;
ALTER TABLE course_work_sheets ADD COLUMN IF NOT EXISTS exams_adopted_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE course_work_sheets ADD COLUMN IF NOT EXISTS vda_confirmed_at TIMESTAMPTZ;
ALTER TABLE course_work_sheets ADD COLUMN IF NOT EXISTS vda_confirmed_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE course_work_sheets ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
