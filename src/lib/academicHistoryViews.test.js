import { describe, it, expect } from 'vitest';
import {
  historyViewFromPath,
  isCgpaAtRisk,
  isProgressTermFinished,
  pickCurrentHistoryTerm,
  progressRowsFromTerms,
  termsForHistoryView,
} from './academicHistoryViews.js';

const winter = { key: 'term-4', name: 'شتاء 2027', is_current: 1, is_closed: 0 };
const fall = { key: 'term-2', name: 'Fall 2026', is_current: 0, is_closed: 1 };

describe('academicHistoryViews', () => {
  it('treats /academic-history as the current-term view', () => {
    expect(historyViewFromPath('/academic-history')).toBe('current');
    expect(historyViewFromPath('/academic-history/all')).toBe('all');
    expect(historyViewFromPath('/academic-history/progress')).toBe('progress');
  });

  it('picks the open current term', () => {
    expect(pickCurrentHistoryTerm([winter, fall])).toEqual(winter);
  });

  it('shows only the current term on the default view', () => {
    expect(termsForHistoryView([winter, fall], 'current')).toEqual([winter]);
    expect(termsForHistoryView([winter, fall], 'all')).toEqual([winter, fall]);
  });

  it('keeps every term on the all-terms view, including closed ones', () => {
    const autumn = { key: 'term-1', name: 'خريف 2026', is_current: 0, is_closed: 0 };
    const all = termsForHistoryView([winter, fall, autumn], 'all');
    expect(all).toHaveLength(3);
    expect(all.map((term) => term.name)).toEqual(['شتاء 2027', 'Fall 2026', 'خريف 2026']);
  });

  it('builds chronological progress rows with GPA columns', () => {
    const rows = progressRowsFromTerms([
      { ...winter, starts_on: '2027-01-01', semester_gpa: 1.75, semester_percent: 45, cgpa: 2.88, cumulative_percent: 72.5 },
      { ...fall, starts_on: '2026-09-01', semester_gpa: 4, semester_percent: 100, cgpa: 4, cumulative_percent: 100 },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe('Fall 2026');
    expect(rows[0].semester_gpa).toBe(4);
    expect(rows[0].cgpa).toBe(4);
    expect(rows[0].at_risk).toBe(false);
    expect(rows[1].name).toBe('شتاء 2027');
    expect(rows[1].semester_percent).toBe(45);
    expect(rows[1].finished).toBe(false);
    expect(rows[1].at_risk).toBe(false);
  });

  it('marks finished terms with CGPA under 2.00 as at risk', () => {
    expect(isProgressTermFinished(fall)).toBe(true);
    expect(isProgressTermFinished(winter)).toBe(false);
    expect(isCgpaAtRisk(1.75, true)).toBe(true);
    expect(isCgpaAtRisk(2, true)).toBe(false);
    expect(isCgpaAtRisk(1.5, false)).toBe(false);

    const rows = progressRowsFromTerms([
      {
        key: 'term-x',
        name: 'فصل ضعيف',
        starts_on: '2025-01-01',
        is_current: 0,
        is_closed: 1,
        semester_gpa: 1.2,
        semester_percent: 40,
        cgpa: 1.5,
        cumulative_percent: 42,
      },
      {
        ...winter,
        starts_on: '2027-01-01',
        semester_gpa: 1.75,
        semester_percent: 45,
        cgpa: 1.75,
        cumulative_percent: 45,
      },
    ]);
    expect(rows[0].at_risk).toBe(true);
    expect(rows[0].warning).toBe(true);
    expect(rows[1].at_risk).toBe(false);
  });
});
