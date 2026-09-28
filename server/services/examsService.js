import { db } from '../db.js';
import { EXAM_TYPES, isExamType, hallFitsEnrolled, generateSeatLabels } from '../college/exams.js';
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

const SESSION_SELECT = `
  s.id, s.university_id, s.offering_id, s.hall_id, s.exam_type, s.room_name, s.starts_at, s.ends_at,
  s.proctor_user_id, s.notes, s.is_published, s.created_at,
  h.name AS hall_name, h.capacity AS hall_capacity, h.building,
  uc.course_code, uc.course_name, o.term_id,
  (SELECT COUNT(*)::int FROM enrollments e WHERE e.offering_id = s.offering_id AND e.status = 'enrolled') AS enrolled_count,
  (SELECT COUNT(*)::int FROM exam_session_seating seat WHERE seat.session_id = s.id) AS seated_count
`;

async function offeringInCollege(offeringId, user) {
  const uni = orgUniversityId(user);
  const cid = collegeId(user);
  if (!uni || !cid) throw httpError(400, 'User is not attached to a college');
  const row = await db.prepare(`
    SELECT o.id, o.term_id, o.uni_course_id, uc.course_code, uc.course_name,
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

async function hallInUniversity(hallId, user) {
  const uni = orgUniversityId(user);
  const row = await db.prepare('SELECT id, university_id, name, capacity, building FROM exam_halls WHERE id = ? AND university_id = ?')
    .get(hallId, uni);
  if (!row) throw httpError(404, 'Hall not found');
  return row;
}

async function sessionInScope(sessionId, user) {
  const uni = orgUniversityId(user);
  const cid = collegeId(user);
  const row = await db.prepare(`
    SELECT ${SESSION_SELECT}
    FROM exam_sessions s
    LEFT JOIN exam_halls h ON h.id = s.hall_id
    LEFT JOIN course_offerings o ON o.id = s.offering_id
    LEFT JOIN uni_courses uc ON uc.id = o.uni_course_id
    LEFT JOIN departments d ON d.id = uc.department_id
    WHERE s.id = ? AND s.university_id = ? AND (d.college_id IS NULL OR d.college_id = ?)
  `).get(sessionId, uni, cid);
  if (!row) throw httpError(404, 'Exam session not found');
  return row;
}

async function assertNoHallClash(hallId, startsAt, endsAt, ignoreId) {
  if (!hallId) return;
  const others = await db.prepare(`
    SELECT id, starts_at, ends_at FROM exam_sessions
    WHERE hall_id = ? AND starts_at IS NOT NULL AND ends_at IS NOT NULL
      AND starts_at < ? AND ends_at > ?
      ${ignoreId ? 'AND id <> ?' : ''}
  `).all(...(ignoreId ? [hallId, endsAt, startsAt, ignoreId] : [hallId, endsAt, startsAt]));
  if (others.length) throw httpError(400, 'This hall is already booked at that time');
}

async function seatSession(sessionId, offeringId) {
  await db.prepare('DELETE FROM exam_session_seating WHERE session_id = ?').run(sessionId);
  const students = await db.prepare(`
    SELECT e.user_id FROM enrollments e
    WHERE e.offering_id = ? AND e.status = 'enrolled'
    ORDER BY e.id ASC
  `).all(offeringId);
  const labels = generateSeatLabels(students.length);
  for (let i = 0; i < students.length; i += 1) {
    await db.prepare(`
      INSERT INTO exam_session_seating (session_id, student_user_id, seat_label)
      VALUES (?, ?, ?)
    `).run(sessionId, students[i].user_id, labels[i]);
  }
  return students.length;
}

export async function listHalls(user) {
  const uni = orgUniversityId(user);
  if (!uni) return [];
  return db.prepare(`
    SELECT id, university_id, name, capacity, building, created_at
    FROM exam_halls WHERE university_id = ?
    ORDER BY name ASC, id ASC
  `).all(uni);
}

export async function createHall(user, body) {
  const uni = orgUniversityId(user);
  if (!uni) throw httpError(400, 'User is not attached to a university');
  const name = String(body?.name || '').trim();
  if (!name) throw httpError(400, 'Hall name is required');
  const capacity = parseInt(body?.capacity, 10);
  if (!Number.isFinite(capacity) || capacity < 1) throw httpError(400, 'Capacity must be at least 1');
  const building = String(body?.building || '').trim() || null;
  const r = await db.prepare(`
    INSERT INTO exam_halls (university_id, name, capacity, building) VALUES (?, ?, ?, ?)
  `).run(uni, name, capacity, building);
  return db.prepare('SELECT id, university_id, name, capacity, building, created_at FROM exam_halls WHERE id = ?').get(r.lastInsertRowid);
}

export async function updateHall(user, id, body) {
  const hall = await hallInUniversity(id, user);
  const name = body?.name != null ? String(body.name).trim() : hall.name;
  if (!name) throw httpError(400, 'Hall name is required');
  const capacity = body?.capacity != null ? parseInt(body.capacity, 10) : Number(hall.capacity);
  if (!Number.isFinite(capacity) || capacity < 1) throw httpError(400, 'Capacity must be at least 1');
  const building = body?.building !== undefined ? (String(body.building || '').trim() || null) : hall.building;
  await db.prepare('UPDATE exam_halls SET name = ?, capacity = ?, building = ? WHERE id = ?').run(name, capacity, building, hall.id);
  return db.prepare('SELECT id, university_id, name, capacity, building, created_at FROM exam_halls WHERE id = ?').get(hall.id);
}

export async function deleteHall(user, id) {
  const hall = await hallInUniversity(id, user);
  const used = await db.prepare('SELECT COUNT(*)::int AS n FROM exam_sessions WHERE hall_id = ?').get(hall.id);
  if (Number(used?.n || 0) > 0) throw httpError(400, 'Cannot delete a hall that already has exam sessions');
  await db.prepare('DELETE FROM exam_halls WHERE id = ?').run(hall.id);
  return { ok: true };
}

export async function listExamBoard(user) {
  const uni = orgUniversityId(user);
  const cid = collegeId(user);
  const term = uni ? await getCurrentTerm(uni) : null;
  const offerings = term && cid ? await listOfferingsForTerm(term.id, cid) : [];
  const halls = await listHalls(user);
  let sessions = [];
  if (term && uni) {
    sessions = await db.prepare(`
      SELECT ${SESSION_SELECT}
      FROM exam_sessions s
      LEFT JOIN exam_halls h ON h.id = s.hall_id
      INNER JOIN course_offerings o ON o.id = s.offering_id
      INNER JOIN uni_courses uc ON uc.id = o.uni_course_id
      INNER JOIN departments d ON d.id = uc.department_id
      WHERE s.university_id = ? AND o.term_id = ? AND d.college_id = ?
      ORDER BY s.starts_at ASC NULLS LAST, s.id ASC
    `).all(uni, term.id, cid);
  }
  return { term, exam_types: EXAM_TYPES, halls, offerings, sessions };
}

export async function createSession(user, body) {
  const uni = orgUniversityId(user);
  if (!uni) throw httpError(400, 'User is not attached to a university');
  const offering = await offeringInCollege(parseInt(body?.offering_id, 10), user);
  const term = await getCurrentTerm(uni);
  if (!term || Number(offering.term_id) !== Number(term.id)) {
    throw httpError(400, 'Exams can only be scheduled for the current term');
  }
  const examType = String(body?.exam_type || '').trim();
  if (!isExamType(examType)) throw httpError(400, 'exam_type must be midterm, practical, or theory_final');
  const startsAt = body?.starts_at;
  const endsAt = body?.ends_at;
  if (!startsAt || !endsAt) throw httpError(400, 'starts_at and ends_at are required');
  if (new Date(endsAt) <= new Date(startsAt)) throw httpError(400, 'ends_at must be after starts_at');
  const hallId = body?.hall_id != null && body.hall_id !== '' ? parseInt(body.hall_id, 10) : null;
  let hall = null;
  if (hallId) {
    hall = await hallInUniversity(hallId, user);
    if (!hallFitsEnrolled(offering.enrolled_count, hall.capacity)) {
      throw httpError(400, `Hall capacity (${hall.capacity}) is below enrolled students (${offering.enrolled_count})`);
    }
    await assertNoHallClash(hall.id, startsAt, endsAt, null);
  }
  const r = await db.prepare(`
    INSERT INTO exam_sessions
      (university_id, offering_id, hall_id, exam_type, room_name, starts_at, ends_at, notes, is_published)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
  `).run(uni, offering.id, hall?.id || null, examType, hall?.name || null, startsAt, endsAt, body?.notes || null);
  return sessionInScope(r.lastInsertRowid, user);
}

export async function updateSession(user, id, body) {
  const existing = await sessionInScope(id, user);
  const startsAt = body?.starts_at || existing.starts_at;
  const endsAt = body?.ends_at || existing.ends_at;
  if (new Date(endsAt) <= new Date(startsAt)) throw httpError(400, 'ends_at must be after starts_at');
  const examType = body?.exam_type != null ? String(body.exam_type).trim() : existing.exam_type;
  if (examType && !isExamType(examType)) throw httpError(400, 'exam_type must be midterm, practical, or theory_final');
  let hallId = existing.hall_id;
  if (body?.hall_id !== undefined) {
    hallId = body.hall_id === '' || body.hall_id == null ? null : parseInt(body.hall_id, 10);
  }
  let hall = null;
  if (hallId) {
    hall = await hallInUniversity(hallId, user);
    if (!hallFitsEnrolled(existing.enrolled_count, hall.capacity)) {
      throw httpError(400, `Hall capacity (${hall.capacity}) is below enrolled students (${existing.enrolled_count})`);
    }
    await assertNoHallClash(hall.id, startsAt, endsAt, existing.id);
  }
  await db.prepare(`
    UPDATE exam_sessions
    SET hall_id = ?, exam_type = ?, room_name = ?, starts_at = ?, ends_at = ?, notes = ?
    WHERE id = ?
  `).run(hall?.id || null, examType || existing.exam_type, hall?.name || existing.room_name, startsAt, endsAt, body?.notes !== undefined ? body.notes : existing.notes, existing.id);
  return sessionInScope(existing.id, user);
}

export async function deleteSession(user, id) {
  const existing = await sessionInScope(id, user);
  await db.prepare('DELETE FROM exam_sessions WHERE id = ?').run(existing.id);
  return { ok: true };
}

export async function publishSession(user, id) {
  const existing = await sessionInScope(id, user);
  if (!existing.hall_id) throw httpError(400, 'Assign a hall before publishing');
  if (!existing.starts_at || !existing.ends_at) throw httpError(400, 'Set exam times before publishing');
  const hall = await hallInUniversity(existing.hall_id, user);
  if (!hallFitsEnrolled(existing.enrolled_count, hall.capacity)) {
    throw httpError(400, `Hall capacity (${hall.capacity}) is below enrolled students (${existing.enrolled_count})`);
  }
  await seatSession(existing.id, existing.offering_id);
  await db.prepare('UPDATE exam_sessions SET is_published = 1, room_name = ? WHERE id = ?').run(hall.name, existing.id);
  return getSessionDetail(user, existing.id);
}

export async function getSessionDetail(user, id) {
  const session = await sessionInScope(id, user);
  const seating = await db.prepare(`
    SELECT seat.id, seat.seat_label, seat.student_user_id, u.full_name, u.person_code
    FROM exam_session_seating seat
    INNER JOIN users u ON u.id = seat.student_user_id
    WHERE seat.session_id = ?
    ORDER BY seat.seat_label ASC, seat.id ASC
  `).all(session.id);
  return { ...session, seating };
}

export async function listMyExams(user) {
  const uni = orgUniversityId(user);
  if (!uni) return { term: null, exams: [] };
  const term = await getCurrentTerm(uni);
  if (!term) return { term: null, exams: [] };
  const exams = await db.prepare(`
    SELECT s.id, s.exam_type, s.starts_at, s.ends_at, s.room_name, s.is_published,
           h.name AS hall_name, h.building, uc.course_code, uc.course_name,
           seat.seat_label
    FROM exam_sessions s
    INNER JOIN course_offerings o ON o.id = s.offering_id
    INNER JOIN uni_courses uc ON uc.id = o.uni_course_id
    INNER JOIN enrollments e ON e.offering_id = o.id AND e.user_id = ? AND e.status = 'enrolled'
    LEFT JOIN exam_halls h ON h.id = s.hall_id
    LEFT JOIN exam_session_seating seat ON seat.session_id = s.id AND seat.student_user_id = ?
    WHERE s.university_id = ? AND o.term_id = ? AND COALESCE(s.is_published, 0) = 1
    ORDER BY s.starts_at ASC NULLS LAST, s.id ASC
  `).all(user.id, user.id, uni, term.id);
  return { term, exam_types: EXAM_TYPES, exams };
}
