import { describe, expect, it } from 'vitest';
import { activeRosterStudents, mergeRosterRows, rosterEditState } from './courseRoster.js';

describe('course roster', () => {
  it('keeps withdrawn students in order with a flag', () => {
    const roster = mergeRosterRows([
      { user_id: 3, full_name: 'Ali', person_code: '0260000003', status: 'withdrawn' },
      { user_id: 7, full_name: 'Sara', person_code: '0260000007', status: 'enrolled' },
    ]);
    expect(roster).toEqual([
      { user_id: 3, full_name: 'Ali', person_code: '0260000003', withdrawn: true },
      { user_id: 7, full_name: 'Sara', person_code: '0260000007', withdrawn: false },
    ]);
  });

  it('treats a student as active when any offering is still enrolled', () => {
    const roster = mergeRosterRows([
      { user_id: 3, full_name: 'Ali', status: 'withdrawn' },
      { user_id: 3, full_name: 'Ali', status: 'enrolled' },
    ]);
    expect(roster).toHaveLength(1);
    expect(roster[0].withdrawn).toBe(false);
  });

  it('filters withdrawn students out of active work', () => {
    expect(activeRosterStudents([{ user_id: 1, withdrawn: true }, { user_id: 2, withdrawn: false }]))
      .toEqual([{ user_id: 2, withdrawn: false }]);
  });

  it('locks edits for withdrawn students', () => {
    expect(rosterEditState(['enrolled'])).toBe('editable');
    expect(rosterEditState(['withdrawn', 'enrolled'])).toBe('editable');
    expect(rosterEditState(['withdrawn'])).toBe('withdrawn');
    expect(rosterEditState([])).toBe('not_enrolled');
  });
});
