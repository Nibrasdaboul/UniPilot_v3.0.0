import { db } from '../db.js';
import { COURSE_WORK_COMPONENTS, parseCourseWorkMark, canEditCourseWorkComponent, isAutomatedTheoryComponent } from '../college/courseWorkGrades.js';
import { isTeachingStaffRole, isExamsOfficeRole } from '../college/roles.js';
import { staffCanEditSheet, examsCanEditSheet, normalizeSheetStatus } from '../college/courseWorkSheets.js';
import { getDeanAcademic } from './deanAcademicService.js';
import { listOfferingsForTerm } from './registrationService.js';
import { getOrCreateCourseWorkSheet, sheetActionsForUser } from './courseWorkSheetsService.js';
import { getStudentCourseWorkAppeals } from './courseWorkAppealsService.js';
import { applyScaleToUserMark } from './gpaScaleService.js';
import { publicCourseWorkSheet } from '../college/courseWorkSheets.js';
import { assertRosterStudentEditable, loadCourseRoster } from './courseRosterService.js';

function httpError(status, detail) {
  const err = new Error(detail);
  err.status = status;
  throw err;
}

function emptyGrades() {
  return {
    students: [],
    rows: [],
    components: COURSE_WORK_COMPONENTS,
    sheet: publicCourseWorkSheet(null),
  };
}

function collegeId(user) {
  const cid = user?.college_id != null ? Number(user.college_id) : null;
  if (cid == null) httpError(400, 'User is not attached to a college');
  return cid;
}

async function catalogOfferings(user, catalogCourseId) {
  const cid = collegeId(user);
  const catalogId = Number(catalogCourseId);
  if (!Number.isFinite(catalogId)) httpError(404, 'Course not found');
  const academic = await getDeanAcademic(user);
  const all = academic.term?.id ? await listOfferingsForTerm(academic.term.id, cid) : [];
  const offerings = (all || []).filter((o) => Number(o.catalog_course_id) === catalogId);
  return { cid, catalogId, offeringIds: offerings.map((o) => Number(o.id)) };
}

export async function getCourseWorkGrades(user, catalogCourseId, offeringIds) {
  const cid = collegeId(user);
  const catalogId = Number(catalogCourseId);
  const ids = [...new Set((offeringIds || []).map((id) => Number(id)).filter(Boolean))];
  if (!ids.length) return emptyGrades();
  const students = await loadCourseRoster(ids);

  let marks = [];
  try {
    marks = await db.prepare(`
      SELECT user_id, component, score, max_score, practical_kind
      FROM course_work_marks
      WHERE college_id = ? AND catalog_course_id = ?
    `).all(cid, catalogId);
  } catch (err) {
    if (err?.code !== '42P01') throw err;
  }

  const byUser = new Map();
  for (const row of marks || []) {
    const uid = Number(row.user_id);
    const current = byUser.get(uid) || {};
    current[row.component] = {
      score: row.score == null ? null : Number(row.score),
      max_score: Number(row.max_score) || 100,
      practical_kind: row.component === 'practical' ? (row.practical_kind || 'exam') : null,
    };
    byUser.set(uid, current);
  }

  return {
    students,
    rows: students.map((row) => {
      const uid = Number(row.user_id);
      const marksFor = byUser.get(uid) || {};
      return {
        user_id: uid,
        withdrawn: row.withdrawn,
        midterm_theory: marksFor.midterm_theory || { score: null, max_score: 100 },
        sai_theory: marksFor.sai_theory || { score: null, max_score: 100 },
        final_theory: marksFor.final_theory || { score: null, max_score: 100 },
        practical: marksFor.practical || { score: null, max_score: 100, practical_kind: 'exam' },
      };
    }),
    components: COURSE_WORK_COMPONENTS,
    sheet: await sheetActionsForUser(user, await getOrCreateCourseWorkSheet(user, catalogId), catalogId),
  };
}

export async function upsertCourseWorkMark(user, catalogCourseId, body) {
  const { cid, catalogId, offeringIds } = await catalogOfferings(user, catalogCourseId);
  if (!offeringIds.length) httpError(400, 'Course is not offered this term');
  const studentId = parseInt(body?.user_id, 10);
  if (!Number.isFinite(studentId)) httpError(400, 'user_id is required');
  const parsed = parseCourseWorkMark(body);
  if (parsed.error) httpError(400, parsed.error);
  const allowed = canEditCourseWorkComponent(user?.role, parsed.component);
  if (!allowed.ok) httpError(403, allowed.error);
  const sheet = await getOrCreateCourseWorkSheet(user, catalogId);
  if (isTeachingStaffRole(user?.role) && !isExamsOfficeRole(user?.role) && !staffCanEditSheet(sheet.status)) {
    httpError(403, 'Marks are locked after the sheet left teaching staff');
  }
  if (isExamsOfficeRole(user?.role) && !examsCanEditSheet(sheet.status)) {
    httpError(403, 'The Exams Office can no longer edit this adopted sheet');
  }
  if (isTeachingStaffRole(user?.role) && isAutomatedTheoryComponent(parsed.component) && Number(sheet.theory_midterm_automated)) {
    httpError(403, 'Automated theory exams (midterm and final) are graded by the Exams Office');
  }

  await assertRosterStudentEditable(studentId, offeringIds);

  let current = null;
  try {
    current = await db.prepare(`
      SELECT score, max_score, practical_kind
      FROM course_work_marks
      WHERE college_id = ? AND catalog_course_id = ? AND user_id = ? AND component = ?
    `).get(cid, catalogId, studentId, parsed.component);
  } catch (err) {
    if (err?.code !== '42P01') throw err;
  }

  const score = parsed.score === undefined ? (current?.score ?? null) : parsed.score;
  const maxScore = parsed.max_score ?? Number(current?.max_score) ?? 100;
  if (score != null && score > maxScore) httpError(400, `score must be between 0 and ${maxScore}`);
  const practicalKind = parsed.component === 'practical'
    ? (parsed.practical_kind || current?.practical_kind || 'exam')
    : null;

  await db.prepare(`
    INSERT INTO course_work_marks
      (college_id, catalog_course_id, user_id, component, score, max_score, practical_kind, updated_by, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT (college_id, catalog_course_id, user_id, component) DO UPDATE SET
      score = EXCLUDED.score,
      max_score = EXCLUDED.max_score,
      practical_kind = EXCLUDED.practical_kind,
      updated_by = EXCLUDED.updated_by,
      updated_at = CURRENT_TIMESTAMP
    RETURNING id
  `).run(cid, catalogId, studentId, parsed.component, score, maxScore, practicalKind, user.id);

  return getCourseWorkGrades(user, catalogId, offeringIds);
}

export async function getStudentPublishedCourseWork(user, studentCourseId) {
  const sc = await db.prepare(`
    SELECT id, user_id, catalog_course_id, current_grade
    FROM student_courses
    WHERE id = ? AND user_id = ?
  `).get(Number(studentCourseId), user.id);
  if (!sc) httpError(404, 'Course not found');
  const catalogId = Number(sc.catalog_course_id);
  if (!catalogId) return { published: false, percent: null, gpa_points: null, letter: null, grades: emptyGrades() };
  const sheet = await getOrCreateCourseWorkSheet(user, catalogId);
  const published = normalizeSheetStatus(sheet.status) === 'published';
  const hasGrade = sc.current_grade != null;
  if (!published && !hasGrade) {
    return { published: false, percent: null, gpa_points: null, letter: null, components: COURSE_WORK_COMPONENTS, row: null, appeals: [] };
  }
  let marks = [];
  try {
    marks = await db.prepare(`
      SELECT component, score, max_score, practical_kind
      FROM course_work_marks
      WHERE college_id = ? AND catalog_course_id = ? AND user_id = ?
    `).all(collegeId(user), catalogId, user.id);
  } catch (err) {
    if (err?.code !== '42P01') throw err;
  }
  const byKey = {};
  for (const row of marks || []) {
    byKey[row.component] = {
      score: row.score == null ? null : Number(row.score),
      max_score: Number(row.max_score) || 100,
      practical_kind: row.component === 'practical' ? (row.practical_kind || 'exam') : null,
    };
  }
  const scaled = await applyScaleToUserMark(user, sc.current_grade);
  return {
    published: true,
    sheet_status: normalizeSheetStatus(sheet.status),
    percent: scaled.percent,
    gpa_points: scaled.gpa_points,
    letter: scaled.letter,
    appeals: await getStudentCourseWorkAppeals(user, catalogId),
    components: COURSE_WORK_COMPONENTS,
    row: {
      user_id: user.id,
      midterm_theory: byKey.midterm_theory || { score: null, max_score: 100 },
      sai_theory: byKey.sai_theory || { score: null, max_score: 100 },
      final_theory: byKey.final_theory || { score: null, max_score: 100 },
      practical: byKey.practical || { score: null, max_score: 100, practical_kind: 'exam' },
      percent: scaled.percent,
      gpa_points: scaled.gpa_points,
      letter: scaled.letter,
    },
  };
}
