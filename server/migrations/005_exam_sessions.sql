ALTER TABLE exam_sessions ADD COLUMN exam_type TEXT;
ALTER TABLE exam_sessions ADD COLUMN is_published INTEGER NOT NULL DEFAULT 0;
