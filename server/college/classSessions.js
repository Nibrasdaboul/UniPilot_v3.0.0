export const SESSION_KINDS = ['regular', 'makeup'];
export const SESSION_STATUSES = ['scheduled', 'held', 'late', 'absent', 'cancelled'];

export const STAFF_SESSION_SETTING_RULES = {
  staff_grace_minutes: { default: 10, min: 0, max: 60 },
  staff_late_absent_minutes: { default: 30, min: 5, max: 180 },
  staff_check_in_before_minutes: { default: 15, min: 0, max: 60 },
  makeup_request_days: { default: 7, min: 1, max: 60 },
  student_report_after_minutes: { default: 15, min: 5, max: 120 },
};

const SETTING_KEYS = Object.keys(STAFF_SESSION_SETTING_RULES);

function inRange(value, rule) {
  const n = Number(value);
  return Number.isInteger(n) && n >= rule.min && n <= rule.max ? n : null;
}

export function normalizeStaffSessionSettings(row = {}) {
  const out = {};
  for (const key of SETTING_KEYS) {
    const rule = STAFF_SESSION_SETTING_RULES[key];
    out[key] = inRange(row?.[key], rule) ?? rule.default;
  }
  return out;
}

export function parseStaffSessionSettings(body = {}, current = {}) {
  const next = normalizeStaffSessionSettings(current);
  for (const key of SETTING_KEYS) {
    if (body?.[key] === undefined || body[key] === '') continue;
    const rule = STAFF_SESSION_SETTING_RULES[key];
    const value = inRange(body[key], rule);
    if (value == null) return { error: `${key} must be an integer from ${rule.min} to ${rule.max}` };
    next[key] = value;
  }
  if (next.staff_late_absent_minutes <= next.staff_grace_minutes) {
    return { error: 'staff_late_absent_minutes must be greater than staff_grace_minutes' };
  }
  return { error: null, settings: next };
}

export function toIsoDate(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function utcFromIso(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function isoFromUtc(date) {
  return date.toISOString().slice(0, 10);
}

export function meetingDates({ startsOn, endsOn, dayOfWeek }) {
  const start = toIsoDate(startsOn);
  const end = toIsoDate(endsOn);
  const dow = Number(dayOfWeek);
  if (!start || !end || !Number.isInteger(dow) || dow < 0 || dow > 6 || start > end) return [];
  const cursor = utcFromIso(start);
  cursor.setUTCDate(cursor.getUTCDate() + ((dow - cursor.getUTCDay() + 7) % 7));
  const last = utcFromIso(end);
  const out = [];
  while (cursor <= last) {
    out.push(isoFromUtc(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }
  return out;
}

const ROLE_FOR_KIND = { theory: 'instructor', practical: 'teaching_assistant' };

export function sectionStaffId(section, offeringStaff = []) {
  if (section?.staff_user_id != null) return Number(section.staff_user_id);
  const role = ROLE_FOR_KIND[section?.kind];
  const candidates = offeringStaff.filter(
    (s) => Number(s.offering_id) === Number(section?.offering_id) && s.staff_role === role
  );
  return candidates.length === 1 ? Number(candidates[0].user_id) : null;
}

export function meetingRoom(meeting) {
  return [meeting?.room_number, meeting?.building].map((v) => String(v || '').trim()).filter(Boolean).join(' — ') || null;
}

export function buildRegularSessions({ term, sections = [], meetings = [], offeringStaff = [] }) {
  const sectionById = new Map(sections.map((s) => [Number(s.id), s]));
  const rows = [];
  for (const meeting of meetings) {
    const section = sectionById.get(Number(meeting.section_id));
    if (!section || !meeting.start_time || !meeting.end_time) continue;
    const staffId = sectionStaffId(section, offeringStaff);
    for (const date of meetingDates({ startsOn: term?.starts_on, endsOn: term?.ends_on, dayOfWeek: meeting.day_of_week })) {
      rows.push({
        offering_id: Number(section.offering_id),
        section_id: Number(section.id),
        meeting_id: Number(meeting.id),
        session_date: date,
        start_time: meeting.start_time,
        end_time: meeting.end_time,
        room: meetingRoom(meeting),
        staff_user_id: staffId,
      });
    }
  }
  return rows;
}

const sessionKey = (row) => `${Number(row.meeting_id)}|${toIsoDate(row.session_date)}`;

export function planSessionSync({ desired = [], existing = [], today }) {
  const todayIso = toIsoDate(today);
  const existingByKey = new Map(
    existing.filter((row) => row.kind === 'regular' && row.meeting_id != null).map((row) => [sessionKey(row), row])
  );
  const desiredKeys = new Set(desired.map(sessionKey));
  const editable = (row) => row.status === 'scheduled' && toIsoDate(row.session_date) >= todayIso;

  const toInsert = desired.filter((row) => !existingByKey.has(sessionKey(row)));
  const toUpdate = [];
  for (const row of desired) {
    const current = existingByKey.get(sessionKey(row));
    if (!current || !editable(current)) continue;
    const changed = current.start_time !== row.start_time
      || current.end_time !== row.end_time
      || (current.room || null) !== (row.room || null)
      || (current.staff_user_id != null ? Number(current.staff_user_id) : null) !== row.staff_user_id;
    if (changed) toUpdate.push({ id: current.id, ...row });
  }
  const toDelete = existing
    .filter((row) => row.kind === 'regular' && editable(row) && !row.has_links)
    .filter((row) => row.meeting_id == null || !desiredKeys.has(sessionKey(row)))
    .map((row) => row.id);
  return { toInsert, toUpdate, toDelete };
}

export function sessionStartsAt(sessionDate, startTime) {
  const iso = toIsoDate(sessionDate);
  const [h, m] = String(startTime || '').split(':').map(Number);
  if (!iso || !Number.isFinite(h)) return null;
  const [y, mo, d] = iso.split('-').map(Number);
  return new Date(y, mo - 1, d, h, Number.isFinite(m) ? m : 0);
}

const ARRIVAL_TO_SESSION_STATUS = { present: 'held', late: 'late', absent: 'absent' };

export function sessionStatusForArrival(arrivalStatus) {
  return ARRIVAL_TO_SESSION_STATUS[arrivalStatus] || 'absent';
}

const addMinutes = (date, minutes) => new Date(date.getTime() + minutes * 60000);

export function sessionEndsAt(sessionDate, endTime) {
  return sessionStartsAt(sessionDate, endTime);
}

export function checkInOpensAt(session, settings) {
  const start = sessionStartsAt(session?.session_date, session?.start_time);
  if (!start) return null;
  return addMinutes(start, -normalizeStaffSessionSettings(settings).staff_check_in_before_minutes);
}

export function makeupDeadline(session, settings) {
  const end = sessionEndsAt(session?.session_date, session?.end_time);
  if (!end) return null;
  const deadline = new Date(end);
  deadline.setDate(deadline.getDate() + normalizeStaffSessionSettings(settings).makeup_request_days);
  return deadline;
}

const ACTIVE_REQUEST = new Set(['pending', 'approved']);

export function staffSessionActions({ session, attendance = null, requests = [], now = new Date(), settings }) {
  const at = new Date(now);
  const start = sessionStartsAt(session?.session_date, session?.start_time);
  const end = sessionEndsAt(session?.session_date, session?.end_time);
  const opens = checkInOpensAt(session, settings);
  const deadline = makeupDeadline(session, settings);
  const active = (kind) => requests.some((r) => r.kind === kind && ACTIVE_REQUEST.has(r.status));
  const scheduled = session?.status === 'scheduled';
  const missed = session?.status === 'absent' || session?.status === 'cancelled';

  return {
    can_check_in: Boolean(scheduled && !attendance && opens && end && at >= opens && at <= end),
    can_notify_absence: Boolean(scheduled && !attendance && start && at < start && !active('absence_notice')),
    can_request_makeup: Boolean(
      (missed || (scheduled && active('absence_notice')))
      && !active('makeup')
      && deadline && at <= deadline
    ),
  };
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function normalizeTime(value) {
  const m = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hhmm = `${m[1].padStart(2, '0')}:${m[2]}`;
  return TIME_RE.test(hhmm) ? hhmm : null;
}

export function timesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

export function parseMakeupProposal(body = {}, { term, fallbackRoom = null, now = new Date() } = {}) {
  const date = toIsoDate(body?.proposed_date);
  const start = normalizeTime(body?.proposed_start);
  const end = normalizeTime(body?.proposed_end);
  if (!date || !start || !end) return { error: 'Proposed date, start and end are required', code: 'makeup_fields_required' };
  if (start >= end) return { error: 'Makeup must end after it starts', code: 'makeup_time_order' };
  const startsOn = toIsoDate(term?.starts_on);
  const endsOn = toIsoDate(term?.ends_on);
  if ((startsOn && date < startsOn) || (endsOn && date > endsOn)) {
    return { error: 'Makeup date must be inside the current term', code: 'makeup_outside_term' };
  }
  const startsAt = sessionStartsAt(date, start);
  if (!startsAt || startsAt <= new Date(now)) return { error: 'Makeup must be in the future', code: 'makeup_in_past' };
  const room = String(body?.proposed_room || '').trim() || fallbackRoom || null;
  const reason = String(body?.reason || '').trim() || null;
  return { error: null, proposal: { date, start, end, room, reason } };
}

export const STAFF_ATTENDANCE_STATUSES = ['present', 'late', 'absent', 'excused'];

const ATTENDANCE_TO_SESSION_STATUS = { present: 'held', late: 'late', absent: 'absent', excused: 'cancelled' };

export function sessionStatusForAttendance(status) {
  return ATTENDANCE_TO_SESSION_STATUS[status] || 'absent';
}

export function parseRequestDecision(body = {}) {
  const decision = String(body?.decision || '').trim();
  if (decision !== 'approve' && decision !== 'reject') {
    return { error: 'Decision must be approve or reject', code: 'decision_invalid' };
  }
  const note = String(body?.note || '').trim();
  if (decision === 'reject' && note.length < 3) {
    return { error: 'Write the reason for rejecting', code: 'decision_note_required' };
  }
  return { error: null, decision, note: note ? note.slice(0, 1000) : null };
}

export function parseStaffAttendanceEdit(body = {}, { session, now = new Date() } = {}) {
  const status = String(body?.status || '').trim();
  if (!STAFF_ATTENDANCE_STATUSES.includes(status)) {
    return { error: 'Status must be present, late, absent or excused', code: 'attendance_status_invalid' };
  }
  const note = String(body?.note || '').trim();
  if (note.length < 3) return { error: 'Write a note explaining the change', code: 'attendance_note_required' };
  let lateMinutes = 0;
  if (status === 'late') {
    lateMinutes = Number(body?.late_minutes);
    if (!Number.isInteger(lateMinutes) || lateMinutes < 1 || lateMinutes > 300) {
      return { error: 'Late minutes must be an integer from 1 to 300', code: 'late_minutes_invalid' };
    }
  }
  if (status !== 'excused') {
    const start = sessionStartsAt(session?.session_date, session?.start_time);
    if (!start || start > new Date(now)) {
      return { error: 'Attendance can be set only after the session starts', code: 'attendance_before_start' };
    }
  }
  return { error: null, edit: { status, late_minutes: lateMinutes, note: note.slice(0, 1000) } };
}

export const LIVE_SESSION_STATES = ['upcoming', 'waiting', 'started', 'late', 'no_show', 'absent', 'cancelled'];

export function liveSessionState({ session, attendance = null, now = new Date(), settings }) {
  if (session?.status === 'cancelled' || attendance?.status === 'excused') return 'cancelled';
  if (attendance?.status === 'present') return 'started';
  if (attendance?.status === 'late') return 'late';
  if (attendance?.status === 'absent' || session?.status === 'absent') return 'absent';
  const start = sessionStartsAt(session?.session_date, session?.start_time);
  const at = new Date(now);
  if (!start || at < start) return 'upcoming';
  const rules = normalizeStaffSessionSettings(settings);
  return at < addMinutes(start, rules.staff_late_absent_minutes) ? 'waiting' : 'no_show';
}

function emptyCommitment(staffUserId) {
  return {
    staff_user_id: staffUserId,
    total: 0,
    due: 0,
    held: 0,
    late: 0,
    late_minutes: 0,
    absent_notified: 0,
    absent_unnotified: 0,
    makeup_requested: 0,
    makeup_approved: 0,
    makeup_done: 0,
    makeup_pending: 0,
    makeup_not_requested: 0,
    makeup_missed: 0,
  };
}

export function summarizeStaffCommitment({ sessions = [], requests = [], now = new Date(), settings } = {}) {
  const at = new Date(now);
  const bySession = new Map();
  for (const r of requests) {
    const list = bySession.get(Number(r.session_id)) || [];
    list.push(r);
    bySession.set(Number(r.session_id), list);
  }
  const sessionById = new Map(sessions.map((s) => [Number(s.id), s]));
  const out = new Map();
  const bucket = (id) => {
    if (!out.has(id)) out.set(id, emptyCommitment(id));
    return out.get(id);
  };

  for (const s of sessions) {
    if (s.staff_user_id == null) continue;
    const row = bucket(Number(s.staff_user_id));
    const reqs = bySession.get(Number(s.id)) || [];
    row.total += 1;
    const start = sessionStartsAt(s.session_date, s.start_time);
    if (start && start <= at) row.due += 1;
    if (s.status === 'held') row.held += 1;
    if (s.status === 'late') {
      row.late += 1;
      row.late_minutes += Number(s.late_minutes || 0);
    }
    const notified = reqs.some((r) => r.kind === 'absence_notice' && r.status === 'approved');
    if (s.status === 'cancelled' && notified) row.absent_notified += 1;
    if (s.status === 'absent') row.absent_unnotified += 1;

    const makeups = reqs.filter((r) => r.kind === 'makeup' && r.status !== 'cancelled');
    row.makeup_requested += makeups.length;
    const approved = makeups.find((r) => r.status === 'approved');
    if (approved) row.makeup_approved += 1;

    const missed = s.status === 'absent' || (s.status === 'cancelled' && notified);
    if (!missed || s.kind === 'makeup') continue;
    if (approved) {
      const mk = sessionById.get(Number(approved.makeup_session_id));
      if (mk && (mk.status === 'held' || mk.status === 'late')) row.makeup_done += 1;
      else if (mk && mk.status === 'absent') row.makeup_missed += 1;
      else row.makeup_pending += 1;
    } else if (makeups.some((r) => r.status === 'pending')) {
      row.makeup_pending += 1;
    } else {
      const deadline = makeupDeadline(s, settings);
      if (deadline && at > deadline) row.makeup_missed += 1;
      else row.makeup_not_requested += 1;
    }
  }
  return [...out.values()];
}

export function classifyStaffArrival({ sessionDate, startTime, checkedInAt, settings }) {
  const rules = normalizeStaffSessionSettings(settings);
  const start = sessionStartsAt(sessionDate, startTime);
  const arrived = checkedInAt ? new Date(checkedInAt) : null;
  if (!start || !arrived || Number.isNaN(arrived.getTime())) return { status: 'absent', late_minutes: 0 };
  const late = Math.max(0, Math.floor((arrived.getTime() - start.getTime()) / 60000));
  if (late <= rules.staff_grace_minutes) return { status: 'present', late_minutes: late };
  if (late > rules.staff_late_absent_minutes) return { status: 'absent', late_minutes: late };
  return { status: 'late', late_minutes: late };
}
