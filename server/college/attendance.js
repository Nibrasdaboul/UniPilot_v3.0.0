import { normalizeRole, ROLES, isExamsOfficeRole } from './roles.js';

export const ATTENDANCE_STATUSES = ['present', 'absent', 'late', 'excused'];

export const ATTENDANCE_STATUS_LABELS = {
  ar: {
    present: 'حاضر',
    absent: 'غائب',
    late: 'متأخر',
    excused: 'معتذر',
  },
  en: {
    present: 'Present',
    absent: 'Absent',
    late: 'Late',
    excused: 'Excused',
  },
};

export function parseAttendanceStatus(value) {
  const status = String(value || '').trim().toLowerCase();
  if (!ATTENDANCE_STATUSES.includes(status)) {
    return { error: 'status must be present, absent, late, or excused' };
  }
  return { error: null, status };
}

export function attendanceLabel(status, ar) {
  const key = String(status || '').toLowerCase();
  return (ar ? ATTENDANCE_STATUS_LABELS.ar : ATTENDANCE_STATUS_LABELS.en)[key] || status || '';
}

export function sessionKind(value) {
  const kind = String(value || '').trim().toLowerCase();
  if (kind === 'practical' || kind === 'lab' || kind === 'tutorial') return 'practical';
  return 'theory';
}

export function attendanceKindForRole(role) {
  const n = normalizeRole(role);
  if (n === ROLES.INSTRUCTOR) return 'theory';
  if (n === ROLES.TEACHING_ASSISTANT) return 'practical';
  return null;
}

export function canWriteAttendanceKind(role, kind) {
  if (isExamsOfficeRole(role)) return { ok: true, kind: sessionKind(kind) };
  const allowed = attendanceKindForRole(role);
  if (!allowed) return { ok: false, error: 'You cannot edit attendance' };
  if (sessionKind(kind) !== allowed) {
    return {
      ok: false,
      error: allowed === 'theory'
        ? 'Instructors can only edit theory attendance'
        : 'Teaching assistants can only edit practical attendance',
    };
  }
  return { ok: true, kind: allowed };
}

export function classSessionCountsForStudentAbsence(classStatus) {
  const status = String(classStatus || '').trim().toLowerCase();
  return status !== 'cancelled' && status !== 'absent';
}

export function makeupAttendanceTitle(date, ar = true) {
  const day = String(date || '').slice(0, 10);
  return ar ? `تعويض ${day}` : `Makeup ${day}`;
}

export function sessionCountsForStudentAbsence(session) {
  if (session && session.counts_for_absence === false) return false;
  return classSessionCountsForStudentAbsence(session?.class_status);
}

export function countOfficialAbsences(marks, sessions) {
  const countable = new Set(
    (sessions || []).filter(sessionCountsForStudentAbsence).map((s) => Number(s.id))
  );
  return (marks || []).filter(
    (m) => countable.has(Number(m.session_id)) && String(m.status || '').trim() === 'absent'
  ).length;
}

export function parseEvaluated(value) {
  if (value === true || value === 1 || value === '1' || String(value).trim().toLowerCase() === 'true' || String(value).trim().toLowerCase() === 'evaluated') {
    return { error: null, evaluated: true };
  }
  if (value === false || value === 0 || value === '0' || String(value).trim().toLowerCase() === 'false' || String(value).trim().toLowerCase() === 'not_evaluated') {
    return { error: null, evaluated: false };
  }
  return { error: 'evaluated must be true or false' };
}
