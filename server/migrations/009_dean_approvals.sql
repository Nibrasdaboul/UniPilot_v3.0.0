CREATE TABLE IF NOT EXISTS dean_approvals (
  id SERIAL PRIMARY KEY,
  college_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  source_table TEXT NOT NULL DEFAULT 'inbox',
  source_id INTEGER NOT NULL DEFAULT 0,
  payload TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  submitted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  decided_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  decision_note TEXT,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dean_approvals_source
  ON dean_approvals (college_id, kind, source_table, source_id);

CREATE INDEX IF NOT EXISTS idx_dean_approvals_pending
  ON dean_approvals (college_id, status, kind);
