import { normalizeRole, ROLES } from './roles.js';

export const COURSE_WORK_COMPONENTS = [
  { key: 'midterm_theory', ar: 'ميدتيرم النظري', en: 'Theory midterm' },
  { key: 'sai_theory', ar: 'سعي النظري', en: 'Theory coursework' },
  { key: 'final_theory', ar: 'الامتحان النهائي النظري', en: 'Theory final exam' },
  { key: 'practical', ar: 'العملي (امتحان / مشروع / تقييم)', en: 'Practical (exam / project / eval)' },
];

export const THEORY_GRADE_COMPONENTS = ['midterm_theory', 'sai_theory', 'final_theory'];
export const AUTOMATED_THEORY_COMPONENTS = ['midterm_theory', 'final_theory'];
export const PRACTICAL_GRADE_COMPONENTS = ['practical'];

export function isAutomatedTheoryComponent(component) {
  return AUTOMATED_THEORY_COMPONENTS.includes(String(component || '').trim());
}

export function canEditCourseWorkComponent(role, component) {
  const parsed = parseCourseWorkComponent(component);
  if (parsed.error) return { ok: false, error: parsed.error };
  const n = normalizeRole(role);
  if (n === ROLES.INSTRUCTOR && THEORY_GRADE_COMPONENTS.includes(parsed.component)) {
    return { ok: true, component: parsed.component };
  }
  if (n === ROLES.TEACHING_ASSISTANT && PRACTICAL_GRADE_COMPONENTS.includes(parsed.component)) {
    return { ok: true, component: parsed.component };
  }
  if (n === ROLES.EXAMS_OFFICE) {
    return { ok: true, component: parsed.component };
  }
  if (n === ROLES.INSTRUCTOR) {
    return { ok: false, error: 'Instructors can only enter theory marks' };
  }
  if (n === ROLES.TEACHING_ASSISTANT) {
    return { ok: false, error: 'Teaching assistants can only enter practical marks' };
  }
  return { ok: false, error: 'You cannot enter marks for this component' };
}

export const PRACTICAL_KINDS = [
  { key: 'exam', ar: 'امتحان', en: 'Exam' },
  { key: 'project', ar: 'مشروع', en: 'Project' },
  { key: 'eval', ar: 'تقييم', en: 'Evaluation' },
];

export const COURSE_WORK_MAX_SCORE_LIMIT = 1000;

export function parseCourseWorkComponent(value) {
  const key = String(value || '').trim();
  if (!COURSE_WORK_COMPONENTS.some((c) => c.key === key)) {
    return { error: 'component must be midterm_theory, sai_theory, final_theory, or practical' };
  }
  return { error: null, component: key };
}

export function parsePracticalKind(value) {
  if (value == null || value === '') return { error: null, kind: 'exam' };
  const kind = String(value).trim();
  if (!PRACTICAL_KINDS.some((k) => k.key === kind)) {
    return { error: 'practical_kind must be exam, project, or eval' };
  }
  return { error: null, kind };
}

export function parseCourseWorkMark(body) {
  const component = parseCourseWorkComponent(body?.component);
  if (component.error) return { error: component.error };

  const hasScore = Object.prototype.hasOwnProperty.call(body || {}, 'score');
  const hasMax = Object.prototype.hasOwnProperty.call(body || {}, 'max_score');
  let max = undefined;
  if (hasMax) {
    max = body.max_score === '' || body.max_score == null ? 100 : Number(body.max_score);
    if (!Number.isFinite(max) || max <= 0 || max > COURSE_WORK_MAX_SCORE_LIMIT) {
      return { error: `max_score must be between 1 and ${COURSE_WORK_MAX_SCORE_LIMIT}` };
    }
  }

  let score = undefined;
  if (hasScore) {
    if (body.score === '' || body.score == null) {
      score = null;
    } else {
      score = Number(body.score);
      const cap = max ?? COURSE_WORK_MAX_SCORE_LIMIT;
      if (!Number.isFinite(score) || score < 0 || score > cap) {
        return { error: `score must be between 0 and ${cap}` };
      }
    }
  }

  let practicalKind = null;
  if (component.component === 'practical') {
    const kind = parsePracticalKind(body?.practical_kind);
    if (kind.error) return { error: kind.error };
    practicalKind = kind.kind;
  }

  if (!hasScore && !hasMax && body?.practical_kind == null) {
    return { error: 'score, max_score, or practical_kind is required' };
  }

  return {
    error: null,
    component: component.component,
    score,
    max_score: max,
    practical_kind: practicalKind,
    has_score: hasScore,
    has_max: hasMax,
  };
}

export function computeCourseWorkPercent(row, weights = {}) {
  const parts = [
    { key: 'midterm_theory', weight: Number(weights.weight_midterm ?? weights.midterm) || 0 },
    { key: 'sai_theory', weight: Number(weights.weight_sai ?? weights.sai) || 0 },
    { key: 'final_theory', weight: Number(weights.weight_theory ?? weights.theory) || 0 },
    { key: 'practical', weight: Number(weights.weight_practical ?? weights.practical) || 0 },
  ];
  const weightSum = parts.reduce((sum, part) => sum + part.weight, 0);
  let scored = 0;
  let usedWeight = 0;
  let usedCount = 0;
  let equalSum = 0;
  for (const part of parts) {
    const cell = row?.[part.key];
    if (cell?.score == null || cell.score === '') continue;
    const max = Number(cell.max_score) || 100;
    const pct = max > 0 ? (Number(cell.score) / max) * 100 : 0;
    equalSum += pct;
    usedCount += 1;
    if (part.weight > 0) {
      scored += pct * part.weight;
      usedWeight += part.weight;
    }
  }
  if (weightSum > 0 && usedWeight > 0) {
    return Math.round((scored / usedWeight) * 100) / 100;
  }
  if (usedCount === 0) return null;
  return Math.round((equalSum / usedCount) * 100) / 100;
}
