ALTER TABLE enrollments DROP CONSTRAINT IF EXISTS enrollments_status_check;
ALTER TABLE enrollments ADD CONSTRAINT enrollments_status_check CHECK (status IN ('enrolled', 'dropped', 'withdrawn'));
ALTER TABLE enrollments ADD COLUMN withdrawn_at TIMESTAMPTZ;
ALTER TABLE student_courses ADD COLUMN withdrawn_at TIMESTAMPTZ;
ALTER TABLE student_semesters ADD COLUMN frozen_at TIMESTAMPTZ;
