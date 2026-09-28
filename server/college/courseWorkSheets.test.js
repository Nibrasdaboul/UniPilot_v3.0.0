import { describe, it, expect } from 'vitest';
import {
  normalizeSheetStatus,
  isSheetAtExams,
  staffCanEditSheet,
  examsCanEditSheet,
  parseTheoryMidtermAutomated,
  publicCourseWorkSheet,
  sheetStatusLabel,
} from './courseWorkSheets.js';

describe('course work sheet workflow', () => {
  it('keeps the five pipeline statuses', () => {
    expect(normalizeSheetStatus(null)).toBe('staff_draft');
    expect(normalizeSheetStatus('at_exams')).toBe('at_exams');
    expect(normalizeSheetStatus('staff_review')).toBe('staff_review');
    expect(normalizeSheetStatus('awaiting_vda')).toBe('awaiting_vda');
    expect(normalizeSheetStatus('published')).toBe('published');
    expect(isSheetAtExams('at_exams')).toBe(true);
    expect(staffCanEditSheet('staff_draft')).toBe(true);
    expect(staffCanEditSheet('at_exams')).toBe(false);
    expect(examsCanEditSheet('at_exams')).toBe(true);
    expect(examsCanEditSheet('staff_review')).toBe(false);
  });

  it('parses the automated midterm flag', () => {
    expect(parseTheoryMidtermAutomated(true).automated).toBe(true);
    expect(parseTheoryMidtermAutomated(0).automated).toBe(false);
    expect(parseTheoryMidtermAutomated('maybe').error).toMatch(/true or false/);
  });

  it('exposes adopt, confirm, and publish on the matching step', () => {
    const draft = publicCourseWorkSheet({ status: 'staff_draft', theory_midterm_automated: 1 }, { canSubmit: true, canSetAutomated: true });
    expect(draft.can_submit).toBe(true);
    expect(draft.can_set_automated).toBe(true);
    const atExams = publicCourseWorkSheet({ status: 'at_exams' }, { canAdopt: true });
    expect(atExams.can_adopt).toBe(true);
    expect(atExams.can_submit).toBe(false);
    const review = publicCourseWorkSheet({ status: 'staff_review' }, { canConfirm: true, needInstructor: true });
    expect(review.can_confirm).toBe(true);
    expect(review.need_instructor_confirm).toBe(true);
    expect(sheetStatusLabel('staff_review', true)).toBe('قيد تدقيق الكادر التدريسي');
    const vda = publicCourseWorkSheet({ status: 'awaiting_vda' }, { canPublish: true });
    expect(vda.can_publish).toBe(true);
    expect(sheetStatusLabel('awaiting_vda', true)).toBe('بانتظار تأكيد نائب العميد');
  });
});
