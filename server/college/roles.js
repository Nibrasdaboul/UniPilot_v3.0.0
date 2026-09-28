/**
 * College roles and who may create whom.
 * One app; access is role + permission, not a separate admin site.
 */

export const ROLES = {
  STUDENT: 'student',
  TEACHING_ASSISTANT: 'teaching_assistant',
  INSTRUCTOR: 'instructor',
  DEPARTMENT_HEAD: 'department_head',
  VICE_DEAN_ACADEMIC: 'vice_dean_academic',
  VICE_DEAN_STUDENTS: 'vice_dean_students',
  DEAN: 'dean',
  STUDENT_AFFAIRS: 'student_affairs',
  EXAMS_OFFICE: 'exams_office',
  HR: 'hr',
  FINANCE: 'finance',
  LIBRARY: 'library',
  IT: 'it',
  QUALITY: 'quality',
  ARCHIVE: 'archive',
  PLATFORM_ADMIN: 'platform_admin',
  UNIVERSITY_ADMIN: 'university_admin',
  ADMIN: 'admin', // legacy UniPilot role; treated as dean-level for bootstrap only
};

export const ALL_ROLES = Object.values(ROLES);

export const ROLE_LABELS = {
  ar: {
    student: 'طالب',
    teaching_assistant: 'معيد',
    instructor: 'مدرّس',
    department_head: 'رئيس قسم',
    vice_dean_academic: 'نائب العميد للشؤون الأكاديمية',
    vice_dean_students: 'نائب العميد لشؤون الطلاب',
    dean: 'عميد',
    student_affairs: 'شؤون الطلاب',
    exams_office: 'دائرة الامتحانات',
    hr: 'شؤون العاملين',
    finance: 'المالية',
    library: 'المكتبة',
    it: 'تقنية المعلومات',
    quality: 'الجودة والاعتماد',
    archive: 'الديوان / الأرشيف',
    university_admin: 'رئيس الجامعة',
    platform_admin: 'مدير المنصة',
    admin: 'مدير نظام (قديم)',
  },
  en: {
    student: 'Student',
    teaching_assistant: 'Teaching Assistant',
    instructor: 'Instructor',
    department_head: 'Head of Department',
    vice_dean_academic: 'Vice Dean for Academic Affairs',
    vice_dean_students: 'Vice Dean for Student Affairs',
    dean: 'Dean',
    student_affairs: 'Student Affairs',
    exams_office: 'Exams Office',
    hr: 'Human Resources',
    finance: 'Finance',
    library: 'Library',
    it: 'IT Support',
    quality: 'Quality Assurance',
    archive: 'Archive / Correspondence',
    university_admin: 'University president',
    platform_admin: 'Platform admin',
    admin: 'Legacy admin',
  },
};

/**
 * Target role -> roles allowed to create it.
 * Dean is seeded, not created from Student Affairs.
 */
export const CREATED_BY = {
  student: ['student_affairs'],
  teaching_assistant: ['hr', 'department_head', 'vice_dean_academic', 'dean', 'admin', 'university_admin'],
  instructor: ['hr', 'department_head', 'vice_dean_academic', 'dean', 'admin', 'university_admin'],
  department_head: ['dean', 'admin', 'university_admin'],
  vice_dean_academic: ['dean', 'admin', 'university_admin'],
  vice_dean_students: ['dean', 'admin', 'university_admin'],
  dean: ['university_admin', 'platform_admin', 'admin'],
  student_affairs: ['vice_dean_students', 'dean', 'admin', 'university_admin'],
  exams_office: ['vice_dean_academic', 'dean', 'admin', 'university_admin'],
  hr: ['dean', 'admin', 'university_admin'],
  finance: ['dean', 'hr', 'admin', 'university_admin'],
  library: ['dean', 'hr', 'admin', 'university_admin'],
  it: ['dean', 'hr', 'admin', 'university_admin'],
  quality: ['vice_dean_academic', 'dean', 'admin', 'university_admin'],
  archive: ['dean', 'hr', 'admin', 'university_admin'],
  university_admin: ['platform_admin'],
  platform_admin: [],
  admin: [],
};

export const LEADERSHIP_ROLES = ['dean', 'admin', 'university_admin', 'platform_admin'];

export function canCreateRole(actorRole, targetRole) {
  if (!actorRole || !targetRole) return false;
  const allowed = CREATED_BY[targetRole];
  if (!allowed) return false;
  return allowed.includes(actorRole);
}

export function creatableRolesFor(actorRole) {
  return ALL_ROLES.filter((role) => canCreateRole(actorRole, role));
}

/** People directory never creates students — that form lives on Student Affairs only. */
export function directoryCreatableRolesFor(actorRole) {
  return creatableRolesFor(actorRole).filter((role) => role !== ROLES.STUDENT);
}

export function canRegisterStudent(role) {
  return normalizeRole(role) === ROLES.STUDENT_AFFAIRS;
}

export function isLeadership(role) {
  return LEADERSHIP_ROLES.includes(role);
}

export const ACADEMIC_CALENDAR_ROLES = [
  ROLES.VICE_DEAN_ACADEMIC,
  ROLES.DEAN,
  ROLES.UNIVERSITY_ADMIN,
  ROLES.ADMIN,
  ROLES.PLATFORM_ADMIN,
];

export const CURRICULUM_ROLES = [...ACADEMIC_CALENDAR_ROLES, ROLES.DEPARTMENT_HEAD];

export function canManageAcademicCalendar(role) {
  return ACADEMIC_CALENDAR_ROLES.includes(role);
}

export function canManageCurriculum(role) {
  return CURRICULUM_ROLES.includes(role);
}

/** Legacy DB used exams_officer; college role is exams_office. */
export function normalizeRole(role) {
  if (role === 'exams_officer') return ROLES.EXAMS_OFFICE;
  if (role === 'doctor') return ROLES.INSTRUCTOR;
  if (role === 'engineer') return ROLES.TEACHING_ASSISTANT;
  return role;
}

export const OFFICIAL_GRADES_ROLES = [
  ROLES.EXAMS_OFFICE,
  ROLES.VICE_DEAN_ACADEMIC,
  ROLES.DEAN,
  ROLES.UNIVERSITY_ADMIN,
  ROLES.ADMIN,
  ROLES.PLATFORM_ADMIN,
];

export function canEnterOfficialGrades(role) {
  return OFFICIAL_GRADES_ROLES.includes(normalizeRole(role));
}

export function canAssignTeachingStaff(role) {
  return canManageCurriculum(role);
}

export function isTeachingStaffRole(role) {
  const n = normalizeRole(role);
  return n === ROLES.INSTRUCTOR || n === ROLES.TEACHING_ASSISTANT;
}

export function isExamsOfficeRole(role) {
  return normalizeRole(role) === ROLES.EXAMS_OFFICE;
}

export const STUDENT_AFFAIRS_ROLES = [
  ROLES.STUDENT_AFFAIRS,
  ROLES.VICE_DEAN_STUDENTS,
  ROLES.DEAN,
  ROLES.UNIVERSITY_ADMIN,
  ROLES.ADMIN,
  ROLES.PLATFORM_ADMIN,
];

export function canManageStudentAffairs(role) {
  return STUDENT_AFFAIRS_ROLES.includes(normalizeRole(role));
}

export function isStudentRole(role) {
  return normalizeRole(role) === ROLES.STUDENT;
}

export function isViceDeanAcademic(role) {
  return normalizeRole(role) === ROLES.VICE_DEAN_ACADEMIC;
}
