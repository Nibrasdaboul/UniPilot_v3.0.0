export const COMPLAINT_TYPES = [
  { key: 'academic', ar: 'أكاديمية', en: 'Academic' },
  { key: 'administrative', ar: 'إدارية', en: 'Administrative' },
  { key: 'financial', ar: 'مالية', en: 'Financial' },
  { key: 'facility', ar: 'قاعات ومرافق', en: 'Facilities' },
  { key: 'conduct', ar: 'سلوكية', en: 'Conduct' },
  { key: 'other', ar: 'أخرى', en: 'Other' },
];

export const COMPLAINT_STATUSES = [
  { key: 'open', ar: 'مفتوحة', en: 'Open' },
  { key: 'in_review', ar: 'قيد المتابعة', en: 'In review' },
  { key: 'resolved', ar: 'محلولة', en: 'Resolved' },
  { key: 'rejected', ar: 'مرفوضة', en: 'Rejected' },
];

export const CASE_TYPES = [
  { key: 'disciplinary', ar: 'انضباطية', en: 'Disciplinary' },
  { key: 'academic', ar: 'أكاديمية', en: 'Academic' },
  { key: 'financial', ar: 'مالية', en: 'Financial' },
  { key: 'other', ar: 'أخرى', en: 'Other' },
];

export const CASE_STATUSES = [
  { key: 'open', ar: 'مفتوحة', en: 'Open' },
  { key: 'in_review', ar: 'قيد المتابعة', en: 'In review' },
  { key: 'closed', ar: 'مغلقة', en: 'Closed' },
];

export function isComplaintType(value) {
  return COMPLAINT_TYPES.some((t) => t.key === value);
}

export function isComplaintStatus(value) {
  return COMPLAINT_STATUSES.some((s) => s.key === value);
}

export function isCaseType(value) {
  return CASE_TYPES.some((t) => t.key === value);
}

export function isCaseStatus(value) {
  return CASE_STATUSES.some((s) => s.key === value);
}

export function activityHasRoom(signedCount, capacity) {
  const taken = Number(signedCount) || 0;
  const cap = Number(capacity);
  if (!Number.isFinite(cap) || cap < 1) return false;
  return taken < cap;
}
