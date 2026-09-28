import { describe, it, expect } from 'vitest';
import { canEnterOfficialGrades, normalizeRole, ROLES } from './roles.js';
import { computeOfficialFinal, weightedComponents, parseMarkInput, mapCourseWorkToOfficialMarks, assertManualOfficialEntryLocked } from './officialGrades.js';

describe('official grade roles', () => {
  it('exams office and academic leadership enter grades; students do not', () => {
    expect(canEnterOfficialGrades(ROLES.STUDENT)).toBe(false);
    expect(canEnterOfficialGrades(ROLES.STUDENT_AFFAIRS)).toBe(false);
    expect(canEnterOfficialGrades(ROLES.INSTRUCTOR)).toBe(false);
    expect(canEnterOfficialGrades(ROLES.EXAMS_OFFICE)).toBe(true);
    expect(canEnterOfficialGrades('exams_officer')).toBe(true);
    expect(canEnterOfficialGrades(ROLES.VICE_DEAN_ACADEMIC)).toBe(true);
    expect(canEnterOfficialGrades(ROLES.DEAN)).toBe(true);
    expect(normalizeRole('exams_officer')).toBe(ROLES.EXAMS_OFFICE);
  });
});

describe('official final mark', () => {
  const weights = weightedComponents({
    weight_sai: 20,
    weight_theory: 20,
    weight_practical: 20,
    weight_midterm: 10,
    weight_practical_midterm: 10,
    weight_practical_final: 10,
    weight_theory_final: 10,
  });

  it('uses every weighted component', () => {
    expect(weights).toHaveLength(7);
    const r = computeOfficialFinal(weights, {
      sai: { score: 80, max_score: 100 },
      theory: { score: 80, max_score: 100 },
      practical: { score: 80, max_score: 100 },
      midterm: { score: 80, max_score: 100 },
      practical_midterm: { score: 80, max_score: 100 },
      practical_final: { score: 80, max_score: 100 },
      theory_final: { score: 80, max_score: 100 },
    });
    expect(r.complete).toBe(true);
    expect(r.final).toBe(80);
    expect(r.passed).toBe(true);
  });

  it('stays incomplete until every component is entered', () => {
    const r = computeOfficialFinal(weights, { midterm: { score: 77, max_score: 100 } });
    expect(r.complete).toBe(false);
    expect(r.missing).toContain('sai');
  });

  it('rejects scores above the max', () => {
    expect(() => parseMarkInput(120, 100)).toThrow(/between 0 and 100/);
    expect(parseMarkInput('', 100)).toBe(null);
    expect(parseMarkInput(77, 100)).toBe(77);
  });
});

describe('mapCourseWorkToOfficialMarks', () => {
  it('maps staff course-work cells onto official components', () => {
    const mapped = mapCourseWorkToOfficialMarks({
      midterm_theory: { score: 20, max_score: 20 },
      sai_theory: { score: 13, max_score: 20 },
      final_theory: { score: 100, max_score: 100 },
      practical: { score: 16, max_score: 20 },
    });
    expect(mapped.midterm).toEqual({ score: 20, max_score: 20 });
    expect(mapped.sai).toEqual({ score: 13, max_score: 20 });
    expect(mapped.theory).toEqual({ score: 100, max_score: 100 });
    expect(mapped.theory_final).toEqual({ score: 100, max_score: 100 });
    expect(mapped.practical).toEqual({ score: 16, max_score: 20 });
    expect(mapped.practical_final).toEqual({ score: 16, max_score: 20 });
    const weightedOnly = mapCourseWorkToOfficialMarks({
      midterm_theory: { score: 20, max_score: 20 },
      sai_theory: { score: 13, max_score: 20 },
      final_theory: { score: 100, max_score: 100 },
      practical: { score: 16, max_score: 20 },
    }, { components: [{ key: 'sai' }, { key: 'midterm' }, { key: 'theory' }, { key: 'practical' }] });
    expect(weightedOnly.theory_final).toBeUndefined();
    expect(weightedOnly.practical_final).toBeUndefined();
    expect(weightedOnly.theory).toEqual({ score: 100, max_score: 100 });
  });

  it('locks manual official-page save and publish', () => {
    try {
      assertManualOfficialEntryLocked();
      throw new Error('expected lock');
    } catch (err) {
      expect(err.status).toBe(403);
      expect(err.message).toMatch(/course-work/i);
    }
  });

  it('skips empty course-work cells', () => {
    const mapped = mapCourseWorkToOfficialMarks({
      sai_theory: { score: null, max_score: 20 },
      midterm_theory: { score: 10, max_score: 20 },
    });
    expect(mapped.sai).toBeUndefined();
    expect(mapped.midterm).toEqual({ score: 10, max_score: 20 });
  });
});
