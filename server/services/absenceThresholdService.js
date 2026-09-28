import { db } from '../db.js';
import { isExamsOfficeRole, isViceDeanAcademic } from '../college/roles.js';
import {
  DEFAULT_ABSENCE_LIMIT,
  parseAbsenceLimit,
  normalizeAbsenceLimit,
} from '../college/absenceThreshold.js';

function httpError(status, detail) {
  const err = new Error(detail);
  err.status = status;
  throw err;
}

function collegeId(user) {
  const cid = user?.college_id != null ? Number(user.college_id) : null;
  if (cid == null) httpError(400, 'User is not attached to a college');
  return cid;
}

function canEditAbsenceLimit(user) {
  return isViceDeanAcademic(user?.role) || isExamsOfficeRole(user?.role);
}

function publicThreshold(limit) {
  const value = normalizeAbsenceLimit(limit);
  return {
    absence_limit: value,
    percent_step: Math.round(100 / value),
    note_ar: `${value} غيابات = 100٪ = حد الحرمان.`,
    note_en: `${value} absences = 100% = the deprivation limit.`,
  };
}

export async function getAbsenceThreshold(user) {
  const cid = collegeId(user);
  try {
    const row = await db.prepare(
      'SELECT absence_limit FROM college_academic_settings WHERE college_id = ?'
    ).get(cid);
    return publicThreshold(row?.absence_limit ?? DEFAULT_ABSENCE_LIMIT);
  } catch (err) {
    if (err?.code === '42703' || err?.code === '42P01') return publicThreshold(DEFAULT_ABSENCE_LIMIT);
    throw err;
  }
}

export async function updateAbsenceThreshold(user, body) {
  if (!canEditAbsenceLimit(user)) httpError(403, 'Academic Vice Dean or Exams Office only');
  const cid = collegeId(user);
  const parsed = parseAbsenceLimit(body?.absence_limit ?? body?.limit);
  if (parsed.error) httpError(400, parsed.error);
  await db.prepare(`
    INSERT INTO college_academic_settings (college_id, project_request_min_hours, absence_limit, updated_by, updated_at)
    VALUES (?, 90, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT (college_id) DO UPDATE SET
      absence_limit = EXCLUDED.absence_limit,
      updated_by = EXCLUDED.updated_by,
      updated_at = CURRENT_TIMESTAMP
    RETURNING college_id AS id
  `).run(cid, parsed.limit, user.id);
  return getAbsenceThreshold(user);
}
