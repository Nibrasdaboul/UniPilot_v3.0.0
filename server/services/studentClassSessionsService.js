import { db } from '../db.js';
import { isStudentRole } from '../college/roles.js';
import { getCurrentTerm } from './registrationService.js';
import { getStaffSessionSettings } from './classSessionsService.js';
import { sessionStartsAt, sessionEndsAt, toIsoDate } from '../college/classSessions.js';

function httpError(status, detail, code = null) {
  const err = new Error(detail);
  err.status = status;
  if (code) err.code = code;
  throw err;
}

function requireStudent(user) {
  if (!isStudentRole(user?.role)) httpError(403, 'Students only', 'student_only');
}

function orgUniversityId(user) {
  return user?.org_university_id != null ? Number(user.org_university_id) : 1;
}

function localStamp(date) {
  if (!date || Number.isNaN(date.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${toIsoDate(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const SESSION_SELECT = `
  SELECT cs.id, cs.kind, cs.status, cs.makeup_for_session_id,
         to_char(cs.session_date, 'YYYY-MM-DD') AS session_date,
         cs.start_time, cs.end_time, cs.room, cs.offering_id, cs.section_id,
         cs.staff_user_id,
         sec.kind AS section_kind, sec.code AS section_code,
         uc.course_code, uc.course_name, uc.catalog_course_id,
         to_char(orig.session_date, 'YYYY-MM-DD') AS makeup_for_date
  FROM class_sessions cs
  INNER JOIN sections sec ON sec.id = cs.section_id
  INNER JOIN course_offerings co ON co.id = cs.offering_id
  INNER JOIN uni_courses uc ON uc.id = co.uni_course_id
  LEFT JOIN class_sessions orig ON orig.id = cs.makeup_for_session_id
`;

export async function getStudentClassSessions(user) {
  requireStudent(user);
  const term = await getCurrentTerm(orgUniversityId(user));
  if (!term) return { term: null, now: null, settings: {}, sessions: [] };

  const termId = Number(term.id);
  const userId = Number(user.id);
  const now = new Date();
  const today = toIsoDate(now);

  // Fetch settings (uses college_id from user, falls back to defaults)
  let settings;
  try {
    settings = await getStaffSessionSettings(user);
  } catch {
    settings = { student_report_after_minutes: 15 };
  }

  // Sessions from sections the student has picked in this term
  // Filter: cancelled (staff absent), absent (auto without staff), makeup sessions, or today's sessions
  const rows = (await db.query(`
    ${SESSION_SELECT}
    INNER JOIN enrollment_section_picks esp ON esp.section_id = cs.section_id
    INNER JOIN enrollments e ON e.id = esp.enrollment_id
    WHERE e.user_id = ? AND cs.term_id = ?
      AND (
        cs.status = 'cancelled'
        OR cs.status = 'absent'
        OR cs.kind = 'makeup'
        OR cs.session_date = ?::date
      )
    ORDER BY cs.session_date DESC, cs.start_time, cs.id
    LIMIT 500
  `, [userId, termId, today])).rows;

  if (!rows.length) {
    return {
      term: { id: termId, name: term.name, starts_on: toIsoDate(term.starts_on), ends_on: toIsoDate(term.ends_on) },
      now: localStamp(now),
      settings: { student_report_after_minutes: settings.student_report_after_minutes },
      sessions: [],
    };
  }

  const sessionIds = rows.map((r) => Number(r.id));
  const reports = sessionIds.length ? (await db.query(`
    SELECT session_id, COUNT(*)::int AS total_reports,
           BOOL_OR(student_user_id = ?) AS my_report
    FROM staff_absence_reports
    WHERE session_id = ANY(?::int[])
    GROUP BY session_id
  `, [userId, sessionIds])).rows : [];
  const reportMap = new Map(reports.map((r) => [Number(r.session_id), r]));

  const sessions = rows.map((row) => {
    const id = Number(row.id);
    const rpt = reportMap.get(id) || {};
    const start = sessionStartsAt(row.session_date, row.start_time);
    const end = sessionEndsAt(row.session_date, row.end_time);
    const minutesPassed = start ? Math.floor((now - start) / 60000) : -Infinity;
    const canReport = row.status === 'scheduled'
      && !rpt.my_report
      && minutesPassed >= settings.student_report_after_minutes
      && end != null && now <= end;

    return {
      id,
      kind: row.kind,
      status: row.status,
      session_date: row.session_date,
      start_time: row.start_time,
      end_time: row.end_time,
      room: row.room || null,
      section_kind: row.section_kind || null,
      section_code: row.section_code || null,
      course_code: row.course_code,
      course_name: row.course_name,
      catalog_course_id: row.catalog_course_id != null ? Number(row.catalog_course_id) : null,
      makeup_for_date: row.makeup_for_date || null,
      report_count: Number(rpt.total_reports || 0),
      already_reported: Boolean(rpt.my_report),
      can_report: canReport,
    };
  });

  return {
    term: { id: termId, name: term.name, starts_on: toIsoDate(term.starts_on), ends_on: toIsoDate(term.ends_on) },
    now: localStamp(now),
    settings: { student_report_after_minutes: settings.student_report_after_minutes },
    sessions,
  };
}

export async function reportStaffAbsence(user, sessionId) {
  requireStudent(user);
  const id = Number(sessionId);
  if (!id || id <= 0) httpError(404, 'Session not found', 'session_not_found');
  const userId = Number(user.id);

  // Verify student is enrolled in this section
  const row = (await db.query(`
    SELECT cs.id, cs.status, cs.session_date, cs.start_time, cs.end_time
    FROM class_sessions cs
    INNER JOIN enrollment_section_picks esp ON esp.section_id = cs.section_id
    INNER JOIN enrollments e ON e.id = esp.enrollment_id
    WHERE cs.id = ? AND e.user_id = ? AND e.status = 'enrolled'
    LIMIT 1
  `, [id, userId])).rows[0];

  if (!row) httpError(404, 'Session not found or you are not enrolled in this section', 'session_not_found');

  let settings;
  try {
    settings = await getStaffSessionSettings(user);
  } catch {
    settings = { student_report_after_minutes: 15 };
  }

  const now = new Date();
  const start = sessionStartsAt(row.session_date, row.start_time);
  const end = sessionEndsAt(row.session_date, row.end_time);

  if (row.status !== 'scheduled') {
    httpError(409, 'Attendance was already recorded for this session', 'session_not_open');
  }
  if (!start || now < new Date(start.getTime() + settings.student_report_after_minutes * 60000)) {
    httpError(409, `Please wait ${settings.student_report_after_minutes} minutes after the session start time before reporting`, 'report_too_early');
  }
  if (!end || now > end) {
    httpError(409, 'The session has ended. Reports are no longer accepted', 'report_closed');
  }

  try {
    await db.query(
      'INSERT INTO staff_absence_reports (session_id, student_user_id) VALUES (?, ?)',
      [id, userId]
    );
  } catch (err) {
    if (err?.code === '23505') httpError(409, 'You already reported this session', 'already_reported');
    throw err;
  }

  const countRow = (await db.query(
    'SELECT COUNT(*)::int AS n FROM staff_absence_reports WHERE session_id = ?',
    [id]
  )).rows[0];

  return { session_id: id, report_count: Number(countRow?.n || 1) };
}

/** Notify all enrolled students about a session change (cancellation or new makeup) */
export async function notifyEnrolledStudents(sessionId, title, body, catalogCourseId) {
  try {
    const students = (await db.query(`
      SELECT DISTINCT e.user_id
      FROM enrollments e
      INNER JOIN enrollment_section_picks esp ON esp.enrollment_id = e.id
      INNER JOIN class_sessions cs ON cs.section_id = esp.section_id
      WHERE cs.id = ? AND e.status = 'enrolled'
    `, [sessionId])).rows;

    if (!students.length) return 0;

    const link = catalogCourseId ? `/weekly-program` : '/weekly-program';
    for (const s of students) {
      try {
        await db.prepare(
          'INSERT INTO notifications (user_id, title, body, type, link, source) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(Number(s.user_id), title, String(body || '').slice(0, 600), 'info', link, 'staff_session');
      } catch (_) {}
    }
    return students.length;
  } catch (_) {
    return 0;
  }
}
