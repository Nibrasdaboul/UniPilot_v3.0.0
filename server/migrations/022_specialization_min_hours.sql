ALTER TABLE college_academic_settings
  ADD COLUMN IF NOT EXISTS specialization_min_hours INTEGER DEFAULT 110;
