CREATE TABLE IF NOT EXISTS withdrawal_windows (
  id SERIAL PRIMARY KEY,
  term_id INTEGER NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  college_id INTEGER,
  name TEXT NOT NULL,
  opens_at TIMESTAMPTZ NOT NULL,
  closes_at TIMESTAMPTZ,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_withdrawal_windows_term
  ON withdrawal_windows (term_id, college_id);
