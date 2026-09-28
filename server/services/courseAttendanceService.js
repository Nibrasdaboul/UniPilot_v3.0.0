import { db } from '../db.js';
import { parseAttendanceStatus, parseEvaluated, sessionKind, attendanceKindForRole, canWriteAttendanceKind, makeupAttendanceTitle, classSessionCountsForStudentAbsence } from '../college/attendance.js';
import { toIsoDate } from '../college/classSessions.js';
import { isExamsOfficeRole, isTeachingStaffRole, normalizeRole, ROLES } from '../college/roles.js';
import { staffCanEditAttendance, examsCanEditAttendance } from '../college/attendanceSheets.js';
import { getOrCreateAttendanceSheet } from './attendanceSheetsService.js';
import { getDeanAcademic } from './deanAcademicService.js';
import { listOfferingsForTerm } from './registrationService.js';
import { assertRosterStudentEditable, loadCourseRoster } from './courseRosterService.js';

function httpError(status, detail) {
  const err = new Error(detail);
  err.status = status;
  throw err;
}

function emptyGrid() {
  return { students: [], sessions: [], marks: [] };
}

function formatSessionDate(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return toIsoDate(value);
}

export async function ensureAttendanceColumnForClassSession(cs) {
  if (!cs?.id) return null;
  if (String(cs.kind || '') !== 'makeup') return null;
  if (!classSessionCountsForStudentAbsence(cs.status)) return null;
  const classId = Number(cs.id);
  const existing = await db.prepare(
    'SELECT id FROM attendance_sessions WHERE class_session_id = ?'
  ).get(classId);
  if (existing) return Number(existing.id);
  const date = formatSessionDate(cs.session_date);
  if (!date || !cs.offering_id || !cs.section_id || !cs.university_id) return null;
  const ins = await db.prepare(`
    INSERT INTO attendance_sessions (university_id, offering_id, section_id, session_date, title, class_session_id)
    VALUES (?, ?, ?, ?::date, ?, ?)
  `).run(
    Number(cs.university_id),
    Number(cs.offering_id),
    Number(cs.section_id),
    date,
    makeupAttendanceTitle(date),
    classId
  );
  return Number(ins.lastInsertRowid || ins.id || 0) || null;
}

async function backfillMakeupAttendanceColumns(offeringIds) {
  if (!offeringIds.length) return;
  const rows = (await db.query(`
    SELECT cs.id, cs.university_id, cs.offering_id, cs.section_id,
           to_char(cs.session_date, 'YYYY-MM-DD') AS session_date, cs.kind, cs.status
    FROM class_sessions cs
    WHERE cs.offering_id = ANY(?::int[])
      AND cs.kind = 'makeup'
      AND cs.status NOT IN ('cancelled', 'absent')
      AND NOT EXISTS (SELECT 1 FROM attendance_sessions a WHERE a.class_session_id = cs.id)
  `, [offeringIds])).rows;
  for (const row of rows || []) {
    await ensureAttendanceColumnForClassSession(row);
  }
}

export async function getAttendanceGridForOfferings(offeringIds) {
  const ids = [...new Set((offeringIds || []).map((id) => Number(id)).filter(Boolean))];
  if (!ids.length) return emptyGrid();
  const placeholders = ids.map(() => '?').join(', ');
  try {
    const students = await loadCourseRoster(ids);
    await backfillMakeupAttendanceColumns(ids);

    const sessions = await db.prepare(`
      SELECT s.id, s.offering_id, s.section_id, s.session_date, s.title, sec.kind AS section_kind,
             s.class_session_id, cs.kind AS class_kind, cs.status AS class_status
      FROM attendance_sessions s
      LEFT JOIN sections sec ON sec.id = s.section_id
      LEFT JOIN class_sessions cs ON cs.id = s.class_session_id
      WHERE s.offering_id IN (${placeholders})
        AND (cs.id IS NULL OR cs.status NOT IN ('cancelled', 'absent'))
        AND NOT EXISTS (
          SELECT 1 FROM class_sessions cancelled
          WHERE cancelled.offering_id = s.offering_id
            AND cancelled.section_id = s.section_id
            AND cancelled.session_date = s.session_date
            AND cancelled.kind = 'regular'
            AND cancelled.status IN ('cancelled', 'absent')
            AND s.class_session_id IS NULL
        )
      ORDER BY s.session_date ASC, s.id ASC
    `).all(...ids);

    const sessionIds = (sessions || []).map((s) => Number(s.id));
    const records = sessionIds.length
      ? await db.prepare(`
          SELECT session_id, user_id, status
          FROM attendance_records
          WHERE session_id IN (${sessionIds.map(() => '?').join(', ')})
        `).all(...sessionIds)
      : [];
    let evals = [];
    if (sessionIds.length) {
      try {
        evals = await db.prepare(`
          SELECT session_id, user_id, evaluated
          FROM attendance_session_evals
          WHERE session_id IN (${sessionIds.map(() => '?').join(', ')})
        `).all(...sessionIds);
      } catch (err) {
        if (err?.code !== '42P01') throw err;
      }
    }

    const markMap = new Map();
    for (const row of records || []) {
      const key = `${row.session_id}:${row.user_id}`;
      markMap.set(key, {
        session_id: Number(row.session_id),
        user_id: Number(row.user_id),
        status: row.status || null,
        evaluated: false,
      });
    }
    for (const row of evals || []) {
      const key = `${row.session_id}:${row.user_id}`;
      const current = markMap.get(key) || {
        session_id: Number(row.session_id),
        user_id: Number(row.user_id),
        status: null,
        evaluated: false,
      };
      current.evaluated = Boolean(row.evaluated);
      markMap.set(key, current);
    }

    return {
      students,
      sessions: (sessions || []).map((row, index) => {
        const isMakeup = String(row.class_kind || '') === 'makeup';
        const date = formatSessionDate(row.session_date);
        return {
          id: Number(row.id),
          offering_id: Number(row.offering_id),
          section_id: Number(row.section_id),
          session_date: date,
          title: isMakeup ? (row.title || makeupAttendanceTitle(date)) : (row.title || `الجلسة ${index + 1}`),
          index: index + 1,
          kind: sessionKind(row.section_kind),
          is_makeup: isMakeup,
          class_status: row.class_status || null,
          class_session_id: row.class_session_id != null ? Number(row.class_session_id) : null,
          counts_for_absence: true,
        };
      }),
      marks: [...markMap.values()],
    };
  } catch (err) {
    if (err?.code === '42P01') return emptyGrid();
    throw err;
  }
}

async function offeringsForCatalog(user, catalogCourseId) {
  const cid = user?.college_id != null ? Number(user.college_id) : null;
  if (cid == null) httpError(400, 'User is not attached to a college');
  const catalogId = Number(catalogCourseId);
  if (!Number.isFinite(catalogId)) httpError(404, 'Course not found');
  const academic = await getDeanAcademic(user);
  const all = academic.term?.id ? await listOfferingsForTerm(academic.term.id, cid) : [];
  const offerings = (all || []).filter((o) => Number(o.catalog_course_id) === catalogId);
  const termRow = academic.term?.id
    ? await db.prepare('SELECT university_id FROM academic_terms WHERE id = ?').get(academic.term.id)
    : null;
  const universityId = termRow?.university_id != null
    ? Number(termRow.university_id)
    : (user?.org_university_id != null ? Number(user.org_university_id) : null);
  return {
    catalogId,
    offerings: offerings.map((o) => ({
      id: Number(o.id),
      term_id: Number(o.term_id),
      university_id: universityId,
    })),
  };
}

async function sectionForOfferingKind(offeringId, kind) {
  const normalized = sessionKind(kind);
  const existing = await db.prepare(
    'SELECT id FROM sections WHERE offering_id = ? AND kind = ? ORDER BY id ASC LIMIT 1'
  ).get(offeringId, normalized);
  if (existing) return Number(existing.id);
  const code = normalized === 'practical' ? 'ATT-PR' : 'ATT-TH';
  const created = await db.prepare(`
    INSERT INTO sections (offering_id, kind, code, staff_user_id, capacity)
    VALUES (?, ?, ?, NULL, 50)
    RETURNING id
  `).run(offeringId, normalized, code);
  return Number(created.lastInsertRowid || created.id);
}

async function sessionWithKind(sessionId, offeringIds) {
  return db.prepare(`
    SELECT s.id, sec.kind AS section_kind
    FROM attendance_sessions s
    LEFT JOIN sections sec ON sec.id = s.section_id
    WHERE s.id = ? AND s.offering_id IN (${offeringIds.map(() => '?').join(', ')})
  `).get(sessionId, ...offeringIds);
}

export async function addCourseAttendanceSession(user, catalogCourseId) {
  const kind = attendanceKindForRole(user?.role);
  if (!kind) httpError(403, 'You cannot add attendance sessions');
  const sheet = await getOrCreateAttendanceSheet(user, catalogCourseId);
  if (!staffCanEditAttendance(sheet.status)) httpError(403, 'Attendance is locked after the sheet left teaching staff');
  const { offerings } = await offeringsForCatalog(user, catalogCourseId);
  const offering = offerings[0];
  if (!offering) httpError(400, 'Course is not offered this term');
  if (!offering.university_id) httpError(400, 'University is missing');
  const sectionId = await sectionForOfferingKind(offering.id, kind);
  const count = await db.prepare(`
    SELECT COUNT(*)::int AS n
    FROM attendance_sessions s
    LEFT JOIN sections sec ON sec.id = s.section_id
    WHERE s.offering_id = ? AND COALESCE(sec.kind, 'theory') = ?
  `).get(offering.id, kind);
  const n = Number(count?.n || 0) + 1;
  const title = kind === 'practical' ? `جلسة العملي ${n}` : `جلسة النظري ${n}`;
  await db.prepare(`
    INSERT INTO attendance_sessions (university_id, offering_id, section_id, session_date, title, created_by)
    VALUES (?, ?, ?, CURRENT_DATE, ?, ?)
  `).run(offering.university_id, offering.id, sectionId, title, user.id);
  return getAttendanceGridForOfferings(offerings.map((o) => o.id));
}

export async function markCourseAttendance(user, catalogCourseId, body) {
  const { offerings } = await offeringsForCatalog(user, catalogCourseId);
  const offeringIds = offerings.map((o) => Number(o.id));
  if (!offeringIds.length) httpError(400, 'Course is not offered this term');

  const sessionId = parseInt(body?.session_id, 10);
  const studentId = parseInt(body?.user_id, 10);
  const parsed = parseAttendanceStatus(body?.status);
  if (parsed.error) httpError(400, parsed.error);
  if (!Number.isFinite(sessionId) || !Number.isFinite(studentId)) {
    httpError(400, 'session_id and user_id are required');
  }

  const session = await sessionWithKind(sessionId, offeringIds);
  if (!session) httpError(404, 'Session not found');
  const allowed = canWriteAttendanceKind(user?.role, session.section_kind);
  if (!allowed.ok) httpError(403, allowed.error);
  const sheet = await getOrCreateAttendanceSheet(user, catalogCourseId);
  if (isTeachingStaffRole(user?.role) && !isExamsOfficeRole(user?.role) && !staffCanEditAttendance(sheet.status)) {
    httpError(403, 'Attendance is locked after the sheet left teaching staff');
  }
  if (isExamsOfficeRole(user?.role) && !examsCanEditAttendance(sheet.status)) {
    httpError(403, 'The Exams Office can no longer change this adopted attendance sheet');
  }

  await assertRosterStudentEditable(studentId, offeringIds);

  await db.prepare(`
    INSERT INTO attendance_records (session_id, user_id, status, updated_by, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT (session_id, user_id) DO UPDATE SET
      status = EXCLUDED.status,
      updated_by = EXCLUDED.updated_by,
      updated_at = CURRENT_TIMESTAMP
    RETURNING id
  `).run(sessionId, studentId, parsed.status, user.id);

  return getAttendanceGridForOfferings(offeringIds);
}

export async function markCourseSessionEval(user, catalogCourseId, body) {
  if (normalizeRole(user?.role) !== ROLES.TEACHING_ASSISTANT) {
    httpError(403, 'Teaching assistants only');
  }
  const { offerings } = await offeringsForCatalog(user, catalogCourseId);
  const offeringIds = offerings.map((o) => Number(o.id));
  if (!offeringIds.length) httpError(400, 'Course is not offered this term');

  const sessionId = parseInt(body?.session_id, 10);
  const studentId = parseInt(body?.user_id, 10);
  const parsed = parseEvaluated(body?.evaluated);
  if (parsed.error) httpError(400, parsed.error);
  if (!Number.isFinite(sessionId) || !Number.isFinite(studentId)) {
    httpError(400, 'session_id and user_id are required');
  }

  const session = await sessionWithKind(sessionId, offeringIds);
  if (!session) httpError(404, 'Session not found');
  if (sessionKind(session.section_kind) !== 'practical') {
    httpError(403, 'Evaluation is only for practical sessions');
  }
  const sheet = await getOrCreateAttendanceSheet(user, catalogCourseId);
  if (!staffCanEditAttendance(sheet.status)) httpError(403, 'Attendance is locked after the sheet left teaching staff');

  await assertRosterStudentEditable(studentId, offeringIds);

  await db.prepare(`
    INSERT INTO attendance_session_evals (session_id, user_id, evaluated, updated_by, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT (session_id, user_id) DO UPDATE SET
      evaluated = EXCLUDED.evaluated,
      updated_by = EXCLUDED.updated_by,
      updated_at = CURRENT_TIMESTAMP
    RETURNING id
  `).run(sessionId, studentId, parsed.evaluated, user.id);

  return getAttendanceGridForOfferings(offeringIds);
}
