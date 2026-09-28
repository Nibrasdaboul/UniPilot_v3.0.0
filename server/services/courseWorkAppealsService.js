import { db } from '../db.js';
import { COURSE_WORK_COMPONENTS } from '../college/courseWorkGrades.js';
import {
  parseAppealReason,
  parseAppealDecision,
  parseCourseWorkComponent,
  publicAppeal,
  appealActionForComponent,
} from '../college/courseWorkAppeals.js';
import { isExamsOfficeRole } from '../college/roles.js';
import { normalizeSheetStatus } from '../college/courseWorkSheets.js';
import { getOrCreateCourseWorkSheet, sheetStaffNeeds } from './courseWorkSheetsService.js';
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

const APPEAL_SELECT = `
  a.id, a.college_id, a.catalog_course_id, a.user_id, a.component, a.reason, a.status,
  a.decision_note, a.decided_by, a.decided_at, a.created_at,
  u.full_name, u.person_code
`;

export async function pendingAppealCountsForCollege(cid) {
  try {
    const rows = await db.prepare(`
      SELECT catalog_course_id, COUNT(*)::int AS pending_count
      FROM course_work_appeals
      WHERE college_id = ? AND status = 'pending'
      GROUP BY catalog_course_id
    `).all(cid);
    return new Map((rows || []).map((row) => [Number(row.catalog_course_id), Number(row.pending_count)]));
  } catch (err) {
    if (err?.code === '42P01') return new Map();
    throw err;
  }
}

export async function listCourseWorkAppeals(user, catalogCourseId) {
  const cid = collegeId(user);
  const catalogId = Number(catalogCourseId);
  if (!Number.isFinite(catalogId)) httpError(404, 'Course not found');
  try {
    const rows = await db.prepare(`
      SELECT ${APPEAL_SELECT}
      FROM course_work_appeals a
      INNER JOIN users u ON u.id = a.user_id
      WHERE a.college_id = ? AND a.catalog_course_id = ?
      ORDER BY a.created_at DESC, a.id DESC
    `).all(cid, catalogId);
    return (rows || []).map(publicAppeal);
  } catch (err) {
    if (err?.code === '42P01') return [];
    throw err;
  }
}

export async function getStudentCourseWorkAppeals(user, catalogCourseId) {
  const cid = collegeId(user);
  const catalogId = Number(catalogCourseId);
  let rows = [];
  try {
    rows = await db.prepare(`
      SELECT ${APPEAL_SELECT}
      FROM course_work_appeals a
      INNER JOIN users u ON u.id = a.user_id
      WHERE a.college_id = ? AND a.catalog_course_id = ? AND a.user_id = ?
    `).all(cid, catalogId, user.id);
  } catch (err) {
    if (err?.code !== '42P01') throw err;
  }
  const byComponent = {};
  for (const row of rows || []) {
    byComponent[row.component] = publicAppeal(row);
  }
  return COURSE_WORK_COMPONENTS.map((comp) => ({
    component: comp.key,
    ...appealActionForComponent(byComponent[comp.key]),
    id: byComponent[comp.key]?.id || null,
    reason: byComponent[comp.key]?.reason || null,
    decision_note: byComponent[comp.key]?.decision_note || null,
  }));
}

export async function submitCourseWorkAppeal(user, studentCourseId, body) {
  const cid = collegeId(user);
  const sc = await db.prepare(`
    SELECT id, user_id, catalog_course_id, course_name
    FROM student_courses
    WHERE id = ? AND user_id = ?
  `).get(Number(studentCourseId), user.id);
  if (!sc) httpError(404, 'Course not found');
  const catalogId = Number(sc.catalog_course_id);
  if (!catalogId) httpError(400, 'This course has no published mark sheet');
  const sheet = await getOrCreateCourseWorkSheet(user, catalogId);
  if (normalizeSheetStatus(sheet.status) !== 'published' && sc.current_grade == null) {
    httpError(400, 'Marks are not available to appeal yet');
  }
  const parsed = parseCourseWorkComponent(body?.component);
  if (parsed.error) httpError(400, parsed.error);
  const reason = parseAppealReason(body?.reason);
  if (reason.error) httpError(400, reason.error);

  try {
    await db.prepare(`
      INSERT INTO course_work_appeals (college_id, catalog_course_id, user_id, component, reason, status)
      VALUES (?, ?, ?, ?, ?, 'pending')
    `).run(cid, catalogId, user.id, parsed.component, reason.reason);
  } catch (err) {
    if (err?.code === '23505') httpError(400, 'You already appealed this component');
    throw err;
  }
  return { appeals: await getStudentCourseWorkAppeals(user, catalogId) };
}

export async function decideCourseWorkAppeal(user, catalogCourseId, appealId, body) {
  if (!isExamsOfficeRole(user?.role)) httpError(403, 'Exams Office only');
  const cid = collegeId(user);
  const catalogId = Number(catalogCourseId);
  const id = Number(appealId);
  const parsed = parseAppealDecision(body?.decision || body?.status);
  if (parsed.error) httpError(400, parsed.error);
  const note = body?.note != null || body?.decision_note != null
    ? String(body.note || body.decision_note || '').trim()
    : '';

  const row = await db.prepare(`
    SELECT ${APPEAL_SELECT}
    FROM course_work_appeals a
    INNER JOIN users u ON u.id = a.user_id
    WHERE a.id = ? AND a.college_id = ? AND a.catalog_course_id = ?
  `).get(id, cid, catalogId);
  if (!row) httpError(404, 'Appeal not found');
  if (row.status !== 'pending') httpError(400, 'This appeal was already decided');
  const needs = await sheetStaffNeeds(user, catalogId);
  await assertRosterStudentEditable(row.user_id, needs.offeringIds);

  await db.prepare(`
    UPDATE course_work_appeals
    SET status = ?, decision_note = ?, decided_by = ?, decided_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(parsed.decision, note || null, user.id, id);

  if (parsed.decision === 'accepted') {
    const sheet = await getOrCreateCourseWorkSheet(user, catalogId);
    if (sheet?.id) {
      await db.prepare(`
        UPDATE course_work_sheets
        SET status = 'at_exams',
            instructor_confirmed_at = NULL,
            ta_confirmed_at = NULL,
            vda_confirmed_at = NULL,
            vda_confirmed_by = NULL,
            published_at = NULL,
            updated_by = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(user.id, sheet.id);
    }
  }

  try {
    const title = parsed.decision === 'rejected'
      ? 'نتيجة الاعتراض: العلامة صحيحة'
      : 'نتيجة الاعتراض: سيتم مراجعة العلامة';
    const bodyText = parsed.decision === 'rejected'
      ? (note || 'راجعت دائرة الامتحانات العلامة ووجدتها صحيحة.')
      : (note || 'قبلت دائرة الامتحانات الاعتراض وستعدّل العلامة ثم تعيد سلسلة الاعتماد.');
    const sc = await db.prepare(
      'SELECT id FROM student_courses WHERE user_id = ? AND catalog_course_id = ? ORDER BY id DESC LIMIT 1'
    ).get(row.user_id, catalogId);
    await db.prepare(
      'INSERT INTO notifications (user_id, title, body, type, link, source) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(row.user_id, title, bodyText.slice(0, 600), parsed.decision === 'rejected' ? 'warning' : 'info', sc?.id ? `/courses/${sc.id}` : '/notes', 'course_work_appeal');
  } catch (_) {}

  return { appeal: publicAppeal({ ...row, status: parsed.decision, decision_note: note || null }), appeals: await listCourseWorkAppeals(user, catalogId) };
}
