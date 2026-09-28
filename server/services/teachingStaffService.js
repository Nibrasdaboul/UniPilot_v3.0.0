import { db } from '../db.js';
import {
  STAFF_ROLES,
  SECTION_KINDS,
  WEEKDAYS,
  TIME_SLOTS,
  normalizeStaffRole,
  userMatchesStaffRole,
  isSectionKind,
  isWeekday,
  isTimeSlot,
} from '../college/teachingStaff.js';
import { isTeachingStaffRole } from '../college/roles.js';
import { getCurrentTerm, listOfferingsForTerm } from './registrationService.js';

function httpError(status, detail) {
  const err = new Error(detail);
  err.status = status;
  return err;
}

function orgUniversityId(user) {
  return user?.org_university_id != null ? Number(user.org_university_id) : null;
}

function collegeId(user) {
  return user?.college_id != null ? Number(user.college_id) : null;
}

function publicStaffRole(raw) {
  return normalizeStaffRole(raw) || raw;
}

async function offeringInCollege(offeringId, user) {
  const uni = orgUniversityId(user);
  const cid = collegeId(user);
  if (!uni || !cid) throw httpError(400, 'User is not attached to a college');
  const row = await db.prepare(`
    SELECT o.id, o.term_id, uc.course_code, uc.course_name,
           (SELECT COUNT(*)::int FROM enrollments e WHERE e.offering_id = o.id AND e.status = 'enrolled') AS enrolled_count
    FROM course_offerings o
    INNER JOIN uni_courses uc ON uc.id = o.uni_course_id
    INNER JOIN departments d ON d.id = uc.department_id
    INNER JOIN academic_terms t ON t.id = o.term_id
    WHERE o.id = ? AND t.university_id = ? AND d.college_id = ?
  `).get(offeringId, uni, cid);
  if (!row) throw httpError(404, 'Offering not found');
  return row;
}

export async function listAssignablePeople(user) {
  const cid = collegeId(user);
  if (!cid) return [];
  const rows = await db.prepare(`
    SELECT u.id, u.full_name, u.person_code, u.role
    FROM users u
    WHERE u.college_id = ?
      AND u.role IN ('instructor', 'teaching_assistant', 'doctor', 'engineer')
    ORDER BY u.full_name ASC, u.id ASC
  `).all(cid);
  return rows.map((r) => ({ ...r, staff_role: publicStaffRole(r.role) }));
}

async function staffForOfferings(offeringIds) {
  if (!offeringIds.length) return [];
  const placeholders = offeringIds.map(() => '?').join(', ');
  return db.prepare(`
    SELECT cs.id, cs.offering_id, cs.user_id, cs.staff_role, u.full_name, u.person_code, u.role
    FROM course_staff cs
    INNER JOIN users u ON u.id = cs.user_id
    WHERE cs.offering_id IN (${placeholders})
    ORDER BY cs.id ASC
  `).all(...offeringIds);
}

const DOW_TO_WEEKDAY = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const WEEKDAY_TO_DOW = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
};

function slotFromStart(time) {
  const hour = parseInt(String(time || '00').split(':')[0], 10);
  if (hour < 10) return '08-10';
  if (hour < 12) return '10-12';
  if (hour < 14) return '12-14';
  return '14-16';
}

function timesFromSlot(slot) {
  const map = {
    '08-10': ['08:00', '10:00'],
    '10-12': ['10:00', '12:00'],
    '12-14': ['12:00', '14:00'],
    '14-16': ['14:00', '16:00'],
  };
  return map[slot] || ['08:00', '10:00'];
}

function mapMeeting(row) {
  return {
    ...row,
    weekday: DOW_TO_WEEKDAY[Number(row.day_of_week)] || 'sunday',
    slot: slotFromStart(row.start_time),
    hall_id: row.room_number,
    hall_name: row.room_number,
  };
}

async function listCollegeHalls(user) {
  const uni = orgUniversityId(user);
  const examHalls = uni
    ? await db.prepare(`
        SELECT id::text AS id, name, building
        FROM exam_halls WHERE university_id = ?
        ORDER BY name ASC, id ASC
      `).all(uni)
    : [];
  const rooms = await db.prepare(`
    SELECT DISTINCT room_number AS name
    FROM section_meetings
    WHERE room_number IS NOT NULL AND room_number <> ''
    ORDER BY room_number
  `).all();
  const seen = new Set();
  const halls = [];
  for (const h of examHalls) {
    seen.add(h.name);
    halls.push({ id: h.name, name: h.name, building: h.building });
  }
  for (const r of rooms) {
    if (seen.has(r.name)) continue;
    seen.add(r.name);
    halls.push({ id: r.name, name: r.name, building: null });
  }
  return halls;
}

async function meetingsForOfferings(offeringIds) {
  if (!offeringIds.length) return [];
  const placeholders = offeringIds.map(() => '?').join(', ');
  const rows = await db.prepare(`
    SELECT m.id, m.section_id, m.day_of_week, m.start_time, m.end_time,
           m.room_number, m.building,
           s.offering_id, s.kind, s.code, s.staff_user_id,
           u.full_name AS staff_name, u.role AS staff_role,
           uc.course_code, uc.course_name
    FROM section_meetings m
    INNER JOIN sections s ON s.id = m.section_id
    INNER JOIN course_offerings o ON o.id = s.offering_id
    INNER JOIN uni_courses uc ON uc.id = o.uni_course_id
    LEFT JOIN users u ON u.id = s.staff_user_id
    WHERE s.offering_id IN (${placeholders})
    ORDER BY m.day_of_week, m.start_time, m.room_number
  `).all(...offeringIds);
  return rows.map(mapMeeting);
}

async function sectionsForOfferings(offeringIds) {
  if (!offeringIds.length) return [];
  const placeholders = offeringIds.map(() => '?').join(', ');
  return db.prepare(`
    SELECT s.id, s.offering_id, s.kind, s.code, s.staff_user_id, s.capacity,
           u.full_name AS staff_name, u.person_code AS staff_person_code,
           (SELECT COUNT(*)::int FROM enrollment_section_picks p
              INNER JOIN enrollments pe ON pe.id = p.enrollment_id
              WHERE p.section_id = s.id AND pe.status = 'enrolled') AS picked_count
    FROM sections s
    LEFT JOIN users u ON u.id = s.staff_user_id
    WHERE s.offering_id IN (${placeholders})
    ORDER BY s.kind ASC, s.code ASC, s.id ASC
  `).all(...offeringIds);
}

function attachToOfferings(offerings, staff, sections) {
  return offerings.map((o) => ({
    ...o,
    staff: staff.filter((s) => Number(s.offering_id) === Number(o.id)).map((s) => ({
      ...s,
      staff_role: publicStaffRole(s.staff_role),
    })),
    sections: sections.filter((s) => Number(s.offering_id) === Number(o.id)),
  }));
}

export async function getStaffBoard(user) {
  const uni = orgUniversityId(user);
  const cid = collegeId(user);
  const term = uni ? await getCurrentTerm(uni) : null;
  const offerings = term && cid ? await listOfferingsForTerm(term.id, cid) : [];
  const ids = offerings.map((o) => o.id);
  const [people, staff, sections, halls, meetings] = await Promise.all([
    listAssignablePeople(user),
    staffForOfferings(ids),
    sectionsForOfferings(ids),
    listCollegeHalls(user),
    meetingsForOfferings(ids),
  ]);
  return {
    term,
    staff_roles: STAFF_ROLES,
    section_kinds: SECTION_KINDS,
    weekdays: WEEKDAYS,
    time_slots: TIME_SLOTS,
    people,
    halls,
    meetings,
    offerings: attachToOfferings(offerings, staff, sections),
  };
}

export async function createMeeting(user, body) {
  const cid = collegeId(user);
  const sectionId = parseInt(body?.section_id, 10);
  const weekday = String(body?.weekday || '').trim();
  const slot = String(body?.slot || '').trim();
  if (!Number.isFinite(sectionId)) throw httpError(400, 'Section is required');
  if (!isWeekday(weekday)) throw httpError(400, 'Weekday is invalid');
  if (!isTimeSlot(slot)) throw httpError(400, 'Time slot is invalid');

  const section = await db.prepare(`
    SELECT s.id FROM sections s
    INNER JOIN course_offerings o ON o.id = s.offering_id
    INNER JOIN uni_courses uc ON uc.id = o.uni_course_id
    INNER JOIN departments d ON d.id = uc.department_id
    WHERE s.id = ? AND d.college_id = ?
  `).get(sectionId, cid);
  if (!section) throw httpError(404, 'Section not found');

  const roomName = String(body?.hall_id || body?.hall_name || '').trim();
  if (!roomName) throw httpError(400, 'Hall is required');
  const dow = WEEKDAY_TO_DOW[weekday];
  const [startTime, endTime] = timesFromSlot(slot);

  const hallClash = await db.prepare(
    'SELECT id FROM section_meetings WHERE room_number = ? AND day_of_week = ? AND start_time = ?'
  ).get(roomName, dow, startTime);
  if (hallClash) throw httpError(400, 'This hall is already booked in that slot');

  const sectionClash = await db.prepare(
    'SELECT id FROM section_meetings WHERE section_id = ? AND day_of_week = ? AND start_time = ?'
  ).get(sectionId, dow, startTime);
  if (sectionClash) throw httpError(400, 'This section is already placed in that slot');

  const r = await db.prepare(
    'INSERT INTO section_meetings (section_id, day_of_week, start_time, end_time, room_number) VALUES (?, ?, ?, ?, ?)'
  ).run(sectionId, dow, startTime, endTime, roomName);
  const offering = await db.prepare('SELECT offering_id FROM sections WHERE id = ?').get(sectionId);
  const rows = await meetingsForOfferings([offering.offering_id]);
  return rows.find((m) => Number(m.id) === Number(r.lastInsertRowid)) || { id: r.lastInsertRowid };
}

export async function deleteMeeting(user, id) {
  const cid = collegeId(user);
  const row = await db.prepare(`
    SELECT m.id FROM section_meetings m
    INNER JOIN sections s ON s.id = m.section_id
    INNER JOIN course_offerings o ON o.id = s.offering_id
    INNER JOIN uni_courses uc ON uc.id = o.uni_course_id
    INNER JOIN departments d ON d.id = uc.department_id
    WHERE m.id = ? AND d.college_id = ?
  `).get(id, cid);
  if (!row) throw httpError(404, 'Meeting not found');
  await db.prepare('DELETE FROM section_meetings WHERE id = ?').run(row.id);
  return { ok: true };
}

export async function assignStaff(user, body) {
  const offering = await offeringInCollege(parseInt(body?.offering_id, 10), user);
  const uni = orgUniversityId(user);
  const term = await getCurrentTerm(uni);
  if (!term || Number(offering.term_id) !== Number(term.id)) {
    throw httpError(400, 'Staff can only be assigned on the current term');
  }
  const staffRole = normalizeStaffRole(body?.staff_role);
  if (!staffRole) throw httpError(400, 'staff_role must be instructor or teaching_assistant');
  const person = await db.prepare(
    'SELECT id, role, college_id, full_name FROM users WHERE id = ?'
  ).get(parseInt(body?.user_id, 10));
  if (!person || Number(person.college_id) !== collegeId(user)) {
    throw httpError(404, 'Staff member not found in this college');
  }
  if (!userMatchesStaffRole(person.role, staffRole)) {
    throw httpError(400, `${person.full_name} cannot be assigned as ${staffRole}`);
  }
  const existing = await db.prepare(
    'SELECT id FROM course_staff WHERE offering_id = ? AND user_id = ? AND staff_role IN (?, ?)'
  ).get(offering.id, person.id, staffRole, staffRole === 'instructor' ? 'doctor' : 'engineer');
  if (existing) throw httpError(400, 'This person is already assigned to the offering');
  const r = await db.prepare(
    'INSERT INTO course_staff (offering_id, user_id, staff_role) VALUES (?, ?, ?)'
  ).run(offering.id, person.id, staffRole);
  return db.prepare(`
    SELECT cs.id, cs.offering_id, cs.user_id, cs.staff_role, u.full_name, u.person_code
    FROM course_staff cs INNER JOIN users u ON u.id = cs.user_id WHERE cs.id = ?
  `).get(r.lastInsertRowid);
}

export async function unassignStaff(user, assignmentId) {
  const cid = collegeId(user);
  const row = await db.prepare(`
    SELECT cs.id FROM course_staff cs
    INNER JOIN course_offerings o ON o.id = cs.offering_id
    INNER JOIN uni_courses uc ON uc.id = o.uni_course_id
    INNER JOIN departments d ON d.id = uc.department_id
    WHERE cs.id = ? AND d.college_id = ?
  `).get(assignmentId, cid);
  if (!row) throw httpError(404, 'Assignment not found');
  await db.prepare('DELETE FROM course_staff WHERE id = ?').run(row.id);
  return { ok: true };
}

export async function createSection(user, body) {
  const offering = await offeringInCollege(parseInt(body?.offering_id, 10), user);
  const kind = String(body?.kind || '').trim();
  if (!isSectionKind(kind)) throw httpError(400, 'kind must be theory or practical');
  const code = String(body?.code || '').trim();
  if (!code) throw httpError(400, 'Section code is required');
  const capacity = parseInt(body?.capacity, 10);
  if (!Number.isFinite(capacity) || capacity < 1) throw httpError(400, 'Capacity must be at least 1');
  let staffId = body?.staff_user_id != null && body.staff_user_id !== '' ? parseInt(body.staff_user_id, 10) : null;
  if (staffId) {
    const person = await db.prepare('SELECT id, role, college_id FROM users WHERE id = ?').get(staffId);
    const want = kind === 'theory' ? 'instructor' : 'teaching_assistant';
    if (!person || Number(person.college_id) !== collegeId(user) || !userMatchesStaffRole(person.role, want)) {
      throw httpError(400, 'Section staff must match the section kind');
    }
  }
  const r = await db.prepare(`
    INSERT INTO sections (offering_id, kind, code, staff_user_id, capacity)
    VALUES (?, ?, ?, ?, ?)
  `).run(offering.id, kind, code, staffId, capacity);
  return db.prepare(`
    SELECT s.id, s.offering_id, s.kind, s.code, s.staff_user_id, s.capacity,
           u.full_name AS staff_name
    FROM sections s LEFT JOIN users u ON u.id = s.staff_user_id WHERE s.id = ?
  `).get(r.lastInsertRowid);
}

export async function updateSection(user, id, body) {
  const cid = collegeId(user);
  const existing = await db.prepare(`
    SELECT s.* FROM sections s
    INNER JOIN course_offerings o ON o.id = s.offering_id
    INNER JOIN uni_courses uc ON uc.id = o.uni_course_id
    INNER JOIN departments d ON d.id = uc.department_id
    WHERE s.id = ? AND d.college_id = ?
  `).get(id, cid);
  if (!existing) throw httpError(404, 'Section not found');
  const code = body?.code != null ? String(body.code).trim() : existing.code;
  if (!code) throw httpError(400, 'Section code is required');
  const capacity = body?.capacity != null ? parseInt(body.capacity, 10) : Number(existing.capacity);
  if (!Number.isFinite(capacity) || capacity < 1) throw httpError(400, 'Capacity must be at least 1');
  const picked = await db.prepare('SELECT COUNT(*)::int AS n FROM enrollment_section_picks WHERE section_id = ?').get(existing.id);
  if (Number(picked?.n || 0) > capacity) throw httpError(400, 'Capacity cannot be below students already in the section');
  let staffId = existing.staff_user_id;
  if (body?.staff_user_id !== undefined) {
    staffId = body.staff_user_id === '' || body.staff_user_id == null ? null : parseInt(body.staff_user_id, 10);
    if (staffId) {
      const person = await db.prepare('SELECT id, role, college_id FROM users WHERE id = ?').get(staffId);
      const want = existing.kind === 'theory' ? 'instructor' : 'teaching_assistant';
      if (!person || Number(person.college_id) !== cid || !userMatchesStaffRole(person.role, want)) {
        throw httpError(400, 'Section staff must match the section kind');
      }
    }
  }
  await db.prepare('UPDATE sections SET code = ?, capacity = ?, staff_user_id = ? WHERE id = ?')
    .run(code, capacity, staffId, existing.id);
  return db.prepare(`
    SELECT s.id, s.offering_id, s.kind, s.code, s.staff_user_id, s.capacity, u.full_name AS staff_name
    FROM sections s LEFT JOIN users u ON u.id = s.staff_user_id WHERE s.id = ?
  `).get(existing.id);
}

export async function deleteSection(user, id) {
  const cid = collegeId(user);
  const existing = await db.prepare(`
    SELECT s.id FROM sections s
    INNER JOIN course_offerings o ON o.id = s.offering_id
    INNER JOIN uni_courses uc ON uc.id = o.uni_course_id
    INNER JOIN departments d ON d.id = uc.department_id
    WHERE s.id = ? AND d.college_id = ?
  `).get(id, cid);
  if (!existing) throw httpError(404, 'Section not found');
  await db.prepare('DELETE FROM sections WHERE id = ?').run(existing.id);
  return { ok: true };
}

export async function pickSection(user, sectionId) {
  const cid = collegeId(user);
  const section = await db.prepare(`
    SELECT s.id, s.offering_id, s.kind, s.capacity
    FROM sections s
    INNER JOIN course_offerings o ON o.id = s.offering_id
    INNER JOIN uni_courses uc ON uc.id = o.uni_course_id
    INNER JOIN departments d ON d.id = uc.department_id
    WHERE s.id = ? AND d.college_id = ?
  `).get(sectionId, cid);
  if (!section) throw httpError(404, 'Section not found');
  const enrollment = await db.prepare(`
    SELECT id FROM enrollments WHERE user_id = ? AND offering_id = ? AND status = 'enrolled'
  `).get(user.id, section.offering_id);
  if (!enrollment) throw httpError(403, 'You are not enrolled in this course');
  const taken = await db.prepare(`
    SELECT COUNT(*)::int AS n FROM enrollment_section_picks p
    INNER JOIN enrollments e ON e.id = p.enrollment_id
    WHERE p.section_id = ? AND e.status = 'enrolled'
  `).get(section.id);
  const alreadyHere = await db.prepare(
    'SELECT id FROM enrollment_section_picks WHERE enrollment_id = ? AND section_id = ?'
  ).get(enrollment.id, section.id);
  if (!alreadyHere && Number(taken?.n || 0) >= Number(section.capacity)) {
    throw httpError(400, 'This section is full');
  }
  const sameKind = await db.prepare(`
    SELECT p.id FROM enrollment_section_picks p
    INNER JOIN sections s ON s.id = p.section_id
    WHERE p.enrollment_id = ? AND s.kind = ? AND s.id <> ?
  `).all(enrollment.id, section.kind, section.id);
  for (const row of sameKind) {
    await db.prepare('DELETE FROM enrollment_section_picks WHERE id = ?').run(row.id);
  }
  if (!alreadyHere) {
    await db.prepare('INSERT INTO enrollment_section_picks (enrollment_id, section_id) VALUES (?, ?)')
      .run(enrollment.id, section.id);
  }
  return listMyCourseStaff(user);
}

export async function listMyCourseStaff(user) {
  const uni = orgUniversityId(user);
  const term = uni ? await getCurrentTerm(uni) : null;
  if (!term) return { term: null, offerings: [] };
  const offerings = await db.prepare(`
    SELECT o.id, uc.course_code, uc.course_name, e.id AS enrollment_id
    FROM enrollments e
    INNER JOIN course_offerings o ON o.id = e.offering_id
    INNER JOIN uni_courses uc ON uc.id = o.uni_course_id
    WHERE e.user_id = ? AND e.status = 'enrolled' AND o.term_id = ?
    ORDER BY uc.course_code ASC
  `).all(user.id, term.id);
  const ids = offerings.map((o) => o.id);
  const [staff, sections] = await Promise.all([staffForOfferings(ids), sectionsForOfferings(ids)]);
  const picks = ids.length
    ? await db.prepare(`
        SELECT p.section_id, e.offering_id
        FROM enrollment_section_picks p
        INNER JOIN enrollments e ON e.id = p.enrollment_id
        WHERE e.user_id = ? AND e.offering_id IN (${ids.map(() => '?').join(', ')})
      `).all(user.id, ...ids)
    : [];
  const picked = new Set(picks.map((p) => Number(p.section_id)));
  return {
    term,
    staff_roles: STAFF_ROLES,
    section_kinds: SECTION_KINDS,
    offerings: attachToOfferings(offerings, staff, sections).map((o) => ({
      ...o,
      sections: o.sections.map((s) => ({ ...s, picked: picked.has(Number(s.id)) })),
    })),
  };
}

export async function listMyTeachings(user) {
  if (!isTeachingStaffRole(user.role)) return { term: null, offerings: [] };
  const uni = orgUniversityId(user);
  const term = uni ? await getCurrentTerm(uni) : null;
  if (!term) return { term: null, offerings: [] };
  const offerings = await db.prepare(`
    SELECT DISTINCT o.id, uc.course_code, uc.course_name, uc.catalog_course_id, uc.credit_hours, o.term_id,
           (SELECT COUNT(*)::int FROM enrollments e WHERE e.offering_id = o.id AND e.status = 'enrolled') AS enrolled_count
    FROM course_offerings o
    INNER JOIN uni_courses uc ON uc.id = o.uni_course_id
    LEFT JOIN course_staff cs ON cs.offering_id = o.id AND cs.user_id = ?
    LEFT JOIN sections sec ON sec.offering_id = o.id AND sec.staff_user_id = ?
    WHERE o.term_id = ? AND (cs.id IS NOT NULL OR sec.id IS NOT NULL)
    ORDER BY uc.course_code ASC
  `).all(user.id, user.id, term.id);
  const ids = offerings.map((o) => o.id);
  const [staff, sections] = await Promise.all([staffForOfferings(ids), sectionsForOfferings(ids)]);
  return { term, offerings: attachToOfferings(offerings, staff, sections) };
}
