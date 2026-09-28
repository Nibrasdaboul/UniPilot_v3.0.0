import { db } from '../db.js';
import { computeAbsenceWarning } from '../college/absenceThreshold.js';
import { countOfficialAbsences } from '../college/attendance.js';
import { sessionKind } from '../college/attendance.js';
import { getDeanAcademic } from './deanAcademicService.js';
import { listOfferingsForTerm } from './registrationService.js';
import { getAttendanceGridForOfferings } from './courseAttendanceService.js';
import { getAbsenceThreshold } from './absenceThresholdService.js';
import { getOrCreateAttendanceSheet, getStudentDeprivation } from './attendanceSheetsService.js';
import { normalizeAttendanceSheetStatus } from '../college/attendanceSheets.js';

function httpError(status, detail) {
  const err = new Error(detail);
  err.status = status;
  throw err;
}

function splitAttendanceByKind(attendance) {
  const students = attendance?.students || [];
  const all = attendance?.sessions || [];
  const marks = attendance?.marks || [];
  const split = (kind) => {
    const sessions = all.filter((row) => sessionKind(row.kind) === kind);
    const ids = new Set(sessions.map((row) => Number(row.id)));
    return {
      students,
      sessions,
      marks: marks.filter((row) => ids.has(Number(row.session_id))),
    };
  };
  return { theory: split('theory'), practical: split('practical') };
}

function studentSlice(grid, userId) {
  const uid = Number(userId);
  const students = (grid.students || []).filter((s) => Number(s.user_id) === uid);
  const marks = (grid.marks || []).filter((m) => Number(m.user_id) === uid);
  return { students, sessions: grid.sessions || [], marks };
}

export async function getStudentCourseAttendance(user, studentCourseId) {
  const sc = await db.prepare(`
    SELECT id, user_id, catalog_course_id, course_name, course_code
    FROM student_courses
    WHERE id = ? AND user_id = ?
  `).get(Number(studentCourseId), user.id);
  if (!sc) httpError(404, 'Course not found');
  const catalogId = Number(sc.catalog_course_id);
  const threshold = await getAbsenceThreshold(user);
  if (!catalogId) {
    return {
      ...threshold,
      ...computeAbsenceWarning(0, threshold.absence_limit),
      official: false,
      deprived: false,
      deprivation: { deprived: false, can_request: false, request: null },
      theory: { students: [], sessions: [], marks: [] },
      practical: { students: [], sessions: [], marks: [] },
    };
  }

  const cid = user?.college_id != null ? Number(user.college_id) : null;
  if (cid == null) httpError(400, 'User is not attached to a college');
  const academic = await getDeanAcademic(user);
  const all = academic.term?.id ? await listOfferingsForTerm(academic.term.id, cid) : [];
  const offeringIds = (all || []).filter((o) => Number(o.catalog_course_id) === catalogId).map((o) => Number(o.id));
  const grid = await getAttendanceGridForOfferings(offeringIds);
  const mine = studentSlice(grid, user.id);
  const split = splitAttendanceByKind(mine);
  const absentCount = countOfficialAbsences(mine.marks, mine.sessions);
  const liveWarning = computeAbsenceWarning(absentCount, threshold.absence_limit);
  const sheet = await getOrCreateAttendanceSheet(user, catalogId);
  const official = normalizeAttendanceSheetStatus(sheet.status) === 'published';
  const warning = official ? liveWarning : { ...liveWarning, level: 0, message_ar: null, message_en: null };
  const deprivation = await getStudentDeprivation(user, catalogId);
  return {
    ...threshold,
    ...warning,
    live_absent_count: absentCount,
    official,
    deprived: deprivation.deprived,
    deprivation,
    course_name: sc.course_name,
    course_code: sc.course_code,
    theory: split.theory,
    practical: split.practical,
  };
}
