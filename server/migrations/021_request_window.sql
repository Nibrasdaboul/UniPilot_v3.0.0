ALTER TABLE college_academic_settings ADD COLUMN IF NOT EXISTS request_window_start TIMESTAMPTZ;
ALTER TABLE college_academic_settings ADD COLUMN IF NOT EXISTS request_window_end TIMESTAMPTZ;
