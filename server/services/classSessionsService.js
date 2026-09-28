import { db } from '../db.js';
import { isViceDeanAcademic, isTeachingStaffRole } from '../college/roles.js';
import {
  STAFF_SESSION_SETTING_RULES,
  normalizeStaffSessionSettings,
  parseStaffSessionSettings,
  buildRegularSessions,
  planSessionSync,
  toIsoDate,
  sessionEndsAt,
  checkInOpensAt,
  makeupDeadline,
  staffSessionActions,
  classifyStaffArrival,
  sessionStatusForArrival,
  parseMakeupProposal,
} from '../college/classSessions.js';
import { getCurrentTerm } from './registrationService.js';

const SETTING_KEYS = Object.keys(STAFF_SESSION_SETTING_RULES);
const INSERT_CHUNK = 200;

function httpError(status, detail, code = null) {
  const err = new Error(detail);
  err.status = status;
  if (code) err.code = code;
  throw err;
}

function collegeId(user) {
  const cid = user?.college_id != null ? Number(user.college_id) : null;
  if (cid == null) httpError(400, 'User is not attached to a college');
  return cid;
}

function orgUniversityId(user) {
  return user?.org_university_id != null ? Number(user.org_university_id) : 1;
}

function isMissingSchema(err) {
  return err?.code === '42703' || err?.code === '42P01';
}

export async function getStaffSessionSettings(user) {
  const cid = collegeId(user);
  try {
    const row = await db.prepare(
      `SELECT ${SETTING_KEYS.join(', ')} FROM college_academic_settings WHERE college_id = ?`
    ).get(cid);
    return normalizeStaffSessionSettings(row || {});
  } catch (err) {
    if (isMissingSchema(err)) return normalizeStaffSessionSettings({});
    throw err;
  }
}

export async function updateStaffSessionSettings(user, body) {
  if (!isViceDeanAcademic(user?.role)) httpError(403, 'Academic Vice Dean only');
  const cid = collegeId(user);
  const current = await getStaffSessionSettings(user);
  const parsed = parseStaffSessionSettings(body || {}, current);
  if (parsed.error) httpError(400, parsed.error);
  const s = parsed.settings;
  await db.prepare(`
    INSERT INTO college_academic_settings (college_id, project_request_min_hours, ${SETTING_KEYS.join(', ')}, updated_by, updated_at)
    VALUES (?, 90, ${SETTING_KEYS.map(() => '?').join(', ')}, ?, CURRENT_TIMESTAMP)
    ON CONFLICT (college_id) DO UPDATE SET
      ${SETTING_KEYS.map((k) => `${k} = EXCLUDED.${k}`).join(',\n      ')},
      updated_by = EXCLUDED.updated_by,
      updated_at = CURRENT_TIMESTAMP
    RETURNING college_id AS id
  `).run(cid, ...SETTING_KEYS.map((k) => s[k]), user.id);
  return getStaffSessionSettings(user);
}

async function loadCollegeSchedule(termId, cid) {
  const sections = await db.prepare(`
    SELECT sec.id, sec.offering_id, sec.kind, sec.code, sec.staff_user_id,
           uc.course_code, uc.course_name, uc.catalog_course_id
    FROM sections sec
    INNER JOIN course_offerings o ON o.id = sec.offering_id
    INNER JOIN uni_courses uc ON uc.id = o.uni_course_id
    INNER JOIN departments d ON d.id = uc.department_id
    WHERE o.term_id = ? AND d.college_id = ?
    ORDER BY uc.course_code ASC, sec.kind DESC, sec.code ASC, sec.id ASC
  `).all(termId, cid);
  if (!sections.length) return { sections, meetings: [], offeringStaff: [] };
  const sectionIds = sections.map((s) => Number(s.id));
  const offeringIds = [...new Set(sections.map((s) => Number(s.offering_id)))];
  const meetings = (await db.query(
    `SELECT id, section_id, day_of_week, start_time, end_time, room_number, building
     FROM section_meetings WHERE section_id = ANY(?::int[]) ORDER BY section_id, day_of_week, start_time`,
    [sectionIds]
  )).rows;
  const offeringStaff = (await db.query(
    'SELECT offering_id, user_id, staff_role FROM course_staff WHERE offering_id = ANY(?::int[])',
    [offeringIds]
  )).rows;
  return { sections, meetings, offeringStaff };
}

async function loadExistingSessions(termId, offeringIds) {
  if (!offeringIds.length) return [];
  return (await db.query(`
    SELECT cs.id, cs.kind, cs.meeting_id, to_char(cs.session_date, 'YYYY-MM-DD') AS session_date,
           cs.start_time, cs.end_time, cs.room, cs.staff_user_id, cs.status,
           (EXISTS (SELECT 1 FROM staff_session_attendance a WHERE a.session_id = cs.id)
             OR EXISTS (SELECT 1 FROM staff_session_requests r WHERE r.session_id = cs.id OR r.makeup_session_id = cs.id)
             OR EXISTS (SELECT 1 FROM staff_absence_reports sr WHERE sr.session_id = cs.id)
             OR EXISTS (SELECT 1 FROM attendance_sessions ats WHERE ats.class_session_id = cs.id)
             OR EXISTS (SELECT 1 FROM class_sessions mk WHERE mk.makeup_for_session_id = cs.id)) AS has_links
    FROM class_sessions cs
    WHERE cs.term_id = ? AND cs.offering_id = ANY(?::int[]) AND cs.kind = 'regular'
  `, [termId, offeringIds])).rows;
}

async function insertSessions(term, rows) {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const chunk = rows.slice(i, i + INSERT_CHUNK);
    const params = [];
    const values = chunk.map((r) => {
      params.push(term.university_id, term.id, r.offering_id, r.section_id, r.meeting_id,
        r.session_date, r.start_time, r.end_time, r.room, r.staff_user_id);
      return "(?, ?, ?, ?, ?, ?::date, ?, ?, ?, ?, 'regular', 'scheduled')";
    });
    const res = await db.query(`
      INSERT INTO class_sessions (university_id, term_id, offering_id, section_id, meeting_id,
        session_date, start_time, end_time, room, staff_user_id, kind, status)
      VALUES ${values.join(', ')}
      ON CONFLICT (meeting_id, session_date) WHERE kind = 'regular' DO NOTHING
    `, params);
    inserted += res.rowCount ?? 0;
  }
  return inserted;
}

export async function syncTermSessions(user) {
  const cid = collegeId(user);
  const term = await getCurrentTerm(orgUniversityId(user));
  if (!term) return { term: null, inserted: 0, updated: 0, deleted: 0 };
  const termInfo = {
    id: Number(term.id),
    university_id: Number(term.university_id),
    name: term.name,
    starts_on: toIsoDate(term.starts_on),
    ends_on: toIsoDate(term.ends_on),
  };
  const schedule = await loadCollegeSchedule(termInfo.id, cid);
  if (!termInfo.starts_on || !termInfo.ends_on) {
    return { term: termInfo, schedule, inserted: 0, updated: 0, deleted: 0 };
  }
  const desired = buildRegularSessions({ term: termInfo, ...schedule });
  const offeringIds = [...new Set(schedule.sections.map((s) => Number(s.offering_id)))];
  const existing = await loadExistingSessions(termInfo.id, offeringIds);
  const plan = planSessionSync({ desired, existing, today: toIsoDate(new Date()) });

  const inserted = await insertSessions(termInfo, plan.toInsert);
  for (const row of plan.toUpdate) {
    await db.prepare(`
      UPDATE class_sessions
      SET start_time = ?, end_time = ?, room = ?, staff_user_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'scheduled'
    `).run(row.start_time, row.end_time, row.room, row.staff_user_id, row.id);
  }
  if (plan.toDelete.length) {
    await db.query("DELETE FROM class_sessions WHERE id = ANY(?::int[]) AND status = 'scheduled'", [plan.toDelete]);
  }
  return { term: termInfo, schedule, inserted, updated: plan.toUpdate.length, deleted: plan.toDelete.length };
}

export async function getStaffSessionsOverview(user) {
  const settings = await getStaffSessionSettings(user);
  const sync = await syncTermSessions(user);
  if (!sync.term) return { term: null, settings, sync: { inserted: 0, updated: 0, deleted: 0 }, sections: [], totals: { sessions: 0, sections: 0 } };

  const { sections, meetings } = sync.schedule;
  const today = toIsoDate(new Date());
  const offeringIds = [...new Set(sections.map((s) => Number(s.offering_id)))];
  const stats = offeringIds.length ? (await db.query(`
    SELECT cs.section_id,
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE cs.kind = 'makeup')::int AS makeup,
           COUNT(*) FILTER (WHERE cs.status = 'cancelled')::int AS cancelled,
           COUNT(*) FILTER (WHERE cs.status IN ('held', 'late'))::int AS held,
           to_char(MIN(cs.session_date), 'YYYY-MM-DD') AS first_date,
           to_char(MAX(cs.session_date), 'YYYY-MM-DD') AS last_date,
           to_char(MIN(cs.session_date) FILTER (WHERE cs.session_date >= ?::date AND cs.status <> 'cancelled'), 'YYYY-MM-DD') AS next_date
    FROM class_sessions cs
    WHERE cs.term_id = ? AND cs.offering_id = ANY(?::int[])
    GROUP BY cs.section_id
  `, [today, sync.term.id, offeringIds])).rows : [];
  const statsBySection = new Map(stats.map((r) => [Number(r.section_id), r]));

  const staffIds = [...new Set((await db.query(
    'SELECT DISTINCT staff_user_id FROM class_sessions WHERE term_id = ? AND offering_id = ANY(?::int[]) AND staff_user_id IS NOT NULL',
    [sync.term.id, offeringIds.length ? offeringIds : [0]]
  )).rows.map((r) => Number(r.staff_user_id)))];
  const staffRows = staffIds.length
    ? (await db.query('SELECT id, full_name, person_code FROM users WHERE id = ANY(?::int[])', [staffIds])).rows
    : [];
  const staffById = new Map(staffRows.map((u) => [Number(u.id), u]));
  const sectionStaff = staffIds.length ? (await db.query(`
    SELECT DISTINCT ON (section_id) section_id, staff_user_id
    FROM class_sessions
    WHERE term_id = ? AND offering_id = ANY(?::int[]) AND kind = 'regular'
    ORDER BY section_id, session_date DESC
  `, [sync.term.id, offeringIds])).rows : [];
  const staffBySection = new Map(sectionStaff.map((r) => [Number(r.section_id), r.staff_user_id != null ? Number(r.staff_user_id) : null]));

  const rows = sections.map((sec) => {
    const st = statsBySection.get(Number(sec.id)) || {};
    const staffId = staffBySection.get(Number(sec.id)) ?? null;
    const staff = staffId != null ? staffById.get(staffId) : null;
    return {
      section_id: Number(sec.id),
      offering_id: Number(sec.offering_id),
      course_code: sec.course_code,
      course_name: sec.course_name,
      catalog_course_id: sec.catalog_course_id != null ? Number(sec.catalog_course_id) : null,
      section_kind: sec.kind,
      section_code: sec.code,
      staff_user_id: staffId,
      staff_name: staff?.full_name || null,
      staff_person_code: staff?.person_code || null,
      meetings: meetings
        .filter((m) => Number(m.section_id) === Number(sec.id))
        .map((m) => ({
          id: Number(m.id),
          day_of_week: Number(m.day_of_week),
          start_time: m.start_time,
          end_time: m.end_time,
          room: [m.room_number, m.building].filter(Boolean).join(' — ') || null,
        })),
      total: Number(st.total || 0),
      makeup: Number(st.makeup || 0),
      cancelled: Number(st.cancelled || 0),
      held: Number(st.held || 0),
      first_date: st.first_date || null,
      last_date: st.last_date || null,
      next_date: st.next_date || null,
    };
  });

  return {
    term: sync.term,
    settings,
    sync: { inserted: sync.inserted, updated: sync.updated, deleted: sync.deleted },
    sections: rows,
    totals: {
      sections: rows.length,
      sessions: rows.reduce((sum, r) => sum + r.total, 0),
      unassigned: rows.filter((r) => r.total > 0 && r.staff_user_id == null).length,
      without_meetings: rows.filter((r) => !r.meetings.length).length,
    },
  };
}

function requireTeachingStaff(user) {
  if (!isTeachingStaffRole(user?.role)) httpError(403, 'Teaching staff only', 'staff_only');
}

export function localStamp(date) {
  if (!date || Number.isNaN(date.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${toIsoDate(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export async function markOverdueAbsences({ termId, staffUserId = null, now = new Date() }) {
  const params = [termId, toIsoDate(now)];
  let staffFilter = '';
  if (staffUserId != null) {
    staffFilter = 'AND cs.staff_user_id = ?';
    params.push(staffUserId);
  }
  const candidates = (await db.query(`
    SELECT cs.id, cs.staff_user_id, to_char(cs.session_date, 'YYYY-MM-DD') AS session_date, cs.end_time, cs.created_at
    FROM class_sessions cs
    WHERE cs.term_id = ? AND cs.status = 'scheduled' AND cs.session_date <= ?::date
      AND cs.staff_user_id IS NOT NULL ${staffFilter}
      AND NOT EXISTS (SELECT 1 FROM staff_session_attendance a WHERE a.session_id = cs.id)
  `, params)).rows;
  let marked = 0;
  for (const row of candidates) {
    const end = sessionEndsAt(row.session_date, row.end_time);
    if (!end || end >= now || new Date(row.created_at) > end) continue;
    const ins = await db.query(`
      INSERT INTO staff_session_attendance (session_id, staff_user_id, status, late_minutes, source, updated_at)
      VALUES (?, ?, 'absent', 0, 'auto', CURRENT_TIMESTAMP)
      ON CONFLICT (session_id) DO NOTHING
    `, [row.id, row.staff_user_id]);
    if (!ins.rowCount) continue;
    await db.prepare(
      "UPDATE class_sessions SET status = 'absent', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'scheduled'"
    ).run(row.id);
    marked += 1;
  }
  return marked;
}

export const SESSION_SELECT = `
  SELECT cs.id, cs.term_id, cs.university_id, cs.kind, cs.makeup_for_session_id,
         to_char(cs.session_date, 'YYYY-MM-DD') AS session_date, cs.start_time, cs.end_time, cs.room,
         cs.status, cs.section_id, cs.offering_id, cs.staff_user_id,
         sec.kind AS section_kind, sec.code AS section_code,
         uc.course_code, uc.course_name, uc.catalog_course_id,
         to_char(orig.session_date, 'YYYY-MM-DD') AS makeup_for_date,
         a.status AS attendance_status, a.checked_in_at, a.late_minutes, a.source AS attendance_source, a.note AS attendance_note
  FROM class_sessions cs
  LEFT JOIN sections sec ON sec.id = cs.section_id
  INNER JOIN course_offerings o ON o.id = cs.offering_id
  INNER JOIN uni_courses uc ON uc.id = o.uni_course_id
  LEFT JOIN class_sessions orig ON orig.id = cs.makeup_for_session_id
  LEFT JOIN staff_session_attendance a ON a.session_id = cs.id
`;

async function loadRequests(sessionIds, staffUserId) {
  if (!sessionIds.length) return [];
  return (await db.query(`
    SELECT id, session_id, kind, reason, to_char(proposed_date, 'YYYY-MM-DD') AS proposed_date,
           proposed_start, proposed_end, proposed_room, status, decision_note, decided_at, makeup_session_id, created_at
    FROM staff_session_requests
    WHERE session_id = ANY(?::int[]) AND staff_user_id = ?
    ORDER BY created_at DESC, id DESC
  `, [sessionIds, staffUserId])).rows;
}

export function attendanceOf(row) {
  if (!row.attendance_status) return null;
  return {
    status: row.attendance_status,
    checked_in_at: row.checked_in_at,
    late_minutes: Number(row.late_minutes || 0),
    source: row.attendance_source,
    note: row.attendance_note || null,
  };
}

export function sessionFields(row) {
  return {
    id: Number(row.id),
    kind: row.kind,
    makeup_for_session_id: row.makeup_for_session_id != null ? Number(row.makeup_for_session_id) : null,
    makeup_for_date: row.makeup_for_date || null,
    session_date: row.session_date,
    start_time: row.start_time,
    end_time: row.end_time,
    room: row.room || null,
    status: row.status,
    section_id: Number(row.section_id),
    section_kind: row.section_kind || null,
    section_code: row.section_code || null,
    course_code: row.course_code,
    course_name: row.course_name,
    catalog_course_id: row.catalog_course_id != null ? Number(row.catalog_course_id) : null,
    staff_user_id: row.staff_user_id != null ? Number(row.staff_user_id) : null,
    attendance: attendanceOf(row),
  };
}

function presentSession(row, requests, settings, now) {
  const base = sessionFields(row);
  const { attendance } = base;
  return {
    ...base,
    requests,
    check_in_opens_at: localStamp(checkInOpensAt(row, settings)),
    makeup_deadline: localStamp(makeupDeadline(row, settings)),
    actions: staffSessionActions({ session: row, attendance, requests, now, settings }),
  };
}

export async function listMySessions(user, { catalogCourseId = null } = {}) {
  requireTeachingStaff(user);
  const catalogFilter = Number.isInteger(Number(catalogCourseId)) && Number(catalogCourseId) > 0 ? Number(catalogCourseId) : null;
  const settings = await getStaffSessionSettings(user);
  const sync = await syncTermSessions(user);
  const now = new Date();
  const empty = { total: 0, upcoming: 0, held: 0, late: 0, absent: 0, cancelled: 0, pending_requests: 0 };
  if (!sync.term) return { term: null, settings, now: localStamp(now), sessions: [], counts: empty };

  await markOverdueAbsences({ termId: sync.term.id, staffUserId: user.id, now });
  const rows = (await db.query(
    `${SESSION_SELECT} WHERE cs.term_id = ? AND cs.staff_user_id = ? AND (?::int IS NULL OR uc.catalog_course_id = ?)
     ORDER BY cs.session_date, cs.start_time, cs.id`,
    [sync.term.id, user.id, catalogFilter, catalogFilter]
  )).rows;
  const requests = await loadRequests(rows.map((r) => Number(r.id)), user.id);
  const requestsBySession = new Map();
  for (const r of requests) {
    const list = requestsBySession.get(Number(r.session_id)) || [];
    list.push({ ...r, id: Number(r.id), session_id: Number(r.session_id) });
    requestsBySession.set(Number(r.session_id), list);
  }
  const sessions = rows.map((row) => presentSession(row, requestsBySession.get(Number(row.id)) || [], settings, now));
  const today = toIsoDate(now);
  return {
    term: sync.term,
    settings,
    now: localStamp(now),
    sessions,
    counts: {
      total: sessions.length,
      upcoming: sessions.filter((s) => s.status === 'scheduled' && s.session_date >= today).length,
      held: sessions.filter((s) => s.status === 'held').length,
      late: sessions.filter((s) => s.status === 'late').length,
      absent: sessions.filter((s) => s.status === 'absent').length,
      cancelled: sessions.filter((s) => s.status === 'cancelled').length,
      pending_requests: requests.filter((r) => r.status === 'pending').length,
    },
  };
}

async function loadOwnSession(user, sessionId) {
  requireTeachingStaff(user);
  const id = Number(sessionId);
  if (!Number.isInteger(id) || id <= 0) httpError(404, 'Session not found', 'session_not_found');
  const row = (await db.query(`${SESSION_SELECT} WHERE cs.id = ? AND cs.staff_user_id = ?`, [id, user.id])).rows[0];
  if (!row) httpError(404, 'Session not found', 'session_not_found');
  const settings = await getStaffSessionSettings(user);
  const requests = await loadRequests([id], user.id);
  return { row, settings, requests, attendance: attendanceOf(row) };
}

export async function checkInSession(user, sessionId) {
  const { row, settings, requests, attendance } = await loadOwnSession(user, sessionId);
  const now = new Date();
  const actions = staffSessionActions({ session: row, attendance, requests, now, settings });
  if (!actions.can_check_in) {
    if (attendance) httpError(409, 'Attendance already recorded for this session', 'already_checked_in');
    if (row.status !== 'scheduled') httpError(409, 'This session is not open for check-in', 'session_not_open');
    const opens = checkInOpensAt(row, settings);
    if (opens && now < opens) httpError(409, 'Check-in has not opened yet', 'check_in_too_early');
    httpError(409, 'Check-in closed when the session ended', 'check_in_closed');
  }
  const arrival = classifyStaffArrival({ sessionDate: row.session_date, startTime: row.start_time, checkedInAt: now, settings });
  const ins = await db.query(`
    INSERT INTO staff_session_attendance (session_id, staff_user_id, status, checked_in_at, late_minutes, source, recorded_by, updated_at)
    VALUES (?, ?, ?, ?, ?, 'check_in', ?, CURRENT_TIMESTAMP)
    ON CONFLICT (session_id) DO NOTHING
  `, [row.id, user.id, arrival.status, now.toISOString(), arrival.late_minutes, user.id]);
  if (!ins.rowCount) httpError(409, 'Attendance already recorded for this session', 'already_checked_in');
  await db.prepare('UPDATE class_sessions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(sessionStatusForArrival(arrival.status), row.id);
  return { session_id: Number(row.id), status: arrival.status, late_minutes: arrival.late_minutes, checked_in_at: now.toISOString() };
}

async function insertRequest(values) {
  try {
    const res = await db.query(`
      INSERT INTO staff_session_requests (session_id, staff_user_id, kind, reason, proposed_date, proposed_start, proposed_end, proposed_room)
      VALUES (?, ?, ?, ?, ?::date, ?, ?, ?)
      RETURNING id
    `, values);
    return Number(res.rows[0].id);
  } catch (err) {
    if (err?.code === '23505') httpError(409, 'A pending request already exists for this session', 'request_already_pending');
    throw err;
  }
}

export async function notifyAbsence(user, sessionId, body = {}) {
  const { row, settings, requests, attendance } = await loadOwnSession(user, sessionId);
  const reason = String(body?.reason || '').trim();
  if (reason.length < 3) httpError(400, 'Write the reason for the absence', 'reason_required');
  const actions = staffSessionActions({ session: row, attendance, requests, now: new Date(), settings });
  if (!actions.can_notify_absence) {
    if (requests.some((r) => r.kind === 'absence_notice' && ['pending', 'approved'].includes(r.status))) {
      httpError(409, 'You already reported this absence', 'absence_already_notified');
    }
    httpError(409, 'Absence can only be reported before the session starts', 'absence_notice_closed');
  }
  const id = await insertRequest([row.id, user.id, 'absence_notice', reason.slice(0, 1000), null, null, null, null]);
  return { id, session_id: Number(row.id), kind: 'absence_notice', status: 'pending' };
}

export async function findClash({ universityId, staffUserId, room, date, start, end, excludeSessionId, excludeRequestId = 0 }) {
  const staffSession = (await db.query(`
    SELECT uc.course_code, cs.start_time, cs.end_time
    FROM class_sessions cs
    INNER JOIN course_offerings o ON o.id = cs.offering_id
    INNER JOIN uni_courses uc ON uc.id = o.uni_course_id
    WHERE cs.staff_user_id = ? AND cs.session_date = ?::date AND cs.status <> 'cancelled'
      AND cs.start_time < ? AND cs.end_time > ? AND cs.id <> ?
    LIMIT 1
  `, [staffUserId, date, end, start, excludeSessionId])).rows[0];
  if (staffSession) {
    return {
      code: 'makeup_staff_clash',
      detail: `The staff member teaches ${staffSession.course_code} ${staffSession.start_time}-${staffSession.end_time} at that time`,
      course_code: staffSession.course_code,
      start: staffSession.start_time,
      end: staffSession.end_time,
    };
  }
  const staffRequest = (await db.query(`
    SELECT proposed_start, proposed_end FROM staff_session_requests
    WHERE staff_user_id = ? AND kind = 'makeup' AND status = 'pending' AND proposed_date = ?::date
      AND proposed_start < ? AND proposed_end > ? AND id <> ?
    LIMIT 1
  `, [staffUserId, date, end, start, excludeRequestId])).rows[0];
  if (staffRequest) {
    return {
      code: 'makeup_staff_clash',
      detail: `The staff member already proposed a makeup ${staffRequest.proposed_start}-${staffRequest.proposed_end} at that time`,
      course_code: null,
      start: staffRequest.proposed_start,
      end: staffRequest.proposed_end,
    };
  }
  if (room) {
    const roomSession = (await db.query(`
      SELECT uc.course_code, cs.start_time, cs.end_time
      FROM class_sessions cs
      INNER JOIN course_offerings o ON o.id = cs.offering_id
      INNER JOIN uni_courses uc ON uc.id = o.uni_course_id
      WHERE cs.university_id = ? AND cs.room = ? AND cs.session_date = ?::date AND cs.status <> 'cancelled'
        AND cs.start_time < ? AND cs.end_time > ? AND cs.id <> ?
      LIMIT 1
    `, [universityId, room, date, end, start, excludeSessionId])).rows[0];
    if (roomSession) {
      return {
        code: 'makeup_room_clash',
        detail: `${room} is booked for ${roomSession.course_code} ${roomSession.start_time}-${roomSession.end_time}`,
        course_code: roomSession.course_code,
        start: roomSession.start_time,
        end: roomSession.end_time,
        room,
      };
    }
  }
  return null;
}

export async function requestMakeup(user, sessionId, body = {}) {
  const { row, settings, requests, attendance } = await loadOwnSession(user, sessionId);
  const now = new Date();
  const actions = staffSessionActions({ session: row, attendance, requests, now, settings });
  if (!actions.can_request_makeup) {
    if (requests.some((r) => r.kind === 'makeup' && ['pending', 'approved'].includes(r.status))) {
      httpError(409, 'A makeup was already requested for this session', 'makeup_already_requested');
    }
    const deadline = makeupDeadline(row, settings);
    const missed = ['absent', 'cancelled'].includes(row.status);
    if (missed && deadline && now > deadline) httpError(409, 'The makeup request deadline has passed', 'makeup_deadline_passed');
    httpError(409, 'A makeup can be requested only for a missed session or a reported absence', 'makeup_not_allowed');
  }
  const term = await db.prepare('SELECT starts_on, ends_on FROM academic_terms WHERE id = ?').get(row.term_id);
  const parsed = parseMakeupProposal(body, { term, fallbackRoom: row.room, now });
  if (parsed.error) httpError(400, parsed.error, parsed.code);
  const p = parsed.proposal;
  const clash = await findClash({
    universityId: row.university_id,
    staffUserId: user.id,
    room: p.room,
    date: p.date,
    start: p.start,
    end: p.end,
    excludeSessionId: row.id,
  });
  if (clash) httpError(409, clash.detail, clash.code);
  const id = await insertRequest([row.id, user.id, 'makeup', p.reason ? p.reason.slice(0, 1000) : null, p.date, p.start, p.end, p.room]);
  return { id, session_id: Number(row.id), kind: 'makeup', status: 'pending', proposal: p };
}

export async function cancelSessionRequest(user, requestId) {
  requireTeachingStaff(user);
  const id = Number(requestId);
  if (!Number.isInteger(id) || id <= 0) httpError(404, 'Request not found', 'request_not_found');
  const res = await db.query(`
    UPDATE staff_session_requests SET status = 'cancelled'
    WHERE id = ? AND staff_user_id = ? AND status = 'pending'
    RETURNING id
  `, [id, user.id]);
  if (!res.rowCount) {
    const exists = await db.prepare('SELECT status FROM staff_session_requests WHERE id = ? AND staff_user_id = ?').get(id, user.id);
    if (!exists) httpError(404, 'Request not found', 'request_not_found');
    httpError(409, 'Only pending requests can be cancelled', 'request_not_pending');
  }
  return { id, status: 'cancelled' };
}
