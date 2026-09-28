import { describe, it, expect } from 'vitest';
import { isOfferingGradesClosed } from './academicViceDeanDashboardService.js';

describe('academic vice dean KPIs', () => {
  it('closes an offering only when every enrolled student has published marks', () => {
    expect(isOfferingGradesClosed(0, 0)).toBe(false);
    expect(isOfferingGradesClosed(10, 9)).toBe(false);
    expect(isOfferingGradesClosed(10, 10)).toBe(true);
    expect(isOfferingGradesClosed(4, 6)).toBe(true);
  });
});
