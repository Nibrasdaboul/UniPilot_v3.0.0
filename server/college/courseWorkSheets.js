export const COURSE_WORK_SHEET_STATUSES = [
  'staff_draft',
  'at_exams',
  'staff_review',
  'awaiting_vda',
  'published',
];

export const COURSE_WORK_SHEET_LABELS = {
  ar: {
    staff_draft: 'قيد إدخال الكادر',
    at_exams: 'عند دائرة الامتحانات',
    staff_review: 'قيد تدقيق الكادر التدريسي',
    awaiting_vda: 'بانتظار تأكيد نائب العميد',
    published: 'أُرسلت للطلاب',
  },
  en: {
    staff_draft: 'With teaching staff',
    at_exams: 'At the Exams Office',
    staff_review: 'Under teaching-staff review',
    awaiting_vda: 'Awaiting vice dean confirmation',
    published: 'Sent to students',
  },
};

export function normalizeSheetStatus(value) {
  const status = String(value || '').trim();
  return COURSE_WORK_SHEET_STATUSES.includes(status) ? status : 'staff_draft';
}

export function sheetStatusLabel(status, ar) {
  const key = normalizeSheetStatus(status);
  return (ar ? COURSE_WORK_SHEET_LABELS.ar : COURSE_WORK_SHEET_LABELS.en)[key];
}

export function isSheetAtExams(status) {
  return normalizeSheetStatus(status) === 'at_exams';
}

export function staffCanEditSheet(status) {
  return normalizeSheetStatus(status) === 'staff_draft';
}

export function examsCanEditSheet(status) {
  const s = normalizeSheetStatus(status);
  return s === 'staff_draft' || s === 'at_exams';
}

export function parseTheoryMidtermAutomated(value) {
  if (value === true || value === 1 || value === '1' || String(value).trim().toLowerCase() === 'true') {
    return { error: null, automated: true };
  }
  if (value === false || value === 0 || value === '0' || String(value).trim().toLowerCase() === 'false') {
    return { error: null, automated: false };
  }
  return { error: 'theory_midterm_automated must be true or false' };
}

export function publicCourseWorkSheet(row, actions = {}) {
  const status = normalizeSheetStatus(row?.status);
  const instructorConfirmed = Boolean(row?.instructor_confirmed_at);
  const taConfirmed = Boolean(row?.ta_confirmed_at);
  return {
    status,
    theory_midterm_automated: Boolean(Number(row?.theory_midterm_automated) || row?.theory_midterm_automated === true),
    submitted_at: row?.submitted_at || null,
    instructor_confirmed: instructorConfirmed,
    ta_confirmed: taConfirmed,
    need_instructor_confirm: Boolean(actions.needInstructor),
    need_ta_confirm: Boolean(actions.needTa),
    can_submit: Boolean(actions.canSubmit) && status === 'staff_draft',
    can_set_automated: Boolean(actions.canSetAutomated) && status === 'staff_draft',
    can_adopt: Boolean(actions.canAdopt) && status === 'at_exams',
    can_confirm: Boolean(actions.canConfirm) && status === 'staff_review',
    can_publish: Boolean(actions.canPublish) && status === 'awaiting_vda',
    published: status === 'published',
  };
}
