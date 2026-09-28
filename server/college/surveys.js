export const SURVEY_STATUSES = ['draft', 'published'];
export const SURVEY_OPTION_MIN = 2;
export const SURVEY_OPTION_MAX = 8;

export function parseSurveyStatus(value) {
  const status = String(value || '').trim();
  return SURVEY_STATUSES.includes(status) ? status : null;
}

export function parseSurveyQuestions(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const questions = [];
  for (const item of list) {
    const prompt = String(item?.prompt || item?.text || '').trim();
    const options = (Array.isArray(item?.options) ? item.options : [])
      .map((opt) => String(typeof opt === 'string' ? opt : opt?.option_text || opt?.text || '').trim())
      .filter(Boolean)
      .slice(0, SURVEY_OPTION_MAX);
    if (!prompt && options.length === 0) continue;
    questions.push({ prompt, options });
  }
  return questions;
}

export function surveyPublishError(survey) {
  const title = String(survey?.title || '').trim();
  if (!title) return 'Survey title is required';
  const questions = Array.isArray(survey?.questions) ? survey.questions : [];
  if (!questions.length) return 'Add at least one multiple-choice question';
  for (const question of questions) {
    if (!String(question.prompt || '').trim()) return 'Every question needs a prompt';
    const options = question.options || [];
    if (options.length < SURVEY_OPTION_MIN) {
      return `Each question needs at least ${SURVEY_OPTION_MIN} choices`;
    }
  }
  return null;
}

export function canPublishSurvey(survey) {
  return surveyPublishError(survey) == null;
}

export function tallyOptionResults(optionRows, countsByOptionId, responseCount) {
  const total = Number(responseCount) || 0;
  return (optionRows || []).map((opt) => {
    const count = Number(countsByOptionId?.[opt.id] || 0);
    return {
      id: opt.id,
      option_text: opt.option_text,
      count,
      percent: total > 0 ? Math.round((count / total) * 100) : 0,
    };
  });
}

export function parseSurveyAnswers(raw, questions) {
  const incoming = Array.isArray(raw) ? raw : [];
  const picked = new Map();
  for (const item of incoming) {
    const questionId = Number(item?.question_id);
    const optionId = Number(item?.option_id);
    if (Number.isInteger(questionId) && Number.isInteger(optionId)) {
      picked.set(questionId, optionId);
    }
  }
  const answers = [];
  for (const question of questions || []) {
    const optionId = picked.get(Number(question.id));
    const options = question.option_rows || [];
    const valid = options.some((opt) => Number(opt.id) === optionId);
    if (!valid) {
      return { error: 'Answer every question with one of its choices', answers: [] };
    }
    answers.push({ question_id: Number(question.id), option_id: optionId });
  }
  return { error: null, answers };
}
