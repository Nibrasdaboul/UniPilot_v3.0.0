import { db } from '../db.js';
import { ROLE_LABELS } from '../college/roles.js';
import { getDeanAcademic } from './deanAcademicService.js';
import { getDeanKpis } from './deanDashboardService.js';
import { getDeanOperations } from './deanOperationsService.js';
import { listDeanApprovals } from './deanApprovalsService.js';

function httpError(status, detail) {
  const err = new Error(detail);
  err.status = status;
  throw err;
}

function collegeId(user) {
  const cid = user?.college_id != null ? Number(user.college_id) : null;
  if (cid == null) httpError(400, 'Dean is not attached to a college');
  return cid;
}

async function departmentReport(user, departmentId) {
  const cid = collegeId(user);
  const id = parseInt(departmentId, 10);
  if (!Number.isFinite(id)) httpError(404, 'Department not found');
  let dept = await db.prepare(
    'SELECT id, code, name FROM departments WHERE id = ? AND college_id = ?'
  ).get(id, cid);
  if (!dept) {
    dept = await db.prepare('SELECT id, code, name FROM departments WHERE id = ?').get(id);
  }
  if (!dept) httpError(404, 'Department not found');

  const studentTotal = Number((await db.prepare(
    `SELECT COUNT(*)::int AS n FROM users WHERE role = 'student' AND college_id = ? AND department_id = ?`
  ).get(cid, dept.id)).n) || 0;

  const students = await db.prepare(`
    SELECT u.id, u.person_code, u.full_name, u.full_name_ar, u.gender, u.account_status,
           p.study_year, p.academic_status, p.major
    FROM users u
    LEFT JOIN student_profiles p ON p.user_id = u.id
    WHERE u.role = 'student' AND u.college_id = ? AND u.department_id = ?
    ORDER BY u.full_name ASC
    LIMIT 80
  `).all(cid, dept.id);

  const staff = await db.prepare(`
    SELECT u.id, u.person_code, u.full_name, u.role
    FROM users u
    WHERE u.college_id = ? AND u.department_id = ?
      AND u.role IN ('instructor', 'department_head', 'teaching_assistant', 'vice_dean_academic')
    ORDER BY u.full_name ASC
    LIMIT 50
  `).all(cid, dept.id);

  const academic = await getDeanAcademic(user);
  const courses = (academic.syllabus?.courses || []).filter((c) => Number(c.department_id) === Number(dept.id));
  const attendance = (academic.attendance?.courses || []).filter((c) => Number(c.department_id) === Number(dept.id));
  const fail = (academic.grades?.fail_by_course || []).filter((c) =>
    courses.some((o) => o.course_code === c.course_code),
  );

  return {
    scope: 'department',
    department: dept,
    counts: { students: studentTotal, staff: staff.length, courses: courses.length },
    students,
    staff: staff.map((s) => ({ ...s, role_ar: ROLE_LABELS.ar[s.role] || s.role, role_en: ROLE_LABELS.en[s.role] || s.role })),
    courses,
    attendance,
    fail_by_course: fail,
    term: academic.term,
  };
}

async function studentsReport(user) {
  const cid = collegeId(user);
  const kpis = await getDeanKpis(user);
  const byDept = kpis.departments.items;
  const sample = await db.prepare(`
    SELECT u.id, u.person_code, u.full_name, u.gender, p.academic_status, p.study_year, d.name AS department
    FROM users u
    LEFT JOIN student_profiles p ON p.user_id = u.id
    LEFT JOIN departments d ON d.id = u.department_id
    WHERE u.role = 'student' AND u.college_id = ?
    ORDER BY u.id DESC
    LIMIT 40
  `).all(cid);
  return { scope: 'students', summary: kpis.students, departments: byDept, sample };
}

async function academicStaffReport(user) {
  const cid = collegeId(user);
  const rows = await db.prepare(`
    SELECT u.id, u.person_code, u.full_name, u.role, d.name AS department, fp.academic_rank
    FROM users u
    LEFT JOIN departments d ON d.id = u.department_id
    LEFT JOIN faculty_profiles fp ON fp.user_id = u.id
    WHERE u.college_id = ?
      AND u.role IN ('instructor', 'department_head', 'vice_dean_academic', 'dean', 'teaching_assistant')
    ORDER BY u.role, u.full_name
    LIMIT 80
  `).all(cid);
  return {
    scope: 'academic',
    items: rows.map((s) => ({
      ...s,
      role_ar: ROLE_LABELS.ar[s.role] || s.role,
      role_en: ROLE_LABELS.en[s.role] || s.role,
    })),
  };
}

async function adminStaffReport(user) {
  const cid = collegeId(user);
  const rows = await db.prepare(`
    SELECT u.id, u.person_code, u.full_name, u.role
    FROM users u
    WHERE u.college_id = ?
      AND u.role IN ('student_affairs', 'exams_office', 'hr', 'finance', 'library', 'it', 'quality', 'archive', 'vice_dean_students')
    ORDER BY u.role, u.full_name
    LIMIT 80
  `).all(cid);
  return {
    scope: 'admin',
    items: rows.map((s) => ({
      ...s,
      role_ar: ROLE_LABELS.ar[s.role] || s.role,
      role_en: ROLE_LABELS.en[s.role] || s.role,
    })),
  };
}

async function successReport(user) {
  const academic = await getDeanAcademic(user);
  return { scope: 'success', term: academic.term, grades: academic.grades };
}

async function approvalsReport(user) {
  return { scope: 'approvals', ...(await listDeanApprovals(user)) };
}

async function operationsReport(user) {
  return { scope: 'operations', ...(await getDeanOperations(user)) };
}

async function departmentsReport(user) {
  const kpis = await getDeanKpis(user);
  const academic = await getDeanAcademic(user);
  return {
    scope: 'departments',
    total: kpis.departments.total,
    term: academic.term,
    items: (kpis.departments.items || []).map((d) => {
      const syl = (academic.syllabus?.by_department || []).find((x) => Number(x.id) === Number(d.id));
      return {
        ...d,
        syllabus_progress: syl?.progress ?? null,
        courses: syl?.courses ?? 0,
      };
    }),
  };
}

async function courseReport(user, code) {
  const academic = await getDeanAcademic(user);
  const courseCode = String(code || '').trim();
  const offering = (academic.syllabus?.courses || []).find((c) => c.course_code === courseCode);
  const attendance = (academic.attendance?.courses || []).find((c) => c.course_code === courseCode);
  const fail = (academic.grades?.fail_by_course || []).find((c) => c.course_code === courseCode);
  if (!offering && !attendance && !fail) httpError(404, 'Course not found');
  return { scope: 'course', course_code: courseCode, offering, attendance, fail, term: academic.term };
}

export async function getDeanReport(user, scope, id) {
  switch (scope) {
    case 'department':
      return departmentReport(user, id);
    case 'departments':
      return departmentsReport(user);
    case 'students':
      return studentsReport(user);
    case 'academic':
      return academicStaffReport(user);
    case 'admin':
      return adminStaffReport(user);
    case 'success':
      return successReport(user);
    case 'approvals':
      return approvalsReport(user);
    case 'operations':
      return operationsReport(user);
    case 'course':
      return courseReport(user, id);
    default:
      httpError(404, 'Unknown report');
  }
}
