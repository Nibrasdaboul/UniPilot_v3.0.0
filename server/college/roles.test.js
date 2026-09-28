import { describe, it, expect } from 'vitest';
import { canCreateRole, creatableRolesFor, directoryCreatableRolesFor, canRegisterStudent, canManageAcademicCalendar, canManageCurriculum, canManageStudentAffairs, isStudentRole, isViceDeanAcademic, ROLES } from './roles.js';
import { formatUniversityId, yearPrefix } from './universityId.js';

describe('college roles', () => {
  it('only student affairs can create students', () => {
    expect(canCreateRole(ROLES.STUDENT_AFFAIRS, ROLES.STUDENT)).toBe(true);
    expect(canCreateRole(ROLES.STUDENT_AFFAIRS, ROLES.DEAN)).toBe(false);
    expect(canCreateRole(ROLES.STUDENT_AFFAIRS, ROLES.INSTRUCTOR)).toBe(false);
    expect(canCreateRole(ROLES.STUDENT_AFFAIRS, ROLES.VICE_DEAN_ACADEMIC)).toBe(false);
    expect(canCreateRole(ROLES.DEAN, ROLES.STUDENT)).toBe(false);
    expect(canCreateRole(ROLES.VICE_DEAN_STUDENTS, ROLES.STUDENT)).toBe(false);
    expect(canCreateRole(ROLES.UNIVERSITY_ADMIN, ROLES.STUDENT)).toBe(false);
    expect(canCreateRole(ROLES.ADMIN, ROLES.STUDENT)).toBe(false);
  });

  it('people directory never lists student as a creatable role', () => {
    expect(directoryCreatableRolesFor(ROLES.STUDENT_AFFAIRS)).not.toContain(ROLES.STUDENT);
    expect(directoryCreatableRolesFor(ROLES.DEAN)).not.toContain(ROLES.STUDENT);
    expect(canRegisterStudent(ROLES.STUDENT_AFFAIRS)).toBe(true);
    expect(canRegisterStudent(ROLES.DEAN)).toBe(false);
    expect(canRegisterStudent(ROLES.VICE_DEAN_STUDENTS)).toBe(false);
  });

  it('dean can create vice deans and student affairs, not another dean', () => {
    expect(canCreateRole(ROLES.DEAN, ROLES.VICE_DEAN_ACADEMIC)).toBe(true);
    expect(canCreateRole(ROLES.DEAN, ROLES.VICE_DEAN_STUDENTS)).toBe(true);
    expect(canCreateRole(ROLES.DEAN, ROLES.STUDENT_AFFAIRS)).toBe(true);
    expect(canCreateRole(ROLES.UNIVERSITY_ADMIN, ROLES.DEAN)).toBe(true);
    expect(canCreateRole(ROLES.DEAN, ROLES.DEAN)).toBe(false);
    expect(creatableRolesFor(ROLES.DEAN).includes(ROLES.STUDENT)).toBe(false);
  });

  it('student cannot create anyone', () => {
    expect(creatableRolesFor(ROLES.STUDENT)).toEqual([]);
  });

  it('academic calendar is owned by vice dean / dean, not students', () => {
    expect(canManageAcademicCalendar(ROLES.STUDENT)).toBe(false);
    expect(canManageAcademicCalendar(ROLES.STUDENT_AFFAIRS)).toBe(false);
    expect(canManageAcademicCalendar(ROLES.VICE_DEAN_ACADEMIC)).toBe(true);
    expect(canManageAcademicCalendar(ROLES.DEAN)).toBe(true);
    expect(canManageCurriculum(ROLES.DEPARTMENT_HEAD)).toBe(true);
    expect(canManageCurriculum(ROLES.STUDENT)).toBe(false);
  });

  it('student affairs office owns complaints and activities, not instructors', () => {
    expect(canManageStudentAffairs(ROLES.STUDENT_AFFAIRS)).toBe(true);
    expect(canManageStudentAffairs(ROLES.VICE_DEAN_STUDENTS)).toBe(true);
    expect(canManageStudentAffairs(ROLES.INSTRUCTOR)).toBe(false);
    expect(canManageStudentAffairs(ROLES.STUDENT)).toBe(false);
  });

  it('student study pages belong to students only', () => {
    expect(isStudentRole(ROLES.STUDENT)).toBe(true);
    expect(isStudentRole(ROLES.DEAN)).toBe(false);
    expect(isStudentRole(ROLES.INSTRUCTOR)).toBe(false);
    expect(isStudentRole(ROLES.STUDENT_AFFAIRS)).toBe(false);
  });

  it('academic vice dean is distinct from dean and department head', () => {
    expect(isViceDeanAcademic(ROLES.VICE_DEAN_ACADEMIC)).toBe(true);
    expect(isViceDeanAcademic(ROLES.DEAN)).toBe(false);
    expect(isViceDeanAcademic(ROLES.DEPARTMENT_HEAD)).toBe(false);
    expect(isViceDeanAcademic(ROLES.STUDENT)).toBe(false);
  });
});

describe('university id', () => {
  it('encodes year 2022 as 022 and pads sequence', () => {
    expect(yearPrefix(2022)).toBe('022');
    expect(formatUniversityId(2022, 411199)).toBe('0220411199');
    expect(formatUniversityId(2026, 1)).toBe('0260000001');
  });
});
