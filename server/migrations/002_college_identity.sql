-- College identity extras. university_id already exists as FK to universities.
-- person_code (login ID) is added in 003_person_code.sql.
-- Keep this file harmless on databases that already have colleges/departments.

ALTER TABLE users ADD COLUMN enrollment_year INTEGER;
ALTER TABLE users ADD COLUMN created_by INTEGER;
