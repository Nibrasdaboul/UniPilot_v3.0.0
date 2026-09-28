import { describe, it, expect } from 'vitest';
import { offeringGradeProgress } from './academicViceDeanGradesService.js';

describe('academic vice dean grade progress', () => {
  it('marks an offering closed only when every enrolled student is published', () => {
    expect(offeringGradeProgress({ enrolled: 10, publishedStudents: 10, draftStudents: 0 })).toEqual({
      published_pct: 100,
      closed: true,
      ready_to_approve: false,
    });
    expect(offeringGradeProgress({ enrolled: 10, publishedStudents: 4, draftStudents: 6 })).toEqual({
      published_pct: 40,
      closed: false,
      ready_to_approve: true,
    });
    expect(offeringGradeProgress({ enrolled: 0, publishedStudents: 0, draftStudents: 0 })).toEqual({
      published_pct: 0,
      closed: false,
      ready_to_approve: false,
    });
  });
});
