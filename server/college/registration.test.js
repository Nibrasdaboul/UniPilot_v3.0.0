import { describe, it, expect } from 'vitest';
import {
  isWindowOpen,
  studentYearLevel,
  isEligibleForWindow,
  eligibilityReasons,
  pickRegistrationWindow,
  wouldExceedCreditCap,
  registrationBlockKind,
  latestRegistrationWindow,
  evaluateRegistrationCatalog,
  sortRegistrationCatalogCards,
} from './registration.js';

const openWindow = {
  id: 1,
  name: 'Open',
  opens_at: '2026-09-01T00:00:00.000Z',
  closes_at: '2026-10-15T00:00:00.000Z',
  min_completed_credits: 0,
  min_semester_gpa: 0,
  max_credits: 18,
};

const now = new Date('2026-09-21T12:00:00.000Z');

describe('registration windows', () => {
  it('is open only between opens_at and closes_at', () => {
    expect(isWindowOpen(openWindow, now)).toBe(true);
    expect(isWindowOpen(openWindow, new Date('2026-08-01T00:00:00.000Z'))).toBe(false);
    expect(isWindowOpen(openWindow, new Date('2026-11-01T00:00:00.000Z'))).toBe(false);
  });

  it('computes year level from enrollment year', () => {
    expect(studentYearLevel(2022, now)).toBe(5);
    expect(studentYearLevel(2026, now)).toBe(1);
    expect(studentYearLevel(null, now)).toBe(null);
  });

  it('rejects students below credit or GPA floors', () => {
    const priority = { ...openWindow, min_completed_credits: 120, min_semester_gpa: 2 };
    expect(isEligibleForWindow(priority, { completedCredits: 0, gpa: 0 })).toBe(false);
    expect(isEligibleForWindow(priority, { completedCredits: 120, gpa: 2.1 })).toBe(true);
    expect(eligibilityReasons(priority, { completedCredits: 0, gpa: 0 }, now).length).toBeGreaterThan(0);
  });

  it('picks an eligible open window over a closed or unmatched one', () => {
    const priority = { ...openWindow, id: 2, min_completed_credits: 120, max_credits: 21 };
    const picked = pickRegistrationWindow([priority, openWindow], { completedCredits: 0, gpa: 0 }, now);
    expect(picked.eligible).toBe(true);
    expect(picked.window.id).toBe(1);
  });

  it('reports a closed window when every window has ended', () => {
    expect(registrationBlockKind([], {}, now)).toBe('no_window');
    expect(registrationBlockKind([openWindow], {}, new Date('2026-11-01T00:00:00.000Z'))).toBe('window_closed');
    expect(registrationBlockKind([openWindow], { completedCredits: 0, gpa: 0 }, now)).toBe(null);
  });

  it('locks a catalog course until the prerequisite is passed or hours are met', () => {
    const passed = new Set([1]);
    expect(evaluateRegistrationCatalog({ prerequisiteId: 1, passedCatalogIds: passed, completedHours: 0 })).toEqual({
      eligible: true,
      lock_reason: null,
    });
    expect(evaluateRegistrationCatalog({ prerequisiteId: 2, passedCatalogIds: passed, completedHours: 80 })).toEqual({
      eligible: false,
      lock_reason: 'prerequisite',
    });
    expect(evaluateRegistrationCatalog({ minHours: 90, completedHours: 6 })).toEqual({
      eligible: false,
      lock_reason: 'hours',
    });
    const sorted = sortRegistrationCatalogCards([
      { course_code: 'B', order: 1, eligible: false },
      { course_code: 'A', order: 2, eligible: true },
    ]);
    expect(sorted.map((c) => c.course_code)).toEqual(['A', 'B']);
  });

  it('blocks adding credits past the window cap', () => {
    expect(wouldExceedCreditCap(openWindow, 15, 3)).toBe(false);
    expect(wouldExceedCreditCap(openWindow, 16, 3)).toBe(true);
    expect(wouldExceedCreditCap({ ...openWindow, max_credits: null }, 40, 3)).toBe(false);
  });
});
