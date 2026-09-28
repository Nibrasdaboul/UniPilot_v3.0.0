import bcrypt from 'bcryptjs';
import { db } from '../db.js';
import { ROLES } from '../college/roles.js';
import { universityIdMatches, createAttemptLimiter } from '../college/withdrawalGuard.js';
import {
  pickRegistrationWindow,
  eligibilityReasons,
  studentYearLevel,
  wouldExceedCreditCap,
  isWindowOpen,
  registrationBlockKind,
  latestRegistrationWindow,
  evaluateRegistrationCatalog,
  sortRegistrationCatalogCards,
} from '../college/registration.js';
import { WEEKDAYS } from '../college/teachingStaff.js';
import { ensureCatalogRowForUniCourse } from '../college/catalogSync.js';
import { getStudentGpaSnapshot } from './studentGpaService.js';
import { pickWithdrawalWindow } from '../college/withdrawalWindow.js';

function httpError(status, detail, code = null) {
  const err = new Error(detail);
  err.status = status;
  if (code) err.code = code;
  return err;
}

function orgUniversityId(user) {
  if (user?.org_university_id != null) return Number(user.org_university_id);
  return 1;
}

function collegeId(user) {
  return user?.college_id != null ? Number(user.college_id) : null;
}

const OFFERING_SELECT = `
  o.id, o.uni_course_id, o.term_id, o.capacity, o.created_at,
  uc.course_code, uc.course_name, uc.credit_hours, uc.year_level, uc.department_id, uc.catalog_course_id,
  d.name AS department_name, d.college_id,
  (SELECT COUNT(*)::int FROM enrollments e WHERE e.offering_id = o.id AND e.status = 'enrolled') AS enrolled_count
`;

export async function getCurrentTerm(universityId) {
  if (!universityId) return null;
  return db.prepare(`
    SELECT id, university_id, name, starts_on, ends_on, is_current, is_closed, closed_at
    FROM academic_terms
    WHERE university_id = ? AND is_current = 1 AND COALESCE(is_closed, 0) = 0
    ORDER BY id DESC
    LIMIT 1
  `).get(universityId);
}

export async function listCollegeUniCourses(user) {
  const cid = collegeId(user);
  if (!cid) return [];
  return db.prepare(`
    SELECT uc.id, uc.course_code, uc.course_name, uc.credit_hours, uc.year_level, uc.department_id,
           d.name AS department_name
    FROM uni_courses uc
    INNER JOIN departments d ON d.id = uc.department_id
    WHERE d.college_id = ?
    ORDER BY uc.course_code ASC, uc.id ASC
  `).all(cid);
}

export async function listOfferingsForTerm(termId, collegeIdFilter) {
  if (!termId) return [];
  let sql = `
    SELECT ${OFFERING_SELECT}
    FROM course_offerings o
    INNER JOIN uni_courses uc ON uc.id = o.uni_course_id
    INNER JOIN departments d ON d.id = uc.department_id
    WHERE o.term_id = ?
  `;
  const params = [termId];
  if (collegeIdFilter) {
    sql += ' AND d.college_id = ?';
    params.push(collegeIdFilter);
  }
  sql += ' ORDER BY uc.course_code ASC, o.id ASC';
  return db.prepare(sql).all(...params);
}

export async function createOffering(user, { uni_course_id, term_id, capacity }) {
  const uni = orgUniversityId(user);
  const cid = collegeId(user);
  const termId = parseInt(term_id, 10);
  const courseId = parseInt(uni_course_id, 10);
  const cap = capacity != null ? parseInt(capacity, 10) : 80;
  if (!uni) throw httpError(400, 'User is not attached to a university');
  if (!cid) throw httpError(400, 'User is not attached to a college');
  if (!termId || !courseId) throw httpError(400, 'term_id and uni_course_id are required');
  if (!Number.isFinite(cap) || cap < 1) throw httpError(400, 'Capacity must be at least 1');

  const term = await db.prepare('SELECT id FROM academic_terms WHERE id = ? AND university_id = ?').get(termId, uni);
  if (!term) throw httpError(404, 'Term not found');
  const course = await db.prepare(`
    SELECT uc.id FROM uni_courses uc
    INNER JOIN departments d ON d.id = uc.department_id
    WHERE uc.id = ? AND d.college_id = ?
  `).get(courseId, cid);
  if (!course) throw httpError(400, 'Course is not in your college catalog');

  const existing = await db.prepare(
    'SELECT id FROM course_offerings WHERE uni_course_id = ? AND term_id = ?'
  ).get(courseId, termId);
  if (existing) throw httpError(400, 'This course is already offered in this term');

  const r = await db.prepare(`
    INSERT INTO course_offerings (uni_course_id, term_id, capacity)
    VALUES (?, ?, ?)
  `).run(courseId, termId, cap);
  const rows = await listOfferingsForTerm(termId, cid);
  return rows.find((o) => Number(o.id) === Number(r.lastInsertRowid)) || { id: r.lastInsertRowid };
}

export async function updateOfferingCapacity(user, offeringId, capacity) {
  const uni = orgUniversityId(user);
  const cid = collegeId(user);
  const cap = parseInt(capacity, 10);
  if (!Number.isFinite(cap) || cap < 1) throw httpError(400, 'Capacity must be at least 1');
  const row = await db.prepare(`
    SELECT o.id, o.term_id
    FROM course_offerings o
    INNER JOIN uni_courses uc ON uc.id = o.uni_course_id
    INNER JOIN departments d ON d.id = uc.department_id
    INNER JOIN academic_terms t ON t.id = o.term_id
    WHERE o.id = ? AND t.university_id = ? AND d.college_id = ?
  `).get(offeringId, uni, cid);
  if (!row) throw httpError(404, 'Offering not found');
  const enrolled = await db.prepare(
    `SELECT COUNT(*)::int AS n FROM enrollments WHERE offering_id = ? AND status = 'enrolled'`
  ).get(offeringId);
  if (Number(enrolled?.n || 0) > cap) {
    throw httpError(400, 'Capacity cannot be below the number of enrolled students');
  }
  await db.prepare('UPDATE course_offerings SET capacity = ? WHERE id = ?').run(cap, offeringId);
  const list = await listOfferingsForTerm(row.term_id, cid);
  return list.find((o) => Number(o.id) === Number(offeringId));
}

export async function deleteOffering(user, offeringId) {
  const uni = orgUniversityId(user);
  const cid = collegeId(user);
  const row = await db.prepare(`
    SELECT o.id
    FROM course_offerings o
    INNER JOIN uni_courses uc ON uc.id = o.uni_course_id
    INNER JOIN departments d ON d.id = uc.department_id
    INNER JOIN academic_terms t ON t.id = o.term_id
    WHERE o.id = ? AND t.university_id = ? AND d.college_id = ?
  `).get(offeringId, uni, cid);
  if (!row) throw httpError(404, 'Offering not found');
  const enrolled = await db.prepare(
    `SELECT COUNT(*)::int AS n FROM enrollments WHERE offering_id = ? AND status = 'enrolled'`
  ).get(offeringId);
  if (Number(enrolled?.n || 0) > 0) {
    throw httpError(400, 'Cannot remove an offering that already has enrolled students');
  }
  await db.prepare('DELETE FROM course_offerings WHERE id = ?').run(offeringId);
  return { ok: true };
}

export async function createWindow(user, body) {
  const uni = orgUniversityId(user);
  if (!uni) throw httpError(400, 'User is not attached to a university');
  const termId = parseInt(body?.term_id, 10);
  if (!termId) throw httpError(400, 'term_id is required');
  const term = await db.prepare('SELECT id FROM academic_terms WHERE id = ? AND university_id = ?').get(termId, uni);
  if (!term) throw httpError(404, 'Term not found');
  const name = String(body?.name || '').trim();
  if (!name) throw httpError(400, 'Window name is required');
  const opens_at = body?.opens_at;
  if (!opens_at) throw httpError(400, 'opens_at is required');
  const closes_at = body?.closes_at || null;
  if (closes_at && new Date(closes_at) < new Date(opens_at)) {
    throw httpError(400, 'closes_at must be after opens_at');
  }
  let cid = body?.college_id != null && body.college_id !== '' ? parseInt(body.college_id, 10) : collegeId(user);
  if (cid) {
    const college = await db.prepare('SELECT id FROM colleges WHERE id = ? AND university_id = ?').get(cid, uni);
    if (!college) throw httpError(400, 'College not found in this university');
  }
  const r = await db.prepare(`
    INSERT INTO registration_windows
      (term_id, college_id, name, opens_at, closes_at, min_completed_credits, min_semester_gpa, max_credits, year_level, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    termId,
    cid || null,
    name,
    opens_at,
    closes_at,
    Number(body?.min_completed_credits || 0),
    Number(body?.min_semester_gpa || 0),
    body?.max_credits != null && body.max_credits !== '' ? Number(body.max_credits) : null,
    body?.year_level != null && body.year_level !== '' ? parseInt(body.year_level, 10) : null,
    user.id,
  );
  return db.prepare('SELECT * FROM registration_windows WHERE id = ?').get(r.lastInsertRowid);
}

export async function updateWindow(user, id, body) {
  const uni = orgUniversityId(user);
  const existing = await db.prepare(`
    SELECT w.* FROM registration_windows w
    INNER JOIN academic_terms t ON t.id = w.term_id
    WHERE w.id = ? AND t.university_id = ?
  `).get(id, uni);
  if (!existing) throw httpError(404, 'Window not found');
  const name = body?.name != null ? String(body.name).trim() : existing.name;
  if (!name) throw httpError(400, 'Window name is required');
  const opens_at = body?.opens_at || existing.opens_at;
  const closes_at = body?.closes_at !== undefined ? (body.closes_at || null) : existing.closes_at;
  if (closes_at && new Date(closes_at) < new Date(opens_at)) {
    throw httpError(400, 'closes_at must be after opens_at');
  }
  await db.prepare(`
    UPDATE registration_windows SET
      name = ?, opens_at = ?, closes_at = ?,
      min_completed_credits = ?, min_semester_gpa = ?, max_credits = ?, year_level = ?
    WHERE id = ?
  `).run(
    name,
    opens_at,
    closes_at,
    body?.min_completed_credits != null ? Number(body.min_completed_credits) : existing.min_completed_credits,
    body?.min_semester_gpa != null ? Number(body.min_semester_gpa) : existing.min_semester_gpa,
    body?.max_credits !== undefined ? (body.max_credits === '' || body.max_credits == null ? null : Number(body.max_credits)) : existing.max_credits,
    body?.year_level !== undefined ? (body.year_level === '' || body.year_level == null ? null : parseInt(body.year_level, 10)) : existing.year_level,
    id,
  );
  return db.prepare('SELECT * FROM registration_windows WHERE id = ?').get(id);
}

export async function deleteWindow(user, id) {
  const uni = orgUniversityId(user);
  const existing = await db.prepare(`
    SELECT w.id FROM registration_windows w
    INNER JOIN academic_terms t ON t.id = w.term_id
    WHERE w.id = ? AND t.university_id = ?
  `).get(id, uni);
  if (!existing) throw httpError(404, 'Window not found');
  await db.prepare('DELETE FROM registration_windows WHERE id = ?').run(id);
  return { ok: true };
}

const WITHDRAWAL_WINDOW_SELECT = `
  w.id, w.term_id, w.college_id, w.name, w.opens_at, w.closes_at, w.created_by, w.created_at,
  t.name AS term_name
`;

async function withdrawalWindowRow(id) {
  return db.prepare(`
    SELECT ${WITHDRAWAL_WINDOW_SELECT}
    FROM withdrawal_windows w
    INNER JOIN academic_terms t ON t.id = w.term_id
    WHERE w.id = ?
  `).get(id);
}

async function findWithdrawalWindow(user, id) {
  const uni = orgUniversityId(user);
  const existing = await db.prepare(`
    SELECT w.* FROM withdrawal_windows w
    INNER JOIN academic_terms t ON t.id = w.term_id
    WHERE w.id = ? AND t.university_id = ?
  `).get(id, uni);
  if (!existing) throw httpError(404, 'Withdrawal window not found');
  return existing;
}

export async function listWithdrawalWindows(user, termId = null) {
  const uni = orgUniversityId(user);
  if (!uni) return [];
  let sql = `
    SELECT ${WITHDRAWAL_WINDOW_SELECT}
    FROM withdrawal_windows w
    INNER JOIN academic_terms t ON t.id = w.term_id
    WHERE t.university_id = ?
  `;
  const params = [uni];
  if (termId) {
    sql += ' AND w.term_id = ?';
    params.push(termId);
  }
  sql += ' ORDER BY w.opens_at DESC, w.id DESC';
  return db.prepare(sql).all(...params);
}

export async function createWithdrawalWindow(user, body) {
  const uni = orgUniversityId(user);
  if (!uni) throw httpError(400, 'User is not attached to a university');
  const termId = parseInt(body?.term_id, 10);
  if (!termId) throw httpError(400, 'term_id is required');
  const term = await db.prepare(
    'SELECT id, is_closed FROM academic_terms WHERE id = ? AND university_id = ?'
  ).get(termId, uni);
  if (!term) throw httpError(404, 'Term not found');
  if (Number(term.is_closed) === 1) throw httpError(400, 'Cannot open a withdrawal window for a closed term');
  const name = String(body?.name || '').trim();
  if (!name) throw httpError(400, 'Window name is required');
  const opens_at = body?.opens_at;
  if (!opens_at) throw httpError(400, 'opens_at is required');
  const closes_at = body?.closes_at || null;
  if (closes_at && new Date(closes_at) < new Date(opens_at)) {
    throw httpError(400, 'closes_at must be after opens_at');
  }
  const cid = body?.college_id != null && body.college_id !== '' ? parseInt(body.college_id, 10) : collegeId(user);
  if (cid) {
    const college = await db.prepare('SELECT id FROM colleges WHERE id = ? AND university_id = ?').get(cid, uni);
    if (!college) throw httpError(400, 'College not found in this university');
  }
  const r = await db.prepare(`
    INSERT INTO withdrawal_windows (term_id, college_id, name, opens_at, closes_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(termId, cid || null, name, opens_at, closes_at, user.id);
  return withdrawalWindowRow(r.lastInsertRowid);
}

export async function updateWithdrawalWindow(user, id, body) {
  const existing = await findWithdrawalWindow(user, id);
  const name = body?.name != null ? String(body.name).trim() : existing.name;
  if (!name) throw httpError(400, 'Window name is required');
  const opens_at = body?.opens_at || existing.opens_at;
  const closes_at = body?.closes_at !== undefined ? (body.closes_at || null) : existing.closes_at;
  if (closes_at && new Date(closes_at) < new Date(opens_at)) {
    throw httpError(400, 'closes_at must be after opens_at');
  }
  await db.prepare(
    'UPDATE withdrawal_windows SET name = ?, opens_at = ?, closes_at = ? WHERE id = ?'
  ).run(name, opens_at, closes_at, id);
  return withdrawalWindowRow(id);
}

export async function deleteWithdrawalWindow(user, id) {
  await findWithdrawalWindow(user, id);
  await db.prepare('DELETE FROM withdrawal_windows WHERE id = ?').run(id);
  return { ok: true };
}

async function withdrawalWindowsForTermCollege(termId, cid) {
  return safeAll(`
    SELECT id, term_id, college_id, name, opens_at, closes_at
    FROM withdrawal_windows
    WHERE term_id = ? AND (college_id IS NULL OR college_id = ?)
    ORDER BY opens_at DESC
  `, [termId, cid]);
}

export async function getWithdrawalState(user) {
  const uni = orgUniversityId(user);
  const cid = collegeId(user);
  const term = uni ? await getCurrentTerm(uni) : null;
  if (!term || !cid) return { term, window: null, open: false };
  const picked = pickWithdrawalWindow(await withdrawalWindowsForTermCollege(term.id, cid));
  return { term, window: picked.window, open: picked.open };
}

async function isTermFrozen(userId, termId) {
  const row = await db.prepare(
    'SELECT frozen_at FROM student_semesters WHERE user_id = ? AND academic_term_id = ?'
  ).get(userId, termId);
  return Boolean(row?.frozen_at);
}

async function studentStats(user) {
  const snap = await getStudentGpaSnapshot(user);
  return {
    completedCredits: snap.credits_completed || 0,
    gpa: snap.semester_gpa || 0,
    yearLevel: studentYearLevel(user.enrollment_year),
  };
}

async function windowsForTermCollege(termId, cid) {
  return db.prepare(`
    SELECT id, term_id, college_id, name, opens_at, closes_at,
           min_completed_credits, min_semester_gpa, max_credits, year_level
    FROM registration_windows
    WHERE term_id = ? AND (college_id IS NULL OR college_id = ?)
    ORDER BY opens_at DESC
  `).all(termId, cid);
}

async function registeredCredits(userId, termId) {
  const row = await db.prepare(`
    SELECT COALESCE(SUM(uc.credit_hours), 0) AS hours
    FROM enrollments e
    INNER JOIN course_offerings o ON o.id = e.offering_id
    INNER JOIN uni_courses uc ON uc.id = o.uni_course_id
    WHERE e.user_id = ? AND e.term_id = ? AND e.status = 'enrolled'
  `).get(userId, termId);
  return Number(row?.hours || 0);
}

async function ensureTermSemester(user, term) {
  let sem = await db.prepare(
    'SELECT * FROM student_semesters WHERE user_id = ? AND academic_term_id = ?'
  ).get(user.id, term.id);
  if (sem) {
    if (Number(sem.is_current) !== 1) {
      await db.prepare('UPDATE student_semesters SET is_current = 0 WHERE user_id = ?').run(user.id);
      await db.prepare('UPDATE student_semesters SET is_current = 1, is_ended = 0 WHERE id = ?').run(sem.id);
    }
    return sem;
  }
  await db.prepare('UPDATE student_semesters SET is_current = 0 WHERE user_id = ?').run(user.id);
  const maxOrder = await db.prepare(
    'SELECT COALESCE(MAX(sort_order), 0) AS m FROM student_semesters WHERE user_id = ?'
  ).get(user.id);
  const r = await db.prepare(`
    INSERT INTO student_semesters (user_id, name, sort_order, is_current, is_ended, academic_term_id)
    VALUES (?, ?, ?, 1, 0, ?)
  `).run(user.id, term.name, (maxOrder?.m ?? 0) + 1, term.id);
  return db.prepare('SELECT * FROM student_semesters WHERE id = ?').get(r.lastInsertRowid);
}

async function assertCanMutateRegistration(user) {
  if (user.role !== ROLES.STUDENT) {
    throw httpError(403, 'Only students can register or drop courses');
  }
  const uni = orgUniversityId(user);
  const cid = collegeId(user);
  if (!uni || !cid) throw httpError(400, 'Student is not attached to a college');
  const term = await getCurrentTerm(uni);
  if (!term) throw httpError(403, 'No current academic term is open');
  const stats = await studentStats(user);
  const windows = await windowsForTermCollege(term.id, cid);
  const picked = pickRegistrationWindow(windows, stats);
  if (!picked.window || !isWindowOpen(picked.window) || !picked.eligible) {
    const reasons = eligibilityReasons(picked.window, stats);
    throw httpError(403, reasons[0] || 'Registration is closed');
  }
  return { term, window: picked.window, stats, collegeId: cid };
}

const DOW_TO_WEEKDAY = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function weekdayMeta(dow) {
  const key = DOW_TO_WEEKDAY[Number(dow)] || 'sunday';
  return WEEKDAYS.find((d) => d.key === key) || { key, ar: key, en: key };
}

async function safeAll(sql, params = []) {
  try {
    return await db.prepare(sql).all(...params);
  } catch (err) {
    if (err?.code === '42P01') return [];
    throw err;
  }
}

async function listRegistrationCatalogCards(user, cid, term, offerings, mineByOffering, stats) {
  const catalogRows = await db.prepare(`
    SELECT cc.id, cc.course_code, cc.course_name, cc.description, cc.credit_hours, cc."order",
           cc.prerequisite_id, p.course_code AS prerequisite_code, p.course_name AS prerequisite_name
    FROM catalog_courses cc
    INNER JOIN uni_courses uc ON uc.catalog_course_id = cc.id
    INNER JOIN departments d ON d.id = uc.department_id
    LEFT JOIN catalog_courses p ON p.id = cc.prerequisite_id
    WHERE d.college_id = ?
    ORDER BY cc."order" ASC NULLS LAST, cc.course_code ASC, cc.id ASC
  `).all(cid);
  const catalog = [];
  const seen = new Set();
  for (const row of catalogRows || []) {
    const id = Number(row.id);
    if (seen.has(id)) continue;
    seen.add(id);
    catalog.push(row);
  }

  const passedRows = await db.prepare(`
    SELECT catalog_course_id
    FROM student_courses
    WHERE user_id = ? AND passed = 1 AND finalized_at IS NOT NULL
      AND COALESCE(withdrawn, 0) = 0 AND catalog_course_id IS NOT NULL
  `).all(user.id);
  const passedCatalogIds = new Set((passedRows || []).map((r) => Number(r.catalog_course_id)));

  const trackRows = await safeAll(
    'SELECT catalog_course_id, request_min_hours FROM college_project_tracks WHERE college_id = ?',
    [cid],
  );
  const minHoursByCatalog = new Map(
    (trackRows || []).map((r) => [Number(r.catalog_course_id), Number(r.request_min_hours)]),
  );

  const syllabusRows = await safeAll(
    'SELECT catalog_course_id, theory_syllabus, practical_syllabus FROM college_course_syllabi WHERE college_id = ?',
    [cid],
  );
  const syllabusByCatalog = new Map((syllabusRows || []).map((r) => [Number(r.catalog_course_id), r]));

  const offeringIds = (offerings || []).map((o) => Number(o.id)).filter(Boolean);
  const staff = offeringIds.length
    ? await safeAll(`
        SELECT cs.offering_id, cs.user_id, cs.staff_role, u.full_name, u.person_code
        FROM course_staff cs
        INNER JOIN users u ON u.id = cs.user_id
        WHERE cs.offering_id IN (${offeringIds.map(() => '?').join(', ')})
      `, offeringIds)
    : [];
  const sections = offeringIds.length
    ? await safeAll(`
        SELECT s.id, s.offering_id, s.kind, s.code, s.capacity, s.staff_user_id,
               u.full_name AS staff_name,
               (SELECT COUNT(*)::int FROM enrollment_section_picks p
                  INNER JOIN enrollments pe ON pe.id = p.enrollment_id
                  WHERE p.section_id = s.id AND pe.status = 'enrolled') AS picked_count
        FROM sections s
        LEFT JOIN users u ON u.id = s.staff_user_id
        WHERE s.offering_id IN (${offeringIds.map(() => '?').join(', ')})
        ORDER BY s.kind ASC, s.code ASC, s.id ASC
      `, offeringIds)
    : [];
  const meetings = offeringIds.length
    ? await safeAll(`
        SELECT m.day_of_week, m.start_time, m.end_time, m.room_number,
               s.id AS section_id, s.offering_id, s.kind, s.code
        FROM section_meetings m
        INNER JOIN sections s ON s.id = m.section_id
        WHERE s.offering_id IN (${offeringIds.map(() => '?').join(', ')})
        ORDER BY m.day_of_week, m.start_time
      `, offeringIds)
    : [];
  const pickRows = offeringIds.length
    ? await safeAll(`
        SELECT p.section_id
        FROM enrollment_section_picks p
        INNER JOIN enrollments e ON e.id = p.enrollment_id
        WHERE e.user_id = ? AND e.status IN ('enrolled', 'withdrawn') AND e.offering_id IN (${offeringIds.map(() => '?').join(', ')})
      `, [user.id, ...offeringIds])
    : [];
  const pickedSectionIds = new Set((pickRows || []).map((row) => Number(row.section_id)));

  const cards = catalog.map((row) => {
    const catalogId = Number(row.id);
    const courseOfferings = (offerings || []).filter((o) => Number(o.catalog_course_id) === catalogId);
    const offeringIdsHere = new Set(courseOfferings.map((o) => Number(o.id)));
    const enrolledOffering = courseOfferings.find((o) => o.enrolled);
    const withdrawnOffering = enrolledOffering ? null : courseOfferings.find((o) => o.withdrawn);
    const enrollTarget = courseOfferings.find((o) => !o.enrolled && Number(o.seats_left) > 0)
      || courseOfferings.find((o) => !o.enrolled)
      || courseOfferings[0]
      || null;
    const courseSections = sections.filter((s) => offeringIdsHere.has(Number(s.offering_id))).map((s) => ({
      id: Number(s.id),
      kind: s.kind,
      code: s.code,
      staff_name: s.staff_name || null,
      capacity: Number(s.capacity) || 0,
      picked_count: Number(s.picked_count) || 0,
      picked: pickedSectionIds.has(Number(s.id)),
      seats_left: Math.max(0, (Number(s.capacity) || 0) - (Number(s.picked_count) || 0)),
      meetings: meetings
        .filter((m) => Number(m.section_id) === Number(s.id))
        .map((m) => {
          const day = weekdayMeta(m.day_of_week);
          return {
            kind: m.kind,
            section_id: Number(s.id),
            section_code: m.code,
            day_of_week: Number(m.day_of_week),
            weekday: day.key,
            weekday_ar: day.ar,
            weekday_en: day.en,
            start_time: m.start_time,
            end_time: m.end_time,
            room_number: m.room_number || null,
          };
        }),
    }));
    const staffMap = new Map();
    for (const person of staff.filter((s) => offeringIdsHere.has(Number(s.offering_id)))) {
      staffMap.set(`${person.user_id}:${person.staff_role}`, {
        user_id: Number(person.user_id),
        full_name: person.full_name,
        staff_role: person.staff_role,
      });
    }
    for (const section of courseSections) {
      if (!section.staff_name) continue;
      const key = `sec:${section.kind}:${section.staff_name}`;
      if (!staffMap.has(key)) {
        staffMap.set(key, {
          user_id: null,
          full_name: section.staff_name,
          staff_role: section.kind === 'practical' ? 'teaching_assistant' : 'instructor',
        });
      }
    }
    const lectures = meetings
      .filter((m) => offeringIdsHere.has(Number(m.offering_id)))
      .map((m) => {
        const day = weekdayMeta(m.day_of_week);
        return {
          kind: m.kind,
          section_code: m.code,
          day_of_week: Number(m.day_of_week),
          weekday: day.key,
          weekday_ar: day.ar,
          weekday_en: day.en,
          start_time: m.start_time,
          end_time: m.end_time,
          room_number: m.room_number || null,
        };
      });
    const syllabus = syllabusByCatalog.get(catalogId);
    const gate = evaluateRegistrationCatalog({
      prerequisiteId: row.prerequisite_id,
      passedCatalogIds,
      minHours: minHoursByCatalog.get(catalogId),
      completedHours: stats?.completedCredits || 0,
    });
    const vacantSeats = courseSections.reduce((sum, s) => sum + s.seats_left, 0)
      || courseOfferings.reduce((sum, o) => sum + (Number(o.seats_left) || 0), 0);
    return {
      id: catalogId,
      course_code: row.course_code,
      course_name: row.course_name,
      description: row.description || '',
      credit_hours: Number(row.credit_hours) || 0,
      order: row.order,
      prerequisite: row.prerequisite_id ? {
        id: Number(row.prerequisite_id),
        course_code: row.prerequisite_code,
        course_name: row.prerequisite_name,
      } : null,
      min_hours: minHoursByCatalog.get(catalogId) ?? null,
      theory_syllabus: syllabus?.theory_syllabus || '',
      practical_syllabus: syllabus?.practical_syllabus || '',
      offered: courseOfferings.length > 0,
      enrolled: Boolean(enrolledOffering),
      withdrawn: Boolean(withdrawnOffering),
      offering_id: enrolledOffering
        ? Number(enrolledOffering.id)
        : (withdrawnOffering
          ? Number(withdrawnOffering.id)
          : (enrollTarget ? Number(enrollTarget.id) : null)),
      open_sections: courseSections.length,
      vacant_seats: vacantSeats,
      sections: courseSections,
      staff: [...staffMap.values()],
      theory_lectures: lectures.filter((l) => l.kind === 'theory'),
      practical_lectures: lectures.filter((l) => l.kind === 'practical'),
      eligible: gate.eligible,
      lock_reason: gate.lock_reason,
    };
  });

  return sortRegistrationCatalogCards(cards);
}

export async function getRegistrationOverview(user) {
  const uni = orgUniversityId(user);
  const cid = collegeId(user);
  const term = uni ? await getCurrentTerm(uni) : null;
  const stats = await studentStats(user);
  const windows = term && cid ? await windowsForTermCollege(term.id, cid) : [];
  const picked = pickRegistrationWindow(windows, stats);
  const reasons = eligibilityReasons(picked.window, stats);
  const hours = term ? await registeredCredits(user.id, term.id) : 0;
  const offerings = term ? await listOfferingsForTerm(term.id, cid) : [];
  const mine = term
    ? await db.prepare(`
        SELECT e.id, e.offering_id, e.status, e.created_at
        FROM enrollments e
        WHERE e.user_id = ? AND e.term_id = ?
      `).all(user.id, term.id)
    : [];
  const mineByOffering = new Map(mine.map((e) => [Number(e.offering_id), e]));
  const open = Boolean(picked.window && isWindowOpen(picked.window) && picked.eligible);
  const closedKind = !term ? 'no_term' : (open ? null : registrationBlockKind(windows, stats));
  const withdrawal = term && cid
    ? pickWithdrawalWindow(await withdrawalWindowsForTermCollege(term.id, cid))
    : { window: null, open: false };
  const enrolledCount = mine.filter((e) => e.status === 'enrolled').length;
  const withdrawnCount = mine.filter((e) => e.status === 'withdrawn').length;
  const termFrozen = term ? await isTermFrozen(user.id, term.id) : false;
  return {
    term,
    window: picked.window || latestRegistrationWindow(windows),
    open,
    withdrawal_window: withdrawal.window,
    withdraw_open: withdrawal.open,
    can_withdraw: user.role === ROLES.STUDENT && withdrawal.open,
    can_freeze: user.role === ROLES.STUDENT && withdrawal.open && enrolledCount > 0,
    enrolled_count: enrolledCount,
    withdrawn_count: withdrawnCount,
    term_frozen: termFrozen,
    eligible: picked.eligible && Boolean(picked.window),
    closed_kind: closedKind,
    reasons: open ? [] : reasons,
    registered_credits: hours,
    max_credits: picked.window?.max_credits ?? null,
    stats,
    can_enroll: user.role === ROLES.STUDENT && open && !termFrozen,
    courses: cid
      ? await listRegistrationCatalogCards(user, cid, term, offerings.map((o) => {
          const mineRow = mineByOffering.get(Number(o.id));
          const enrolledHere = mineRow?.status === 'enrolled';
          return {
            ...o,
            seats_left: Math.max(0, Number(o.capacity || 0) - Number(o.enrolled_count || 0)),
            enrolled: enrolledHere,
            withdrawn: mineRow?.status === 'withdrawn',
          };
        }), mineByOffering, stats)
      : [],
    offerings: offerings.map((o) => {
      const mineRow = mineByOffering.get(Number(o.id));
      const enrolledHere = mineRow?.status === 'enrolled';
      return {
        ...o,
        seats_left: Math.max(0, Number(o.capacity || 0) - Number(o.enrolled_count || 0)),
        my_status: mineRow?.status || null,
        enrolled: enrolledHere,
      };
    }),
  };
}

export async function enrollStudent(user, offeringId) {
  const { term, window, collegeId: cid } = await assertCanMutateRegistration(user);
  const oid = parseInt(offeringId, 10);
  const offering = (await listOfferingsForTerm(term.id, cid)).find((o) => Number(o.id) === oid);
  if (!offering) throw httpError(404, 'Offering not found for this term');

  const existing = await db.prepare(
    'SELECT id, status FROM enrollments WHERE user_id = ? AND offering_id = ?'
  ).get(user.id, oid);

  if (existing?.status === 'enrolled') {
    throw httpError(400, 'Already enrolled in this course');
  }
  if (await isTermFrozen(user.id, term.id)) {
    throw httpError(400, 'You froze this term. You cannot register courses until a new term opens.', 'term_frozen');
  }
  const withdrawnHere = await db.prepare(`
    SELECT e.id FROM enrollments e
    INNER JOIN course_offerings o ON o.id = e.offering_id
    WHERE e.user_id = ? AND e.term_id = ? AND e.status = 'withdrawn' AND o.uni_course_id = ?
  `).get(user.id, term.id, offering.uni_course_id);
  if (withdrawnHere) {
    throw httpError(400, 'You withdrew from this course this term. You can register it again in a new term.', 'withdrawn_this_term');
  }

  const sameCourse = await db.prepare(`
    SELECT e.id FROM enrollments e
    INNER JOIN course_offerings o ON o.id = e.offering_id
    WHERE e.user_id = ? AND e.term_id = ? AND e.status = 'enrolled' AND o.uni_course_id = ? AND o.id <> ?
  `).get(user.id, term.id, offering.uni_course_id, oid);
  if (sameCourse) throw httpError(400, 'Already enrolled in this course this term');

  const hours = await registeredCredits(user.id, term.id);
  if (wouldExceedCreditCap(window, hours, offering.credit_hours)) {
    throw httpError(400, `This window allows at most ${window.max_credits} credits`);
  }

  if (Number(offering.enrolled_count || 0) >= Number(offering.capacity || 0) && existing?.status !== 'dropped') {
    throw httpError(400, 'This offering is full');
  }
  if (existing?.status === 'dropped' && Number(offering.enrolled_count || 0) >= Number(offering.capacity || 0)) {
    throw httpError(400, 'This offering is full');
  }

  if (!offering.catalog_course_id && offering.uni_course_id) {
    const uc = await db.prepare(`
      SELECT uc.id, uc.course_code, uc.course_name, uc.credit_hours, uc.catalog_course_id,
             d.name AS department_name
      FROM uni_courses uc
      INNER JOIN departments d ON d.id = uc.department_id
      WHERE uc.id = ?
    `).get(offering.uni_course_id);
    if (uc) offering.catalog_course_id = await ensureCatalogRowForUniCourse(uc);
  }
  if (offering.catalog_course_id) {
    const catalog = await db.prepare(
      'SELECT id, prerequisite_id FROM catalog_courses WHERE id = ?'
    ).get(offering.catalog_course_id);
    const prereqId = catalog?.prerequisite_id != null ? parseInt(catalog.prerequisite_id, 10) : null;
    if (prereqId) {
      const done = await db.prepare(`
        SELECT id FROM student_courses
        WHERE user_id = ? AND catalog_course_id = ? AND finalized_at IS NOT NULL AND passed = 1
          AND (withdrawn IS NULL OR withdrawn = 0)
      `).get(user.id, prereqId);
      if (!done) throw httpError(400, 'Complete the prerequisite course first');
    }
  }

  let enrollmentId;
  if (existing) {
    await db.prepare(`UPDATE enrollments SET status = 'enrolled' WHERE id = ?`).run(existing.id);
    enrollmentId = existing.id;
  } else {
    const r = await db.prepare(`
      INSERT INTO enrollments (user_id, offering_id, term_id, status)
      VALUES (?, ?, ?, 'enrolled')
    `).run(user.id, oid, term.id);
    enrollmentId = r.lastInsertRowid;
  }

  const sem = await ensureTermSemester(user, term);
  const linked = await db.prepare(
    'SELECT id FROM student_courses WHERE enrollment_id = ?'
  ).get(enrollmentId);
  if (linked) {
    await db.prepare('UPDATE student_courses SET withdrawn = 0, semester_id = ? WHERE id = ?').run(sem.id, linked.id);
  } else if (offering.catalog_course_id) {
    const already = await db.prepare(`
      SELECT id FROM student_courses
      WHERE user_id = ? AND catalog_course_id = ? AND semester_id = ?
    `).get(user.id, offering.catalog_course_id, sem.id);
    if (already) {
      await db.prepare(
        'UPDATE student_courses SET enrollment_id = ?, withdrawn = 0 WHERE id = ?'
      ).run(enrollmentId, already.id);
    } else {
      await db.prepare(`
        INSERT INTO student_courses
          (user_id, catalog_course_id, course_name, course_code, credit_hours, semester, semester_id, enrollment_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        user.id,
        offering.catalog_course_id,
        offering.course_name,
        offering.course_code,
        Math.round(Number(offering.credit_hours) || 3),
        term.name,
        sem.id,
        enrollmentId,
      );
    }
  } else {
    await db.prepare(`
      INSERT INTO student_courses
        (user_id, catalog_course_id, course_name, course_code, credit_hours, semester, semester_id, enrollment_id)
      VALUES (?, NULL, ?, ?, ?, ?, ?, ?)
    `).run(
      user.id,
      offering.course_name,
      offering.course_code,
      Math.round(Number(offering.credit_hours) || 3),
      term.name,
      sem.id,
      enrollmentId,
    );
  }

  return getRegistrationOverview(user);
}

export async function dropStudent(user, offeringId) {
  const { term } = await assertCanMutateRegistration(user);
  const oid = parseInt(offeringId, 10);
  const enrollment = await db.prepare(`
    SELECT id, status FROM enrollments
    WHERE user_id = ? AND offering_id = ? AND term_id = ?
  `).get(user.id, oid, term.id);
  if (!enrollment || enrollment.status !== 'enrolled') {
    throw httpError(404, 'Enrollment not found');
  }
  await db.prepare(`UPDATE enrollments SET status = 'dropped' WHERE id = ?`).run(enrollment.id);
  await db.prepare(
    'UPDATE student_courses SET withdrawn = 1 WHERE enrollment_id = ? AND user_id = ?'
  ).run(enrollment.id, user.id);
  return getRegistrationOverview(user);
}

const withdrawAttempts = createAttemptLimiter();

async function assertWithdrawIdentity(user, credentials) {
  if (user.role !== ROLES.STUDENT) throw httpError(403, 'Only students can withdraw courses');
  if (withdrawAttempts.isLocked(user.id)) {
    throw httpError(429, 'Too many failed confirmations. Try again later.', 'too_many_attempts');
  }
  const universityId = credentials?.university_id;
  const password = String(credentials?.password || '');
  if (!universityId || !password) {
    throw httpError(400, 'University ID and password are required', 'credentials_required');
  }
  if (!universityIdMatches(user, universityId)) {
    withdrawAttempts.fail(user.id);
    throw httpError(403, 'University ID does not match your account', 'university_id_mismatch');
  }
  const row = await db.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id);
  if (!row?.password_hash || !bcrypt.compareSync(password, row.password_hash)) {
    withdrawAttempts.fail(user.id);
    throw httpError(401, 'Incorrect password', 'wrong_password');
  }
  withdrawAttempts.reset(user.id);
}

async function assertWithdrawWindowOpen(user) {
  const state = await getWithdrawalState(user);
  if (!state.term) throw httpError(403, 'No current academic term is open', 'no_term');
  if (!state.open) throw httpError(403, 'The withdrawal window is closed', 'withdraw_closed');
  return state.term;
}

async function markEnrollmentWithdrawn(user, enrollmentId) {
  await db.prepare(
    `UPDATE enrollments SET status = 'withdrawn', withdrawn_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).run(enrollmentId);
  await db.prepare(
    'UPDATE student_courses SET withdrawn = 1, withdrawn_at = CURRENT_TIMESTAMP WHERE enrollment_id = ? AND user_id = ?'
  ).run(enrollmentId, user.id);
}

export async function withdrawCourse(user, body) {
  const term = await assertWithdrawWindowOpen(user);
  await assertWithdrawIdentity(user, body);
  const oid = parseInt(body?.offering_id, 10);
  if (!oid) throw httpError(400, 'offering_id is required');
  const enrollment = await db.prepare(`
    SELECT id, status FROM enrollments
    WHERE user_id = ? AND offering_id = ? AND term_id = ?
  `).get(user.id, oid, term.id);
  if (!enrollment || enrollment.status !== 'enrolled') {
    throw httpError(404, 'You are not enrolled in this course this term', 'not_enrolled');
  }
  await markEnrollmentWithdrawn(user, enrollment.id);
  return getRegistrationOverview(user);
}

export async function freezeTerm(user, body) {
  const term = await assertWithdrawWindowOpen(user);
  await assertWithdrawIdentity(user, body);
  const rows = await db.prepare(`
    SELECT id FROM enrollments
    WHERE user_id = ? AND term_id = ? AND status = 'enrolled'
  `).all(user.id, term.id);
  if (!rows.length) throw httpError(400, 'You have no enrolled courses to withdraw', 'nothing_enrolled');
  for (const row of rows) {
    await markEnrollmentWithdrawn(user, row.id);
  }
  const sem = await ensureTermSemester(user, term);
  await db.prepare('UPDATE student_semesters SET frozen_at = CURRENT_TIMESTAMP WHERE id = ?').run(sem.id);
  return getRegistrationOverview(user);
}
