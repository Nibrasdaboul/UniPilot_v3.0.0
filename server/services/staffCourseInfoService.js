import { isTeachingStaffRole } from '../college/roles.js';
import { listAcademicViceDeanCourseInfo, getAcademicViceDeanCourseInfo } from './academicViceDeanCourseInfoService.js';
import { listMyTeachings } from './teachingStaffService.js';
import { addCourseAttendanceSession, markCourseAttendance, markCourseSessionEval } from './courseAttendanceService.js';
import { upsertCourseWorkMark } from './courseWorkGradesService.js';
import { setTheoryMidtermAutomated, submitCourseWorkSheetToExams, confirmCourseWorkSheet } from './courseWorkSheetsService.js';
import { submitAttendanceSheet, confirmAttendanceSheet } from './attendanceSheetsService.js';
import { uploadCourseLectureFile } from './courseLectureFilesService.js';
import { listCourseStaffChat, postCourseStaffChat } from './courseStaffChatService.js';

function httpError(status, detail) {
  const err = new Error(detail);
  err.status = status;
  throw err;
}

function requireStaff(user) {
  if (!isTeachingStaffRole(user?.role)) httpError(403, 'Teaching staff only');
  if (user?.college_id == null) httpError(400, 'Staff is not attached to a college');
  return user;
}

function assignedCatalogIds(teachings) {
  const ids = new Set();
  for (const off of teachings?.offerings || []) {
    const id = Number(off.catalog_course_id);
    if (id) ids.add(id);
  }
  return ids;
}

export async function listStaffMyCourses(user) {
  requireStaff(user);
  const teachings = await listMyTeachings(user);
  const page = await listAcademicViceDeanCourseInfo(user);
  const assigned = assignedCatalogIds(teachings);
  const items = (page.items || []).filter((item) => assigned.has(Number(item.catalog_course_id)));
  return {
    term: teachings.term || page.term,
    items,
    counts: {
      courses: items.length,
      offered: items.filter((i) => i.offered).length,
      with_syllabus: items.filter((i) => i.has_theory_syllabus || i.has_practical_syllabus).length,
      staffed: items.filter((i) => i.theory_staff_count + i.practical_staff_count > 0).length,
    },
  };
}

async function requireAssignedCourse(user, catalogCourseId) {
  requireStaff(user);
  const teachings = await listMyTeachings(user);
  const catalogId = Number(catalogCourseId);
  if (!assignedCatalogIds(teachings).has(catalogId)) {
    httpError(404, 'Course not assigned to you');
  }
  return catalogId;
}

export async function getStaffMyCourse(user, catalogCourseId) {
  const catalogId = await requireAssignedCourse(user, catalogCourseId);
  return getAcademicViceDeanCourseInfo(user, catalogId);
}

export async function addStaffCourseSession(user, catalogCourseId) {
  const catalogId = await requireAssignedCourse(user, catalogCourseId);
  return addCourseAttendanceSession(user, catalogId);
}

export async function markStaffCourseAttendance(user, catalogCourseId, body) {
  const catalogId = await requireAssignedCourse(user, catalogCourseId);
  return markCourseAttendance(user, catalogId, body);
}

export async function markStaffCourseEval(user, catalogCourseId, body) {
  const catalogId = await requireAssignedCourse(user, catalogCourseId);
  return markCourseSessionEval(user, catalogId, body);
}

export async function markStaffCourseGrade(user, catalogCourseId, body) {
  const catalogId = await requireAssignedCourse(user, catalogCourseId);
  return upsertCourseWorkMark(user, catalogId, body);
}

export async function setStaffTheoryMidtermAutomated(user, catalogCourseId, body) {
  const catalogId = await requireAssignedCourse(user, catalogCourseId);
  return setTheoryMidtermAutomated(user, catalogId, body);
}

export async function submitStaffCourseWorkSheet(user, catalogCourseId) {
  const catalogId = await requireAssignedCourse(user, catalogCourseId);
  return submitCourseWorkSheetToExams(user, catalogId);
}

export async function confirmStaffCourseWorkSheet(user, catalogCourseId) {
  const catalogId = await requireAssignedCourse(user, catalogCourseId);
  return confirmCourseWorkSheet(user, catalogId);
}

export async function submitStaffAttendanceSheet(user, catalogCourseId) {
  const catalogId = await requireAssignedCourse(user, catalogCourseId);
  return submitAttendanceSheet(user, catalogId);
}

export async function confirmStaffAttendanceSheet(user, catalogCourseId) {
  const catalogId = await requireAssignedCourse(user, catalogCourseId);
  return confirmAttendanceSheet(user, catalogId);
}

export async function uploadStaffLectureFile(user, catalogCourseId, body) {
  const catalogId = await requireAssignedCourse(user, catalogCourseId);
  return uploadCourseLectureFile(user, catalogId, body);
}

export async function getStaffCourseChat(user, catalogCourseId) {
  const catalogId = await requireAssignedCourse(user, catalogCourseId);
  return listCourseStaffChat(user, catalogId);
}

export async function requireStaffAssignedCourse(user, catalogCourseId) {
  return requireAssignedCourse(user, catalogCourseId);
}

export async function postStaffCourseChat(user, catalogCourseId, body) {
  const catalogId = await requireAssignedCourse(user, catalogCourseId);
  return postCourseStaffChat(user, catalogId, body);
}
