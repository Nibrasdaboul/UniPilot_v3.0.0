ALTER TABLE student_complaints ADD COLUMN IF NOT EXISTS complaint_type TEXT NOT NULL DEFAULT 'other';
