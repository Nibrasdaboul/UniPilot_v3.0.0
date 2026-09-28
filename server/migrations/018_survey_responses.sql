CREATE TABLE IF NOT EXISTS college_survey_responses (
  id SERIAL PRIMARY KEY,
  survey_id INTEGER NOT NULL REFERENCES college_surveys(id) ON DELETE CASCADE,
  student_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  submitted_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (survey_id, student_user_id)
);

CREATE INDEX IF NOT EXISTS idx_college_survey_responses_student
  ON college_survey_responses (student_user_id, submitted_at DESC);

CREATE TABLE IF NOT EXISTS college_survey_answers (
  id SERIAL PRIMARY KEY,
  response_id INTEGER NOT NULL REFERENCES college_survey_responses(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES college_survey_questions(id) ON DELETE CASCADE,
  option_id INTEGER NOT NULL REFERENCES college_survey_options(id) ON DELETE CASCADE,
  UNIQUE (response_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_college_survey_answers_response
  ON college_survey_answers (response_id);
