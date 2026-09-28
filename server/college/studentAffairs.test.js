import { describe, it, expect } from 'vitest';
import { isComplaintStatus, isComplaintType, isCaseType, isCaseStatus, activityHasRoom } from './studentAffairs.js';
import { canManageStudentAffairs, canRegisterStudent, ROLES } from './roles.js';

describe('student affairs permissions', () => {
  it('student affairs and vice dean manage; students and instructors do not', () => {
    expect(canManageStudentAffairs(ROLES.STUDENT_AFFAIRS)).toBe(true);
    expect(canManageStudentAffairs(ROLES.VICE_DEAN_STUDENTS)).toBe(true);
    expect(canManageStudentAffairs(ROLES.DEAN)).toBe(true);
    expect(canManageStudentAffairs(ROLES.STUDENT)).toBe(false);
    expect(canManageStudentAffairs(ROLES.INSTRUCTOR)).toBe(false);
    expect(canManageStudentAffairs(ROLES.EXAMS_OFFICE)).toBe(false);
    expect(canRegisterStudent(ROLES.STUDENT_AFFAIRS)).toBe(true);
    expect(canRegisterStudent(ROLES.DEAN)).toBe(false);
    expect(canRegisterStudent(ROLES.VICE_DEAN_STUDENTS)).toBe(false);
  });

  it('validates complaint, case, and activity capacity rules', () => {
    expect(isComplaintStatus('open')).toBe(true);
    expect(isComplaintStatus('done')).toBe(false);
    expect(isComplaintType('academic')).toBe(true);
    expect(isComplaintType('random')).toBe(false);
    expect(isCaseType('disciplinary')).toBe(true);
    expect(isCaseType('random')).toBe(false);
    expect(isCaseStatus('closed')).toBe(true);
    expect(activityHasRoom(0, 40)).toBe(true);
    expect(activityHasRoom(40, 40)).toBe(false);
    expect(activityHasRoom(3, 0)).toBe(false);
  });
});
