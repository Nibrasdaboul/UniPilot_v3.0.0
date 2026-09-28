import { describe, it, expect } from 'vitest';
import { isVdaFailAlert, isCourseworkLate, VDA_FAIL_ALERT_PCT } from './academicViceDeanBriefingService.js';

describe('academic vice dean alerts', () => {
  it('flags fail rates strictly above 40%', () => {
    expect(VDA_FAIL_ALERT_PCT).toBe(40);
    expect(isVdaFailAlert(40)).toBe(false);
    expect(isVdaFailAlert(40.1)).toBe(true);
    expect(isVdaFailAlert(20)).toBe(false);
  });

  it('flags late coursework only after elapsed threshold when SAI is missing', () => {
    expect(isCourseworkLate({ elapsedPct: 39, weightSai: 20, enrolled: 10, saiCount: 0 })).toBe(false);
    expect(isCourseworkLate({ elapsedPct: 40, weightSai: 20, enrolled: 10, saiCount: 0 })).toBe(true);
    expect(isCourseworkLate({ elapsedPct: 50, weightSai: 20, enrolled: 10, saiCount: 10 })).toBe(false);
    expect(isCourseworkLate({ elapsedPct: 80, weightSai: 0, enrolled: 10, saiCount: 0 })).toBe(false);
  });
});
