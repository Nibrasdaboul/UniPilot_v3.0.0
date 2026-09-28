import { db } from '../db.js';
import { normalizeRole, ROLES, isTeachingStaffRole, isExamsOfficeRole, isViceDeanAcademic } from '../college/roles.js';
import { normalizeAttendanceSheetStatus, publicAttendanceSheet } from '../college/attendanceSheets.js';
import { computeAbsenceWarning } from '../college/absenceThreshold.js';
import { countOfficialAbsences } from '../college/attendance.js';
import { getAbsenceThreshold } from './absenceThresholdService.js';
import { sheetStaffNeeds } from './courseWorkSheetsService.js';
import { standingToPersistOnTermClose } from '../college/deprivationGrade.js';
import { activeRosterStudents } from '../college/courseRoster.js';
import { assertRosterStudentEditable } from './courseRosterService.js';

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

const SHEET_COLS = `
  id, college_id, catalog_course_id, status, submitted_at, submitted_by,
  exams_adopted_at, exams_adopted_by, instructor_confirmed_at, ta_confirmed_at,
  vda_confirmed_at, vda_confirmed_by, published_at
`;

function emptySheet() {
  return { status: 'staff_draft', instructor_confirmed_at: null, ta_confirmed_at: null };
}

export async function attendanceSheetsForCollege(cid) {
  try {
    const rows = await db.prepare(`
      SELECT catalog_course_id, status, submitted_at, instructor_confirmed_at, ta_confirmed_at
      FROM attendance_sheets
      WHERE college_id = ?
    `).all(cid);
    return new Map((rows || []).map((row) => [Number(row.catalog_course_id), row]));
  } catch (err) {
    if (err?.code === '42P01') return new Map();
    throw err;
  }
}

export async function getOrCreateAttendanceSheet(user, catalogCourseId) {
  const cid = collegeId(user);
  const catalogId = Number(catalogCourseId);
  if (!Number.isFinite(catalogId)) httpError(404, 'Course not found');
  try {
    const existing = await db.prepare(`
      SELECT ${SHEET_COLS} FROM attendance_sheets
      WHERE college_id = ? AND catalog_course_id = ?
    `).get(cid, catalogId);
    if (existing) return existing;
    await db.prepare(`
      INSERT INTO attendance_sheets (college_id, catalog_course_id, status, updated_by)
      VALUES (?, ?, 'staff_draft', ?)
    `).run(cid, catalogId, user?.id || null);
    return db.prepare(`
      SELECT ${SHEET_COLS} FROM attendance_sheets
      WHERE college_id = ? AND catalog_course_id = ?
    `).get(cid, catalogId);
  } catch (err) {
    if (err?.code === '42P01') return { ...emptySheet(), college_id: cid, catalog_course_id: catalogId };
    throw err;
  }
}

export async function attendanceSheetActionsForUser(user, sheet, catalogCourseId) {
  const role = normalizeRole(user?.role);
  const staff = isTeachingStaffRole(role);
  const needs = catalogCourseId != null ? await sheetStaffNeeds(user, catalogCourseId) : { needInstructor: true, needTa: false };
  const instructorLeft = needs.needInstructor && !sheet?.instructor_confirmed_at;
  const taLeft = needs.needTa && !sheet?.ta_confirmed_at;
  const canConfirm = staff && (
    (role === ROLES.INSTRUCTOR && instructorLeft)
    || (role === ROLES.TEACHING_ASSISTANT && taLeft)
  );
  return publicAttendanceSheet(sheet || emptySheet(), {
    canSubmit: staff,
    canAdopt: isExamsOfficeRole(role),
    canConfirm,
    canPublish: isViceDeanAcademic(role),
    canCancel: isViceDeanAcademic(role),
    needInstructor: needs.needInstructor,
    needTa: needs.needTa,
  });
}

export async function submitAttendanceSheet(user, catalogCourseId) {
  if (!isTeachingStaffRole(user?.role)) httpError(403, 'Teaching staff submit the attendance sheet');
  const sheet = await getOrCreateAttendanceSheet(user, catalogCourseId);
  const status = normalizeAttendanceSheetStatus(sheet.status);
  if (status === 'at_exams') return attendanceSheetActionsForUser(user, sheet, catalogCourseId);
  if (status !== 'staff_draft') httpError(403, 'The attendance sheet was already sent');
  await db.prepare(`
    UPDATE attendance_sheets
    SET status = 'at_exams', submitted_at = CURRENT_TIMESTAMP, submitted_by = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(user.id, user.id, sheet.id);
  return attendanceSheetActionsForUser(user, { ...sheet, status: 'at_exams' }, catalogCourseId);
}

export async function adoptAttendanceSheet(user, catalogCourseId) {
  if (!isExamsOfficeRole(user?.role)) httpError(403, 'Exams Office only');
  const sheet = await getOrCreateAttendanceSheet(user, catalogCourseId);
  if (normalizeAttendanceSheetStatus(sheet.status) !== 'at_exams') {
    httpError(400, 'The attendance sheet is not waiting for the Exams Office');
  }
  await db.prepare(`
    UPDATE attendance_sheets
    SET status = 'staff_review',
        exams_adopted_at = CURRENT_TIMESTAMP,
        exams_adopted_by = ?,
        instructor_confirmed_at = NULL,
        ta_confirmed_at = NULL,
        updated_by = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(user.id, user.id, sheet.id);
  return attendanceSheetActionsForUser(user, {
    ...sheet,
    status: 'staff_review',
    instructor_confirmed_at: null,
    ta_confirmed_at: null,
  }, catalogCourseId);
}

export async function confirmAttendanceSheet(user, catalogCourseId) {
  const role = normalizeRole(user?.role);
  if (!isTeachingStaffRole(role)) httpError(403, 'Teaching staff confirm the adopted attendance sheet');
  const sheet = await getOrCreateAttendanceSheet(user, catalogCourseId);
  if (normalizeAttendanceSheetStatus(sheet.status) !== 'staff_review') {
    httpError(400, 'The attendance sheet is not waiting for teaching-staff confirmation');
  }
  const needs = await sheetStaffNeeds(user, catalogCourseId);
  const next = { ...sheet };
  if (role === ROLES.INSTRUCTOR) {
    if (sheet.instructor_confirmed_at) return attendanceSheetActionsForUser(user, sheet, catalogCourseId);
    await db.prepare(`
      UPDATE attendance_sheets SET instructor_confirmed_at = CURRENT_TIMESTAMP, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(user.id, sheet.id);
    next.instructor_confirmed_at = new Date().toISOString();
  } else if (role === ROLES.TEACHING_ASSISTANT) {
    if (!needs.needTa) httpError(400, 'Teaching assistant confirmation is not required');
    if (sheet.ta_confirmed_at) return attendanceSheetActionsForUser(user, sheet, catalogCourseId);
    await db.prepare(`
      UPDATE attendance_sheets SET ta_confirmed_at = CURRENT_TIMESTAMP, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(user.id, sheet.id);
    next.ta_confirmed_at = new Date().toISOString();
  } else {
    httpError(403, 'Teaching staff confirm the adopted attendance sheet');
  }
  const instructorDone = !needs.needInstructor || Boolean(next.instructor_confirmed_at);
  const taDone = !needs.needTa || Boolean(next.ta_confirmed_at);
  if (instructorDone && taDone) {
    await db.prepare(`
      UPDATE attendance_sheets SET status = 'awaiting_vda', updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(user.id, sheet.id);
    next.status = 'awaiting_vda';
  }
  return attendanceSheetActionsForUser(user, next, catalogCourseId);
}

export async function cancelAttendanceSheet(user, catalogCourseId) {
  if (!isViceDeanAcademic(user?.role)) httpError(403, 'Academic Vice Dean only');
  const sheet = await getOrCreateAttendanceSheet(user, catalogCourseId);
  if (normalizeAttendanceSheetStatus(sheet.status) !== 'awaiting_vda') {
    httpError(400, 'The attendance sheet is not waiting for the vice dean');
  }
  await db.prepare(`
    UPDATE attendance_sheets
    SET status = 'staff_draft',
        instructor_confirmed_at = NULL,
        ta_confirmed_at = NULL,
        updated_by = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(user.id, sheet.id);
  return attendanceSheetActionsForUser(user, { ...sheet, status: 'staff_draft', instructor_confirmed_at: null, ta_confirmed_at: null }, catalogCourseId);
}

async function upsertDeprivation(cid, catalogId, userId, actorId) {
  await db.prepare(`
    INSERT INTO course_deprivations (college_id, catalog_course_id, user_id, status, note, applied_by, updated_by)
    VALUES (?, ?, ?, 'active', 'تجاوز حد الغياب المسموح', ?, ?)
    ON CONFLICT (college_id, catalog_course_id, user_id) DO UPDATE SET
      status = 'active',
      note = EXCLUDED.note,
      applied_by = EXCLUDED.applied_by,
      applied_at = CURRENT_TIMESTAMP,
      updated_by = EXCLUDED.updated_by,
      updated_at = CURRENT_TIMESTAMP
    RETURNING id
  `).run(cid, catalogId, userId, actorId, actorId);
}

export async function publishAttendanceSheet(user, catalogCourseId) {
  if (!isViceDeanAcademic(user?.role)) httpError(403, 'Academic Vice Dean only');
  const cid = collegeId(user);
  const catalogId = Number(catalogCourseId);
  const sheet = await getOrCreateAttendanceSheet(user, catalogId);
  if (normalizeAttendanceSheetStatus(sheet.status) !== 'awaiting_vda') {
    httpError(400, 'The attendance sheet is not waiting for the vice dean');
  }
  const needs = await sheetStaffNeeds(user, catalogId);
  const { getAttendanceGridForOfferings } = await import('./courseAttendanceService.js');
  const grid = await getAttendanceGridForOfferings(needs.offeringIds);
  const threshold = await getAbsenceThreshold(user);

  for (const student of activeRosterStudents(grid.students)) {
    const absences = countOfficialAbsences(
      (grid.marks || []).filter((m) => Number(m.user_id) === Number(student.user_id)),
      grid.sessions
    );
    const warning = computeAbsenceWarning(absences, threshold.absence_limit);
    const sc = await db.prepare(
      'SELECT id FROM student_courses WHERE user_id = ? AND catalog_course_id = ? ORDER BY id DESC LIMIT 1'
    ).get(student.user_id, catalogId);
    if (warning.level >= 25) {
      try {
        await db.prepare(
          'INSERT INTO notifications (user_id, title, body, type, link, source) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(
          student.user_id,
          warning.level >= 100 ? 'حرمان من المادة بسبب الغياب' : 'تنبيه غياب',
          (warning.message_ar || '').slice(0, 600),
          warning.level >= 75 ? 'warning' : 'info',
          sc?.id ? `/courses/${sc.id}` : '/notes',
          'attendance_warning'
        );
      } catch (_) {}
    }
    if (warning.level >= 100) {
      await upsertDeprivation(cid, catalogId, student.user_id, user.id);
    }
  }

  await db.prepare(`
    UPDATE attendance_sheets
    SET status = 'published',
        vda_confirmed_at = CURRENT_TIMESTAMP,
        vda_confirmed_by = ?,
        published_at = CURRENT_TIMESTAMP,
        updated_by = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(user.id, user.id, sheet.id);
  return attendanceSheetActionsForUser(user, { ...sheet, status: 'published', published_at: new Date().toISOString() }, catalogId);
}

export async function listCourseDeprivations(user, catalogCourseId) {
  const cid = collegeId(user);
  const catalogId = Number(catalogCourseId);
  try {
    const rows = await db.prepare(`
      SELECT d.id, d.user_id, d.status, d.note, d.applied_at, u.full_name, u.person_code,
             (
               SELECT r.id FROM deprivation_cancel_requests r
               WHERE r.deprivation_id = d.id AND r.status = 'pending'
               ORDER BY r.id DESC LIMIT 1
             ) AS pending_request_id,
             (
               SELECT r.reason FROM deprivation_cancel_requests r
               WHERE r.deprivation_id = d.id AND r.status = 'pending'
               ORDER BY r.id DESC LIMIT 1
             ) AS pending_reason
      FROM course_deprivations d
      INNER JOIN users u ON u.id = d.user_id
      WHERE d.college_id = ? AND d.catalog_course_id = ?
      ORDER BY d.updated_at DESC
    `).all(cid, catalogId);
    return (rows || []).map((row) => ({
      id: Number(row.id),
      user_id: Number(row.user_id),
      full_name: row.full_name,
      person_code: row.person_code,
      status: row.status,
      note: row.note,
      applied_at: row.applied_at,
      pending_request_id: row.pending_request_id != null ? Number(row.pending_request_id) : null,
      pending_reason: row.pending_reason || null,
    }));
  } catch (err) {
    if (err?.code === '42P01') return [];
    throw err;
  }
}

export async function setDeprivation(user, catalogCourseId, studentUserId, body) {
  if (!isViceDeanAcademic(user?.role) && !isExamsOfficeRole(user?.role)) {
    httpError(403, 'Academic Vice Dean or Exams Office only');
  }
  const cid = collegeId(user);
  const catalogId = Number(catalogCourseId);
  const studentId = Number(studentUserId);
  const action = String(body?.action || '').trim();
  const note = String(body?.note || '').trim();
  if (!['activate', 'lift', 'modify'].includes(action)) {
    httpError(400, 'action must be activate, lift, or modify');
  }
  const needs = await sheetStaffNeeds(user, catalogId);
  await assertRosterStudentEditable(studentId, needs.offeringIds);
  const nextStatus = action === 'lift' ? 'lifted' : 'active';
  await db.prepare(`
    INSERT INTO course_deprivations (college_id, catalog_course_id, user_id, status, note, applied_by, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (college_id, catalog_course_id, user_id) DO UPDATE SET
      status = EXCLUDED.status,
      note = COALESCE(NULLIF(EXCLUDED.note, ''), course_deprivations.note),
      updated_by = EXCLUDED.updated_by,
      updated_at = CURRENT_TIMESTAMP
    RETURNING id
  `).run(cid, catalogId, studentId, nextStatus, note || (nextStatus === 'active' ? 'حرمان يدوي' : 'أُلغي الحرمان'), user.id, user.id);

  if (action === 'lift') {
    const dep = await db.prepare(
      'SELECT id FROM course_deprivations WHERE college_id = ? AND catalog_course_id = ? AND user_id = ?'
    ).get(cid, catalogId, studentId);
    if (dep) {
      await db.prepare(`
        UPDATE deprivation_cancel_requests
        SET status = 'approved', decision_note = ?, decided_by = ?, decided_at = CURRENT_TIMESTAMP
        WHERE deprivation_id = ? AND status = 'pending'
      `).run(note || 'أُلغي الحرمان', user.id, dep.id);
    }
  }
  return { deprivations: await listCourseDeprivations(user, catalogId) };
}

export async function decideCancelRequest(user, catalogCourseId, requestId, body) {
  if (!isViceDeanAcademic(user?.role) && !isExamsOfficeRole(user?.role)) {
    httpError(403, 'Academic Vice Dean or Exams Office only');
  }
  const decision = String(body?.decision || '').trim();
  if (decision !== 'approve' && decision !== 'reject') httpError(400, 'decision must be approve or reject');
  const note = String(body?.note || '').trim();
  const row = await db.prepare(`
    SELECT r.id, r.deprivation_id, r.status, d.college_id, d.catalog_course_id, d.user_id
    FROM deprivation_cancel_requests r
    INNER JOIN course_deprivations d ON d.id = r.deprivation_id
    WHERE r.id = ?
  `).get(Number(requestId));
  if (!row || Number(row.catalog_course_id) !== Number(catalogCourseId)) httpError(404, 'Request not found');
  if (row.status !== 'pending') httpError(400, 'This request was already decided');
  const needs = await sheetStaffNeeds(user, Number(catalogCourseId));
  await assertRosterStudentEditable(row.user_id, needs.offeringIds);
  await db.prepare(`
    UPDATE deprivation_cancel_requests
    SET status = ?, decision_note = ?, decided_by = ?, decided_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(decision === 'approve' ? 'approved' : 'rejected', note || null, user.id, row.id);
  if (decision === 'approve') {
    await db.prepare(`
      UPDATE course_deprivations SET status = 'lifted', note = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(note || 'أُلغي الحرمان بعد طلب الطالب', user.id, row.deprivation_id);
  }
  return { deprivations: await listCourseDeprivations(user, catalogCourseId) };
}

export async function lockDeprivedCoursesForTerm(termId) {
  const tid = Number(termId);
  if (!Number.isFinite(tid)) return { locked: 0 };
  try {
    const byEnrollment = await db.prepare(`
      SELECT DISTINCT sc.id
      FROM student_courses sc
      INNER JOIN enrollments e ON e.id = sc.enrollment_id
      INNER JOIN course_offerings o ON o.id = e.offering_id
      INNER JOIN uni_courses uc ON uc.id = o.uni_course_id
      INNER JOIN course_deprivations d
        ON d.user_id = sc.user_id
       AND d.catalog_course_id = uc.catalog_course_id
       AND d.status = 'active'
      WHERE e.term_id = ? AND e.status = 'enrolled'
        AND (sc.withdrawn IS NULL OR sc.withdrawn = 0)
    `).all(tid);
    const bySemester = await db.prepare(`
      SELECT DISTINCT sc.id
      FROM student_courses sc
      INNER JOIN student_semesters ss ON ss.id = sc.semester_id
      INNER JOIN course_deprivations d
        ON d.user_id = sc.user_id
       AND d.catalog_course_id = sc.catalog_course_id
       AND d.status = 'active'
      WHERE ss.academic_term_id = ?
        AND (sc.withdrawn IS NULL OR sc.withdrawn = 0)
    `).all(tid);
    const ids = [...new Set(
      [...(byEnrollment || []), ...(bySemester || [])]
        .map((row) => Number(row.id))
        .filter(Boolean),
    )];
    for (const id of ids) {
      const row = await db.prepare(
        'SELECT id, current_grade, passed FROM student_courses WHERE id = ?'
      ).get(id);
      const locked = standingToPersistOnTermClose(row || {}, true);
      await db.prepare(`
        UPDATE student_courses
        SET current_grade = ?, passed = ?, finalized_at = COALESCE(finalized_at, CURRENT_TIMESTAMP)
        WHERE id = ?
      `).run(locked.current_grade, locked.passed, id);
    }
    return { locked: ids.length };
  } catch (err) {
    if (err?.code === '42P01') return { locked: 0 };
    throw err;
  }
}

export async function listStudentActiveDeprivationCatalogIds(user) {
  const cid = user?.college_id != null ? Number(user.college_id) : null;
  if (cid == null || user?.id == null) return new Set();
  try {
    const rows = await db.prepare(`
      SELECT catalog_course_id
      FROM course_deprivations
      WHERE college_id = ? AND user_id = ? AND status = 'active'
    `).all(cid, user.id);
    return new Set((rows || []).map((row) => Number(row.catalog_course_id)).filter(Boolean));
  } catch (err) {
    if (err?.code === '42P01') return new Set();
    throw err;
  }
}

export async function getStudentDeprivation(user, catalogCourseId) {
  const cid = collegeId(user);
  try {
    const row = await db.prepare(`
      SELECT d.id, d.status, d.note,
             (
               SELECT r.id FROM deprivation_cancel_requests r
               WHERE r.deprivation_id = d.id ORDER BY r.id DESC LIMIT 1
             ) AS request_id,
             (
               SELECT r.status FROM deprivation_cancel_requests r
               WHERE r.deprivation_id = d.id ORDER BY r.id DESC LIMIT 1
             ) AS request_status,
             (
               SELECT r.reason FROM deprivation_cancel_requests r
               WHERE r.deprivation_id = d.id ORDER BY r.id DESC LIMIT 1
             ) AS request_reason
      FROM course_deprivations d
      WHERE d.college_id = ? AND d.catalog_course_id = ? AND d.user_id = ?
    `).get(cid, Number(catalogCourseId), user.id);
    if (!row) return { deprived: false, can_request: false, request: null };
    const deprived = row.status === 'active';
    return {
      deprived,
      status: row.status,
      note: row.note,
      can_request: deprived && row.request_status !== 'pending',
      request: row.request_id ? { id: Number(row.request_id), status: row.request_status, reason: row.request_reason } : null,
    };
  } catch (err) {
    if (err?.code === '42P01') return { deprived: false, can_request: false, request: null };
    throw err;
  }
}

export async function submitDeprivationCancel(user, studentCourseId, body) {
  const sc = await db.prepare(
    'SELECT id, user_id, catalog_course_id FROM student_courses WHERE id = ? AND user_id = ?'
  ).get(Number(studentCourseId), user.id);
  if (!sc) httpError(404, 'Course not found');
  const reason = String(body?.reason || '').trim();
  if (reason.length < 5) httpError(400, 'reason must be at least 5 characters');
  const dep = await getStudentDeprivation(user, sc.catalog_course_id);
  if (!dep.deprived) httpError(400, 'You are not deprived of this course');
  if (dep.request?.status === 'pending') httpError(400, 'A cancel request is already pending');
  const row = await db.prepare(
    'SELECT id FROM course_deprivations WHERE college_id = ? AND catalog_course_id = ? AND user_id = ?'
  ).get(collegeId(user), Number(sc.catalog_course_id), user.id);
  await db.prepare(`
    INSERT INTO deprivation_cancel_requests (deprivation_id, user_id, reason, status)
    VALUES (?, ?, ?, 'pending')
  `).run(row.id, user.id, reason);
  return getStudentDeprivation(user, sc.catalog_course_id);
}
