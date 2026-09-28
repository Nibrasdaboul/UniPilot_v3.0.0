/**
 * Official college mark components and weighted final.
 * Weights live on uni_courses; scores live on official_marks.
 */

export const GRADE_COMPONENTS = [
  { key: 'sai', weightKey: 'weight_sai', ar: 'أعمال الفصل', en: 'Coursework' },
  { key: 'theory', weightKey: 'weight_theory', ar: 'نظري', en: 'Theory' },
  { key: 'practical', weightKey: 'weight_practical', ar: 'عملي', en: 'Practical' },
  { key: 'midterm', weightKey: 'weight_midterm', ar: 'نصفي', en: 'Midterm' },
  { key: 'practical_midterm', weightKey: 'weight_practical_midterm', ar: 'نصفي عملي', en: 'Practical midterm' },
  { key: 'practical_final', weightKey: 'weight_practical_final', ar: 'نهائي عملي', en: 'Practical final' },
  { key: 'theory_final', weightKey: 'weight_theory_final', ar: 'نهائي نظري', en: 'Theory final' },
];

export const PASS_MARK = 50;

/** Course-work sheet keys → official_marks keys (same college weights). */
export const COURSE_WORK_TO_OFFICIAL = {
  sai_theory: ['sai'],
  midterm_theory: ['midterm'],
  final_theory: ['theory', 'theory_final'],
  practical: ['practical', 'practical_final', 'practical_midterm'],
};

export function officialCellFromCourseWork(cell) {
  if (cell == null || cell.score == null || cell.score === '') return null;
  const max = Number(cell.max_score) > 0 ? Number(cell.max_score) : 100;
  const score = Number(cell.score);
  if (!Number.isFinite(score)) return null;
  return { score, max_score: max };
}

export function mapCourseWorkToOfficialMarks(row, options = {}) {
  const mapped = {};
  for (const [courseKey, officialKeys] of Object.entries(COURSE_WORK_TO_OFFICIAL)) {
    const cell = officialCellFromCourseWork(row?.[courseKey]);
    if (!cell) continue;
    for (const key of officialKeys) mapped[key] = { ...cell };
  }
  const allowed = Array.isArray(options.components)
    ? new Set(options.components.map((item) => item.key))
    : null;
  if (allowed) {
    for (const key of Object.keys(mapped)) {
      if (!allowed.has(key)) delete mapped[key];
    }
  }
  return mapped;
}

export function weightedComponents(course) {
  return GRADE_COMPONENTS.map((c) => ({
    ...c,
    weight: Number(course?.[c.weightKey] || 0),
  })).filter((c) => c.weight > 0);
}

/**
 * marksByKey: { midterm: { score, max_score }, ... }
 * Final is a 0–100 percent using component weights.
 */
export function computeOfficialFinal(components, marksByKey = {}) {
  const list = Array.isArray(components) ? components : [];
  const missing = [];
  let points = 0;
  let weightSum = 0;
  for (const c of list) {
    const raw = marksByKey[c.key];
    const score = raw == null || raw.score === '' || raw.score == null ? null : Number(raw.score);
    if (score == null || Number.isNaN(score)) {
      missing.push(c.key);
      continue;
    }
    const max = Number(raw.max_score) > 0 ? Number(raw.max_score) : 100;
    points += (score / max) * Number(c.weight || 0);
    weightSum += Number(c.weight || 0);
  }
  if (missing.length || weightSum <= 0) {
    return { final: null, missing, complete: false, passed: false };
  }
  const final = Math.round((points / weightSum) * 10000) / 100;
  return { final, missing: [], complete: true, passed: final >= PASS_MARK };
}

export function parseMarkInput(value, maxScore = 100) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const max = Number(maxScore) > 0 ? Number(maxScore) : 100;
  if (n < 0 || n > max) {
    const err = new Error(`Score must be between 0 and ${max}`);
    err.status = 400;
    throw err;
  }
  return n;
}

export const MANUAL_OFFICIAL_ENTRY_DETAIL =
  'Official marks can only be published from approved course-work sheets.';

export function assertManualOfficialEntryLocked() {
  const err = new Error(MANUAL_OFFICIAL_ENTRY_DETAIL);
  err.status = 403;
  throw err;
}
