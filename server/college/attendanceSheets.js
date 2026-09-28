export const ATTENDANCE_SHEET_STATUSES = [
  'staff_draft',
  'at_exams',
  'staff_review',
  'awaiting_vda',
  'published',
];

export const ATTENDANCE_SHEET_LABELS = {
  ar: {
    staff_draft: 'قيد تسجيل الكادر',
    at_exams: 'عند دائرة الامتحانات',
    staff_review: 'قيد تأكيد الكادر',
    awaiting_vda: 'بانتظار تأكيد نائب العميد',
    published: 'أُرسلت التنبيهات / الحرمان',
  },
  en: {
    staff_draft: 'With teaching staff',
    at_exams: 'At the Exams Office',
    staff_review: 'Under teaching-staff confirmation',
    awaiting_vda: 'Awaiting vice dean',
    published: 'Warnings / deprivation sent',
  },
};

export function normalizeAttendanceSheetStatus(value) {
  const status = String(value || '').trim();
  return ATTENDANCE_SHEET_STATUSES.includes(status) ? status : 'staff_draft';
}

export function attendanceSheetLabel(status, ar) {
  const key = normalizeAttendanceSheetStatus(status);
  return (ar ? ATTENDANCE_SHEET_LABELS.ar : ATTENDANCE_SHEET_LABELS.en)[key];
}

export function staffCanEditAttendance(status) {
  return normalizeAttendanceSheetStatus(status) === 'staff_draft';
}

export function examsCanEditAttendance(status) {
  const s = normalizeAttendanceSheetStatus(status);
  return s === 'staff_draft' || s === 'at_exams';
}

export function publicAttendanceSheet(row, actions = {}) {
  const status = normalizeAttendanceSheetStatus(row?.status);
  return {
    status,
    submitted_at: row?.submitted_at || null,
    instructor_confirmed: Boolean(row?.instructor_confirmed_at),
    ta_confirmed: Boolean(row?.ta_confirmed_at),
    need_instructor_confirm: Boolean(actions.needInstructor),
    need_ta_confirm: Boolean(actions.needTa),
    can_submit: Boolean(actions.canSubmit) && status === 'staff_draft',
    can_adopt: Boolean(actions.canAdopt) && status === 'at_exams',
    can_confirm: Boolean(actions.canConfirm) && status === 'staff_review',
    can_publish: Boolean(actions.canPublish) && status === 'awaiting_vda',
    can_cancel: Boolean(actions.canCancel) && status === 'awaiting_vda',
    published: status === 'published',
  };
}
