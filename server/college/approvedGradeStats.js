import { PASS_MARK } from './officialGrades.js';

export const GRADE_CURVE_BUCKETS = [
  { key: '0-49', ar: 'راسب', en: 'Fail', min: 0, max: 49 },
  { key: '50-59', ar: 'مقبول', en: 'Pass', min: 50, max: 59 },
  { key: '60-69', ar: 'جيد', en: 'Good', min: 60, max: 69 },
  { key: '70-79', ar: 'جيد جداً', en: 'Very good', min: 70, max: 79 },
  { key: '80-89', ar: 'ممتاز', en: 'Excellent', min: 80, max: 89 },
  { key: '90-100', ar: 'امتياز', en: 'Outstanding', min: 90, max: 100 },
];

export function emptyCurve() {
  return GRADE_CURVE_BUCKETS.map((bucket) => ({ ...bucket, count: 0 }));
}

export function isFailedApprovedMark(grade, passed) {
  if (grade == null || !Number.isFinite(Number(grade))) return false;
  const mark = Number(grade);
  return Number(passed) === 0 || mark < PASS_MARK;
}

export function summarizeApprovedMarks(rows, options = {}) {
  const curve = emptyCurve();
  let published = 0;
  let failed = 0;
  for (const row of rows || []) {
    const grade = row.current_grade ?? row.percent ?? row.grade;
    if (grade == null || !Number.isFinite(Number(grade))) continue;
    published += 1;
    const mark = Number(grade);
    if (isFailedApprovedMark(mark, row.passed)) failed += 1;
    const bucket = curve.find((item) => mark >= item.min && mark <= item.max);
    if (bucket) bucket.count += 1;
  }
  const enrolled = Number(options.enrolled);
  const total = Number.isFinite(enrolled) && enrolled >= 0 ? enrolled : published;
  return {
    published,
    failed,
    fail_rate: published ? Math.round((failed / published) * 1000) / 10 : null,
    published_pct: total ? Math.round((published / total) * 100) : 0,
    curve,
  };
}

export function offeringApprovedStats({ enrolled, published, failed, draft }) {
  const total = Number(enrolled) || 0;
  const pub = Number(published) || 0;
  const fail = Number(failed) || 0;
  return {
    enrolled: total,
    published_students: pub,
    draft_students: Number(draft) || 0,
    failed_students: fail,
    fail_rate: pub ? Math.round((fail / pub) * 1000) / 10 : null,
    published_pct: total ? Math.round((pub / total) * 100) : 0,
  };
}
