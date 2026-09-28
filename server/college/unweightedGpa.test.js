import { describe, it, expect } from 'vitest';
import {
  averageNumbers,
  honorRankFromPercent,
  computeUnweightedTerm,
  computeRunningCumulative,
  sortHistoryTermsForDisplay,
} from './unweightedGpa.js';

describe('unweightedGpa', () => {
  it('averages course points without credit weights', () => {
    const stats = computeUnweightedTerm([
      { current_grade: 78, percent: 78, gpa_points: 2.75, credit_hours: 3 },
      { current_grade: 95, percent: 95, gpa_points: 3.75, credit_hours: 6 },
    ]);
    expect(stats.course_count).toBe(2);
    expect(stats.semester_gpa).toBe(3.25);
    expect(stats.semester_percent).toBe(86.5);
  });

  it('ignores unfinished and withdrawn courses', () => {
    const stats = computeUnweightedTerm([
      { current_grade: 78, percent: 78, gpa_points: 2.75 },
      { current_grade: null, percent: null, gpa_points: null },
      { current_grade: 40, percent: 40, gpa_points: 0, withdrawn: 1 },
    ]);
    expect(stats.course_count).toBe(1);
    expect(stats.semester_gpa).toBe(2.75);
  });

  it('averages semester GPAs for cumulative', () => {
    const rows = computeRunningCumulative([
      { semester_gpa: 2.75, semester_percent: 78 },
      { semester_gpa: 3.25, semester_percent: 86 },
    ]);
    expect(rows[0].cgpa).toBe(2.75);
    expect(rows[1].cgpa).toBe(3);
    expect(rows[1].cumulative_percent).toBe(82);
    expect(rows[1].terms_counted).toBe(2);
  });

  it('skips empty terms in the cumulative count', () => {
    const rows = computeRunningCumulative([
      { semester_gpa: 3, semester_percent: 80 },
      { semester_gpa: null, semester_percent: null },
    ]);
    expect(rows[1].cgpa).toBe(3);
    expect(rows[1].terms_counted).toBe(1);
  });

  it('maps percent to امتياز…راسب', () => {
    expect(honorRankFromPercent(97).ar).toBe('امتياز');
    expect(honorRankFromPercent(85).ar).toBe('جيد جداً');
    expect(honorRankFromPercent(72).ar).toBe('جيد');
    expect(honorRankFromPercent(63).ar).toBe('مقبول');
    expect(honorRankFromPercent(52).ar).toBe('ضعيف');
    expect(honorRankFromPercent(40).ar).toBe('راسب');
    expect(honorRankFromPercent(null)).toBeNull();
  });

  it('puts the open current term first', () => {
    const rows = sortHistoryTermsForDisplay([
      { name: 'Fall', is_current: 0, is_closed: 0, starts_on: '2026-09-01' },
      { name: 'Winter', is_current: 1, is_closed: 0, starts_on: '2027-01-21' },
    ]);
    expect(rows[0].name).toBe('Winter');
  });

  it('averageNumbers ignores empty values but keeps zero', () => {
    expect(averageNumbers([0, 4])).toBe(2);
    expect(averageNumbers([null, undefined])).toBeNull();
  });
});
