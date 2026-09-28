import { describe, it, expect } from 'vitest';
import { parseAttendanceStatus, attendanceLabel, ATTENDANCE_STATUSES, parseEvaluated, sessionKind, canWriteAttendanceKind, attendanceKindForRole, classSessionCountsForStudentAbsence, makeupAttendanceTitle, countOfficialAbsences } from './attendance.js';

describe('attendance helpers', () => {
  it('accepts the four official statuses', () => {
    expect(ATTENDANCE_STATUSES).toEqual(['present', 'absent', 'late', 'excused']);
    expect(parseAttendanceStatus('Present').status).toBe('present');
    expect(parseAttendanceStatus('late').status).toBe('late');
    expect(parseAttendanceStatus('excused').status).toBe('excused');
  });

  it('rejects unknown statuses', () => {
    expect(parseAttendanceStatus('missing').error).toMatch(/present, absent, late, or excused/);
    expect(parseAttendanceStatus('').error).toMatch(/status/);
  });

  it('labels statuses in Arabic and English', () => {
    expect(attendanceLabel('present', true)).toBe('حاضر');
    expect(attendanceLabel('absent', true)).toBe('غائب');
    expect(attendanceLabel('late', false)).toBe('Late');
    expect(attendanceLabel('excused', false)).toBe('Excused');
  });

  it('maps section kinds to theory or practical', () => {
    expect(sessionKind('theory')).toBe('theory');
    expect(sessionKind('ATT')).toBe('theory');
    expect(sessionKind('practical')).toBe('practical');
    expect(sessionKind('lab')).toBe('practical');
  });

  it('lets instructors write theory attendance and TAs write practical', () => {
    expect(attendanceKindForRole('instructor')).toBe('theory');
    expect(attendanceKindForRole('engineer')).toBe('practical');
    expect(canWriteAttendanceKind('instructor', 'theory').ok).toBe(true);
    expect(canWriteAttendanceKind('instructor', 'practical').ok).toBe(false);
    expect(canWriteAttendanceKind('teaching_assistant', 'practical').ok).toBe(true);
    expect(canWriteAttendanceKind('teaching_assistant', 'theory').ok).toBe(false);
    expect(canWriteAttendanceKind('vice_dean_academic', 'theory').ok).toBe(false);
    expect(canWriteAttendanceKind('exams_office', 'theory').ok).toBe(true);
    expect(canWriteAttendanceKind('exams_office', 'practical').ok).toBe(true);
  });

  it('does not count cancelled or staff-absent class sessions toward deprivation', () => {
    expect(classSessionCountsForStudentAbsence('held')).toBe(true);
    expect(classSessionCountsForStudentAbsence('scheduled')).toBe(true);
    expect(classSessionCountsForStudentAbsence('late')).toBe(true);
    expect(classSessionCountsForStudentAbsence('cancelled')).toBe(false);
    expect(classSessionCountsForStudentAbsence('absent')).toBe(false);
  });

  it('labels makeup attendance columns', () => {
    expect(makeupAttendanceTitle('2027-01-31')).toBe('تعويض 2027-01-31');
    expect(makeupAttendanceTitle('2027-01-31', false)).toBe('Makeup 2027-01-31');
  });

  it('counts student absences only on countable sessions, including makeup', () => {
    const sessions = [
      { id: 1, class_status: 'held' },
      { id: 2, class_status: 'cancelled' },
      { id: 3, class_status: 'absent' },
      { id: 4, class_kind: 'makeup', class_status: 'scheduled' },
    ];
    const marks = [
      { session_id: 1, status: 'absent' },
      { session_id: 2, status: 'absent' },
      { session_id: 3, status: 'absent' },
      { session_id: 4, status: 'absent' },
      { session_id: 4, user_id: 9, status: 'late' },
    ];
    expect(countOfficialAbsences(marks, sessions)).toBe(2);
  });

  it('parses TA session evaluation flags', () => {
    expect(parseEvaluated(true).evaluated).toBe(true);
    expect(parseEvaluated('not_evaluated').evaluated).toBe(false);
    expect(parseEvaluated('maybe').error).toMatch(/true or false/);
  });
});
