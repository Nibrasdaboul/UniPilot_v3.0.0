import { describe, it, expect } from 'vitest';
import { parseAbsenceLimit, computeAbsenceWarning, isOfficialAbsence } from './absenceThreshold.js';

describe('absence threshold', () => {
  it('parses a college limit between 1 and 20', () => {
    expect(parseAbsenceLimit(4).limit).toBe(4);
    expect(parseAbsenceLimit(0).error).toMatch(/1 to 20/);
    expect(parseAbsenceLimit(21).error).toMatch(/1 to 20/);
  });

  it('maps 1/2/3 of 4 to 25/50/75 warnings', () => {
    expect(computeAbsenceWarning(1, 4).level).toBe(25);
    expect(computeAbsenceWarning(2, 4).level).toBe(50);
    expect(computeAbsenceWarning(3, 4).level).toBe(75);
    expect(computeAbsenceWarning(4, 4).level).toBe(100);
    expect(computeAbsenceWarning(3, 4).message_ar).toMatch(/حرمانك/);
    expect(isOfficialAbsence('absent')).toBe(true);
    expect(isOfficialAbsence('late')).toBe(false);
  });
});
