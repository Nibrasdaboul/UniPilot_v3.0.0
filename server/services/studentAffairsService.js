import { db } from '../db.js';
import { normalizeRole, ROLES, ROLE_LABELS } from '../college/roles.js';
import { sharedCatalogs, studentCatalogs } from '../college/userProfiles.js';
import { provisionStudent } from './userProvisionService.js';
import {
  COMPLAINT_STATUSES,
  COMPLAINT_TYPES,
  CASE_TYPES,
  CASE_STATUSES,
  isComplaintStatus,
  isComplaintType,
  isCaseType,
  isCaseStatus,
  activityHasRoom,
} from '../college/studentAffairs.js';

function httpError(status, detail) {
  const err = new Error(detail);
  err.status = status;
  return err;
}

function collegeId(user) {
  return user?.college_id != null ? Number(user.college_id) : null;
}

function requireCollege(user) {
  const cid = collegeId(user);
  if (!cid) throw httpError(400, 'User is not attached to a college');
  return cid;
}

function catalogs() {
  const roles = Object.keys(ROLE_LABELS.ar).map((key) => ({
    key,
    ar: ROLE_LABELS.ar[key],
    en: ROLE_LABELS.en[key] || key,
  }));
  return {
    complaint_statuses: COMPLAINT_STATUSES,
    complaint_types: COMPLAINT_TYPES,
    filer_roles: roles,
    case_types: CASE_TYPES,
    case_statuses: CASE_STATUSES,
  };
}

async function listStudents(cid) {
  return db.prepare(`
    SELECT id, full_name, person_code
    FROM users
    WHERE college_id = ? AND role = 'student'
    ORDER BY full_name ASC, id ASC
  `).all(cid);
}

async function attachActivityMeta(rows, userId) {
  return Promise.all(rows.map(async (a) => {
    const taken = await db.prepare(
      'SELECT COUNT(*)::int AS n FROM student_activity_signups WHERE activity_id = ?'
    ).get(a.id);
    const mine = userId
      ? await db.prepare(
        'SELECT id FROM student_activity_signups WHERE activity_id = ? AND user_id = ?'
      ).get(a.id, userId)
      : null;
    return {
      ...a,
      signed_count: Number(taken?.n || 0),
      signed: !!mine,
    };
  }));
}

export async function listMine(user) {
  const cid = collegeId(user);
  if (!cid) return { ...catalogs(), complaints: [], activities: [], cases: [] };
  const activities = await attachActivityMeta(
    await db.prepare(`
      SELECT id, title, description, location, starts_at, ends_at, capacity
      FROM student_activities
      WHERE college_id = ?
      ORDER BY starts_at ASC, id ASC
    `).all(cid),
    user.id,
  );
  if (normalizeRole(user.role) !== ROLES.STUDENT) {
    return { ...catalogs(), complaints: [], activities, cases: [] };
  }
  const complaints = await db.prepare(`
    SELECT id, title, body, status, staff_note, created_at, updated_at,
           COALESCE(complaint_type, 'other') AS complaint_type
    FROM student_complaints
    WHERE college_id = ? AND student_user_id = ?
    ORDER BY id DESC
  `).all(cid, user.id);
  const cases = await db.prepare(`
    SELECT id, case_type, title, body, status, staff_note, created_at, updated_at
    FROM student_cases
    WHERE college_id = ? AND student_user_id = ?
    ORDER BY id DESC
  `).all(cid, user.id);
  return { ...catalogs(), complaints, activities, cases };
}

export async function getBoard(user) {
  const cid = requireCollege(user);
  const [students, complaints, activitiesRaw, cases] = await Promise.all([
    listStudents(cid),
    db.prepare(`
      SELECT c.id, c.title, c.body, c.status, c.staff_note, c.created_at, c.updated_at,
             c.student_user_id, COALESCE(c.complaint_type, 'other') AS complaint_type,
             u.full_name AS student_name, u.person_code AS student_code,
             u.full_name AS filer_name, u.person_code AS filer_code, u.role AS filer_role
      FROM student_complaints c
      INNER JOIN users u ON u.id = c.student_user_id
      WHERE c.college_id = ?
      ORDER BY c.id DESC
    `).all(cid),
    db.prepare(`
      SELECT id, title, description, location, starts_at, ends_at, capacity
      FROM student_activities
      WHERE college_id = ?
      ORDER BY starts_at ASC, id ASC
    `).all(cid),
    db.prepare(`
      SELECT cs.id, cs.case_type, cs.title, cs.body, cs.status, cs.staff_note,
             cs.created_at, cs.updated_at, cs.student_user_id,
             u.full_name AS student_name, u.person_code AS student_code
      FROM student_cases cs
      INNER JOIN users u ON u.id = cs.student_user_id
      WHERE cs.college_id = ?
      ORDER BY cs.id DESC
    `).all(cid),
  ]);
  const activities = await attachActivityMeta(activitiesRaw, null);
  return { ...catalogs(), students, complaints, activities, cases };
}

export async function fileComplaint(user, body) {
  if (normalizeRole(user.role) !== ROLES.STUDENT) {
    throw httpError(403, 'Only students can file complaints');
  }
  const cid = requireCollege(user);
  const title = String(body?.title || '').trim();
  const text = String(body?.body || '').trim();
  const complaintType = String(body?.complaint_type || 'other').trim();
  if (!title) throw httpError(400, 'Title is required');
  if (!text) throw httpError(400, 'Complaint details are required');
  if (!isComplaintType(complaintType)) throw httpError(400, 'Invalid complaint type');
  const r = await db.prepare(`
    INSERT INTO student_complaints (college_id, student_user_id, title, body, status, complaint_type)
    VALUES (?, ?, ?, ?, 'open', ?)
  `).run(cid, user.id, title, text, complaintType);
  return db.prepare(`
    SELECT id, title, body, status, staff_note, created_at, updated_at,
           COALESCE(complaint_type, 'other') AS complaint_type
    FROM student_complaints WHERE id = ?
  `).get(r.lastInsertRowid);
}

export async function updateComplaint(user, id, body) {
  const cid = requireCollege(user);
  const existing = await db.prepare(
    'SELECT * FROM student_complaints WHERE id = ? AND college_id = ?'
  ).get(id, cid);
  if (!existing) throw httpError(404, 'Complaint not found');
  const status = body?.status != null ? String(body.status) : existing.status;
  if (!isComplaintStatus(status)) throw httpError(400, 'Invalid complaint status');
  const staffNote = body?.staff_note != null ? String(body.staff_note) : existing.staff_note;
  await db.prepare(`
    UPDATE student_complaints
    SET status = ?, staff_note = ?, handled_by = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(status, staffNote, user.id, existing.id);
  return db.prepare(`
    SELECT c.id, c.title, c.body, c.status, c.staff_note, c.created_at, c.updated_at,
           c.student_user_id, COALESCE(c.complaint_type, 'other') AS complaint_type,
           u.full_name AS student_name, u.person_code AS student_code,
           u.full_name AS filer_name, u.person_code AS filer_code, u.role AS filer_role
    FROM student_complaints c INNER JOIN users u ON u.id = c.student_user_id
    WHERE c.id = ?
  `).get(existing.id);
}

export async function createActivity(user, body) {
  const cid = requireCollege(user);
  const title = String(body?.title || '').trim();
  if (!title) throw httpError(400, 'Title is required');
  const startsAt = String(body?.starts_at || '').trim();
  if (!startsAt || !Number.isFinite(new Date(startsAt).getTime())) {
    throw httpError(400, 'A valid start time is required');
  }
  const endsAt = body?.ends_at ? String(body.ends_at).trim() : null;
  if (endsAt && !Number.isFinite(new Date(endsAt).getTime())) {
    throw httpError(400, 'End time is invalid');
  }
  const capacity = parseInt(body?.capacity, 10);
  if (!Number.isFinite(capacity) || capacity < 1) throw httpError(400, 'Capacity must be at least 1');
  const r = await db.prepare(`
    INSERT INTO student_activities (college_id, title, description, location, starts_at, ends_at, capacity, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    cid,
    title,
    String(body?.description || '').trim() || null,
    String(body?.location || '').trim() || null,
    startsAt,
    endsAt || null,
    capacity,
    user.id,
  );
  const row = await db.prepare('SELECT * FROM student_activities WHERE id = ?').get(r.lastInsertRowid);
  const [withMeta] = await attachActivityMeta([row], null);
  return withMeta;
}

export async function deleteActivity(user, id) {
  const cid = requireCollege(user);
  const existing = await db.prepare(
    'SELECT id FROM student_activities WHERE id = ? AND college_id = ?'
  ).get(id, cid);
  if (!existing) throw httpError(404, 'Activity not found');
  await db.prepare('DELETE FROM student_activities WHERE id = ?').run(existing.id);
  return { ok: true };
}

export async function signupActivity(user, activityId) {
  if (normalizeRole(user.role) !== ROLES.STUDENT) {
    throw httpError(403, 'Only students can sign up for activities');
  }
  const cid = requireCollege(user);
  const activity = await db.prepare(
    'SELECT * FROM student_activities WHERE id = ? AND college_id = ?'
  ).get(activityId, cid);
  if (!activity) throw httpError(404, 'Activity not found');
  const existing = await db.prepare(
    'SELECT id FROM student_activity_signups WHERE activity_id = ? AND user_id = ?'
  ).get(activity.id, user.id);
  if (existing) return listMine(user);
  const taken = await db.prepare(
    'SELECT COUNT(*)::int AS n FROM student_activity_signups WHERE activity_id = ?'
  ).get(activity.id);
  if (!activityHasRoom(taken?.n, activity.capacity)) {
    throw httpError(400, 'This activity is full');
  }
  await db.prepare(
    'INSERT INTO student_activity_signups (activity_id, user_id) VALUES (?, ?)'
  ).run(activity.id, user.id);
  return listMine(user);
}

export async function leaveActivity(user, activityId) {
  if (normalizeRole(user.role) !== ROLES.STUDENT) {
    throw httpError(403, 'Only students can leave activities');
  }
  const cid = requireCollege(user);
  const activity = await db.prepare(
    'SELECT id FROM student_activities WHERE id = ? AND college_id = ?'
  ).get(activityId, cid);
  if (!activity) throw httpError(404, 'Activity not found');
  await db.prepare(
    'DELETE FROM student_activity_signups WHERE activity_id = ? AND user_id = ?'
  ).run(activity.id, user.id);
  return listMine(user);
}

export async function openCase(user, body) {
  const cid = requireCollege(user);
  const studentId = parseInt(body?.student_user_id, 10);
  const student = await db.prepare(
    "SELECT id, role, college_id FROM users WHERE id = ? AND role = 'student'"
  ).get(studentId);
  if (!student || Number(student.college_id) !== cid) {
    throw httpError(404, 'Student not found in this college');
  }
  const caseType = String(body?.case_type || '').trim();
  if (!isCaseType(caseType)) throw httpError(400, 'Invalid case type');
  const title = String(body?.title || '').trim();
  if (!title) throw httpError(400, 'Title is required');
  const r = await db.prepare(`
    INSERT INTO student_cases (college_id, student_user_id, case_type, title, body, status, opened_by)
    VALUES (?, ?, ?, ?, ?, 'open', ?)
  `).run(cid, student.id, caseType, title, String(body?.body || '').trim() || null, user.id);
  return db.prepare(`
    SELECT cs.id, cs.case_type, cs.title, cs.body, cs.status, cs.staff_note,
           cs.created_at, cs.updated_at, cs.student_user_id,
           u.full_name AS student_name, u.person_code AS student_code
    FROM student_cases cs INNER JOIN users u ON u.id = cs.student_user_id
    WHERE cs.id = ?
  `).get(r.lastInsertRowid);
}

export async function updateCase(user, id, body) {
  const cid = requireCollege(user);
  const existing = await db.prepare(
    'SELECT * FROM student_cases WHERE id = ? AND college_id = ?'
  ).get(id, cid);
  if (!existing) throw httpError(404, 'Case not found');
  const status = body?.status != null ? String(body.status) : existing.status;
  if (!isCaseStatus(status)) throw httpError(400, 'Invalid case status');
  const staffNote = body?.staff_note != null ? String(body.staff_note) : existing.staff_note;
  const title = body?.title != null ? String(body.title).trim() : existing.title;
  if (!title) throw httpError(400, 'Title is required');
  await db.prepare(`
    UPDATE student_cases
    SET status = ?, staff_note = ?, title = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(status, staffNote, title, existing.id);
  return db.prepare(`
    SELECT cs.id, cs.case_type, cs.title, cs.body, cs.status, cs.staff_note,
           cs.created_at, cs.updated_at, cs.student_user_id,
           u.full_name AS student_name, u.person_code AS student_code
    FROM student_cases cs INNER JOIN users u ON u.id = cs.student_user_id
    WHERE cs.id = ?
  `).get(existing.id);
}

export async function registrationOptions(user) {
  const cid = collegeId(user);
  const departments = await db.prepare('SELECT id, code, name FROM departments ORDER BY id').all();
  let college = null;
  if (cid) {
    try {
      college = await db.prepare('SELECT id, name FROM colleges WHERE id = ?').get(cid);
    } catch (_) {
      college = { id: cid, name: null };
    }
  }
  return {
    ...sharedCatalogs(),
    ...studentCatalogs(),
    college,
    departments: departments.map((d) => ({
      id: d.id,
      code: d.code,
      name_ar: d.name,
      name_en: d.name,
    })),
  };
}

export async function listRegisteredStudents(user) {
  const cid = collegeId(user);
  const rows = cid != null
    ? await db.prepare(`
        SELECT u.id, u.person_code, u.full_name, u.full_name_ar, u.full_name_en, u.account_status, u.avatar_url, u.role, u.phone,
               u.enrollment_year, p.major, p.study_year, p.admission_type, p.academic_status
        FROM users u
        LEFT JOIN student_profiles p ON p.user_id = u.id
        WHERE u.role = 'student' AND u.college_id = ?
        ORDER BY u.id DESC
        LIMIT 200
      `).all(cid)
    : await db.prepare(`
        SELECT u.id, u.person_code, u.full_name, u.full_name_ar, u.full_name_en, u.account_status, u.avatar_url, u.role, u.phone,
               u.enrollment_year, p.major, p.study_year, p.admission_type, p.academic_status
        FROM users u
        LEFT JOIN student_profiles p ON p.user_id = u.id
        WHERE u.role = 'student'
        ORDER BY u.id DESC
        LIMIT 200
      `).all();
  return rows;
}

export async function registerStudent(user, body) {
  return provisionStudent({ actor: user, ...body });
}
