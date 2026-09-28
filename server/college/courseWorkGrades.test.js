import { describe, it, expect } from 'vitest';
import { parseCourseWorkMark, parseCourseWorkComponent, parsePracticalKind, canEditCourseWorkComponent, isAutomatedTheoryComponent, computeCourseWorkPercent } from './courseWorkGrades.js';

describe('course work grade helpers', () => {
  it('accepts the four course-card components', () => {
    expect(parseCourseWorkComponent('midterm_theory').component).toBe('midterm_theory');
    expect(parseCourseWorkComponent('sai_theory').component).toBe('sai_theory');
    expect(parseCourseWorkComponent('final_theory').component).toBe('final_theory');
    expect(parseCourseWorkComponent('practical').component).toBe('practical');
    expect(parseCourseWorkComponent('final').error).toMatch(/final_theory/);
  });

  it('validates score against max and practical kind', () => {
    expect(parseCourseWorkMark({ component: 'midterm_theory', score: 18, max_score: 20 }).score).toBe(18);
    expect(parseCourseWorkMark({ component: 'sai_theory', score: 21, max_score: 20 }).error).toMatch(/0 and 20/);
    expect(parseCourseWorkMark({ component: 'practical', score: 15, practical_kind: 'project' }).practical_kind).toBe('project');
    expect(parsePracticalKind('quiz').error).toMatch(/exam, project, or eval/);
  });

  it('lets instructors edit theory only and TAs edit practical only', () => {
    expect(canEditCourseWorkComponent('instructor', 'midterm_theory').ok).toBe(true);
    expect(canEditCourseWorkComponent('doctor', 'sai_theory').ok).toBe(true);
    expect(canEditCourseWorkComponent('instructor', 'practical').ok).toBe(false);
    expect(canEditCourseWorkComponent('teaching_assistant', 'practical').ok).toBe(true);
    expect(canEditCourseWorkComponent('engineer', 'practical').ok).toBe(true);
    expect(canEditCourseWorkComponent('teaching_assistant', 'sai_theory').ok).toBe(false);
    expect(canEditCourseWorkComponent('vice_dean_academic', 'midterm_theory').ok).toBe(false);
    expect(canEditCourseWorkComponent('exams_office', 'midterm_theory').ok).toBe(true);
    expect(canEditCourseWorkComponent('exams_office', 'sai_theory').ok).toBe(true);
    expect(canEditCourseWorkComponent('instructor', 'final_theory').ok).toBe(true);
    expect(canEditCourseWorkComponent('exams_office', 'final_theory').ok).toBe(true);
    expect(canEditCourseWorkComponent('exams_office', 'practical').ok).toBe(true);
    expect(canEditCourseWorkComponent('exams_officer', 'practical').ok).toBe(true);
    expect(canEditCourseWorkComponent('teaching_assistant', 'final_theory').ok).toBe(false);
    expect(isAutomatedTheoryComponent('midterm_theory')).toBe(true);
    expect(isAutomatedTheoryComponent('final_theory')).toBe(true);
    expect(isAutomatedTheoryComponent('sai_theory')).toBe(false);
  });

  it('computes a weighted or equal course percent', () => {
    const row = {
      midterm_theory: { score: 20, max_score: 20 },
      sai_theory: { score: 10, max_score: 20 },
      final_theory: { score: 20, max_score: 20 },
      practical: { score: 10, max_score: 20 },
    };
    expect(computeCourseWorkPercent(row, { weight_midterm: 25, weight_sai: 25, weight_theory: 25, weight_practical: 25 })).toBe(75);
    expect(computeCourseWorkPercent({ midterm_theory: { score: 10, max_score: 20 } })).toBe(50);
  });
});
