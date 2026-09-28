import { describe, it, expect } from 'vitest';
import { isOfficialWithdrawal, isCancelledRegistration, hideWithdrawnMarks } from './withdrawalMarks.js';

describe('withdrawal kinds', () => {
  it('official withdrawal needs a withdrawal time', () => {
    expect(isOfficialWithdrawal({ withdrawn: 1, withdrawn_at: '2026-09-27T20:00:00Z' })).toBe(true);
    expect(isOfficialWithdrawal({ withdrawn: 1, withdrawn_at: null })).toBe(false);
    expect(isOfficialWithdrawal({ withdrawn: 0, withdrawn_at: null })).toBe(false);
  });

  it('cancelled registration has no withdrawal time', () => {
    expect(isCancelledRegistration({ withdrawn: 1, withdrawn_at: null })).toBe(true);
    expect(isCancelledRegistration({ withdrawn: 1, withdrawn_at: '2026-09-27T20:00:00Z' })).toBe(false);
  });
});

describe('hideWithdrawnMarks', () => {
  it('leaves normal courses untouched', () => {
    const course = { id: 1, withdrawn: 0, current_grade: 80 };
    expect(hideWithdrawnMarks(course)).toBe(course);
  });

  it('hides every mark and shows W', () => {
    const out = hideWithdrawnMarks({
      id: 2,
      withdrawn: 1,
      withdrawn_at: '2026-09-27T20:00:00Z',
      current_grade: 84.29,
      percent: 84.29,
      gpa_points: 3.3,
      passed: 1,
      deprived: true,
      letter_grade: 'B+',
      mark_details: { midterm_theory: { score: 20, max_score: 30 } },
    });
    expect(out.withdrawn_w).toBe(true);
    expect(out.current_grade).toBeNull();
    expect(out.percent).toBeNull();
    expect(out.gpa_points).toBeNull();
    expect(out.passed).toBeNull();
    expect(out.deprived).toBe(false);
    expect(out.letter_grade).toBe('W');
    expect(out.mark_details.midterm_theory.score).toBeNull();
    expect(out.mark_details_ar).toBe('W');
  });
});
