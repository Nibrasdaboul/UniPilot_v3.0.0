import bcrypt from 'bcryptjs';
import { db } from '../db.js';
import { ALL_ROLES, ROLES, canCreateRole, directoryCreatableRolesFor, canRegisterStudent, canManageAcademicCalendar, canManageCurriculum, canEnterOfficialGrades, canManageStudentAffairs } from '../college/roles.js';
import { nextUniversityId, yearPrefix } from '../college/universityId.js';
import { parseSharedProfile, parseStudentProfile, parseFacultyProfile, parseTaProfile, parseStaffProfile, profileKindForRole } from '../college/userProfiles.js';
import { parseAvatarPayload, saveAvatarFile } from '../college/avatar.js';

function httpError(status, detail) {
  const err = new Error(detail);
  err.status = status;
  return err;
}

function ymd(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  try {
    return new Date(value).toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

export function toPublicUser(row) {
  if (!row) return null;
  const loginId = row.person_code || null;
  return {
    id: row.id,
    university_id: loginId,
    person_code: loginId,
    email: row.email,
    full_name: row.full_name,
    full_name_ar: row.full_name_ar || null,
    full_name_en: row.full_name_en || null,
    role: row.role,
    department_id: row.department_id ?? null,
    department_name: row.department_name || row.name || row.name_en || null,
    department_name_ar: row.department_name_ar || row.name || null,
    enrollment_year: row.enrollment_year ?? null,
    college_id: row.college_id ?? null,
    account_status: row.account_status || 'active',
    avatar_url: row.avatar_url || null,
    phone: row.phone || null,
    created_at: row.created_at,
    creatable_roles: directoryCreatableRolesFor(row.role),
    can_manage_academic: canManageAcademicCalendar(row.role),
    can_manage_curriculum: canManageCurriculum(row.role),
    can_enter_grades: canEnterOfficialGrades(row.role),
    can_manage_student_affairs: canManageStudentAffairs(row.role),
    can_register_students: canRegisterStudent(row.role),
  };
}

export async function loadUserById(id) {
  return db.prepare(`
    SELECT u.id, u.person_code, u.email, u.full_name, u.full_name_ar, u.full_name_en, u.role,
           u.department_id, u.enrollment_year, u.college_id, u.account_status, u.avatar_url, u.phone,
           u.university_id AS org_university_id, u.created_at,
           d.name AS department_name, d.name AS department_name_ar
    FROM users u
    LEFT JOIN departments d ON d.id = u.department_id
    WHERE u.id = ?
  `).get(id);
}

async function resolveDepartment(department_id) {
  let deptId = department_id != null && department_id !== '' ? Number(department_id) : null;
  if (Number.isNaN(deptId)) deptId = null;
  if (deptId != null) {
    const dept = await db.prepare('SELECT id FROM departments WHERE id = ?').get(deptId);
    if (!dept) throw httpError(400, 'Department not found');
  }
  return deptId;
}

async function insertProvisionedUser({ actor, role, password, enrollment_year, department_id, email, shared }) {
  if (!password || String(password).length < 8) {
    throw httpError(400, 'Password must be at least 8 characters');
  }
  const year = enrollment_year != null ? Number(enrollment_year) : new Date().getFullYear();
  yearPrefix(year);
  const deptId = await resolveDepartment(department_id ?? shared.department_id);
  const personCode = await nextUniversityId(year);
  const emailNorm = email && String(email).trim()
    ? String(email).toLowerCase().trim()
    : (shared.email_official || `${personCode}@unipilot.local`);

  const existingEmail = await db.prepare('SELECT id FROM users WHERE email = ?').get(emailNorm);
  if (existingEmail) throw httpError(400, 'Email already used');
  if (shared.national_id) {
    const existingId = await db.prepare('SELECT id FROM users WHERE national_id = ?').get(shared.national_id);
    if (existingId) throw httpError(400, 'National ID already used');
  }

  const hash = bcrypt.hashSync(String(password), 10);
  try {
    const result = await db.prepare(`
      INSERT INTO users (
        person_code, email, password_hash, full_name, full_name_ar, full_name_en,
        role, department_id, enrollment_year, created_by,
        university_id, college_id, terms_accepted_at,
        national_id, gender, birth_date, birth_place, nationality,
        email_official, email_personal, phone, home_address, account_status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      personCode,
      emailNorm,
      hash,
      shared.full_name,
      shared.full_name_ar,
      shared.full_name_en,
      role,
      deptId,
      year,
      actor.id,
      actor.org_university_id ?? actor.university_id_fk ?? null,
      actor.college_id ?? null,
      shared.national_id,
      shared.gender,
      shared.birth_date,
      shared.birth_place,
      shared.nationality,
      shared.email_official,
      shared.email_personal,
      shared.phone,
      shared.home_address,
      shared.account_status,
    );
    return result.lastInsertRowid;
  } catch (e) {
    if (e.code === '23505') throw httpError(400, 'National ID or email already used');
    throw e;
  }
}

async function applyAvatar(userId, body) {
  const parsed = parseAvatarPayload(body?.avatar_base64, body?.avatar_filename);
  if (!parsed) return null;
  const url = saveAvatarFile(userId, parsed);
  await db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(url, userId);
  return url;
}

export async function provisionUser(input) {
  const targetRole = String(input.role || '').trim();
  if (!ALL_ROLES.includes(targetRole) || targetRole === ROLES.ADMIN || targetRole === ROLES.PLATFORM_ADMIN) {
    throw httpError(400, 'This role cannot be created this way');
  }
  if (targetRole === ROLES.STUDENT) {
    throw httpError(403, 'Students are registered only from Student Affairs');
  }
  if (!canCreateRole(input.actor.role, targetRole)) {
    throw httpError(403, 'You are not allowed to create this role');
  }

  const requireCore = Boolean(input.full_name_ar || input.full_name_en || input.national_id);
  const shared = parseSharedProfile(input, { requireCore });
  const id = await insertProvisionedUser({
    actor: input.actor,
    role: targetRole,
    password: input.password,
    enrollment_year: input.enrollment_year,
    department_id: input.department_id,
    email: input.email,
    shared,
  });
  const profile = await saveRoleProfile(id, targetRole, input, input.actor?.college_id ?? null);
  await applyAvatar(id, input);
  const row = await loadUserById(id);
  if (row) row.role_profile = profile;
  return row;
}

async function saveRoleProfile(userId, role, body, collegeId) {
  const kind = profileKindForRole(role);
  const person = await db.prepare('SELECT person_code FROM users WHERE id = ?').get(userId);
  const loginCode = person?.person_code || null;

  if (kind === 'faculty') {
    const profile = parseFacultyProfile(body);
    await db.prepare(`
      INSERT INTO faculty_profiles (
        user_id, employee_code, academic_rank, department_id, general_specialty, specific_specialty,
        highest_degree, degree_university, degree_year, thesis_title, contract_type, teaching_load_hours, start_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (user_id) DO UPDATE SET
        employee_code = EXCLUDED.employee_code, academic_rank = EXCLUDED.academic_rank,
        department_id = EXCLUDED.department_id, general_specialty = EXCLUDED.general_specialty,
        specific_specialty = EXCLUDED.specific_specialty, highest_degree = EXCLUDED.highest_degree,
        degree_university = EXCLUDED.degree_university, degree_year = EXCLUDED.degree_year,
        thesis_title = EXCLUDED.thesis_title, contract_type = EXCLUDED.contract_type,
        teaching_load_hours = EXCLUDED.teaching_load_hours, start_date = EXCLUDED.start_date,
        updated_at = CURRENT_TIMESTAMP
      RETURNING user_id
    `).run(
      userId,
      profile.employee_code || loginCode,
      profile.academic_rank,
      profile.department_id,
      profile.general_specialty,
      profile.specific_specialty,
      profile.highest_degree,
      profile.degree_university,
      profile.degree_year,
      profile.thesis_title,
      profile.contract_type,
      profile.teaching_load_hours,
      profile.start_date,
    );
    return { kind, ...profile, employee_code: profile.employee_code || loginCode };
  }

  if (kind === 'ta') {
    const profile = parseTaProfile(body);
    if (profile.supervisor_user_id) {
      const supervisor = await db.prepare(
        "SELECT id FROM users WHERE id = ? AND role IN ('instructor','department_head','vice_dean_academic','dean')"
      ).get(profile.supervisor_user_id);
      if (!supervisor) throw httpError(400, 'Supervisor not found');
    }
    await db.prepare(`
      INSERT INTO ta_profiles (
        user_id, employee_code, department_id, specialty, supervisor_user_id,
        bachelor_gpa, bachelor_year, postgraduate_studying, postgraduate_program, assigned_labs
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (user_id) DO UPDATE SET
        employee_code = EXCLUDED.employee_code, department_id = EXCLUDED.department_id,
        specialty = EXCLUDED.specialty, supervisor_user_id = EXCLUDED.supervisor_user_id,
        bachelor_gpa = EXCLUDED.bachelor_gpa, bachelor_year = EXCLUDED.bachelor_year,
        postgraduate_studying = EXCLUDED.postgraduate_studying, postgraduate_program = EXCLUDED.postgraduate_program,
        assigned_labs = EXCLUDED.assigned_labs, updated_at = CURRENT_TIMESTAMP
      RETURNING user_id
    `).run(
      userId,
      profile.employee_code || loginCode,
      profile.department_id,
      profile.specialty,
      profile.supervisor_user_id,
      profile.bachelor_gpa,
      profile.bachelor_year,
      profile.postgraduate_studying,
      profile.postgraduate_program,
      profile.assigned_labs,
    );
    return { kind, ...profile, employee_code: profile.employee_code || loginCode };
  }

  if (kind === 'staff') {
    const profile = parseStaffProfile(body, collegeId);
    await db.prepare(`
      INSERT INTO staff_profiles (
        user_id, employee_code, job_title, office_unit, college_id,
        access_permissions, hire_date, employment_type, work_shift
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (user_id) DO UPDATE SET
        employee_code = EXCLUDED.employee_code, job_title = EXCLUDED.job_title,
        office_unit = EXCLUDED.office_unit, college_id = EXCLUDED.college_id,
        access_permissions = EXCLUDED.access_permissions, hire_date = EXCLUDED.hire_date,
        employment_type = EXCLUDED.employment_type, work_shift = EXCLUDED.work_shift,
        updated_at = CURRENT_TIMESTAMP
      RETURNING user_id
    `).run(
      userId,
      profile.employee_code || loginCode,
      profile.job_title,
      profile.office_unit,
      profile.college_id,
      profile.access_permissions,
      profile.hire_date,
      profile.employment_type,
      profile.work_shift,
    );
    return { kind, ...profile, employee_code: profile.employee_code || loginCode };
  }

  return null;
}

export async function provisionStudent(input) {
  if (!canRegisterStudent(input.actor?.role)) {
    throw httpError(403, 'Only Student Affairs can register students');
  }
  const collegeId = input.actor.college_id ?? null;
  const shared = parseSharedProfile(input, { requireCore: true });
  const profile = parseStudentProfile(input, collegeId);
  const id = await insertProvisionedUser({
    actor: input.actor,
    role: ROLES.STUDENT,
    password: input.password,
    enrollment_year: input.enrollment_year,
    department_id: profile.department_id,
    email: input.email || shared.email_official,
    shared,
  });

  await upsertStudentProfile(id, profile);
  await applyAvatar(id, input);
  const existingRecord = await db.prepare('SELECT user_id FROM student_academic_record WHERE user_id = ?').get(id);
  if (!existingRecord) {
    await db.prepare(
      'INSERT INTO student_academic_record (user_id, cgpa, cumulative_percent, total_credits_completed, total_credits_carried) VALUES (?, 0, 0, 0, 0)'
    ).run(id);
  }

  const row = await loadUserById(id);
  const user = toPublicUser(row);
  return { user, profile, university_id: user?.university_id || row?.person_code };
}

async function upsertStudentProfile(userId, profile) {
  await db.prepare(`
    INSERT INTO student_profiles (
      user_id, college_id, department_id, major, study_year, admission_type, academic_status,
      high_school_score, high_school_track, high_school_year,
      emergency_name, emergency_relation, emergency_phone
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (user_id) DO UPDATE SET
      college_id = EXCLUDED.college_id, department_id = EXCLUDED.department_id,
      major = EXCLUDED.major, study_year = EXCLUDED.study_year,
      admission_type = EXCLUDED.admission_type, academic_status = EXCLUDED.academic_status,
      high_school_score = EXCLUDED.high_school_score, high_school_track = EXCLUDED.high_school_track,
      high_school_year = EXCLUDED.high_school_year, emergency_name = EXCLUDED.emergency_name,
      emergency_relation = EXCLUDED.emergency_relation, emergency_phone = EXCLUDED.emergency_phone,
      updated_at = CURRENT_TIMESTAMP
    RETURNING user_id
  `).run(
    userId,
    profile.college_id,
    profile.department_id,
    profile.major,
    profile.study_year,
    profile.admission_type,
    profile.academic_status,
    profile.high_school_score,
    profile.high_school_track,
    profile.high_school_year,
    profile.emergency_name,
    profile.emergency_relation,
    profile.emergency_phone,
  );
}

export function canAccessPersonFile(actor, targetRole) {
  if (!actor) return false;
  if (directoryCreatableRolesFor(actor.role).length > 0) return true;
  return canRegisterStudent(actor.role) && targetRole === ROLES.STUDENT;
}

export async function loadUserDetail(id) {
  const row = await db.prepare(`
    SELECT u.id, u.person_code, u.email, u.full_name, u.full_name_ar, u.full_name_en, u.role,
           u.department_id, u.enrollment_year, u.college_id, u.account_status, u.avatar_url,
           u.national_id, u.gender, u.birth_date, u.birth_place, u.nationality,
           u.email_official, u.email_personal, u.phone, u.home_address,
           u.university_id AS org_university_id, u.created_at,
           d.name AS department_name, d.name AS department_name_ar
    FROM users u
    LEFT JOIN departments d ON d.id = u.department_id
    WHERE u.id = ?
  `).get(id);
  if (!row) return null;
  const kind = profileKindForRole(row.role);
  let profile = null;
  if (row.role === ROLES.STUDENT) {
    profile = await db.prepare('SELECT * FROM student_profiles WHERE user_id = ?').get(id);
  } else if (kind === 'faculty') {
    profile = await db.prepare('SELECT * FROM faculty_profiles WHERE user_id = ?').get(id);
  } else if (kind === 'ta') {
    profile = await db.prepare('SELECT * FROM ta_profiles WHERE user_id = ?').get(id);
  } else if (kind === 'staff') {
    profile = await db.prepare('SELECT * FROM staff_profiles WHERE user_id = ?').get(id);
  }
  return {
    user: {
      ...toPublicUser(row),
      national_id: row.national_id || null,
      gender: row.gender || null,
      birth_date: ymd(row.birth_date),
      birth_place: row.birth_place || null,
      nationality: row.nationality || null,
      email_official: row.email_official || null,
      email_personal: row.email_personal || null,
      phone: row.phone || null,
      home_address: row.home_address || null,
    },
    kind: row.role === ROLES.STUDENT ? 'student' : kind,
    profile: profile ? {
      ...profile,
      start_date: ymd(profile.start_date),
      hire_date: ymd(profile.hire_date),
      access_permissions: profile.access_permissions
        ? String(profile.access_permissions).split(',').filter(Boolean)
        : [],
      postgraduate_studying: Number(profile.postgraduate_studying) === 1,
    } : null,
  };
}

export async function updateUserRecord(actor, id, body) {
  const existing = await db.prepare('SELECT id, role, college_id FROM users WHERE id = ?').get(id);
  if (!existing) throw httpError(404, 'User not found');
  if (!canAccessPersonFile(actor, existing.role)) {
    throw httpError(403, 'You cannot edit this person');
  }
  if (canRegisterStudent(actor.role) && directoryCreatableRolesFor(actor.role).length === 0 && existing.role !== ROLES.STUDENT) {
    throw httpError(403, 'Student Affairs can only edit students');
  }

  const shared = parseSharedProfile(body, { requireCore: true });
  if (shared.national_id) {
    const clash = await db.prepare('SELECT id FROM users WHERE national_id = ? AND id <> ?').get(shared.national_id, id);
    if (clash) throw httpError(400, 'National ID already used');
  }
  const deptId = await resolveDepartment(body.department_id ?? shared.department_id);
  await db.prepare(`
    UPDATE users SET
      full_name = ?, full_name_ar = ?, full_name_en = ?, national_id = ?, gender = ?,
      birth_date = ?, birth_place = ?, nationality = ?, email_official = ?, email_personal = ?,
      phone = ?, home_address = ?, account_status = ?, department_id = ?,
      enrollment_year = COALESCE(?, enrollment_year)
    WHERE id = ?
  `).run(
    shared.full_name,
    shared.full_name_ar,
    shared.full_name_en,
    shared.national_id,
    shared.gender,
    shared.birth_date,
    shared.birth_place,
    shared.nationality,
    shared.email_official,
    shared.email_personal,
    shared.phone,
    shared.home_address,
    shared.account_status,
    deptId,
    body.enrollment_year != null && body.enrollment_year !== '' ? Number(body.enrollment_year) : null,
    id,
  );

  if (body.password && String(body.password).length >= 8) {
    const hash = bcrypt.hashSync(String(body.password), 10);
    await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, id);
  }
  await applyAvatar(id, body);

  if (existing.role === ROLES.STUDENT) {
    await upsertStudentProfile(id, parseStudentProfile(body, existing.college_id ?? actor.college_id ?? null));
  } else {
    await saveRoleProfile(id, existing.role, body, existing.college_id ?? actor.college_id ?? null);
  }
  return loadUserDetail(id);
}
