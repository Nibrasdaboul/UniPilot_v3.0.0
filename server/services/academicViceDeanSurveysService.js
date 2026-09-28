import { db } from '../db.js';
import { parseSurveyQuestions, surveyPublishError, tallyOptionResults } from '../college/surveys.js';

function httpError(status, detail) {
  const err = new Error(detail);
  err.status = status;
  throw err;
}

function collegeId(user) {
  const cid = user?.college_id != null ? Number(user.college_id) : null;
  if (cid == null) httpError(400, 'Vice Dean is not attached to a college');
  return cid;
}

function trimOrNull(value) {
  const text = String(value || '').trim();
  return text || null;
}

async function loadSurvey(id, cid) {
  const survey = await db.prepare(`
    SELECT id, college_id, title, description, status, created_by, published_at, created_at, updated_at
    FROM college_surveys
    WHERE id = ? AND college_id = ?
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
      list.push({ id: opt.id, option_text: opt.option_text, sort_order: opt.sort_order });
      optionsByQuestion.set(Number(opt.question_id), list);
    }
  }
  const responses = await db.prepare(
    'SELECT COUNT(*)::int AS n FROM college_survey_responses WHERE survey_id = ?'
  ).get(survey.id);
  const responseCount = Number(responses?.n) || 0;
  const tallies = responseCount
    ? await db.prepare(`
        SELECT a.option_id, COUNT(*)::int AS n
        FROM college_survey_answers a
        INNER JOIN college_survey_responses r ON r.id = a.response_id
        WHERE r.survey_id = ?
        GROUP BY a.option_id
      `).all(survey.id)
    : [];
  const countsByOptionId = Object.fromEntries((tallies || []).map((row) => [row.option_id, Number(row.n) || 0]));
  return {
    ...survey,
    response_count: responseCount,
    questions: questions.map((q) => {
      const optionRows = optionsByQuestion.get(Number(q.id)) || [];
      return {
        id: q.id,
        prompt: q.prompt,
        sort_order: q.sort_order,
        options: tallyOptionResults(optionRows, countsByOptionId, responseCount),
        option_rows: optionRows,
      };
    }),
  };
}

async function replaceQuestions(surveyId, questions) {
  await db.prepare('DELETE FROM college_survey_questions WHERE survey_id = ?').run(surveyId);
  for (const [index, question] of questions.entries()) {
    const inserted = await db.prepare(`
      INSERT INTO college_survey_questions (survey_id, prompt, sort_order)
      VALUES (?, ?, ?)
    `).run(surveyId, question.prompt, index);
    const questionId = inserted.lastInsertRowid;
    for (const [optIndex, optionText] of question.options.entries()) {
      await db.prepare(`
        INSERT INTO college_survey_options (question_id, option_text, sort_order)
        VALUES (?, ?, ?)
      `).run(questionId, optionText, optIndex);
    }
  }
}

function parsedDraft(body) {
  const title = String(body?.title || '').trim();
  const description = trimOrNull(body?.description);
  const questions = parseSurveyQuestions(body?.questions);
  return { title, description, questions };
}

export async function listAcademicViceDeanSurveys(user) {
  const cid = collegeId(user);
  const rows = await db.prepare(`
    SELECT id, title, description, status, published_at, created_at, updated_at
    FROM college_surveys
    WHERE college_id = ?
    ORDER BY CASE status WHEN 'draft' THEN 0 ELSE 1 END, id DESC
  `).all(cid);
  const surveys = [];
  for (const row of rows) {
    surveys.push(await loadSurvey(row.id, cid));
  }
  return {
    surveys,
    counts: {
      total: surveys.length,
      draft: surveys.filter((s) => s.status === 'draft').length,
      published: surveys.filter((s) => s.status === 'published').length,
      responses: surveys.reduce((sum, s) => sum + (Number(s.response_count) || 0), 0),
    },
  };
}

export async function createAcademicViceDeanSurvey(user, body) {
  const cid = collegeId(user);
  const draft = parsedDraft(body);
  if (!draft.title) httpError(400, 'Survey title is required');
  const inserted = await db.prepare(`
    INSERT INTO college_surveys (college_id, title, description, status, created_by)
    VALUES (?, ?, ?, 'draft', ?)
  `).run(cid, draft.title, draft.description, user.id);
  await replaceQuestions(inserted.lastInsertRowid, draft.questions);
  return loadSurvey(inserted.lastInsertRowid, cid);
}

export async function updateAcademicViceDeanSurvey(user, id, body) {
  const cid = collegeId(user);
  const existing = await loadSurvey(id, cid);
  if (existing.status !== 'draft') httpError(400, 'Published surveys cannot be edited');
  const draft = parsedDraft({
    title: body?.title != null ? body.title : existing.title,
    description: body?.description !== undefined ? body.description : existing.description,
    questions: body?.questions != null ? body.questions : existing.questions,
  });
  if (!draft.title) httpError(400, 'Survey title is required');
  await db.prepare(`
    UPDATE college_surveys
    SET title = ?, description = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(draft.title, draft.description, existing.id);
  if (body?.questions != null) {
    await replaceQuestions(existing.id, draft.questions);
  }
  return loadSurvey(existing.id, cid);
}

export async function publishAcademicViceDeanSurvey(user, id) {
  const cid = collegeId(user);
  const existing = await loadSurvey(id, cid);
  if (existing.status === 'published') return existing;
  const error = surveyPublishError(existing);
  if (error) httpError(400, error);
  await db.prepare(`
    UPDATE college_surveys
    SET status = 'published', published_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(existing.id);
  return loadSurvey(existing.id, cid);
}
