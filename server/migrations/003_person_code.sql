-- Login identifier (e.g. 0220411199). Separate from users.university_id (FK to universities).
ALTER TABLE users ADD COLUMN person_code TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_person_code ON users(person_code);
