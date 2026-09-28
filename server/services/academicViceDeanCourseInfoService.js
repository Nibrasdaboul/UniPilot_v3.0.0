import { db } from '../db.js';
import { listOfficialCatalog } from '../college/catalogSync.js';
import { toPublicDepartment } from '../college/departments.js';
import { normalizeStaffRole } from '../college/teachingStaff.js';
import { parseCourseSyllabusBody, splitCourseStaff } from '../college/courseInfo.js';
import { getDeanAcademic } from './deanAcademicService.js';
import { listOfferingsForTerm } from './registrationService.js';
import { getAttendanceGridForOfferings } from './courseAttendanceService.js';
import { getCourseWorkGrades } from './courseWorkGradesService.js';
import { listCourseLectureFiles, pendingLectureCountsForCollege } from './courseLectureFilesService.js';
import { listCourseStaffChat, unreadIncomingChatCounts } from './courseStaffChatService.js';
import { sheetsForCollege, getOrCreateCourseWorkSheet, sheetActionsForUser } from './courseWorkSheetsService.js';
import { publicCourseWorkSheet } from '../college/courseWorkSheets.js';
import { listCourseWorkAppeals, pendingAppealCountsForCollege } from './courseWorkAppealsService.js';
import {
  getOrCreateAttendanceSheet,
  attendanceSheetActionsForUser,
  attendanceSheetsForCollege,
  listCourseDeprivations,
} from './attendanceSheetsService.js';
import { publicAttendanceSheet } from '../college/attendanceSheets.js';

function httpError(status, detail) {
  const err = new Error(detail);
  err.status = status;
  throw err;
}

function collegeId(user) {
  const cid = user?.college_id != null ? Number(user.college_id) : null;
  if (cid == null) httpError(400, 'Vice Dean is not attached to a college');
  return cid;
}

function n(value) {
  return Number(value) || 0;
}

async function staffForOfferings(offeringIds) {
  if (!offeringIds.length) return [];
  const placeholders = offeringIds.map(() => '?').join(', ');
  const rows = await db.prepare(`
    SELECT cs.offering_id, cs.user_id, cs.staff_role, u.full_name, u.person_code
    FROM course_staff cs
    INNER JOIN users u ON u.id = cs.user_id
    WHERE cs.offering_id IN (${placeholders})
    ORDER BY cs.id ASC
  `).all(...offeringIds);
  return (rows || []).map((row) => ({
    ...row,
    staff_role: normalizeStaffRole(row.staff_role) || row.staff_role,
  }));
}

async function syllabiForCollege(cid) {
  try {
    const rows = await db.prepare(`
      SELECT catalog_course_id, theory_syllabus, practical_syllabus, updated_at
      FROM college_course_syllabi
      WHERE college_id = ?
    `).all(cid);
    return new Map((rows || []).map((row) => [Number(row.catalog_course_id), row]));
  } catch (err) {
    if (err?.code === '42P01') return new Map();
    throw err;
  }
}

function publicStaff(list) {
  const split = splitCourseStaff(list);
  return {
    ...split,
    theory_staff_count: split.theory_staff.length,
    practical_staff_count: split.practical_staff.length,
  };
}

async function uniCourseForCatalog(cid, catalogId) {
  return db.prepare(`
    SELECT uc.id, uc.course_code, uc.course_name, uc.credit_hours, uc.year_level,
           uc.department_id, uc.catalog_course_id,
           uc.weight_sai, uc.weight_theory, uc.weight_practical, uc.weight_midterm,
           d.name AS department_name, d.code AS department_code
    FROM uni_courses uc
    INNER JOIN departments d ON d.id = uc.department_id
    WHERE d.college_id = ? AND uc.catalog_course_id = ?
    LIMIT 1
  `).get(cid, catalogId);
}

export async function listAcademicViceDeanCourseInfo(user) {
  const cid = collegeId(user);
  const academic = await getDeanAcademic(user);
  const catalog = await listOfficialCatalog(cid);
  const offerings = academic.term?.id ? await listOfferingsForTerm(academic.term.id, cid) : [];
  const staff = await staffForOfferings(offerings.map((o) => o.id));
  const syllabi = await syllabiForCollege(cid);
  const pendingFiles = await pendingLectureCountsForCollege(cid);
  const unreadChat = await unreadIncomingChatCounts(user);
  const sheets = await sheetsForCollege(cid);
  const attendanceSheets = await attendanceSheetsForCollege(cid);
  const pendingAppeals = await pendingAppealCountsForCollege(cid);
  const offeringsByCatalog = new Map();
  for (const off of offerings) {
    const key = Number(off.catalog_course_id);
    if (!key) continue;
    const list = offeringsByCatalog.get(key) || [];
    list.push(off);
    offeringsByCatalog.set(key, list);
  }

  const items = catalog.map((course) => {
    const offs = offeringsByCatalog.get(Number(course.id)) || [];
    const offIds = new Set(offs.map((o) => Number(o.id)));
    const assigned = staff.filter((s) => offIds.has(Number(s.offering_id)));
    const split = publicStaff(assigned);
    const syllabus = syllabi.get(Number(course.id));
    const first = offs[0];
    return {
      catalog_course_id: course.id,
      course_code: course.course_code,
      course_name: course.course_name,
      description: course.description || '',
      credit_hours: course.credit_hours,
      order: course.order ?? null,
      department_id: course.department_id ?? null,
      department: toPublicDepartment({
        id: course.department_id,
        code: course.department_code,
        name: course.department,
      }),
      offered: offs.length > 0,
      offering_id: first?.id || null,
      enrolled_count: offs.reduce((sum, o) => sum + n(o.enrolled_count), 0),
      capacity: offs.reduce((sum, o) => sum + n(o.capacity), 0),
      has_theory_syllabus: Boolean(String(syllabus?.theory_syllabus || '').trim()),
      has_practical_syllabus: Boolean(String(syllabus?.practical_syllabus || '').trim()),
      theory_staff_count: split.theory_staff_count,
      practical_staff_count: split.practical_staff_count,
      pending_file_count: pendingFiles.get(Number(course.id)) || 0,
      unread_chat_count: unreadChat.get(Number(course.id)) || 0,
      grade_sheet: publicCourseWorkSheet(sheets.get(Number(course.id))),
      sheet_status: publicCourseWorkSheet(sheets.get(Number(course.id))).status,
      attendance_sheet: publicAttendanceSheet(attendanceSheets.get(Number(course.id))),
      attendance_sheet_status: publicAttendanceSheet(attendanceSheets.get(Number(course.id))).status,
      pending_appeal_count: pendingAppeals.get(Number(course.id)) || 0,
    };
  });

  return {
    term: academic.term,
    items,
    counts: {
      courses: items.length,
      offered: items.filter((i) => i.offered).length,
      with_syllabus: items.filter((i) => i.has_theory_syllabus || i.has_practical_syllabus).length,
      staffed: items.filter((i) => i.theory_staff_count + i.practical_staff_count > 0).length,
      at_exams: items.filter((i) => i.sheet_status === 'at_exams').length,
      staff_review: items.filter((i) => i.sheet_status === 'staff_review').length,
      awaiting_vda: items.filter((i) => i.sheet_status === 'awaiting_vda').length,
      published: items.filter((i) => i.sheet_status === 'published').length,
      pending_appeals: items.reduce((sum, i) => sum + (Number(i.pending_appeal_count) || 0), 0),
    },
  };
}

export async function getAcademicViceDeanCourseInfo(user, catalogCourseId) {
  const cid = collegeId(user);
  const catalogId = Number(catalogCourseId);
  if (!Number.isFinite(catalogId)) httpError(404, 'Course not found');
  const page = await listAcademicViceDeanCourseInfo(user);
  const summary = page.items.find((i) => Number(i.catalog_course_id) === catalogId);
  if (!summary) httpError(404, 'Course not found');

  const catalog = await db.prepare(`
    SELECT cc.id, cc.course_code, cc.course_name, cc.description, cc.credit_hours, cc."order",
           cc.prerequisite_id, p.course_code AS prerequisite_code, p.course_name AS prerequisite_name
    FROM catalog_courses cc
    LEFT JOIN catalog_courses p ON p.id = cc.prerequisite_id
    WHERE cc.id = ?
  `).get(catalogId);
  const uni = await uniCourseForCatalog(cid, catalogId);
  const academic = page.term;
  const offerings = academic?.id ? await listOfferingsForTerm(academic.id, cid) : [];
  const mine = offerings.filter((o) => Number(o.catalog_course_id) === catalogId);
  const staff = publicStaff(await staffForOfferings(mine.map((o) => o.id)));
  const syllabus = (await syllabiForCollege(cid)).get(catalogId);

  return {
    term: page.term,
    catalog_course_id: catalogId,
    course_code: catalog?.course_code || summary.course_code,
    course_name: catalog?.course_name || summary.course_name,
    description: catalog?.description || '',
    credit_hours: catalog?.credit_hours ?? summary.credit_hours,
    order: catalog?.order ?? summary.order ?? null,
    year_level: uni?.year_level ?? null,
    department_id: summary.department?.id ?? summary.department_id ?? null,
    department: summary.department,
    prerequisite: catalog?.prerequisite_id ? {
      id: catalog.prerequisite_id,
      course_code: catalog.prerequisite_code,
      course_name: catalog.prerequisite_name,
    } : null,
    weights: {
      sai: n(uni?.weight_sai),
      theory: n(uni?.weight_theory),
      practical: n(uni?.weight_practical),
      midterm: n(uni?.weight_midterm),
    },
    offered: summary.offered,
    offering_id: summary.offering_id,
    enrolled_count: summary.enrolled_count,
    capacity: summary.capacity,
    theory_syllabus: syllabus?.theory_syllabus || '',
    practical_syllabus: syllabus?.practical_syllabus || '',
    syllabus_updated_at: syllabus?.updated_at || null,
    theory_staff: staff.theory_staff,
    practical_staff: staff.practical_staff,
    attendance: await getAttendanceGridForOfferings(mine.map((o) => o.id)),
    grades: await getCourseWorkGrades(user, catalogId, mine.map((o) => o.id)),
    lectures: await listCourseLectureFiles(user, catalogId),
    chat: await listCourseStaffChat(user, catalogId),
    grade_sheet: await sheetActionsForUser(user, await getOrCreateCourseWorkSheet(user, catalogId), catalogId),
    appeals: await listCourseWorkAppeals(user, catalogId),
    attendance_sheet: await attendanceSheetActionsForUser(user, await getOrCreateAttendanceSheet(user, catalogId), catalogId),
    deprivations: await listCourseDeprivations(user, catalogId),
  };
}

export async function updateAcademicViceDeanCourseSyllabus(user, catalogCourseId, body) {
  const cid = collegeId(user);
  const catalogId = Number(catalogCourseId);
  if (!Number.isFinite(catalogId)) httpError(404, 'Course not found');
  const exists = await db.prepare(`
    SELECT cc.id
    FROM catalog_courses cc
    INNER JOIN uni_courses uc ON uc.catalog_course_id = cc.id
    INNER JOIN departments d ON d.id = uc.department_id
    WHERE cc.id = ? AND d.college_id = ?
    LIMIT 1
  `).get(catalogId, cid);
  if (!exists) httpError(404, 'Course not found');
  const parsed = parseCourseSyllabusBody(body);
  if (parsed.error) httpError(400, parsed.error);

  const current = await db.prepare(`
    SELECT theory_syllabus, practical_syllabus FROM college_course_syllabi
    WHERE college_id = ? AND catalog_course_id = ?
  `).get(cid, catalogId);
  const theory = parsed.theory_syllabus !== undefined ? parsed.theory_syllabus : (current?.theory_syllabus || '');
  const practical = parsed.practical_syllabus !== undefined ? parsed.practical_syllabus : (current?.practical_syllabus || '');

  await db.prepare(`
    INSERT INTO college_course_syllabi
      (college_id, catalog_course_id, theory_syllabus, practical_syllabus, updated_by, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT (college_id, catalog_course_id) DO UPDATE SET
      theory_syllabus = EXCLUDED.theory_syllabus,
      practical_syllabus = EXCLUDED.practical_syllabus,
      updated_by = EXCLUDED.updated_by,
      updated_at = CURRENT_TIMESTAMP
    RETURNING id
  `).run(cid, catalogId, theory, practical, user.id);

  return getAcademicViceDeanCourseInfo(user, catalogId);
}
