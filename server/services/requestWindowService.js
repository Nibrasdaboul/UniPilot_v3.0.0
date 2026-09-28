import { db } from '../db.js';
import { evaluateRequestWindow, parseRequestWindow } from '../college/requestWindow.js';

function httpError(status, detail) {
  const err = new Error(detail);
  err.status = status;
  throw err;
}

function collegeId(user) {
  const cid = user?.college_id != null ? Number(user.college_id) : 1;
  return cid || 1;
}

export async function getCollegeRequestWindow(collegeIdValue) {
  const cid = Number(collegeIdValue) || 1;
  try {
    const row = await db.prepare(`
      SELECT request_window_start, request_window_end
      FROM college_academic_settings
      WHERE college_id = ?
    `).get(cid);
    return evaluateRequestWindow({
      start: row?.request_window_start,
      end: row?.request_window_end,
    });
  } catch (err) {
    if (err?.code === '42703') return evaluateRequestWindow({});
    throw err;
  }
}

export async function updateCollegeRequestWindow(user, body) {
  const cid = collegeId(user);
  const parsed = parseRequestWindow(body?.start, body?.end, { clear: body?.clear === true });
  if (parsed.error) httpError(400, parsed.error);
  await db.prepare(`
    INSERT INTO college_academic_settings
      (college_id, project_request_min_hours, request_window_start, request_window_end, updated_by, updated_at)
    VALUES (?, 90, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT (college_id) DO UPDATE SET
      request_window_start = EXCLUDED.request_window_start,
      request_window_end = EXCLUDED.request_window_end,
      updated_by = EXCLUDED.updated_by,
      updated_at = CURRENT_TIMESTAMP
    RETURNING college_id AS id
  `).run(cid, parsed.start, parsed.end, user.id);
  return getCollegeRequestWindow(cid);
}

export async function getUserCollegeRequestWindow(user) {
  return getCollegeRequestWindow(collegeId(user));
}
