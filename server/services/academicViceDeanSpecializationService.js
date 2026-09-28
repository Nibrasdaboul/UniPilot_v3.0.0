import { db } from '../db.js';
import {
  SPECIALIZATION_MIN_HOURS,
  parseSpecializationDecision,
  parseSpecializationMinHours,
  isSpecializationCode,
} from '../college/specialization.js';
import { toPublicDepartment } from '../college/departments.js';
import { getCollegeRequestWindow } from './requestWindowService.js';

function httpError(status, detail) {
  const err = new Error(detail);
  err.status = status;
  throw err;
}

function collegeId(user) {
  const cid = user?.college_id != null ? Number(user.college_id) : null;
  if (cid == null) httpError(400, 'Vice Dean is not attached to a college');
  return cid;
}

function trimOrNull(value) {
  const text = String(value || '').trim();
  return text || null;
}

function publicRequest(row) {
  return {
    id: row.id,
    status: row.status,
    vda_note: row.vda_note,
    created_at: row.created_at,
    decided_at: row.decided_at,
    student_user_id: row.student_user_id,
    student_name: row.student_name,
    university_id: row.university_id,
    completed_hours: Number(row.completed_hours) || 0,
    department: toPublicDepartment({
      id: row.department_id,
      code: row.department_code,
      name: row.department_name,
    }),
  };
}

export async function getSpecializationMinHours(collegeIdValue) {
  const cid = Number(collegeIdValue) || 1;
  try {
    const row = await db.prepare(
      'SELECT specialization_min_hours FROM college_academic_settings WHERE college_id = ?'
    ).get(cid);
    return parseSpecializationMinHours(row?.specialization_min_hours) ?? SPECIALIZATION_MIN_HOURS;
  } catch (err) {
    if (err?.code === '42703') return SPECIALIZATION_MIN_HOURS;
    throw err;
  }
}

export async function updateSpecializationMinHours(user, body) {
  const cid = collegeId(user);
  const hours = parseSpecializationMinHours(body?.specialization_min_hours);
  if (hours == null) httpError(400, 'specialization_min_hours must be a whole number from 0 to 250');
  await db.prepare(`
    INSERT INTO college_academic_settings
      (college_id, project_request_min_hours, specialization_min_hours, updated_by, updated_at)
    VALUES (?, 90, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT (college_id) DO UPDATE SET
      specialization_min_hours = EXCLUDED.specialization_min_hours,
      updated_by = EXCLUDED.updated_by,
      updated_at = CURRENT_TIMESTAMP
    RETURNING college_id AS id
  `).run(cid, hours, user.id);
  return { specialization_min_hours: hours };
}

async function loadRequest(id, cid) {
  const row = await db.prepare(`
    SELECT r.id, r.status, r.vda_note, r.created_at, r.decided_at, r.student_user_id, r.department_id,
           u.full_name AS student_name, u.person_code AS university_id,
           d.code AS department_code, d.name AS department_name,
           COALESCE(sar.total_credits_completed, 0) AS completed_hours
    FROM student_specialization_requests r
    LEFT JOIN users u ON u.id = r.student_user_id
    LEFT JOIN departments d ON d.id = r.department_id
    LEFT JOIN student_academic_record sar ON sar.user_id = r.student_user_id
    WHERE r.id = ? AND r.college_id = ?
  `).get(id, cid);
  if (!row) httpError(404, 'Specialization request not found');
  return publicRequest(row);
}

export async function listAcademicViceDeanSpecializations(user) {
  const cid = collegeId(user);
  const rows = await db.prepare(`
    SELECT r.id, r.status, r.vda_note, r.created_at, r.decided_at, r.student_user_id, r.department_id,
           u.full_name AS student_name, u.person_code AS university_id,
           d.code AS department_code, d.name AS department_name,
           COALESCE(sar.total_credits_completed, 0) AS completed_hours
    FROM student_specialization_requests r
    LEFT JOIN users u ON u.id = r.student_user_id
    LEFT JOIN departments d ON d.id = r.department_id
    LEFT JOIN student_academic_record sar ON sar.user_id = r.student_user_id
    WHERE r.college_id = ?
    ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END, r.id DESC
  `).all(cid);
  const items = (rows || []).map(publicRequest);
  return {
    request_window: await getCollegeRequestWindow(cid),
    specialization_min_hours: await getSpecializationMinHours(cid),
    items,
    counts: {
      total: items.length,
      pending: items.filter((i) => i.status === 'pending').length,
      approved: items.filter((i) => i.status === 'approved').length,
      rejected: items.filter((i) => i.status === 'rejected').length,
    },
  };
}

export async function decideAcademicViceDeanSpecialization(user, id, body) {
  const cid = collegeId(user);
  const decision = parseSpecializationDecision(body?.decision);
  if (!decision) httpError(400, 'Decision must be approved or rejected');
  const note = trimOrNull(body?.note);
  const row = await db.prepare(`
    SELECT r.id, r.status, r.student_user_id, r.department_id, d.code AS department_code
    FROM student_specialization_requests r
    LEFT JOIN departments d ON d.id = r.department_id
    WHERE r.id = ? AND r.college_id = ?
  `).get(id, cid);
  if (!row) httpError(404, 'Specialization request not found');
  if (row.status !== 'pending') httpError(400, 'This request was already decided');
  if (decision === 'approved' && !isSpecializationCode(row.department_code)) {
    httpError(400, 'Request is not for an official specialization department');
  }
  await db.prepare(`
    UPDATE student_specialization_requests
    SET status = ?, vda_note = ?, decided_by = ?, decided_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(decision, note, user.id, row.id);
  if (decision === 'approved') {
    await db.prepare('UPDATE users SET department_id = ? WHERE id = ? AND college_id = ?')
      .run(row.department_id, row.student_user_id, cid);
    await db.prepare(`
      UPDATE student_profiles SET department_id = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?
    `).run(row.department_id, row.student_user_id);
  }
  return loadRequest(row.id, cid);
}
