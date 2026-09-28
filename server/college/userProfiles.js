export const GENDERS = [
  { key: 'male', ar: 'ذكر', en: 'Male' },
  { key: 'female', ar: 'أنثى', en: 'Female' },
];

export const ACCOUNT_STATUSES = [
  { key: 'active', ar: 'نشط', en: 'Active' },
  { key: 'suspended', ar: 'معلق', en: 'Suspended' },
];

export const ADMISSION_TYPES = [
  { key: 'general', ar: 'عام', en: 'General' },
  { key: 'parallel', ar: 'موازي', en: 'Parallel' },
  { key: 'private', ar: 'خاص', en: 'Private' },
  { key: 'regular', ar: 'نظامي', en: 'Regular' },
  { key: 'open', ar: 'مفتوح', en: 'Open' },
];

export const ACADEMIC_STATUSES = [
  { key: 'new', ar: 'مستجد', en: 'New' },
  { key: 'repeating', ar: 'مكرر', en: 'Repeating' },
  { key: 'graduated', ar: 'متخرج', en: 'Graduated' },
  { key: 'withdrawn', ar: 'منقطع', en: 'Withdrawn' },
];

export const HIGH_SCHOOL_TRACKS = [
  { key: 'scientific', ar: 'علمي', en: 'Scientific' },
  { key: 'literary', ar: 'أدبي', en: 'Literary' },
];

export const ACADEMIC_RANKS = [
  { key: 'professor', ar: 'أستاذ', en: 'Professor' },
  { key: 'associate_professor', ar: 'أستاذ مشارك', en: 'Associate professor' },
  { key: 'assistant_professor', ar: 'أستاذ مساعد', en: 'Assistant professor' },
  { key: 'lecturer', ar: 'مدرّس', en: 'Lecturer' },
];

export const HIGHEST_DEGREES = [
  { key: 'phd', ar: 'دكتوراه', en: 'PhD' },
  { key: 'masters', ar: 'ماجستير', en: 'Master' },
];

export const CONTRACT_TYPES = [
  { key: 'permanent', ar: 'دائم', en: 'Permanent' },
  { key: 'full_time', ar: 'متفرغ', en: 'Full-time' },
  { key: 'part_time', ar: 'غير متفرغ / ساعات', en: 'Part-time / hourly' },
];

export const EMPLOYMENT_TYPES = [
  { key: 'administrative', ar: 'إداري', en: 'Administrative' },
  { key: 'permanent', ar: 'دائم', en: 'Permanent' },
  { key: 'temporary', ar: 'مؤقت', en: 'Temporary' },
];

export const WORK_SHIFTS = [
  { key: 'morning', ar: 'صباحي', en: 'Morning' },
  { key: 'evening', ar: 'مسائي', en: 'Evening' },
  { key: 'rotating', ar: 'مناوب', en: 'Rotating' },
];

export const ACCESS_PERMISSIONS = [
  { key: 'enter_grades', ar: 'إدخال درجات', en: 'Enter grades' },
  { key: 'edit_student', ar: 'تعديل بيانات طالب', en: 'Edit student data' },
  { key: 'issue_transcripts', ar: 'إصدار كشوف', en: 'Issue transcripts' },
  { key: 'print_cards', ar: 'طباعة بطاقات', en: 'Print cards' },
  { key: 'manage_exams', ar: 'إدارة الامتحانات', en: 'Manage exams' },
  { key: 'manage_activities', ar: 'إدارة الأنشطة', en: 'Manage activities' },
];

export const FACULTY_ROLES = ['instructor', 'department_head', 'vice_dean_academic', 'dean'];
export const STAFF_ROLES = [
  'student_affairs', 'exams_office', 'hr', 'finance', 'library', 'it', 'quality', 'archive', 'vice_dean_students',
];

export function profileKindForRole(role) {
  if (role === 'teaching_assistant') return 'ta';
  if (role === 'student') return 'student';
  if (FACULTY_ROLES.includes(role)) return 'faculty';
  if (STAFF_ROLES.includes(role)) return 'staff';
  return null;
}

function inCatalog(list, value) {
  return list.some((row) => row.key === value);
}

export function trimOrNull(value) {
  const text = value == null ? '' : String(value).trim();
  return text || null;
}

function httpError(status, detail) {
  const err = new Error(detail);
  err.status = status;
  return err;
}

export function parseSharedProfile(body, { requireCore = false } = {}) {
  const full_name_ar = trimOrNull(body?.full_name_ar);
  const full_name_en = trimOrNull(body?.full_name_en);
  const full_name = trimOrNull(body?.full_name) || full_name_ar || full_name_en;
  const national_id = trimOrNull(body?.national_id);
  const gender = trimOrNull(body?.gender);
  const birth_date = trimOrNull(body?.birth_date);
  const account_status = trimOrNull(body?.account_status) || 'active';

  if (gender && !inCatalog(GENDERS, gender)) throw httpError(400, 'Invalid gender');
  if (account_status && !inCatalog(ACCOUNT_STATUSES, account_status)) throw httpError(400, 'Invalid account status');
  if (birth_date && !/^\d{4}-\d{2}-\d{2}$/.test(birth_date)) throw httpError(400, 'Birth date must be YYYY-MM-DD');

  if (requireCore) {
    if (!full_name_ar || !full_name_en) throw httpError(400, 'Arabic and English names are required');
    if (!national_id) throw httpError(400, 'National ID is required');
    if (!gender) throw httpError(400, 'Gender is required');
    if (!birth_date) throw httpError(400, 'Birth date is required');
  } else if (!full_name || full_name.length < 2) {
    throw httpError(400, 'Full name is required');
  }

  return {
    full_name: (full_name || '').slice(0, 200),
    full_name_ar,
    full_name_en,
    national_id,
    gender,
    birth_date,
    birth_place: trimOrNull(body?.birth_place),
    nationality: trimOrNull(body?.nationality),
    email_official: trimOrNull(body?.email_official)?.toLowerCase() || null,
    email_personal: trimOrNull(body?.email_personal)?.toLowerCase() || null,
    phone: trimOrNull(body?.phone),
    home_address: trimOrNull(body?.home_address),
    account_status,
  };
}

export function parseStudentProfile(body, collegeId) {
  const admission_type = trimOrNull(body?.admission_type) || 'general';
  const academic_status = trimOrNull(body?.academic_status) || 'new';
  const high_school_track = trimOrNull(body?.high_school_track);
  const department_id = body?.department_id != null && body.department_id !== '' ? Number(body.department_id) : null;
  const study_year = body?.study_year != null && body.study_year !== '' ? Number(body.study_year) : null;
  const high_school_score = body?.high_school_score != null && body.high_school_score !== '' ? Number(body.high_school_score) : null;
  const high_school_year = body?.high_school_year != null && body.high_school_year !== '' ? Number(body.high_school_year) : null;

  if (!inCatalog(ADMISSION_TYPES, admission_type)) throw httpError(400, 'Invalid admission type');
  if (!inCatalog(ACADEMIC_STATUSES, academic_status)) throw httpError(400, 'Invalid academic status');
  if (high_school_track && !inCatalog(HIGH_SCHOOL_TRACKS, high_school_track)) throw httpError(400, 'Invalid high-school track');
  if (department_id != null && !Number.isFinite(department_id)) throw httpError(400, 'Department is invalid');
  if (study_year != null && (!Number.isFinite(study_year) || study_year < 1 || study_year > 8)) {
    throw httpError(400, 'Study year must be between 1 and 8');
  }
  if (high_school_score != null && (!Number.isFinite(high_school_score) || high_school_score < 0 || high_school_score > 300)) {
    throw httpError(400, 'High-school score is invalid');
  }

  return {
    college_id: collegeId ?? null,
    department_id,
    major: trimOrNull(body?.major),
    study_year,
    admission_type,
    academic_status,
    high_school_score,
    high_school_track,
    high_school_year: Number.isFinite(high_school_year) ? high_school_year : null,
    emergency_name: trimOrNull(body?.emergency_name),
    emergency_relation: trimOrNull(body?.emergency_relation),
    emergency_phone: trimOrNull(body?.emergency_phone),
  };
}

function parseDate(value, label) {
  const date = trimOrNull(value);
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw httpError(400, `${label} must be YYYY-MM-DD`);
  return date;
}

function parseOptionalNumber(value, label, min, max) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || (min != null && n < min) || (max != null && n > max)) {
    throw httpError(400, `${label} is invalid`);
  }
  return n;
}

function parsePermissionList(value) {
  const raw = Array.isArray(value)
    ? value
    : String(value || '').split(',').map((x) => x.trim()).filter(Boolean);
  const unknown = raw.find((key) => !inCatalog(ACCESS_PERMISSIONS, key));
  if (unknown) throw httpError(400, 'Invalid access permission');
  return raw.length ? raw.join(',') : null;
}

export function parseFacultyProfile(body) {
  const academic_rank = trimOrNull(body?.academic_rank);
  const highest_degree = trimOrNull(body?.highest_degree);
  const contract_type = trimOrNull(body?.contract_type);
  if (academic_rank && !inCatalog(ACADEMIC_RANKS, academic_rank)) throw httpError(400, 'Invalid academic rank');
  if (highest_degree && !inCatalog(HIGHEST_DEGREES, highest_degree)) throw httpError(400, 'Invalid highest degree');
  if (contract_type && !inCatalog(CONTRACT_TYPES, contract_type)) throw httpError(400, 'Invalid contract type');
  return {
    employee_code: trimOrNull(body?.employee_code),
    academic_rank,
    department_id: parseOptionalNumber(body?.faculty_department_id ?? body?.department_id, 'Department'),
    general_specialty: trimOrNull(body?.general_specialty),
    specific_specialty: trimOrNull(body?.specific_specialty),
    highest_degree,
    degree_university: trimOrNull(body?.degree_university),
    degree_year: parseOptionalNumber(body?.degree_year, 'Degree year', 1950, 2099),
    thesis_title: trimOrNull(body?.thesis_title),
    contract_type,
    teaching_load_hours: parseOptionalNumber(body?.teaching_load_hours, 'Teaching load', 0, 40),
    start_date: parseDate(body?.start_date, 'Start date'),
  };
}

export function parseTaProfile(body) {
  return {
    employee_code: trimOrNull(body?.employee_code),
    department_id: parseOptionalNumber(body?.ta_department_id ?? body?.department_id, 'Department'),
    specialty: trimOrNull(body?.specialty),
    supervisor_user_id: parseOptionalNumber(body?.supervisor_user_id, 'Supervisor'),
    bachelor_gpa: parseOptionalNumber(body?.bachelor_gpa, 'Bachelor GPA', 0, 100),
    bachelor_year: parseOptionalNumber(body?.bachelor_year, 'Bachelor year', 1950, 2099),
    postgraduate_studying: body?.postgraduate_studying === true || body?.postgraduate_studying === 1 || body?.postgraduate_studying === '1' ? 1 : 0,
    postgraduate_program: trimOrNull(body?.postgraduate_program),
    assigned_labs: trimOrNull(body?.assigned_labs),
  };
}

export function parseStaffProfile(body, collegeId) {
  const employment_type = trimOrNull(body?.employment_type);
  const work_shift = trimOrNull(body?.work_shift);
  if (employment_type && !inCatalog(EMPLOYMENT_TYPES, employment_type)) throw httpError(400, 'Invalid employment type');
  if (work_shift && !inCatalog(WORK_SHIFTS, work_shift)) throw httpError(400, 'Invalid work shift');
  return {
    employee_code: trimOrNull(body?.employee_code),
    job_title: trimOrNull(body?.job_title),
    office_unit: trimOrNull(body?.office_unit),
    college_id: collegeId ?? null,
    access_permissions: parsePermissionList(body?.access_permissions),
    hire_date: parseDate(body?.hire_date, 'Hire date'),
    employment_type,
    work_shift,
  };
}

export function sharedCatalogs() {
  return { genders: GENDERS, account_statuses: ACCOUNT_STATUSES };
}

export function roleCatalogs() {
  return {
    academic_ranks: ACADEMIC_RANKS,
    highest_degrees: HIGHEST_DEGREES,
    contract_types: CONTRACT_TYPES,
    employment_types: EMPLOYMENT_TYPES,
    work_shifts: WORK_SHIFTS,
    access_permissions: ACCESS_PERMISSIONS,
  };
}

export function studentCatalogs() {
  return {
    admission_types: ADMISSION_TYPES,
    academic_statuses: ACADEMIC_STATUSES,
    high_school_tracks: HIGH_SCHOOL_TRACKS,
  };
}
