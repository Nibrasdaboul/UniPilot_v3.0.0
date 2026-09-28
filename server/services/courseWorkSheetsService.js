import { db } from '../db.js';
import { normalizeRole, ROLES, isTeachingStaffRole, isExamsOfficeRole, isViceDeanAcademic } from '../college/roles.js';
import {
  normalizeSheetStatus,
  parseTheoryMidtermAutomated,
  publicCourseWorkSheet,
} from '../college/courseWorkSheets.js';
import { computeCourseWorkPercent } from '../college/courseWorkGrades.js';
import { PASS_MARK } from '../college/officialGrades.js';
import { getDeanAcademic } from './deanAcademicService.js';
import { listOfferingsForTerm } from './registrationService.js';

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
  id, college_id, catalog_course_id, status, theory_midterm_automated, submitted_at, submitted_by,
  instructor_confirmed_at, ta_confirmed_at, exams_adopted_at, exams_adopted_by,
  vda_confirmed_at, vda_confirmed_by, published_at
`;

function emptySheet() {
  return {
    status: 'staff_draft',
    theory_midterm_automated: 0,
    submitted_at: null,
    instructor_confirmed_at: null,
    ta_confirmed_at: null,
  };
}

export async function sheetsForCollege(cid) {
  try {
    const rows = await db.prepare(`
      SELECT catalog_course_id, status, theory_midterm_automated, submitted_at,
             instructor_confirmed_at, ta_confirmed_at
      FROM course_work_sheets
      WHERE college_id = ?
    `).all(cid);
    return new Map((rows || []).map((row) => [Number(row.catalog_course_id), row]));
  } catch (err) {
    if (err?.code === '42P01') return new Map();
    throw err;
  }
}

async function offeringIdsForCatalog(user, catalogId) {
  const cid = collegeId(user);
  const academic = await getDeanAcademic(user);
  const all = academic.term?.id ? await listOfferingsForTerm(academic.term.id, cid) : [];
  return (all || []).filter((o) => Number(o.catalog_course_id) === catalogId).map((o) => Number(o.id));
}

export async function sheetStaffNeeds(user, catalogCourseId) {
  const offeringIds = await offeringIdsForCatalog(user, catalogCourseId);
  if (!offeringIds.length) return { needInstructor: true, needTa: false, offeringIds };
  const placeholders = offeringIds.map(() => '?').join(', ');
  const ta = await db.prepare(`
    SELECT 1 AS ok
    FROM course_staff cs
    WHERE cs.offering_id IN (${placeholders})
      AND cs.staff_role IN ('teaching_assistant', 'engineer')
    UNION
    SELECT 1 AS ok
    FROM sections s
    WHERE s.offering_id IN (${placeholders})
      AND s.kind = 'practical'
      AND s.staff_user_id IS NOT NULL
    LIMIT 1
  `).get(...offeringIds, ...offeringIds);
  return { needInstructor: true, needTa: Boolean(ta), offeringIds };
}

export async function getOrCreateCourseWorkSheet(user, catalogCourseId) {
  const cid = collegeId(user);
  const catalogId = Number(catalogCourseId);
  if (!Number.isFinite(catalogId)) httpError(404, 'Course not found');
  try {
    const existing = await db.prepare(`
      SELECT ${SHEET_COLS} FROM course_work_sheets
      WHERE college_id = ? AND catalog_course_id = ?
    `).get(cid, catalogId);
    if (existing) return existing;
    await db.prepare(`
      INSERT INTO course_work_sheets (college_id, catalog_course_id, status, theory_midterm_automated, updated_by)
      VALUES (?, ?, 'staff_draft', 0, ?)
    `).run(cid, catalogId, user?.id || null);
    return db.prepare(`
      SELECT ${SHEET_COLS} FROM course_work_sheets
      WHERE college_id = ? AND catalog_course_id = ?
    `).get(cid, catalogId);
  } catch (err) {
    if (err?.code === '42P01') return { ...emptySheet(), college_id: cid, catalog_course_id: catalogId };
    throw err;
  }
}

export async function sheetActionsForUser(user, sheet, catalogCourseId) {
  const role = normalizeRole(user?.role);
  const staff = isTeachingStaffRole(role);
  const needs = catalogCourseId != null ? await sheetStaffNeeds(user, catalogCourseId) : { needInstructor: true, needTa: false };
  const instructorLeft = needs.needInstructor && !sheet?.instructor_confirmed_at;
  const taLeft = needs.needTa && !sheet?.ta_confirmed_at;
  const canConfirm = staff && (
    (role === ROLES.INSTRUCTOR && instructorLeft)
    || (role === ROLES.TEACHING_ASSISTANT && taLeft)
  );
  return publicCourseWorkSheet(sheet || emptySheet(), {
    canSubmit: staff,
    canSetAutomated: role === ROLES.INSTRUCTOR,
    canAdopt: isExamsOfficeRole(role),
    canConfirm,
    canPublish: isViceDeanAcademic(role),
    needInstructor: needs.needInstructor,
    needTa: needs.needTa,
  });
}

export async function setTheoryMidtermAutomated(user, catalogCourseId, body) {
  if (normalizeRole(user?.role) !== ROLES.INSTRUCTOR) {
    httpError(403, 'Instructors set whether the theory exam is automated');
  }
  const parsed = parseTheoryMidtermAutomated(body?.theory_midterm_automated);
  if (parsed.error) httpError(400, parsed.error);
  const sheet = await getOrCreateCourseWorkSheet(user, catalogCourseId);
  if (normalizeSheetStatus(sheet.status) !== 'staff_draft') {
    httpError(403, 'The mark sheet is no longer with teaching staff');
  }
  await db.prepare(`
    UPDATE course_work_sheets
    SET theory_midterm_automated = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(parsed.automated ? 1 : 0, user.id, sheet.id);
  return sheetActionsForUser(user, { ...sheet, theory_midterm_automated: parsed.automated ? 1 : 0 }, catalogCourseId);
}

export async function submitCourseWorkSheetToExams(user, catalogCourseId) {
  if (!isTeachingStaffRole(user?.role)) {
    httpError(403, 'Teaching staff submit the mark sheet');
  }
  const sheet = await getOrCreateCourseWorkSheet(user, catalogCourseId);
  const status = normalizeSheetStatus(sheet.status);
  if (status === 'at_exams') return sheetActionsForUser(user, sheet, catalogCourseId);
  if (status !== 'staff_draft') httpError(403, 'The mark sheet was already sent');
  await db.prepare(`
    UPDATE course_work_sheets
    SET status = 'at_exams', submitted_at = CURRENT_TIMESTAMP, submitted_by = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(user.id, user.id, sheet.id);
  return sheetActionsForUser(user, {
    ...sheet,
    status: 'at_exams',
    submitted_at: new Date().toISOString(),
  }, catalogCourseId);
}

export async function adoptCourseWorkSheet(user, catalogCourseId) {
  if (!isExamsOfficeRole(user?.role)) httpError(403, 'Exams Office only');
  const sheet = await getOrCreateCourseWorkSheet(user, catalogCourseId);
  if (normalizeSheetStatus(sheet.status) !== 'at_exams') {
    httpError(400, 'The mark sheet is not waiting for the Exams Office');
  }
  await db.prepare(`
    UPDATE course_work_sheets
    SET status = 'staff_review',
        exams_adopted_at = CURRENT_TIMESTAMP,
        exams_adopted_by = ?,
        instructor_confirmed_at = NULL,
        ta_confirmed_at = NULL,
        updated_by = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(user.id, user.id, sheet.id);
  return sheetActionsForUser(user, {
    ...sheet,
    status: 'staff_review',
    instructor_confirmed_at: null,
    ta_confirmed_at: null,
  }, catalogCourseId);
}

export async function confirmCourseWorkSheet(user, catalogCourseId) {
  const role = normalizeRole(user?.role);
  if (!isTeachingStaffRole(role)) httpError(403, 'Teaching staff confirm the adopted sheet');
  const sheet = await getOrCreateCourseWorkSheet(user, catalogCourseId);
  if (normalizeSheetStatus(sheet.status) !== 'staff_review') {
    httpError(400, 'The mark sheet is not waiting for teaching-staff confirmation');
  }
  const needs = await sheetStaffNeeds(user, catalogCourseId);
  const next = { ...sheet };
  if (role === ROLES.INSTRUCTOR) {
    if (!needs.needInstructor) httpError(400, 'Instructor confirmation is not required');
    if (sheet.instructor_confirmed_at) return sheetActionsForUser(user, sheet, catalogCourseId);
    await db.prepare(`
      UPDATE course_work_sheets
      SET instructor_confirmed_at = CURRENT_TIMESTAMP, updated_by = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(user.id, sheet.id);
    next.instructor_confirmed_at = new Date().toISOString();
  } else if (role === ROLES.TEACHING_ASSISTANT) {
    if (!needs.needTa) httpError(400, 'Teaching assistant confirmation is not required');
    if (sheet.ta_confirmed_at) return sheetActionsForUser(user, sheet, catalogCourseId);
    await db.prepare(`
      UPDATE course_work_sheets
      SET ta_confirmed_at = CURRENT_TIMESTAMP, updated_by = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(user.id, sheet.id);
    next.ta_confirmed_at = new Date().toISOString();
  } else {
    httpError(403, 'Teaching staff confirm the adopted sheet');
  }

  const instructorDone = !needs.needInstructor || Boolean(next.instructor_confirmed_at);
  const taDone = !needs.needTa || Boolean(next.ta_confirmed_at);
  if (instructorDone && taDone) {
    await db.prepare(`
      UPDATE course_work_sheets
      SET status = 'awaiting_vda', updated_by = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(user.id, sheet.id);
    next.status = 'awaiting_vda';
  }
  return sheetActionsForUser(user, next, catalogCourseId);
}

export async function publishCourseWorkSheet(user, catalogCourseId) {
  if (!isViceDeanAcademic(user?.role)) httpError(403, 'Academic Vice Dean only');
  const cid = collegeId(user);
  const catalogId = Number(catalogCourseId);
  const sheet = await getOrCreateCourseWorkSheet(user, catalogCourseId);
  if (normalizeSheetStatus(sheet.status) !== 'awaiting_vda') {
    httpError(400, 'The mark sheet is not waiting for the vice dean');
  }

  const { getCourseWorkGrades } = await import('./courseWorkGradesService.js');
  const { notifyPublishedCourseWork } = await import('./appNotesService.js');
  const { syncStudentAcademicRecordByUserId } = await import('./studentGpaService.js');
  const needs = await sheetStaffNeeds(user, catalogId);
  const grades = await getCourseWorkGrades(user, catalogId, needs.offeringIds);
  const uni = await db.prepare(`
    SELECT uc.weight_sai, uc.weight_theory, uc.weight_practical, uc.weight_midterm
    FROM uni_courses uc
    INNER JOIN departments d ON d.id = uc.department_id
    WHERE d.college_id = ? AND uc.catalog_course_id = ?
    LIMIT 1
  `).get(cid, catalogId);

  const activeRows = (grades.rows || []).filter((row) => !row.withdrawn);
  for (const row of activeRows) {
    const percent = computeCourseWorkPercent(row, uni || {});
    const sc = await db.prepare(
      'SELECT id, course_name FROM student_courses WHERE user_id = ? AND catalog_course_id = ? ORDER BY id DESC LIMIT 1'
    ).get(row.user_id, catalogId);
    if (!sc || percent == null) continue;
    const passed = percent >= PASS_MARK ? 1 : 0;
    await db.prepare(`
      UPDATE student_courses
      SET current_grade = ?, progress = ?, passed = ?, finalized_at = COALESCE(finalized_at, CURRENT_TIMESTAMP)
      WHERE id = ?
    `).run(percent, percent, passed, sc.id);
    await notifyPublishedCourseWork(row.user_id, sc.id, sc.course_name, percent);
    await syncStudentAcademicRecordByUserId(row.user_id);
  }
  const { syncOfficialMarksFromCourseWork } = await import('./officialGradesService.js');
  await syncOfficialMarksFromCourseWork(user, catalogId, activeRows);

  await db.prepare(`
    UPDATE course_work_sheets
    SET status = 'published',
        vda_confirmed_at = CURRENT_TIMESTAMP,
        vda_confirmed_by = ?,
        published_at = CURRENT_TIMESTAMP,
        updated_by = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(user.id, user.id, sheet.id);
  return sheetActionsForUser(user, {
    ...sheet,
    status: 'published',
    published_at: new Date().toISOString(),
  }, catalogId);
}
