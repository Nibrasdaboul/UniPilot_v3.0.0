import { db } from '../db.js';

/** 2022 -> "022" */
export function yearPrefix(year) {
  const y = Number(year);
  if (!Number.isFinite(y) || y < 2000 || y > 2099) {
    throw new Error('Invalid enrollment/hire year');
  }
  return String(y).slice(-3).padStart(3, '0');
}

export function formatUniversityId(year, sequence) {
  const seq = Number(sequence);
  if (!Number.isInteger(seq) || seq < 1 || seq > 9999999) {
    throw new Error('Invalid university ID sequence');
  }
  return `${yearPrefix(year)}${String(seq).padStart(7, '0')}`;
}

/**
 * Next ID for a year: YYY + 7-digit sequence (e.g. 0220000001).
 * Sequence is per year prefix across all roles, so IDs stay unique.
 */
export async function nextUniversityId(year = new Date().getFullYear()) {
  const prefix = yearPrefix(year);
  const row = await db
    .prepare(
      `SELECT person_code FROM users
       WHERE person_code LIKE ?
       ORDER BY person_code DESC
       LIMIT 1`
    )
    .get(`${prefix}%`);
  let seq = 1;
  if (row?.person_code && /^\d{10}$/.test(row.person_code) && row.person_code.startsWith(prefix)) {
    seq = parseInt(row.person_code.slice(3), 10) + 1;
  }
  if (seq > 9999999) {
    throw new Error('University ID sequence exhausted for this year');
  }
  return formatUniversityId(year, seq);
}

export function normalizeUniversityId(value) {
  return String(value || '').replace(/\s+/g, '').trim();
}
