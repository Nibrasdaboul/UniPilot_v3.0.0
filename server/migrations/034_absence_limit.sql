ALTER TABLE college_academic_settings
  ADD COLUMN IF NOT EXISTS absence_limit INTEGER NOT NULL DEFAULT 4;
