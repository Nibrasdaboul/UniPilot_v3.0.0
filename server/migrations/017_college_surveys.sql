CREATE TABLE IF NOT EXISTS college_surveys (
  id SERIAL PRIMARY KEY,
  college_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_college_surveys_college
  ON college_surveys (college_id, status, id DESC);

CREATE TABLE IF NOT EXISTS college_survey_questions (
  id SERIAL PRIMARY KEY,
  survey_id INTEGER NOT NULL REFERENCES college_surveys(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_college_survey_questions_survey
  ON college_survey_questions (survey_id, sort_order, id);

CREATE TABLE IF NOT EXISTS college_survey_options (
  id SERIAL PRIMARY KEY,
  question_id INTEGER NOT NULL REFERENCES college_survey_questions(id) ON DELETE CASCADE,
  option_text TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_college_survey_options_question
  ON college_survey_options (question_id, sort_order, id);
