import { db } from '../db.js';
import {
  evaluateSpecializationRequest,
  isSpecializationCode,
  specializationLockMessage,
} from '../college/specialization.js';
import { ensureCollegeDepartments, toPublicDepartment } from '../college/departments.js';
import { getCollegeRequestWindow } from './requestWindowService.js';
import { getSpecializationMinHours } from './academicViceDeanSpecializationService.js';

function httpError(status, detail) {
  const err = new Error(detail);
  err.status = status;
  throw err;
}

function collegeId(user) {
  return user?.college_id != null ? Number(user.college_id) : 1;
}

async function completedHoursFor(userId) {
  const record = await db.prepare(
    'SELECT total_credits_completed FROM student_academic_record WHERE user_id = ?'
  ).get(userId);
  return Number(record?.total_credits_completed) || 0;
}

async function latestRequest(userId, cid) {
  return db.prepare(`
    SELECT r.id, r.department_id, r.status, r.vda_note, r.created_at, r.decided_at,
           d.code AS department_code, d.name AS department_name
    FROM student_specialization_requests r
    LEFT JOIN departments d ON d.id = r.department_id
    WHERE r.student_user_id = ? AND r.college_id = ?
    ORDER BY r.id DESC
    LIMIT 1
  `).get(userId, cid);
}

export async function getStudentSpecialization(user) {
  const cid = collegeId(user);
  const depts = await ensureCollegeDepartments(cid);
  const options = depts.filter((d) => isSpecializationCode(d.code)).map((d) => toPublicDepartment(d));
  const current = depts.find((d) => Number(d.id) === Number(user.department_id)) || null;
  const completedHours = await completedHoursFor(user.id);
  const request = await latestRequest(user.id, cid);
  const requestWindow = await getCollegeRequestWindow(cid);
  const requiredHours = await getSpecializationMinHours(cid);
  const evalState = evaluateSpecializationRequest({
    completedHours,
    requiredHours,
    currentDepartmentCode: current?.code,
    latestStatus: request?.status || null,
    windowOpen: requestWindow.open,
  });
  return {
    required_hours: requiredHours,
    completed_hours: completedHours,
    request_window: requestWindow,
    current_department: current ? toPublicDepartment(current) : null,
    options,
    request: request ? {
      ...request,
      department: toPublicDepartment({
        id: request.department_id,
        code: request.department_code,
        name: request.department_name,
      }),
    } : null,
    ...evalState,
  };
}

export async function submitStudentSpecialization(user, body) {
  const cid = collegeId(user);
  const page = await getStudentSpecialization(user);
  if (!page.can_request) httpError(400, specializationLockMessage(page.lock_reason, page.required_hours));
  const departmentId = Number(body?.department_id);
  const chosen = page.options.find((d) => Number(d.id) === departmentId);
  if (!chosen) httpError(400, 'Choose Software, Networks, or Artificial Intelligence');
  const inserted = await db.prepare(`
    INSERT INTO student_specialization_requests (college_id, student_user_id, department_id, status)
    VALUES (?, ?, ?, 'pending')
  `).run(cid, user.id, chosen.id);
  const row = await db.prepare(
    'SELECT id, department_id, status, vda_note, created_at, decided_at FROM student_specialization_requests WHERE id = ?'
  ).get(inserted.lastInsertRowid);
  const refreshed = await getStudentSpecialization(user);
  return { request: { ...row, department: chosen }, ...refreshed };
}
