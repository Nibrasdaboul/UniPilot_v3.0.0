import { db } from '../db.js';
import { mergeRosterRows, rosterEditState } from '../college/courseRoster.js';

function rosterError(status, detail, code) {
  const err = new Error(detail);
  err.status = status;
  if (code) err.code = code;
  return err;
}

function cleanIds(offeringIds) {
  return [...new Set((offeringIds || []).map((id) => Number(id)).filter(Boolean))];
}

export async function loadCourseRoster(offeringIds) {
  const ids = cleanIds(offeringIds);
  if (!ids.length) return [];
  const rows = await db.prepare(`
    SELECT u.id AS user_id, u.full_name, u.person_code, e.status
    FROM enrollments e
    INNER JOIN users u ON u.id = e.user_id
    WHERE e.offering_id IN (${ids.map(() => '?').join(', ')}) AND e.status IN ('enrolled', 'withdrawn')
    ORDER BY u.full_name ASC, u.person_code ASC, e.id ASC
  `).all(...ids);
  return mergeRosterRows(rows);
}

export async function assertRosterStudentEditable(studentId, offeringIds) {
  const ids = cleanIds(offeringIds);
  const rows = ids.length
    ? await db.prepare(`
        SELECT status FROM enrollments
        WHERE user_id = ? AND status IN ('enrolled', 'withdrawn')
          AND offering_id IN (${ids.map(() => '?').join(', ')})
      `).all(Number(studentId), ...ids)
    : [];
  const state = rosterEditState((rows || []).map((row) => row.status));
  if (state === 'withdrawn') {
    throw rosterError(403, 'This student withdrew from the course. Their row is locked.', 'student_withdrawn');
  }
  if (state === 'not_enrolled') throw rosterError(404, 'Student is not enrolled in this course');
}
