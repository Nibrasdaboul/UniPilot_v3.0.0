import { db } from '../db.js';
import { ROLES } from '../college/roles.js';
import {
  toIsoDate,
  studentSessionStatus,
  studentReportState,
  studentReportOpensAt,
} from '../college/classSessions.js';
import {
  getStaffSessionSettings,
  syncTermSessions,
  markOverdueAbsences,
  SESSION_SELECT,
  sessionFields,
  localStamp,
} from './classSessionsService.js';
import { getCurrentTerm } from './registrationService.js';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

function httpError(status, detail, code = null) {
  const err = new Error(detail);
  err.status = status;
  if (code) err.code = code;
  throw err;
}

function isoDate(value) {
  return ISO_DATE_RE.test(String(value || '')) ? String(value) : null;
}

function addDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  return toIsoDate(new Date(y, m - 1, d + days));
}

function weekStartOf(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return addDays(iso, -((date.getDay() + 1) % 7));
}

async function studentSectionIds(userId, termId) {
  const rows = (await db.query(`
    SELECT DISTINCT p.section_id
    FROM enrollment_section_picks p
    INNER JOIN enrollments e ON e.id = p.enrollment_id
    INNER JOIN course_offerings o ON o.id = e.offering_id
    WHERE e.user_id = ? AND e.status = 'enrolled' AND o.term_id = ?
  `, [userId, termId])).rows;
  return rows.map((r) => Number(r.section_id));
}

async function catalogIdForStudentCourse(userId, studentCourseId) {
  const row = await db.prepare('SELECT catalog_course_id FROM student_courses WHERE id = ? AND user_id = ?')
    .get(Number(studentCourseId), userId);
  if (!row) httpError(404, 'Course not found', 'course_not_found');
  return row.catalog_course_id != null ? Number(row.catalog_course_id) : null;
}

async function staffNames(ids) {
  const list = [...new Set(ids.filter((id) => id != null).map(Number))];
  if (!list.length) return new Map();
  const rows = (await db.query('SELECT id, full_name FROM users WHERE id = ANY(?::int[])', [list])).rows;
  return new Map(rows.map((u) => [Number(u.id), u.full_name]));
}

async function reportInfo(sessionIds, userId) {
  if (!sessionIds.length) return { counts: new Map(), mine: new Set() };
  const rows = (await db.query(`
    SELECT session_id, COUNT(*)::int AS n, BOOL_OR(student_user_id = ?) AS mine
    FROM staff_absence_reports WHERE session_id = ANY(?::int[]) GROUP BY session_id
  `, [userId, sessionIds])).rows;
  return {
    counts: new Map(rows.map((r) => [Number(r.session_id), Number(r.n)])),
    mine: new Set(rows.filter((r) => r.mine).map((r) => Number(r.session_id))),
  };
}

function presentForStudent(row, { names, reports, settings, now }) {
  const s = sessionFields(row);
  const reported = reports.mine.has(s.id);
  return {
    id: s.id,
    kind: s.kind,
    makeup_for_session_id: s.makeup_for_session_id,
    makeup_for_date: s.makeup_for_date,
    session_date: s.session_date,
    start_time: s.start_time,
    end_time: s.end_time,
    room: s.room,
    section_id: s.section_id,
    section_kind: s.section_kind,
    section_code: s.section_code,
    course_code: s.course_code,
    course_name: s.course_name,
    catalog_course_id: s.catalog_course_id,
    staff_name: names.get(s.staff_user_id) || null,
    student_status: studentSessionStatus({ session: row, attendance: s.attendance, now }),
    report: {
      state: studentReportState({ session: row, attendance: s.attendance, now, settings, reported }),
      opens_at: localStamp(studentReportOpensAt(row, settings)),
      count: reports.counts.get(s.id) || 0,
    },
  };
}

async function loadRows(where, params) {
  return (await db.query(
    `${SESSION_SELECT} WHERE ${where.join(' AND ')} ORDER BY cs.session_date, cs.start_time, uc.course_code, cs.id`,
    params
  )).rows;
}

export async function listStudentSessions(user, query = {}) {
  const now = new Date();
  const today = toIsoDate(now);
  const settings = await getStaffSessionSettings(user).catch(() => ({}));
  const catalogCourseId = query.course_id ? await catalogIdForStudentCourse(user.id, query.course_id) : null;
  const from = isoDate(query.from) || weekStartOf(today);
  const to = isoDate(query.to) || addDays(from, 6);
  const base = {
    term: null,
    now: localStamp(now),
    today,
    from,
    to,
    student_report_after_minutes: settings.student_report_after_minutes ?? null,
    sessions: [],
    today_sessions: [],
    changes: [],
  };
  if (query.course_id && !catalogCourseId) return base;

  let term = null;
  try {
    term = (await syncTermSessions(user)).term;
  } catch (err) {
    if (err.status !== 400) throw err;
  }
  if (!term) {
    const row = await getCurrentTerm(user?.org_university_id != null ? Number(user.org_university_id) : 1);
    term = row ? { id: Number(row.id), name: row.name, starts_on: toIsoDate(row.starts_on), ends_on: toIsoDate(row.ends_on) } : null;
  }
  if (!term) return base;
  const sectionIds = await studentSectionIds(user.id, term.id);
  if (!sectionIds.length) return { ...base, term };
  await markOverdueAbsences({ termId: term.id, now });

  const scope = ['cs.term_id = ?', 'cs.section_id = ANY(?::int[])'];
  const scopeParams = [term.id, sectionIds];
  if (catalogCourseId) { scope.push('uc.catalog_course_id = ?'); scopeParams.push(catalogCourseId); }

  const [rangeRows, todayRows, changeRows] = await Promise.all([
    loadRows([...scope, 'cs.session_date BETWEEN ?::date AND ?::date'], [...scopeParams, from, to]),
    loadRows([...scope, 'cs.session_date = ?::date'], [...scopeParams, today]),
    loadRows([...scope, "(cs.kind = 'makeup' OR cs.status IN ('cancelled', 'absent'))"], scopeParams),
  ]);
  const all = [...rangeRows, ...todayRows, ...changeRows];
  const names = await staffNames(all.map((r) => r.staff_user_id));
  const reports = await reportInfo([...new Set(all.map((r) => Number(r.id)))], user.id);
  const ctx = { names, reports, settings, now };
  return {
    ...base,
    term,
    sessions: rangeRows.map((row) => presentForStudent(row, ctx)),
    today_sessions: todayRows.map((row) => presentForStudent(row, ctx)),
    changes: changeRows.map((row) => presentForStudent(row, ctx)),
  };
}

async function notifyUsers(userIds, title, body, link, source) {
  for (const id of userIds) {
    try {
      await db.prepare(
        'INSERT INTO notifications (user_id, title, body, type, link, source) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(id, title, String(body || '').slice(0, 600), 'info', link, source);
    } catch (_) {}
  }
}

export async function reportStaffNoShow(user, sessionId) {
  const id = Number(sessionId);
  if (!Number.isInteger(id) || id <= 0) httpError(404, 'Session not found', 'session_not_found');
  const row = (await db.query(`
    ${SESSION_SELECT}
    WHERE cs.id = ? AND EXISTS (
      SELECT 1 FROM enrollment_section_picks p
      INNER JOIN enrollments e ON e.id = p.enrollment_id
      WHERE p.section_id = cs.section_id AND e.user_id = ? AND e.status = 'enrolled'
    )
  `, [id, user.id])).rows[0];
  if (!row) httpError(404, 'Session not found', 'session_not_found');
  const settings = await getStaffSessionSettings(user).catch(() => ({}));
  const s = sessionFields(row);
  const state = studentReportState({ session: row, attendance: s.attendance, now: new Date(), settings });
  if (state === 'not_yet') httpError(409, 'Reporting opens a few minutes after the start', 'report_not_open');
  if (state !== 'open') httpError(409, 'This session can no longer be reported', 'report_closed');
  const ins = await db.query(
    'INSERT INTO staff_absence_reports (session_id, student_user_id) VALUES (?, ?) ON CONFLICT (session_id, student_user_id) DO NOTHING',
    [id, user.id]
  );
  if (!ins.rowCount) httpError(409, 'You already reported this session', 'already_reported');
  const count = Number((await db.prepare('SELECT COUNT(*)::int AS n FROM staff_absence_reports WHERE session_id = ?').get(id))?.n || 0);
  if (count === 1) {
    const vdas = (await db.query(`
      SELECT u.id FROM users u
      INNER JOIN departments d ON d.college_id = u.college_id
      INNER JOIN uni_courses uc ON uc.department_id = d.id
      INNER JOIN course_offerings o ON o.uni_course_id = uc.id
      WHERE o.id = ? AND u.role = ?
    `, [row.offering_id, ROLES.VICE_DEAN_ACADEMIC])).rows.map((r) => Number(r.id));
    await notifyUsers(
      [...new Set(vdas)],
      'بلاغ من الطلاب: المدرّس لم يحضر',
      `${row.course_code} · ${s.section_code || ''} · ${s.session_date} ${s.start_time}-${s.end_time}${s.room ? ` · ${s.room}` : ''}`,
      '/staff-attendance',
      'staff_session_report'
    );
  }
  return { session_id: id, state: 'reported', count };
}

async function sectionStudentIds(sectionId) {
  const rows = (await db.query(`
    SELECT DISTINCT e.user_id FROM enrollment_section_picks p
    INNER JOIN enrollments e ON e.id = p.enrollment_id
    WHERE p.section_id = ? AND e.status = 'enrolled'
  `, [sectionId])).rows;
  return rows.map((r) => Number(r.user_id));
}

function dayLabel(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return DAY_AR[new Date(y, m - 1, d).getDay()];
}

export async function notifyStudentsSessionCancelled(row) {
  const date = toIsoDate(row.session_date);
  await notifyUsers(
    await sectionStudentIds(row.section_id),
    `أُلغيت جلسة ${row.course_code}`,
    `${dayLabel(date)} ${date} · ${row.start_time}-${row.end_time}${row.room ? ` · ${row.room}` : ''} — غياب المدرّس. لا تُحسب عليك في الحضور.`,
    `/weekly-program?week=${date}`,
    'class_session_cancelled'
  );
}

export async function notifyStudentsMakeup(row, proposal) {
  await notifyUsers(
    await sectionStudentIds(row.section_id),
    `جلسة تعويضية لمادة ${row.course_code}`,
    `${dayLabel(proposal.date)} ${proposal.date} · ${proposal.start}-${proposal.end}${proposal.room ? ` · ${proposal.room}` : ''} — تعويضاً عن جلسة ${toIsoDate(row.session_date)}. يُسجَّل الحضور فيها.`,
    `/weekly-program?week=${proposal.date}`,
    'class_session_makeup'
  );
}
