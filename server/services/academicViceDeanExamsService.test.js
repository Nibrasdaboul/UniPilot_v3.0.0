import { describe, it, expect } from 'vitest';
import { analyzeExamBoard } from './academicViceDeanExamsService.js';

describe('academic vice dean exam board', () => {
  it('splits published drafts and flags clashes and missing halls', () => {
    const board = {
      halls: [{ id: 1, name: 'A-101' }, { id: 2, name: 'B-202' }],
      offerings: [
        { id: 10, course_code: 'SE101' },
        { id: 11, course_code: 'AI201' },
      ],
      sessions: [
        {
          id: 1, offering_id: 10, hall_id: 1, hall_name: 'A-101', hall_capacity: 80,
          course_code: 'SE101', enrolled_count: 20, is_published: 1,
          starts_at: '2027-02-01T08:00:00Z', ends_at: '2027-02-01T10:00:00Z',
        },
        {
          id: 2, offering_id: 10, hall_id: 1, hall_name: 'A-101', hall_capacity: 10,
          course_code: 'SE101', enrolled_count: 20, is_published: 0,
          starts_at: '2027-02-01T09:00:00Z', ends_at: '2027-02-01T11:00:00Z',
        },
        {
          id: 3, offering_id: 10, hall_id: null, hall_name: null,
          course_code: 'SE101', enrolled_count: 20, is_published: 0,
        },
      ],
    };
    const out = analyzeExamBoard(board);
    expect(out.published).toHaveLength(1);
    expect(out.drafts).toHaveLength(2);
    expect(out.unscheduled.map((o) => o.course_code)).toEqual(['AI201']);
    expect(out.clashes).toHaveLength(1);
    expect(out.shortCapacity).toHaveLength(1);
    expect(out.noHall).toHaveLength(1);
    expect(out.unusedHalls.map((h) => h.name)).toEqual(['B-202']);
    expect(out.issues.some((i) => i.kind === 'clash')).toBe(true);
  });
});
