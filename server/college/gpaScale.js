export const DEFAULT_GPA_SCALE = [
  { min_mark: 97, max_mark: 100, points: 4.0, letter: 'A+' },
  { min_mark: 95, max_mark: 96, points: 3.75, letter: 'A+' },
  { min_mark: 90, max_mark: 94, points: 3.5, letter: 'A-' },
  { min_mark: 85, max_mark: 89, points: 3.25, letter: 'B+' },
  { min_mark: 80, max_mark: 84, points: 3.0, letter: 'B' },
  { min_mark: 75, max_mark: 79, points: 2.75, letter: 'B-' },
  { min_mark: 70, max_mark: 74, points: 2.5, letter: 'C+' },
  { min_mark: 65, max_mark: 69, points: 2.25, letter: 'C' },
  { min_mark: 60, max_mark: 64, points: 2.0, letter: 'C-' },
  { min_mark: 55, max_mark: 59, points: 1.75, letter: 'D+' },
  { min_mark: 50, max_mark: 54, points: 1.5, letter: 'D' },
  { min_mark: 0, max_mark: 49, points: 0.0, letter: 'F' },
];

const LETTER_RE = /^[A-F][+-]?$/i;

function round2(value) {
  return Math.round(Number(value) * 100) / 100;
}

export function parseGpaScaleRow(row, index) {
  const min = Number(row?.min_mark);
  const max = Number(row?.max_mark);
  const points = Number(row?.points);
  const letter = String(row?.letter || '').trim().toUpperCase();
  const label = `row ${index + 1}`;
  if (!Number.isFinite(min) || min < 0 || min > 100) {
    return { error: `${label}: min_mark must be from 0 to 100` };
  }
  if (!Number.isFinite(max) || max < 0 || max > 100) {
    return { error: `${label}: max_mark must be from 0 to 100` };
  }
  if (min > max) return { error: `${label}: min_mark cannot be greater than max_mark` };
  if (!Number.isFinite(points) || points < 0 || points > 4) {
    return { error: `${label}: points must be from 0 to 4.00` };
  }
  if (!LETTER_RE.test(letter)) {
    return { error: `${label}: letter must look like A+, A-, B, or F` };
  }
  return {
    error: null,
    row: {
      min_mark: round2(min),
      max_mark: round2(max),
      points: round2(points),
      letter,
    },
  };
}

export function parseGpaScaleRows(raw) {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { error: 'At least one scale row is required' };
  }
  if (raw.length > 40) return { error: 'A scale cannot have more than 40 rows' };
  const rows = [];
  for (let i = 0; i < raw.length; i += 1) {
    const parsed = parseGpaScaleRow(raw[i], i);
    if (parsed.error) return { error: parsed.error };
    rows.push(parsed.row);
  }
  const sorted = [...rows].sort((a, b) => b.min_mark - a.min_mark || b.max_mark - a.max_mark);
  for (let i = 0; i < sorted.length; i += 1) {
    for (let j = i + 1; j < sorted.length; j += 1) {
      const a = sorted[i];
      const b = sorted[j];
      const overlap = a.min_mark <= b.max_mark && b.min_mark <= a.max_mark;
      if (overlap) {
        return { error: `Ranges overlap: ${a.min_mark}–${a.max_mark} and ${b.min_mark}–${b.max_mark}` };
      }
    }
  }
  return { error: null, rows: sorted };
}

export function lookupGpaScale(rows, mark) {
  if (mark == null || Number.isNaN(Number(mark))) return { points: null, letter: null };
  const value = Math.min(100, Math.max(0, Number(mark)));
  const match = (rows || []).find((row) => value >= Number(row.min_mark) && value <= Number(row.max_mark));
  if (!match) return { points: null, letter: null };
  return { points: Number(match.points), letter: match.letter };
}

export function publicGpaScale(rows) {
  return {
    rows: (rows || []).map((row) => ({
      min_mark: Number(row.min_mark),
      max_mark: Number(row.max_mark),
      points: Number(row.points),
      letter: row.letter,
    })),
  };
}
