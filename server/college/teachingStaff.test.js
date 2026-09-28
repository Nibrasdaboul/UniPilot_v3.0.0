import { describe, it, expect } from 'vitest';
import { normalizeStaffRole, userMatchesStaffRole, isSectionKind, isWeekday, isTimeSlot } from './teachingStaff.js';
import { canAssignTeachingStaff, isTeachingStaffRole, ROLES } from './roles.js';

describe('teaching staff assignment', () => {
  it('department head and dean assign staff; students do not', () => {
    expect(canAssignTeachingStaff(ROLES.DEPARTMENT_HEAD)).toBe(true);
    expect(canAssignTeachingStaff(ROLES.DEAN)).toBe(true);
    expect(canAssignTeachingStaff(ROLES.STUDENT)).toBe(false);
    expect(canAssignTeachingStaff(ROLES.EXAMS_OFFICE)).toBe(false);
  });

  it('maps legacy doctor/engineer to instructor/TA', () => {
    expect(normalizeStaffRole('doctor')).toBe('instructor');
    expect(normalizeStaffRole('engineer')).toBe('teaching_assistant');
    expect(userMatchesStaffRole('doctor', 'instructor')).toBe(true);
    expect(userMatchesStaffRole('engineer', 'teaching_assistant')).toBe(true);
    expect(userMatchesStaffRole(ROLES.STUDENT, 'instructor')).toBe(false);
    expect(isTeachingStaffRole('doctor')).toBe(true);
    expect(isSectionKind('theory')).toBe(true);
    expect(isSectionKind('lab')).toBe(false);
  });

  it('accepts Friday-Thursday weekdays and two-hour slots', () => {
    expect(isWeekday('friday')).toBe(true);
    expect(isWeekday('thursday')).toBe(true);
    expect(isWeekday('weekend')).toBe(false);
    expect(isTimeSlot('08-10')).toBe(true);
    expect(isTimeSlot('14-16')).toBe(true);
    expect(isTimeSlot('16-18')).toBe(false);
  });
});
