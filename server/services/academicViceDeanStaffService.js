import { db } from '../db.js';
import { getDeanAcademic } from './deanAcademicService.js';
import { getStaffBoard } from './teachingStaffService.js';
import { normalizeStaffRole } from '../college/teachingStaff.js';

export const VDA_DEFAULT_LOAD = {
  instructor: 12,
  teaching_assistant: 8,
};

export const VDA_UNDERLOAD_RATIO = 0.75;

function httpError(status, detail) {
  const err = new Error(detail);
  err.status = status;
  throw err;
}

function n(value) {
  return Number(value) || 0;
}

function collegeId(user) {
  const cid = user?.college_id != null ? Number(user.college_id) : null;
  if (cid == null) httpError(400, 'Vice Dean is not attached to a college');
  return cid;
}

export function legalLoadHours(role, stored) {
  if (stored != null && stored !== '') return n(stored);
  const key = normalizeStaffRole(role) || role;
  return VDA_DEFAULT_LOAD[key] ?? VDA_DEFAULT_LOAD.instructor;
}

export function loadStatus({ assigned, legal }) {
  const a = n(assigned);
  const L = legal == null ? null : n(legal);
  if (L == null || L <= 0) return a > 0 ? 'unspecified' : 'unassigned';
  if (a > L) return 'overload';
  if (a === 0) return 'unassigned';
  if (a < L * VDA_UNDERLOAD_RATIO) return 'underload';
  return 'ok';
}

export async function getAcademicViceDeanStaff(user) {
  const cid = collegeId(user);
  const academic = await getDeanAcademic(user);
  const termRow = academic.term?.id
    ? await db.prepare('SELECT id, university_id, name FROM academic_terms WHERE id = ?').get(academic.term.id)
    : null;
  const uni = termRow?.university_id != null ? Number(termRow.university_id) : user?.org_university_id;
  const board = await getStaffBoard({ ...user, org_university_id: uni, college_id: cid });

  const people = await db.prepare(`
    SELECT u.id, u.full_name, u.person_code, u.role, d.name AS department_name,
           fp.teaching_load_hours
    FROM users u
    LEFT JOIN faculty_profiles fp ON fp.user_id = u.id
    LEFT JOIN departments d ON d.id = u.department_id
    WHERE u.college_id = ?
      AND u.role IN ('instructor', 'teaching_assistant', 'doctor', 'engineer')
    ORDER BY u.full_name ASC, u.id ASC
  `).all(cid);

  const assignedByUser = new Map();
  for (const off of board.offerings || []) {
    const hours = n(off.credit_hours) || 3;
    const seen = new Set();
    for (const s of off.staff || []) {
      const uid = Number(s.user_id);
      if (!uid || seen.has(uid)) continue;
      seen.add(uid);
      const row = assignedByUser.get(uid) || { assigned: 0, courses: [] };
      row.assigned += hours;
      row.courses.push({
        offering_id: off.id,
        course_code: off.course_code,
        course_name: off.course_name,
        hours,
        staff_role: s.staff_role,
      });
      assignedByUser.set(uid, row);
    }
  }

  const loads = people.map((p) => {
    const stored = p.teaching_load_hours;
    const legal = legalLoadHours(p.role, stored);
    const usedDefault = stored == null || stored === '';
    const hit = assignedByUser.get(Number(p.id)) || { assigned: 0, courses: [] };
    const status = loadStatus({ assigned: hit.assigned, legal });
    return {
      user_id: p.id,
      full_name: p.full_name,
      person_code: p.person_code,
      role: normalizeStaffRole(p.role) || p.role,
      department_name: p.department_name,
      assigned_hours: hit.assigned,
      legal_hours: legal,
      legal_is_default: usedDefault,
      status,
      courses: hit.courses,
    };
  });

  const unstaffed = (board.offerings || [])
    .filter((o) => !(o.staff || []).length)
    .map((o) => ({
      id: o.id,
      course_code: o.course_code,
      course_name: o.course_name,
      enrolled_count: o.enrolled_count ?? 0,
    }));

  return {
    term: board.term || academic.term,
    staff_roles: board.staff_roles,
    section_kinds: board.section_kinds,
    weekdays: board.weekdays,
    time_slots: board.time_slots,
    halls: board.halls || [],
    meetings: board.meetings || [],
    offerings: board.offerings || [],
    loads,
    unstaffed,
    counts: {
      staff: loads.length,
      overload: loads.filter((r) => r.status === 'overload').length,
      underload: loads.filter((r) => r.status === 'underload' || r.status === 'unassigned').length,
      unstaffed: unstaffed.length,
    },
  };
}
