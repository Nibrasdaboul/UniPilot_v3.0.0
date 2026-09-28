import { db } from '../db.js';
import { isViceDeanAcademic } from '../college/roles.js';
import {
  toIsoDate,
  parseMakeupProposal,
  parseRequestDecision,
  parseStaffAttendanceEdit,
  sessionStatusForAttendance,
  liveSessionState,
  summarizeStaffCommitment,
  sessionStartsAt,
  LIVE_SESSION_STATES,
} from '../college/classSessions.js';
import {
  getStaffSessionSettings,
  syncTermSessions,
  markOverdueAbsences,
  SESSION_SELECT,
  sessionFields,
  localStamp,
  findClash,
} from './classSessionsService.js';
import { notifyEnrolledStudents } from './studentClassSessionsService.js';
import { ensureAttendanceColumnForClassSession } from './courseAttendanceService.js';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function httpError(status, detail, code = null) {
  const err = new Error(detail);
  err.status = status;
  if (code) err.code = code;
  throw err;
}

function requireVda(user) {
  if (!isViceDeanAcademic(user?.role)) httpError(403, 'Academic Vice Dean only', 'vda_only');
  if (user?.college_id == null) httpError(400, 'User is not attached to a college');
  return Number(user.college_id);
}

function positiveInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

async function termContext(user) {
  requireVda(user);
  const settings = await getStaffSessionSettings(user);
  const sync = await syncTermSessions(user);
  const offeringIds = [...new Set((sync.schedule?.sections || []).map((s) => Number(s.offering_id)))];
  return { settings, term: sync.term, offeringIds };
}

async function loadUsers(ids) {
  const list = [...new Set(ids.filter((id) => id != null).map(Number))];
  if (!list.length) return new Map();
  const rows = (await db.query('SELECT id, full_name, person_code, role FROM users WHERE id = ANY(?::int[])', [list])).rows;
  return new Map(rows.map((u) => [Number(u.id), u]));
}

function personOf(users, id) {
  if (id == null) return null;
  const u = users.get(Number(id));
  return u ? { id: Number(u.id), name: u.full_name, person_code: u.person_code, role: u.role } : { id: Number(id), name: null, person_code: null, role: null };
}

async function studentReportCounts(sessionIds) {
  if (!sessionIds.length) return new Map();
  const rows = (await db.query(
    'SELECT session_id, COUNT(*)::int AS n FROM staff_absence_reports WHERE session_id = ANY(?::int[]) GROUP BY session_id',
    [sessionIds]
  )).rows;
  return new Map(rows.map((r) => [Number(r.session_id), Number(r.n)]));
}

async function requestsForSessions(sessionIds) {
  if (!sessionIds.length) return [];
  return (await db.query(`
    SELECT id, session_id, staff_user_id, kind, reason, to_char(proposed_date, 'YYYY-MM-DD') AS proposed_date,
           proposed_start, proposed_end, proposed_room, status, decision_note, decided_by, decided_at,
           makeup_session_id, created_at
    FROM staff_session_requests
    WHERE session_id = ANY(?::int[])
    ORDER BY created_at DESC, id DESC
  `, [sessionIds])).rows.map((r) => ({
    ...r,
    id: Number(r.id),
    session_id: Number(r.session_id),
    staff_user_id: Number(r.staff_user_id),
    makeup_session_id: r.makeup_session_id != null ? Number(r.makeup_session_id) : null,
  }));
}

async function pendingRequestCount(offeringIds) {
  if (!offeringIds.length) return 0;
  const row = (await db.query(`
    SELECT COUNT(*)::int AS n FROM staff_session_requests r
    INNER JOIN class_sessions cs ON cs.id = r.session_id
    WHERE r.status = 'pending' AND cs.offering_id = ANY(?::int[])
  `, [offeringIds])).rows[0];
  return Number(row?.n || 0);
}

export async function listVdaSessions(user, query = {}) {
  const { settings, term, offeringIds } = await termContext(user);
  const now = new Date();
  const catalogCourseId = positiveInt(query.catalog_course_id);
  const staffUserId = positiveInt(query.staff_user_id);
  let date = ISO_DATE_RE.test(String(query.date || '')) ? String(query.date) : null;
  if (!date && !catalogCourseId && !staffUserId) date = toIsoDate(now);
  const counts = Object.fromEntries(['total', ...LIVE_SESSION_STATES].map((k) => [k, 0]));
  const base = { term, settings, now: localStamp(now), date, sessions: [], counts, pending_requests: 0 };
  if (!term || !offeringIds.length) return base;

  await markOverdueAbsences({ termId: term.id, now });
  const where = ['cs.term_id = ?', 'cs.offering_id = ANY(?::int[])'];
  const params = [term.id, offeringIds];
  if (date) { where.push('cs.session_date = ?::date'); params.push(date); }
  if (catalogCourseId) { where.push('uc.catalog_course_id = ?'); params.push(catalogCourseId); }
  if (staffUserId) { where.push('cs.staff_user_id = ?'); params.push(staffUserId); }
  const rows = (await db.query(
    `${SESSION_SELECT} WHERE ${where.join(' AND ')} ORDER BY cs.session_date, cs.start_time, uc.course_code, cs.id`,
    params
  )).rows;
  const ids = rows.map((r) => Number(r.id));
  const [requests, reports] = await Promise.all([requestsForSessions(ids), studentReportCounts(ids)]);
  const users = await loadUsers([...rows.map((r) => r.staff_user_id), ...requests.map((r) => r.decided_by)]);
  const sessions = rows.map((row) => {
    const s = sessionFields(row);
    const live = liveSessionState({ session: row, attendance: s.attendance, now, settings });
    counts.total += 1;
    counts[live] += 1;
    return {
      ...s,
      live_state: live,
      staff: personOf(users, row.staff_user_id),
      student_reports: reports.get(s.id) || 0,
      requests: requests
        .filter((r) => r.session_id === s.id)
        .map((r) => ({ ...r, decided_by: personOf(users, r.decided_by) })),
    };
  });
  return { ...base, sessions, counts, pending_requests: await pendingRequestCount(offeringIds) };
}

const REQUEST_STATUS_FILTERS = {
  pending: ['pending'],
  decided: ['approved', 'rejected'],
  all: ['pending', 'approved', 'rejected', 'cancelled'],
};

export async function listVdaRequests(user, query = {}) {
  const { settings, term, offeringIds } = await termContext(user);
  const statusKey = REQUEST_STATUS_FILTERS[query.status] ? query.status : 'pending';
  const now = new Date();
  const base = { term, settings, now: localStamp(now), status: statusKey, requests: [], pending: 0 };
  if (!term || !offeringIds.length) return base;

  const rows = (await db.query(`
    SELECT r.id, r.session_id, r.staff_user_id, r.kind, r.reason, to_char(r.proposed_date, 'YYYY-MM-DD') AS proposed_date,
           r.proposed_start, r.proposed_end, r.proposed_room, r.status, r.decision_note, r.decided_by, r.decided_at,
           r.makeup_session_id, r.created_at
    FROM staff_session_requests r
    INNER JOIN class_sessions cs ON cs.id = r.session_id
    WHERE cs.term_id = ? AND cs.offering_id = ANY(?::int[]) AND r.status = ANY(?::text[])
    ORDER BY (r.status = 'pending') DESC, r.created_at ${statusKey === 'pending' ? 'ASC' : 'DESC'}, r.id
    LIMIT 300
  `, [term.id, offeringIds, REQUEST_STATUS_FILTERS[statusKey]])).rows;
  const sessionIds = [...new Set(rows.map((r) => Number(r.session_id)))];
  const sessionRows = sessionIds.length
    ? (await db.query(`${SESSION_SELECT} WHERE cs.id = ANY(?::int[])`, [sessionIds])).rows
    : [];
  const sessionById = new Map(sessionRows.map((row) => [Number(row.id), row]));
  const staffIds = [...new Set(rows.map((r) => Number(r.staff_user_id)))];
  const missedByStaff = new Map(staffIds.length ? (await db.query(`
    SELECT staff_user_id, COUNT(*)::int AS n FROM class_sessions
    WHERE term_id = ? AND staff_user_id = ANY(?::int[]) AND status IN ('absent', 'cancelled')
    GROUP BY staff_user_id
  `, [term.id, staffIds])).rows.map((r) => [Number(r.staff_user_id), Number(r.n)]) : []);
  const users = await loadUsers([...staffIds, ...rows.map((r) => r.decided_by)]);
  const reports = await studentReportCounts(sessionIds);

  const requests = [];
  for (const r of rows) {
    const row = sessionById.get(Number(r.session_id));
    if (!row) continue;
    const session = sessionFields(row);
    let clash = null;
    let expired = false;
    if (r.status === 'pending' && r.kind === 'makeup') {
      const startsAt = sessionStartsAt(r.proposed_date, r.proposed_start);
      expired = !startsAt || startsAt <= now;
      clash = await findClash({
        universityId: row.university_id,
        staffUserId: Number(r.staff_user_id),
        room: r.proposed_room,
        date: r.proposed_date,
        start: r.proposed_start,
        end: r.proposed_end,
        excludeSessionId: Number(row.id),
        excludeRequestId: Number(r.id),
      });
    }
    requests.push({
      id: Number(r.id),
      kind: r.kind,
      status: r.status,
      reason: r.reason || null,
      proposed_date: r.proposed_date,
      proposed_start: r.proposed_start,
      proposed_end: r.proposed_end,
      proposed_room: r.proposed_room,
      decision_note: r.decision_note || null,
      decided_at: r.decided_at,
      decided_by: personOf(users, r.decided_by),
      makeup_session_id: r.makeup_session_id != null ? Number(r.makeup_session_id) : null,
      created_at: r.created_at,
      staff: personOf(users, r.staff_user_id),
      staff_missed_this_term: missedByStaff.get(Number(r.staff_user_id)) || 0,
      session: { ...session, student_reports: reports.get(session.id) || 0 },
      clash,
      expired,
    });
  }
  return { ...base, requests, pending: await pendingRequestCount(offeringIds) };
}

async function loadCollegeSession(cid, sessionId) {
  const id = positiveInt(sessionId);
  if (!id) httpError(404, 'Session not found', 'session_not_found');
  const row = (await db.query(`
    ${SESSION_SELECT}
    INNER JOIN departments d ON d.id = uc.department_id
    WHERE cs.id = ? AND d.college_id = ?
  `, [id, cid])).rows[0];
  if (!row) httpError(404, 'Session not found', 'session_not_found');
  return row;
}

async function notifyStaff(userId, title, body, catalogCourseId) {
  if (userId == null) return;
  try {
    await db.prepare(
      'INSERT INTO notifications (user_id, title, body, type, link, source) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(
      Number(userId),
      title,
      String(body || '').slice(0, 600),
      'info',
      catalogCourseId ? `/my-courses/${catalogCourseId}?tab=sessions` : '/my-courses',
      'staff_session'
    );
  } catch (_) {}
}

function sessionLabel(row) {
  return `${row.course_code} · ${toIsoDate(row.session_date)} ${row.start_time}-${row.end_time}`;
}

async function claimRequest(requestId, userId, status, note, proposal = null) {
  const sets = ['status = ?', 'decided_by = ?', 'decided_at = CURRENT_TIMESTAMP', 'decision_note = ?'];
  const params = [status, userId, note];
  if (proposal) {
    sets.push('proposed_date = ?::date', 'proposed_start = ?', 'proposed_end = ?', 'proposed_room = ?');
    params.push(proposal.date, proposal.start, proposal.end, proposal.room);
  }
  const res = await db.query(
    `UPDATE staff_session_requests SET ${sets.join(', ')} WHERE id = ? AND status = 'pending' RETURNING id`,
    [...params, requestId]
  );
  if (!res.rowCount) httpError(409, 'This request was already decided', 'request_not_pending');
}

export async function decideVdaRequest(user, requestId, body = {}) {
  const cid = requireVda(user);
  const id = positiveInt(requestId);
  if (!id) httpError(404, 'Request not found', 'request_not_found');
  const parsed = parseRequestDecision(body);
  if (parsed.error) httpError(400, parsed.error, parsed.code);
  const request = await db.prepare(`
    SELECT id, session_id, staff_user_id, kind, reason, to_char(proposed_date, 'YYYY-MM-DD') AS proposed_date,
           proposed_start, proposed_end, proposed_room, status
    FROM staff_session_requests WHERE id = ?
  `).get(id);
  if (!request) httpError(404, 'Request not found', 'request_not_found');
  let row;
  try {
    row = await loadCollegeSession(cid, request.session_id);
  } catch (err) {
    if (err.code === 'session_not_found') httpError(404, 'Request not found', 'request_not_found');
    throw err;
  }
  if (request.status !== 'pending') httpError(409, 'This request was already decided', 'request_not_pending');
  const kindAr = request.kind === 'makeup' ? 'طلب التعويض' : 'إبلاغ الغياب';

  if (parsed.decision === 'reject') {
    await claimRequest(id, user.id, 'rejected', parsed.note);
    await notifyStaff(request.staff_user_id, `رُفض ${kindAr}`, `${sessionLabel(row)} — ${parsed.note}`, row.catalog_course_id);
    return { id, status: 'rejected', decision_note: parsed.note };
  }

  if (request.kind === 'absence_notice') {
    if (['present', 'late'].includes(row.attendance_status)) {
      httpError(409, 'The staff member already started this session', 'session_already_held');
    }
    await claimRequest(id, user.id, 'approved', parsed.note);
    await db.query(`
      INSERT INTO staff_session_attendance (session_id, staff_user_id, status, late_minutes, source, note, recorded_by, updated_at)
      VALUES (?, ?, 'excused', 0, 'vda', ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT (session_id) DO UPDATE SET status = 'excused', late_minutes = 0, source = 'vda',
        note = EXCLUDED.note, recorded_by = EXCLUDED.recorded_by, updated_at = CURRENT_TIMESTAMP
    `, [row.id, row.staff_user_id, request.reason || null, user.id]);
    await db.prepare("UPDATE class_sessions SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(row.id);
    await notifyStaff(
      request.staff_user_id,
      'اعتُمد إبلاغ الغياب',
      `${sessionLabel(row)} — أُلغيت الجلسة. يمكنك طلب جلسة تعويضية.${parsed.note ? ` ${parsed.note}` : ''}`,
      row.catalog_course_id
    );
    // Notify enrolled students
    await notifyEnrolledStudents(
      Number(row.id),
      `أُلغيت جلسة ${row.course_code}`,
      `جلسة ${row.session_date} ${row.start_time}–${row.end_time} أُلغيت بسبب غياب المدرّس. ستُضاف جلسة تعويضية لاحقاً إذا طُلبت.`,
      row.catalog_course_id
    );
    return { id, status: 'approved', session_id: Number(row.id), session_status: 'cancelled' };
  }

  const pick = (key) => (body?.[key] !== undefined && String(body[key]).trim() !== '' ? body[key] : request[key]);
  const term = await db.prepare('SELECT starts_on, ends_on FROM academic_terms WHERE id = ?').get(row.term_id);
  const proposal = parseMakeupProposal({
    proposed_date: pick('proposed_date'),
    proposed_start: pick('proposed_start'),
    proposed_end: pick('proposed_end'),
    proposed_room: pick('proposed_room'),
    reason: request.reason,
  }, { term, fallbackRoom: row.room, now: new Date() });
  if (proposal.error) httpError(400, proposal.error, proposal.code);
  const p = proposal.proposal;
  const clash = await findClash({
    universityId: row.university_id,
    staffUserId: Number(request.staff_user_id),
    room: p.room,
    date: p.date,
    start: p.start,
    end: p.end,
    excludeSessionId: Number(row.id),
    excludeRequestId: id,
  });
  if (clash) httpError(409, clash.detail, clash.code);

  await claimRequest(id, user.id, 'approved', parsed.note, p);
  let makeupId;
  try {
    const ins = await db.query(`
      INSERT INTO class_sessions (university_id, term_id, offering_id, section_id, meeting_id, kind, makeup_for_session_id,
        session_date, start_time, end_time, room, staff_user_id, status)
      VALUES (?, ?, ?, ?, NULL, 'makeup', ?, ?::date, ?, ?, ?, ?, 'scheduled')
      RETURNING id
    `, [row.university_id, row.term_id, row.offering_id, row.section_id, row.id, p.date, p.start, p.end, p.room, request.staff_user_id]);
    makeupId = Number(ins.rows[0].id);
  } catch (err) {
    await db.query(
      "UPDATE staff_session_requests SET status = 'pending', decided_by = NULL, decided_at = NULL, decision_note = NULL WHERE id = ?",
      [id]
    );
    throw err;
  }
  await db.prepare('UPDATE staff_session_requests SET makeup_session_id = ? WHERE id = ?').run(makeupId, id);
  await ensureAttendanceColumnForClassSession({
    id: makeupId,
    kind: 'makeup',
    status: 'scheduled',
    university_id: row.university_id,
    offering_id: row.offering_id,
    section_id: row.section_id,
    session_date: p.date,
  });
  const changed = p.date !== request.proposed_date || p.start !== request.proposed_start
    || p.end !== request.proposed_end || (p.room || null) !== (request.proposed_room || null);
  // Notify enrolled students about the new makeup session
  await notifyEnrolledStudents(
    Number(row.id),
    `جلسة تعويضية لمادة ${row.course_code}`,
    `جلسة ${row.session_date} ${row.start_time}–${row.end_time} ستُعوَّض في ${p.date} ${p.start}–${p.end}${p.room ? ` · ${p.room}` : ''}. ستُحسب هذه الجلسة في نسبة حضورك.`,
    row.catalog_course_id
  );
  await notifyStaff(
    request.staff_user_id,
    changed ? 'اعتُمد التعويض بموعد معدّل' : 'اعتُمد طلب التعويض',
    `${row.course_code} — الجلسة التعويضية: ${p.date} ${p.start}-${p.end}${p.room ? ` · ${p.room}` : ''}${parsed.note ? ` — ${parsed.note}` : ''}`,
    row.catalog_course_id
  );
  return { id, status: 'approved', makeup_session_id: makeupId, proposal: p, changed };
}

const ATTENDANCE_AR = { present: 'حاضر', late: 'متأخر', absent: 'غائب', excused: 'غياب بعذر (الجلسة ملغاة)' };

export async function updateVdaStaffAttendance(user, sessionId, body = {}) {
  const cid = requireVda(user);
  const row = await loadCollegeSession(cid, sessionId);
  if (row.staff_user_id == null) httpError(409, 'This session has no assigned staff member', 'session_without_staff');
  const parsed = parseStaffAttendanceEdit(body, { session: row, now: new Date() });
  if (parsed.error) httpError(400, parsed.error, parsed.code);
  const e = parsed.edit;
  await db.query(`
    INSERT INTO staff_session_attendance (session_id, staff_user_id, status, late_minutes, source, note, recorded_by, updated_at)
    VALUES (?, ?, ?, ?, 'vda', ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT (session_id) DO UPDATE SET status = EXCLUDED.status, late_minutes = EXCLUDED.late_minutes,
      staff_user_id = EXCLUDED.staff_user_id, source = 'vda', note = EXCLUDED.note,
      recorded_by = EXCLUDED.recorded_by, updated_at = CURRENT_TIMESTAMP
  `, [row.id, row.staff_user_id, e.status, e.late_minutes, e.note, user.id]);
  const sessionStatus = sessionStatusForAttendance(e.status);
  await db.prepare('UPDATE class_sessions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(sessionStatus, row.id);
  await notifyStaff(
    row.staff_user_id,
    'عدّل نائب العميد حالة حضورك',
    `${sessionLabel(row)} — ${ATTENDANCE_AR[e.status]}${e.status === 'late' ? ` ${e.late_minutes} د` : ''} — ${e.note}`,
    row.catalog_course_id
  );
  return { session_id: Number(row.id), status: e.status, late_minutes: e.late_minutes, session_status: sessionStatus };
}

export async function getVdaStaffReport(user) {
  const { settings, term, offeringIds } = await termContext(user);
  const now = new Date();
  const base = { term, settings, now: localStamp(now), staff: [] };
  if (!term || !offeringIds.length) return base;
  await markOverdueAbsences({ termId: term.id, now });
  const sessions = (await db.query(`
    SELECT cs.id, cs.staff_user_id, cs.kind, cs.status, to_char(cs.session_date, 'YYYY-MM-DD') AS session_date,
           cs.start_time, cs.end_time, a.late_minutes, uc.course_code
    FROM class_sessions cs
    INNER JOIN course_offerings o ON o.id = cs.offering_id
    INNER JOIN uni_courses uc ON uc.id = o.uni_course_id
    LEFT JOIN staff_session_attendance a ON a.session_id = cs.id
    WHERE cs.term_id = ? AND cs.offering_id = ANY(?::int[]) AND cs.staff_user_id IS NOT NULL
  `, [term.id, offeringIds])).rows;
  const requests = await requestsForSessions(sessions.map((s) => Number(s.id)));
  const [reports, users] = await Promise.all([
    studentReportCounts(sessions.map((s) => Number(s.id))),
    loadUsers(sessions.map((s) => s.staff_user_id)),
  ]);
  const summary = summarizeStaffCommitment({ sessions, requests, now, settings });
  const staff = summary.map((row) => {
    const own = sessions.filter((s) => Number(s.staff_user_id) === row.staff_user_id);
    return {
      ...row,
      staff: personOf(users, row.staff_user_id),
      courses: [...new Set(own.map((s) => s.course_code))].sort(),
      student_reports: own.reduce((sum, s) => sum + (reports.get(Number(s.id)) || 0), 0),
    };
  }).sort((a, b) => (b.absent_unnotified - a.absent_unnotified) || (b.late_minutes - a.late_minutes)
    || String(a.staff?.name || '').localeCompare(String(b.staff?.name || '')));
  return { ...base, staff };
}
