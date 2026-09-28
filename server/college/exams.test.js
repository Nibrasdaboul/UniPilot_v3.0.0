import { describe, it, expect } from 'vitest';
import { sessionsOverlap, hallFitsEnrolled, generateSeatLabels, isExamType } from './exams.js';
import { canEnterOfficialGrades, isExamsOfficeRole, ROLES } from './roles.js';

describe('exam schedule rules', () => {
  it('detects overlapping hall times', () => {
    expect(sessionsOverlap('2026-09-22T09:00:00Z', '2026-09-22T11:00:00Z', '2026-09-22T10:00:00Z', '2026-09-22T12:00:00Z')).toBe(true);
    expect(sessionsOverlap('2026-09-22T09:00:00Z', '2026-09-22T11:00:00Z', '2026-09-22T11:00:00Z', '2026-09-22T13:00:00Z')).toBe(false);
    expect(sessionsOverlap('2026-09-22T09:00:00Z', '2026-09-22T11:00:00Z', '2026-09-23T09:00:00Z', '2026-09-23T11:00:00Z')).toBe(false);
  });

  it('rejects a hall smaller than the enrolled count', () => {
    expect(hallFitsEnrolled(1, 80)).toBe(true);
    expect(hallFitsEnrolled(41, 40)).toBe(false);
    expect(hallFitsEnrolled(0, 40)).toBe(true);
  });

  it('labels seats A1.. then B1..', () => {
    expect(generateSeatLabels(2)).toEqual(['A1', 'A2']);
    expect(generateSeatLabels(11)[10]).toBe('B1');
  });

  it('only exams office roles schedule exams', () => {
    expect(isExamType('midterm')).toBe(true);
    expect(isExamType('quiz')).toBe(false);
    expect(canEnterOfficialGrades(ROLES.EXAMS_OFFICE)).toBe(true);
    expect(canEnterOfficialGrades(ROLES.STUDENT)).toBe(false);
    expect(isExamsOfficeRole(ROLES.EXAMS_OFFICE)).toBe(true);
    expect(isExamsOfficeRole('exams_officer')).toBe(true);
    expect(isExamsOfficeRole(ROLES.VICE_DEAN_ACADEMIC)).toBe(false);
    expect(isExamsOfficeRole(ROLES.DEAN)).toBe(false);
  });
});
