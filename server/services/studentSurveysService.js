import { db } from '../db.js';
import { parseSurveyAnswers } from '../college/surveys.js';

function httpError(status, detail) {
  const err = new Error(detail);
  err.status = status;
  throw err;
}

function collegeId(user) {
  return user?.college_id != null ? Number(user.college_id) : 1;
}

async function loadPublishedSurvey(id, cid) {
  const survey = await db.prepare(`
    SELECT id, title, description, status, published_at
    FROM college_surveys
    WHERE id = ? AND college_id = ? AND status = 'published'
  `).get(id, cid);
  if (!survey) httpError(404, 'Survey not found');
  const questions = await db.prepare(`
    SELECT id, prompt, sort_order
    FROM college_survey_questions
    WHERE survey_id = ?
    ORDER BY sort_order ASC, id ASC
  `).all(survey.id);
  const optionsByQuestion = new Map();
  if (questions.length) {
    const placeholders = questions.map(() => '?').join(', ');
    const options = await db.prepare(`
      SELECT id, question_id, option_text, sort_order
      FROM college_survey_options
      WHERE question_id IN (${placeholders})
      ORDER BY sort_order ASC, id ASC
    `).all(...questions.map((q) => q.id));
    for (const opt of options) {
      const list = optionsByQuestion.get(Number(opt.question_id)) || [];
      list.push({ id: opt.id, option_text: opt.option_text });
      optionsByQuestion.set(Number(opt.question_id), list);
    }
  }
  return {
    ...survey,
    questions: questions.map((q) => ({
      id: q.id,
      prompt: q.prompt,
      option_rows: optionsByQuestion.get(Number(q.id)) || [],
      options: optionsByQuestion.get(Number(q.id)) || [],
    })),
  };
}

async function loadStudentResponse(surveyId, userId) {
  const response = await db.prepare(`
    SELECT id, submitted_at
    FROM college_survey_responses
    WHERE survey_id = ? AND student_user_id = ?
  `).get(surveyId, userId);
  if (!response) return null;
  const answers = await db.prepare(`
    SELECT question_id, option_id
    FROM college_survey_answers
    WHERE response_id = ?
    ORDER BY id ASC
  `).all(response.id);
  return { id: response.id, submitted_at: response.submitted_at, answers };
}

function publicSurvey(survey, response) {
  return {
    id: survey.id,
    title: survey.title,
    description: survey.description,
    published_at: survey.published_at,
    submitted: Boolean(response),
    submitted_at: response?.submitted_at || null,
    questions: survey.questions.map((q) => ({
      id: q.id,
      prompt: q.prompt,
      options: q.options,
    })),
    answers: response?.answers || [],
  };
}

export async function getStudentSurveys(user) {
  const cid = collegeId(user);
  const rows = await db.prepare(`
    SELECT id
    FROM college_surveys
    WHERE college_id = ? AND status = 'published'
    ORDER BY published_at DESC NULLS LAST, id DESC
  `).all(cid);
  const surveys = [];
  let submitted = 0;
  for (const row of rows) {
    const survey = await loadPublishedSurvey(row.id, cid);
    const response = await loadStudentResponse(survey.id, user.id);
    if (response) submitted += 1;
    surveys.push(publicSurvey(survey, response));
  }
  return {
    surveys,
    counts: {
      published: surveys.length,
      submitted,
      pending: surveys.length - submitted,
    },
  };
}

export async function submitStudentSurvey(user, surveyId, body) {
  const cid = collegeId(user);
  const survey = await loadPublishedSurvey(surveyId, cid);
  const existing = await loadStudentResponse(survey.id, user.id);
  if (existing) httpError(400, 'You have already submitted this survey');
  const parsed = parseSurveyAnswers(body?.answers, survey.questions);
  if (parsed.error) httpError(400, parsed.error);
  const inserted = await db.prepare(`
    INSERT INTO college_survey_responses (survey_id, student_user_id)
    VALUES (?, ?)
  `).run(survey.id, user.id);
  for (const answer of parsed.answers) {
    await db.prepare(`
      INSERT INTO college_survey_answers (response_id, question_id, option_id)
      VALUES (?, ?, ?)
    `).run(inserted.lastInsertRowid, answer.question_id, answer.option_id);
  }
  const refreshed = await getStudentSurveys(user);
  return {
    ...refreshed,
    survey: refreshed.surveys.find((s) => Number(s.id) === Number(survey.id)) || null,
  };
}
