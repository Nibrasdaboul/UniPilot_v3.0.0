export const EXAM_TYPES = [
  { key: 'midterm', ar: 'نصفي', en: 'Midterm' },
  { key: 'practical', ar: 'عملي', en: 'Practical' },
  { key: 'theory_final', ar: 'نهائي نظري', en: 'Theory final' },
];

export const EXAM_TYPE_KEYS = EXAM_TYPES.map((t) => t.key);

export function isExamType(value) {
  return EXAM_TYPE_KEYS.includes(value);
}

export function sessionsOverlap(aStart, aEnd, bStart, bEnd) {
  const a0 = new Date(aStart).getTime();
  const a1 = new Date(aEnd).getTime();
  const b0 = new Date(bStart).getTime();
  const b1 = new Date(bEnd).getTime();
  if (![a0, a1, b0, b1].every(Number.isFinite)) return false;
  return a0 < b1 && b0 < a1;
}

export function hallFitsEnrolled(enrolled, capacity) {
  const n = Number(enrolled) || 0;
  const cap = Number(capacity);
  if (!Number.isFinite(cap) || cap < 1) return false;
  return n <= cap;
}

export function generateSeatLabels(count) {
  const n = Math.max(0, Number(count) || 0);
  const labels = [];
  for (let i = 0; i < n; i += 1) {
    const row = String.fromCharCode(65 + Math.floor(i / 10));
    labels.push(`${row}${(i % 10) + 1}`);
  }
  return labels;
}
