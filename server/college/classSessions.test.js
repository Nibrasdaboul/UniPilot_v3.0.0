import { describe, it, expect } from 'vitest';
import {
  normalizeStaffSessionSettings,
  parseStaffSessionSettings,
  meetingDates,
  sectionStaffId,
  buildRegularSessions,
  planSessionSync,
  classifyStaffArrival,
  staffSessionActions,
  parseMakeupProposal,
  sessionStatusForArrival,
  timesOverlap,
  parseRequestDecision,
  parseStaffAttendanceEdit,
  sessionStatusForAttendance,
  liveSessionState,
  summarizeStaffCommitment,
} from './classSessions.js';

describe('vice dean decisions', () => {
  it('requires a note only when rejecting', () => {
    expect(parseRequestDecision({ decision: 'approve' })).toEqual({ error: null, decision: 'approve', note: null });
    expect(parseRequestDecision({ decision: 'reject', note: ' ' }).code).toBe('decision_note_required');
    expect(parseRequestDecision({ decision: 'reject', note: 'Clashes with exams' }).note).toBe('Clashes with exams');
    expect(parseRequestDecision({ decision: 'maybe' }).code).toBe('decision_invalid');
  });

  it('validates staff attendance edits', () => {
    const session = { session_date: '2027-02-05', start_time: '08:00' };
    const now = new Date('2027-02-05T09:00:00');
    expect(parseStaffAttendanceEdit({ status: 'present', note: 'forgot to check in' }, { session, now }).edit)
      .toEqual({ status: 'present', late_minutes: 0, note: 'forgot to check in' });
    expect(parseStaffAttendanceEdit({ status: 'late', late_minutes: 20, note: 'traffic' }, { session, now }).edit.late_minutes).toBe(20);
    expect(parseStaffAttendanceEdit({ status: 'late', late_minutes: 0, note: 'traffic' }, { session, now }).code).toBe('late_minutes_invalid');
    expect(parseStaffAttendanceEdit({ status: 'present' }, { session, now }).code).toBe('attendance_note_required');
    expect(parseStaffAttendanceEdit({ status: 'gone', note: 'xxx' }, { session, now }).code).toBe('attendance_status_invalid');
    const early = new Date('2027-02-05T07:00:00');
    expect(parseStaffAttendanceEdit({ status: 'present', note: 'xxx' }, { session, now: early }).code).toBe('attendance_before_start');
    expect(parseStaffAttendanceEdit({ status: 'excused', note: 'conference' }, { session, now: early }).error).toBeNull();
    expect(sessionStatusForAttendance('excused')).toBe('cancelled');
    expect(sessionStatusForAttendance('present')).toBe('held');
  });
});

describe('live session state', () => {
  const session = { session_date: '2027-02-05', start_time: '08:00', end_time: '10:00', status: 'scheduled' };
  const settings = { staff_late_absent_minutes: 30, staff_grace_minutes: 10 };
  const at = (t) => new Date(`2027-02-05T${t}:00`);

  it('moves from upcoming to waiting to no-show without a check-in', () => {
    expect(liveSessionState({ session, now: at('07:59'), settings })).toBe('upcoming');
    expect(liveSessionState({ session, now: at('08:10'), settings })).toBe('waiting');
    expect(liveSessionState({ session, now: at('08:30'), settings })).toBe('no_show');
  });

  it('reflects recorded attendance and cancellations', () => {
    expect(liveSessionState({ session, attendance: { status: 'present' }, now: at('08:30'), settings })).toBe('started');
    expect(liveSessionState({ session, attendance: { status: 'late' }, now: at('08:30'), settings })).toBe('late');
    expect(liveSessionState({ session: { ...session, status: 'absent' }, now: at('11:00'), settings })).toBe('absent');
    expect(liveSessionState({ session: { ...session, status: 'cancelled' }, now: at('07:00'), settings })).toBe('cancelled');
  });
});

describe('staff commitment report', () => {
  const settings = { makeup_request_days: 7 };
  const now = new Date('2027-03-01T12:00:00');
  const s = (id, over) => ({ id, staff_user_id: 18, session_date: '2027-02-05', start_time: '08:00', end_time: '10:00', status: 'held', kind: 'regular', ...over });

  it('counts lateness, notified and unnotified absences, and the makeup lifecycle', () => {
    const [row] = summarizeStaffCommitment({
      now,
      settings,
      sessions: [
        s(1),
        s(2, { status: 'late', late_minutes: 20 }),
        s(3, { status: 'absent' }),
        s(4, { status: 'cancelled' }),
        s(5, { status: 'absent', session_date: '2027-02-26' }),
        s(6, { status: 'absent', session_date: '2027-02-27' }),
        s(7, { kind: 'makeup', session_date: '2027-02-10' }),
        s(8, { status: 'scheduled', session_date: '2027-03-05' }),
      ],
      requests: [
        { session_id: 3, kind: 'makeup', status: 'approved', makeup_session_id: 7 },
        { session_id: 4, kind: 'absence_notice', status: 'approved' },
        { session_id: 5, kind: 'makeup', status: 'pending' },
        { session_id: 6, kind: 'makeup', status: 'cancelled' },
      ],
    });
    expect(row).toMatchObject({
      total: 8,
      due: 7,
      held: 2,
      late: 1,
      late_minutes: 20,
      absent_notified: 1,
      absent_unnotified: 3,
      makeup_requested: 2,
      makeup_approved: 1,
      makeup_done: 1,
      makeup_pending: 1,
      makeup_not_requested: 1,
      makeup_missed: 1,
    });
  });
});

describe('staff session actions', () => {
  const session = { session_date: '2027-02-05', start_time: '08:00', end_time: '10:00', status: 'scheduled' };
  const at = (iso) => new Date(iso);

  it('opens check-in before the start and closes it at the end', () => {
    expect(staffSessionActions({ session, now: at('2027-02-05T07:40:00') }).can_check_in).toBe(false);
    expect(staffSessionActions({ session, now: at('2027-02-05T07:45:00') }).can_check_in).toBe(true);
    expect(staffSessionActions({ session, now: at('2027-02-05T10:00:00') }).can_check_in).toBe(true);
    expect(staffSessionActions({ session, now: at('2027-02-05T10:01:00') }).can_check_in).toBe(false);
    expect(staffSessionActions({ session, attendance: { status: 'present' }, now: at('2027-02-05T08:05:00') }).can_check_in).toBe(false);
    expect(staffSessionActions({ session: { ...session, status: 'cancelled' }, now: at('2027-02-05T08:00:00') }).can_check_in).toBe(false);
  });

  it('allows one absence notice before the session starts', () => {
    expect(staffSessionActions({ session, now: at('2027-02-04T12:00:00') }).can_notify_absence).toBe(true);
    expect(staffSessionActions({ session, now: at('2027-02-05T08:00:00') }).can_notify_absence).toBe(false);
    const requests = [{ kind: 'absence_notice', status: 'pending' }];
    expect(staffSessionActions({ session, requests, now: at('2027-02-04T12:00:00') }).can_notify_absence).toBe(false);
    const rejected = [{ kind: 'absence_notice', status: 'rejected' }];
    expect(staffSessionActions({ session, requests: rejected, now: at('2027-02-04T12:00:00') }).can_notify_absence).toBe(true);
  });

  it('allows a makeup request after an absence until the deadline', () => {
    const absent = { ...session, status: 'absent' };
    expect(staffSessionActions({ session: absent, now: at('2027-02-12T10:00:00') }).can_request_makeup).toBe(true);
    expect(staffSessionActions({ session: absent, now: at('2027-02-12T10:01:00') }).can_request_makeup).toBe(false);
    expect(staffSessionActions({ session: absent, requests: [{ kind: 'makeup', status: 'pending' }], now: at('2027-02-06T09:00:00') }).can_request_makeup).toBe(false);
    expect(staffSessionActions({ session: absent, requests: [{ kind: 'makeup', status: 'rejected' }], now: at('2027-02-06T09:00:00') }).can_request_makeup).toBe(true);
    expect(staffSessionActions({ session, now: at('2027-02-04T09:00:00') }).can_request_makeup).toBe(false);
    const noticed = [{ kind: 'absence_notice', status: 'pending' }];
    expect(staffSessionActions({ session, requests: noticed, now: at('2027-02-04T09:00:00') }).can_request_makeup).toBe(true);
    expect(staffSessionActions({ session: { ...session, status: 'held' }, now: at('2027-02-06T09:00:00') }).can_request_makeup).toBe(false);
  });

  it('maps arrival to a session status', () => {
    expect(sessionStatusForArrival('present')).toBe('held');
    expect(sessionStatusForArrival('late')).toBe('late');
    expect(sessionStatusForArrival('absent')).toBe('absent');
  });
});

describe('makeup proposal', () => {
  const term = { starts_on: '2027-01-22', ends_on: '2027-06-28' };
  const now = new Date('2027-02-06T09:00:00');

  it('normalizes a valid proposal and falls back to the original room', () => {
    const r = parseMakeupProposal({ proposed_date: '2027-02-10', proposed_start: '9:00', proposed_end: '11:00' }, { term, fallbackRoom: 'قاعة 1', now });
    expect(r.error).toBeNull();
    expect(r.proposal).toEqual({ date: '2027-02-10', start: '09:00', end: '11:00', room: 'قاعة 1', reason: null });
  });

  it('rejects missing fields, bad order, dates outside the term and the past', () => {
    expect(parseMakeupProposal({}, { term, now }).code).toBe('makeup_fields_required');
    expect(parseMakeupProposal({ proposed_date: '2027-02-10', proposed_start: '11:00', proposed_end: '10:00' }, { term, now }).code).toBe('makeup_time_order');
    expect(parseMakeupProposal({ proposed_date: '2027-07-01', proposed_start: '09:00', proposed_end: '10:00' }, { term, now }).code).toBe('makeup_outside_term');
    expect(parseMakeupProposal({ proposed_date: '2027-02-06', proposed_start: '08:00', proposed_end: '10:00' }, { term, now }).code).toBe('makeup_in_past');
    expect(parseMakeupProposal({ proposed_date: '2027-02-10', proposed_start: '25:00', proposed_end: '26:00' }, { term, now }).code).toBe('makeup_fields_required');
  });

  it('detects overlapping time ranges', () => {
    expect(timesOverlap('09:00', '11:00', '10:00', '12:00')).toBe(true);
    expect(timesOverlap('09:00', '10:00', '10:00', '12:00')).toBe(false);
  });
});

describe('staff session settings', () => {
  it('falls back to defaults for missing or invalid values', () => {
    expect(normalizeStaffSessionSettings({ staff_grace_minutes: 999 })).toEqual({
      staff_grace_minutes: 10,
      staff_late_absent_minutes: 30,
      staff_check_in_before_minutes: 15,
      makeup_request_days: 7,
      student_report_after_minutes: 15,
    });
  });

  it('validates ranges and keeps late-absent above grace', () => {
    expect(parseStaffSessionSettings({ staff_grace_minutes: 5 }).settings.staff_grace_minutes).toBe(5);
    expect(parseStaffSessionSettings({ staff_grace_minutes: 61 }).error).toMatch(/0 to 60/);
    expect(parseStaffSessionSettings({ staff_grace_minutes: 30, staff_late_absent_minutes: 20 }).error)
      .toMatch(/greater than/);
  });
});

describe('meeting dates', () => {
  it('lists every weekday occurrence inside the term', () => {
    const dates = meetingDates({ startsOn: '2027-01-22', endsOn: '2027-02-06', dayOfWeek: 6 });
    expect(dates).toEqual(['2027-01-23', '2027-01-30', '2027-02-06']);
  });

  it('includes the first day when it matches and ignores bad input', () => {
    expect(meetingDates({ startsOn: '2027-01-22', endsOn: '2027-01-29', dayOfWeek: 5 }))
      .toEqual(['2027-01-22', '2027-01-29']);
    expect(meetingDates({ startsOn: null, endsOn: '2027-01-29', dayOfWeek: 5 })).toEqual([]);
    expect(meetingDates({ startsOn: '2027-01-22', endsOn: '2027-01-29', dayOfWeek: 9 })).toEqual([]);
  });
});

describe('regular session generation', () => {
  const staff = [
    { offering_id: 7, user_id: 18, staff_role: 'instructor' },
    { offering_id: 7, user_id: 112, staff_role: 'instructor' },
    { offering_id: 7, user_id: 19, staff_role: 'teaching_assistant' },
  ];

  it('uses the section staff, else a single matching course staff member', () => {
    expect(sectionStaffId({ offering_id: 7, kind: 'theory', staff_user_id: 128 }, staff)).toBe(128);
    expect(sectionStaffId({ offering_id: 7, kind: 'practical', staff_user_id: null }, staff)).toBe(19);
    expect(sectionStaffId({ offering_id: 7, kind: 'theory', staff_user_id: null }, staff)).toBeNull();
  });

  it('builds one row per meeting date with room and staff', () => {
    const rows = buildRegularSessions({
      term: { starts_on: '2027-01-22', ends_on: '2027-02-06' },
      sections: [{ id: 18, offering_id: 7, kind: 'practical', staff_user_id: null }],
      meetings: [{ id: 15, section_id: 18, day_of_week: 0, start_time: '12:00', end_time: '14:00', room_number: 'مخبر 1', building: 'A' }],
      offeringStaff: staff,
    });
    expect(rows.map((r) => r.session_date)).toEqual(['2027-01-24', '2027-01-31']);
    expect(rows[0]).toMatchObject({ meeting_id: 15, staff_user_id: 19, room: 'مخبر 1 — A', start_time: '12:00' });
  });
});

describe('session sync plan', () => {
  const desired = [
    { meeting_id: 1, session_date: '2027-01-23', start_time: '10:00', end_time: '12:00', room: 'R2', staff_user_id: 5 },
    { meeting_id: 1, session_date: '2027-01-30', start_time: '10:00', end_time: '12:00', room: 'R2', staff_user_id: 5 },
  ];

  it('inserts missing rows, updates future scheduled ones and never touches the past', () => {
    const existing = [
      { id: 10, kind: 'regular', meeting_id: 1, session_date: '2027-01-23', start_time: '09:00', end_time: '11:00', room: 'R1', staff_user_id: 5, status: 'scheduled' },
    ];
    const plan = planSessionSync({ desired, existing, today: '2027-01-01' });
    expect(plan.toInsert.map((r) => r.session_date)).toEqual(['2027-01-30']);
    expect(plan.toUpdate).toHaveLength(1);
    expect(plan.toUpdate[0]).toMatchObject({ id: 10, start_time: '10:00', room: 'R2' });

    const past = planSessionSync({ desired, existing, today: '2027-01-25' });
    expect(past.toUpdate).toHaveLength(0);
  });

  it('removes orphaned future sessions only when nothing depends on them', () => {
    const existing = [
      { id: 20, kind: 'regular', meeting_id: 2, session_date: '2027-01-24', status: 'scheduled', has_links: false },
      { id: 21, kind: 'regular', meeting_id: 2, session_date: '2027-01-31', status: 'scheduled', has_links: true },
      { id: 22, kind: 'regular', meeting_id: null, session_date: '2027-02-07', status: 'cancelled', has_links: false },
      { id: 23, kind: 'makeup', meeting_id: null, session_date: '2027-02-08', status: 'scheduled', has_links: false },
    ];
    expect(planSessionSync({ desired, existing, today: '2027-01-01' }).toDelete).toEqual([20]);
  });
});

describe('staff arrival classification', () => {
  const base = { sessionDate: '2027-01-23', startTime: '10:00', settings: { staff_grace_minutes: 10, staff_late_absent_minutes: 30 } };

  it('is present within grace, late after it, absent past the late-absent threshold', () => {
    expect(classifyStaffArrival({ ...base, checkedInAt: new Date(2027, 0, 23, 9, 55) }))
      .toEqual({ status: 'present', late_minutes: 0 });
    expect(classifyStaffArrival({ ...base, checkedInAt: new Date(2027, 0, 23, 10, 10) }).status).toBe('present');
    expect(classifyStaffArrival({ ...base, checkedInAt: new Date(2027, 0, 23, 10, 12) }))
      .toEqual({ status: 'late', late_minutes: 12 });
    expect(classifyStaffArrival({ ...base, checkedInAt: new Date(2027, 0, 23, 10, 31) }).status).toBe('absent');
    expect(classifyStaffArrival({ ...base, checkedInAt: null }).status).toBe('absent');
  });
});
