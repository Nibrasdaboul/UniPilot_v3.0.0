import { isExamsOfficeRole } from '../college/roles.js';
import {
  listAcademicViceDeanCourseInfo,
  getAcademicViceDeanCourseInfo,
} from './academicViceDeanCourseInfoService.js';
import { upsertCourseWorkMark } from './courseWorkGradesService.js';
import { adoptCourseWorkSheet } from './courseWorkSheetsService.js';
import { markCourseAttendance } from './courseAttendanceService.js';
import { adoptAttendanceSheet, setDeprivation, decideCancelRequest } from './attendanceSheetsService.js';

function httpError(status, detail) {
  const err = new Error(detail);
  err.status = status;
  throw err;
}

function requireExams(user) {
  if (!isExamsOfficeRole(user?.role)) httpError(403, 'Exams Office only');
  if (user?.college_id == null) httpError(400, 'Exams Office is not attached to a college');
  return user;
}

export async function listExamsCourseMarks(user) {
  requireExams(user);
  const page = await listAcademicViceDeanCourseInfo(user);
  return {
    ...page,
    items: (page.items || []).map((item) => {
      const { pending_file_count, unread_chat_count, ...rest } = item;
      return rest;
    }),
  };
}

export async function getExamsCourseMarks(user, catalogCourseId) {
  requireExams(user);
  const card = await getAcademicViceDeanCourseInfo(user, catalogCourseId);
  const { lectures, chat, ...rest } = card;
  return rest;
}

export async function markExamsCourseGrade(user, catalogCourseId, body) {
  requireExams(user);
  return upsertCourseWorkMark(user, catalogCourseId, body);
}

export async function adoptExamsCourseWorkSheet(user, catalogCourseId) {
  requireExams(user);
  return adoptCourseWorkSheet(user, catalogCourseId);
}

export async function markExamsCourseAttendance(user, catalogCourseId, body) {
  requireExams(user);
  return markCourseAttendance(user, catalogCourseId, body);
}

export async function adoptExamsAttendanceSheet(user, catalogCourseId) {
  requireExams(user);
  return adoptAttendanceSheet(user, catalogCourseId);
}

export async function setExamsDeprivation(user, catalogCourseId, studentUserId, body) {
  requireExams(user);
  return setDeprivation(user, catalogCourseId, studentUserId, body);
}

export async function decideExamsCancelRequest(user, catalogCourseId, requestId, body) {
  requireExams(user);
  return decideCancelRequest(user, catalogCourseId, requestId, body);
}
