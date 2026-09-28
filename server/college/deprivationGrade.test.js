import { describe, it, expect } from 'vitest';
import { applyDeprivationStanding, standingToPersistOnTermClose, DEPRIVATION_STANDING } from './deprivationGrade.js';
import { computeUnweightedTerm } from './unweightedGpa.js';

describe('deprivationGrade', () => {
  it('leaves a non-deprived course unchanged', () => {
    const course = { current_grade: 90, percent: 90, gpa_points: 3.5, letter_grade: 'A-' };
    expect(applyDeprivationStanding(course, false)).toEqual(course);
  });

  it('forces 0 / 0% / 0 / F when deprived', () => {
    const next = applyDeprivationStanding({
      current_grade: 84.29,
      percent: 84.29,
      gpa_points: 3.25,
      letter_grade: 'B+',
      passed: 1,
      registered: true,
    }, true);
    expect(next).toMatchObject(DEPRIVATION_STANDING);
    expect(next.registered).toBe(false);
    expect(next.deprived).toBe(true);
  });

  it('counts the zero into the semester GPA', () => {
    const stats = computeUnweightedTerm([
      { percent: 90, gpa_points: 3.5 },
      applyDeprivationStanding({ percent: 84, gpa_points: 3 }, true),
    ]);
    expect(stats.course_count).toBe(2);
    expect(stats.semester_gpa).toBe(1.75);
    expect(stats.semester_percent).toBe(45);
  });

  it('path A: lift before close keeps the stored grade when the term closes', () => {
    const stored = {
      current_grade: 84.29,
      percent: 84.29,
      gpa_points: 3,
      letter_grade: 'B',
      passed: 1,
    };
    const persisted = standingToPersistOnTermClose(stored, false);
    expect(persisted).toEqual(stored);
    expect(applyDeprivationStanding(persisted, false)).toMatchObject({
      current_grade: 84.29,
      percent: 84.29,
      letter_grade: 'B',
    });
  });

  it('path B: close while deprived then lift still shows the locked 0 / F', () => {
    const stored = {
      current_grade: 84.29,
      percent: 84.29,
      gpa_points: 3,
      letter_grade: 'B',
      passed: 1,
    };
    const locked = standingToPersistOnTermClose(stored, true);
    expect(locked).toMatchObject(DEPRIVATION_STANDING);
    expect(applyDeprivationStanding(locked, false)).toMatchObject({
      current_grade: 0,
      percent: 0,
      gpa_points: 0,
      letter_grade: 'F',
      passed: 0,
    });
  });
});
