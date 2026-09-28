CREATE TABLE IF NOT EXISTS research_publications (
  id SERIAL PRIMARY KEY,
  college_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  authors TEXT,
  venue TEXT,
  published_on DATE,
  department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  author_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'published',
  notes TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_research_publications_college
  ON research_publications (college_id, published_on DESC NULLS LAST, id DESC);

CREATE TABLE IF NOT EXISTS graduation_projects (
  id SERIAL PRIMARY KEY,
  college_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  student_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  student_name TEXT,
  supervisor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  supervisor_name TEXT,
  department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  kind TEXT NOT NULL DEFAULT 'bachelor',
  status TEXT NOT NULL DEFAULT 'pending',
  decided_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  decision_note TEXT,
  decided_at TIMESTAMPTZ,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_graduation_projects_college
  ON graduation_projects (college_id, status, id DESC);

CREATE TABLE IF NOT EXISTS graduation_committee_members (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES graduation_projects(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  committee_role TEXT NOT NULL DEFAULT 'member'
);

CREATE INDEX IF NOT EXISTS idx_graduation_committee_project
  ON graduation_committee_members (project_id);
