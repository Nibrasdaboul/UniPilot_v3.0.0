import { normalizeRole, ROLES } from './roles.js';

export const STAFF_ROLES = [
  { key: 'instructor', ar: 'مدرّس', en: 'Instructor', legacy: 'doctor' },
  { key: 'teaching_assistant', ar: 'معيد', en: 'Teaching assistant', legacy: 'engineer' },
];

export const SECTION_KINDS = [
  { key: 'theory', ar: 'نظري', en: 'Theory', staffRole: 'instructor' },
  { key: 'practical', ar: 'عملي', en: 'Practical', staffRole: 'teaching_assistant' },
];

export const WEEKDAYS = [
  { key: 'friday', ar: 'الجمعة', en: 'Friday' },
  { key: 'saturday', ar: 'السبت', en: 'Saturday' },
  { key: 'sunday', ar: 'الأحد', en: 'Sunday' },
  { key: 'monday', ar: 'الاثنين', en: 'Monday' },
  { key: 'tuesday', ar: 'الثلاثاء', en: 'Tuesday' },
  { key: 'wednesday', ar: 'الأربعاء', en: 'Wednesday' },
  { key: 'thursday', ar: 'الخميس', en: 'Thursday' },
];

export const TIME_SLOTS = [
  { key: '08-10', ar: '8 إلى 10', en: '8 to 10' },
  { key: '10-12', ar: '10 إلى 12', en: '10 to 12' },
  { key: '12-14', ar: '12 إلى 2', en: '12 to 2' },
  { key: '14-16', ar: '2 إلى 4', en: '2 to 4' },
];

export function normalizeStaffRole(value) {
  const v = String(value || '').trim();
  if (v === 'doctor' || v === ROLES.INSTRUCTOR) return 'instructor';
  if (v === 'engineer' || v === ROLES.TEACHING_ASSISTANT) return 'teaching_assistant';
  return null;
}

export function userMatchesStaffRole(userRole, staffRole) {
  const want = normalizeStaffRole(staffRole);
  const have = normalizeRole(userRole);
  if (!want || !have) return false;
  if (want === 'instructor') return have === ROLES.INSTRUCTOR;
  if (want === 'teaching_assistant') return have === ROLES.TEACHING_ASSISTANT;
  return false;
}

export function isSectionKind(value) {
  return SECTION_KINDS.some((k) => k.key === value);
}

export function isWeekday(value) {
  return WEEKDAYS.some((d) => d.key === value);
}

export function isTimeSlot(value) {
  return TIME_SLOTS.some((s) => s.key === value);
}
