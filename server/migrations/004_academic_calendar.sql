-- College academic calendar flags on existing academic_terms.
ALTER TABLE academic_terms ADD COLUMN is_closed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE academic_terms ADD COLUMN closed_at TIMESTAMPTZ;
ALTER TABLE academic_terms ADD COLUMN opened_by INTEGER;
