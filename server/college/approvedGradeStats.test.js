import { describe, it, expect } from 'vitest';
import { summarizeApprovedMarks, offeringApprovedStats, isFailedApprovedMark } from './approvedGradeStats.js';

describe('approvedGradeStats', () => {
  it('counts fail below 50 and builds a curve', () => {
    const summary = summarizeApprovedMarks([
      { current_grade: 78, passed: 1 },
      { current_grade: 40, passed: 0 },
      { current_grade: 95, passed: 1 },
    ]);
    expect(summary.published).toBe(3);
    expect(summary.failed).toBe(1);
    expect(summary.fail_rate).toBe(33.3);
    expect(summary.curve.find((b) => b.key === '70-79').count).toBe(1);
    expect(summary.curve.find((b) => b.key === '0-49').count).toBe(1);
  });

  it('treats missing marks as unpublished', () => {
    expect(isFailedApprovedMark(null, 0)).toBe(false);
    expect(offeringApprovedStats({ enrolled: 10, published: 4, failed: 1, draft: 3 })).toEqual({
      enrolled: 10,
      published_students: 4,
      draft_students: 3,
      failed_students: 1,
      fail_rate: 25,
      published_pct: 40,
    });
  });
});
