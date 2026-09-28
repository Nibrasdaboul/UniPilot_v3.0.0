export const WITHDRAWN_LETTER = 'W';

function isFlagged(value) {
  return value == 1 || value === true || value === '1';
}

export function isOfficialWithdrawal(course) {
  return isFlagged(course?.withdrawn) && course?.withdrawn_at != null;
}

export function isCancelledRegistration(course) {
  return isFlagged(course?.withdrawn) && course?.withdrawn_at == null;
}

const EMPTY_CELL = { score: null, max_score: 100, practical_kind: null };

export function hideWithdrawnMarks(course) {
  if (!isOfficialWithdrawal(course)) return course;
  const next = {
    ...course,
    withdrawn_w: true,
    deprived: false,
    current_grade: null,
    progress: null,
    percent: null,
    gpa_points: null,
    passed: null,
    letter_grade: WITHDRAWN_LETTER,
    registered: false,
  };
  if (course.mark_details) {
    next.mark_details = {
      midterm_theory: { ...EMPTY_CELL },
      sai_theory: { ...EMPTY_CELL },
      final_theory: { ...EMPTY_CELL },
      practical: { ...EMPTY_CELL, practical_kind: 'exam' },
    };
    next.mark_details_ar = WITHDRAWN_LETTER;
    next.mark_details_en = WITHDRAWN_LETTER;
  }
  return next;
}
