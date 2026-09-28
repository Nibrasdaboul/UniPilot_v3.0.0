import { db } from '../db.js';
import { GRADE_COMPONENTS, weightedComponents, computeOfficialFinal, parseMarkInput, PASS_MARK, mapCourseWorkToOfficialMarks, assertManualOfficialEntryLocked } from '../college/officialGrades.js';
import { COURSE_WORK_COMPONENTS, computeCourseWorkPercent } from '../college/courseWorkGrades.js';
import { getCurrentTerm, listOfferingsForTerm } from './registrationService.js';
import { syncStudentAcademicRecordByUserId } from './studentGpaService.js';
import { loadApprovedOfferingStats, statsForOffering } from './approvedGradeStatsService.js';
import { summarizeApprovedMarks } from '../college/approvedGradeStats.js';
import { isOfficialWithdrawal } from '../college/withdrawalMarks.js';

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

async function offeringInCollege(offeringId, user) {
  const uni = orgUniversityId(user);
  const cid = collegeId(user);
  if (!uni || !cid) throw httpError(400, 'User is not attached to a college');
  const row = await db.prepare(`
    SELECT o.id, o.uni_course_id, o.term_id, o.capacity,
           uc.course_code, uc.course_name, uc.credit_hours, uc.catalog_course_id,
           uc.weight_sai, uc.weight_theory, uc.weight_practical, uc.weight_midterm,
           uc.weight_practical_midterm, uc.weight_practical_final, uc.weight_theory_final,
           d.name AS department_name, d.college_id, t.name AS term_name, t.university_id
    FROM course_offerings o
    INNER JOIN uni_courses uc ON uc.id = o.uni_course_id
    INNER JOIN departments d ON d.id = uc.department_id
    INNER JOIN academic_terms t ON t.id = o.term_id
    WHERE o.id = ? AND t.university_id = ? AND d.college_id = ?
  `).get(offeringId, uni, cid);
  if (!row) throw httpError(404, 'Offering not found');
  return row;
}

async function enrollmentInCollege(enrollmentId, user) {
  const uni = orgUniversityId(user);
  const cid = collegeId(user);
  const row = await db.prepare(`
    SELECT e.id, e.user_id, e.offering_id, e.term_id, e.status,
           o.uni_course_id,
           uc.course_code, uc.course_name, uc.credit_hours, uc.catalog_course_id,
           uc.weight_sai, uc.weight_theory, uc.weight_practical, uc.weight_midterm,
           uc.weight_practical_midterm, uc.weight_practical_final, uc.weight_theory_final,
           d.college_id, t.university_id, t.name AS term_name
    FROM enrollments e
    INNER JOIN course_offerings o ON o.id = e.offering_id
    INNER JOIN uni_courses uc ON uc.id = o.uni_course_id
    INNER JOIN departments d ON d.id = uc.department_id
    INNER JOIN academic_terms t ON t.id = e.term_id
    WHERE e.id = ? AND t.university_id = ? AND d.college_id = ?
  `).get(enrollmentId, uni, cid);
  if (!row) throw httpError(404, 'Enrollment not found');
  if (row.status !== 'enrolled') throw httpError(400, 'Student is not enrolled in this offering');
  return row;
}

function marksMap(rows, { publishedOnly = false } = {}) {
  const map = {};
  for (const r of rows || []) {
    if (publishedOnly && r.status !== 'published') continue;
    map[r.component] = {
      score: r.score,
      max_score: r.max_score,
      status: r.status,
      updated_at: r.updated_at,
    };
  }
  return map;
}

async function applyOfficialFinalize(studentCourse, userId, finalMark) {
  const passed = Number(finalMark) >= PASS_MARK ? 1 : 0;
  await db.prepare(`
    UPDATE student_courses SET current_grade = ?, progress = ?, passed = ?, finalized_at = COALESCE(finalized_at, CURRENT_TIMESTAMP)
    WHERE id = ?
  `).run(finalMark, finalMark, passed, studentCourse.id);
  await syncStudentAcademicRecordByUserId(userId);
}

async function ensureStudentCourse(enrollment) {
  let sc = await db.prepare('SELECT * FROM student_courses WHERE enrollment_id = ?').get(enrollment.id);
  if (sc) return sc;
  const sem = await db.prepare(
    'SELECT id FROM student_semesters WHERE user_id = ? AND academic_term_id = ?'
  ).get(enrollment.user_id, enrollment.term_id);
  const r = await db.prepare(`
    INSERT INTO student_courses
      (user_id, catalog_course_id, course_name, course_code, credit_hours, semester, semester_id, enrollment_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    enrollment.user_id,
    enrollment.catalog_course_id || null,
    enrollment.course_name,
    enrollment.course_code,
    Math.round(Number(enrollment.credit_hours) || 3),
    enrollment.term_name || 'Term',
    sem?.id || null,
    enrollment.id,
  );
  return db.prepare('SELECT * FROM student_courses WHERE id = ?').get(r.lastInsertRowid);
}

async function upsertPublishedOfficialMark(enrollmentId, component, cell, actorId) {
  const existing = await db.prepare(
    'SELECT id FROM official_marks WHERE enrollment_id = ? AND component = ?'
  ).get(enrollmentId, component);
  if (existing) {
    await db.prepare(`
      UPDATE official_marks
      SET score = ?, max_score = ?, status = 'published',
          reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP,
          updated_by = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(cell.score, cell.max_score, actorId || null, actorId || null, existing.id);
    return;
  }
  await db.prepare(`
    INSERT INTO official_marks
      (enrollment_id, component, score, max_score, status, updated_by, reviewed_by, reviewed_at)
    VALUES (?, ?, ?, ?, 'published', ?, ?, CURRENT_TIMESTAMP)
  `).run(enrollmentId, component, cell.score, cell.max_score, actorId || null, actorId || null);
}

export async function syncOfficialMarksFromCourseWork(user, catalogCourseId, gradesRows = null) {
  const catalogId = Number(catalogCourseId);
  if (!Number.isFinite(catalogId)) return { synced: 0 };
  let rows = gradesRows;
  if (!rows) {
    const { getCourseWorkGrades } = await import('./courseWorkGradesService.js');
    const { sheetStaffNeeds } = await import('./courseWorkSheetsService.js');
    const needs = await sheetStaffNeeds(user, catalogId);
    const grades = await getCourseWorkGrades(user, catalogId, needs.offeringIds);
    rows = grades.rows || [];
  }
  const course = await db.prepare(`
    SELECT uc.weight_sai, uc.weight_theory, uc.weight_practical, uc.weight_midterm,
           uc.weight_practical_midterm, uc.weight_practical_final, uc.weight_theory_final
    FROM uni_courses uc
    INNER JOIN departments d ON d.id = uc.department_id
    WHERE uc.catalog_course_id = ?
    LIMIT 1
  `).get(catalogId);
  const components = weightedComponents(course || {});
  const enrollments = await db.prepare(`
    SELECT e.id, e.user_id
    FROM enrollments e
    INNER JOIN course_offerings o ON o.id = e.offering_id
    INNER JOIN uni_courses uc ON uc.id = o.uni_course_id
    WHERE e.status = 'enrolled' AND uc.catalog_course_id = ?
  `).all(catalogId);
  const byUser = new Map();
  for (const enrollment of enrollments || []) {
    const uid = Number(enrollment.user_id);
    if (!byUser.has(uid)) byUser.set(uid, []);
    byUser.get(uid).push(Number(enrollment.id));
  }
  let synced = 0;
  for (const row of (rows || []).filter((item) => !item.withdrawn)) {
    const official = mapCourseWorkToOfficialMarks(row, { components });
    const ids = byUser.get(Number(row.user_id)) || [];
    for (const enrollmentId of ids) {
      for (const [component, cell] of Object.entries(official)) {
        await upsertPublishedOfficialMark(enrollmentId, component, cell, user?.id);
        synced += 1;
      }
    }
  }
  return { synced };
}

export async function listGradeOfferings(user) {
  const uni = orgUniversityId(user);
  const cid = collegeId(user);
  if (!uni || !cid) return { term: null, offerings: [] };
  const term = await getCurrentTerm(uni);
  if (!term) return { term: null, offerings: [] };
  const offerings = await listOfferingsForTerm(term.id, cid);
  const approved = await loadApprovedOfferingStats(cid, term.id);
  return {
    term,
    components: GRADE_COMPONENTS,
    curve: approved.curve,
    fail_rate: approved.fail_rate,
    published: approved.published,
    failed: approved.failed,
    offerings: (offerings || []).map((offering) => ({
      ...offering,
      ...statsForOffering(approved.byOffering, offering.id, offering.enrolled_count),
    })),
  };
}

export async function getOfferingRoster(user, offeringId) {
  const offering = await offeringInCollege(offeringId, user);
  if (offering.catalog_course_id) {
    try {
      const sheet = await db.prepare(
        'SELECT status FROM course_work_sheets WHERE college_id = ? AND catalog_course_id = ?'
      ).get(collegeId(user), Number(offering.catalog_course_id));
      if (sheet && String(sheet.status) === 'published') {
        await syncOfficialMarksFromCourseWork(user, offering.catalog_course_id);
      }
    } catch (err) {
      if (err?.code !== '42P01') throw err;
    }
  }
  const components = weightedComponents(offering);
  const students = await db.prepare(`
    SELECT e.id AS enrollment_id, e.user_id, e.status,
           u.full_name, u.person_code,
           sc.id AS student_course_id, sc.current_grade, sc.finalized_at, sc.passed
    FROM enrollments e
    INNER JOIN users u ON u.id = e.user_id
    LEFT JOIN student_courses sc ON sc.enrollment_id = e.id
    WHERE e.offering_id = ? AND e.status IN ('enrolled', 'withdrawn')
    ORDER BY u.full_name ASC, e.id ASC
  `).all(offering.id);
  const marks = await db.prepare(`
    SELECT om.enrollment_id, om.component, om.score, om.max_score, om.status, om.updated_at
    FROM official_marks om
    INNER JOIN enrollments e ON e.id = om.enrollment_id
    WHERE e.offering_id = ?
  `).all(offering.id);
  const byEnrollment = new Map();
  for (const m of marks) {
    if (!byEnrollment.has(Number(m.enrollment_id))) byEnrollment.set(Number(m.enrollment_id), []);
    byEnrollment.get(Number(m.enrollment_id)).push(m);
  }
  const courseWorkByUser = new Map();
  if (offering.catalog_course_id && collegeId(user)) {
    try {
      const cwRows = await db.prepare(`
        SELECT user_id, component, score, max_score, practical_kind
        FROM course_work_marks
        WHERE college_id = ? AND catalog_course_id = ?
      `).all(collegeId(user), Number(offering.catalog_course_id));
      for (const row of cwRows || []) {
        const uid = Number(row.user_id);
        const current = courseWorkByUser.get(uid) || {};
        current[row.component] = {
          score: row.score == null ? null : Number(row.score),
          max_score: Number(row.max_score) || 100,
          practical_kind: row.component === 'practical' ? (row.practical_kind || 'exam') : null,
        };
        courseWorkByUser.set(uid, current);
      }
    } catch (err) {
      if (err?.code !== '42P01') throw err;
    }
  }
  const gradeByUser = new Map();
  if (offering.catalog_course_id) {
    const sent = await db.prepare(`
      SELECT user_id, current_grade
      FROM student_courses
      WHERE catalog_course_id = ? AND current_grade IS NOT NULL
    `).all(Number(offering.catalog_course_id));
    for (const row of sent || []) {
      gradeByUser.set(Number(row.user_id), Number(row.current_grade));
    }
  }
  const studentsMapped = students.map((s) => {
      if (s.status === 'withdrawn') {
        return {
          enrollment_id: s.enrollment_id,
          user_id: s.user_id,
          full_name: s.full_name,
          person_code: s.person_code,
          student_course_id: s.student_course_id,
          withdrawn: true,
          marks: {},
          course_work: {},
          percent: null,
          draft_final: null,
          complete: false,
          missing: [],
          published: false,
          published_final: null,
          current_grade: null,
          finalized_at: null,
          passed: null,
        };
      }
      const map = marksMap(byEnrollment.get(Number(s.enrollment_id)) || []);
      const computed = computeOfficialFinal(components, map);
      const publishedMap = marksMap(byEnrollment.get(Number(s.enrollment_id)) || [], { publishedOnly: true });
      const published = computeOfficialFinal(components, publishedMap);
      const cw = courseWorkByUser.get(Number(s.user_id)) || {};
      const courseWork = {
        midterm_theory: cw.midterm_theory || { score: null, max_score: 100 },
        sai_theory: cw.sai_theory || { score: null, max_score: 100 },
        final_theory: cw.final_theory || { score: null, max_score: 100 },
        practical: cw.practical || { score: null, max_score: 100, practical_kind: 'exam' },
      };
      const approvedGrade = s.current_grade != null
        ? Number(s.current_grade)
        : (gradeByUser.get(Number(s.user_id)) ?? null);
      const percent = approvedGrade ?? computeCourseWorkPercent(courseWork, offering);
      return {
        enrollment_id: s.enrollment_id,
        user_id: s.user_id,
        full_name: s.full_name,
        person_code: s.person_code,
        student_course_id: s.student_course_id,
        withdrawn: false,
        marks: map,
        course_work: courseWork,
        percent,
        draft_final: computed.final,
        complete: computed.complete,
        missing: computed.missing,
        published: published.complete,
        published_final: published.final ?? percent,
        current_grade: approvedGrade,
        finalized_at: s.finalized_at,
        passed: s.passed,
      };
    });
  const approved = await loadApprovedOfferingStats(collegeId(user), offering.term_id);
  const activeStudents = studentsMapped.filter((s) => !s.withdrawn);
  const stats = statsForOffering(approved.byOffering, offering.id, activeStudents.length);
  const rosterSummary = summarizeApprovedMarks(
    activeStudents.map((s) => ({
      current_grade: s.current_grade,
      passed: s.passed,
    })),
    { enrolled: activeStudents.length },
  );
  return {
    offering: {
      id: offering.id,
      course_code: offering.course_code,
      course_name: offering.course_name,
      term_id: offering.term_id,
      term_name: offering.term_name,
      catalog_course_id: offering.catalog_course_id || null,
    },
    components,
    display_components: COURSE_WORK_COMPONENTS,
    stats: {
      ...stats,
      published: rosterSummary.published,
      failed: rosterSummary.failed,
      fail_rate: rosterSummary.fail_rate,
      published_pct: rosterSummary.published_pct,
      curve: rosterSummary.curve,
    },
    students: studentsMapped,
  };
}

export async function saveEnrollmentMarks(user, enrollmentId, marksInput) {
  assertManualOfficialEntryLocked();
  const enrollment = await enrollmentInCollege(enrollmentId, user);
  const components = weightedComponents(enrollment);
  const allowed = new Set(components.map((c) => c.key));
  const incoming = marksInput && typeof marksInput === 'object' ? marksInput : {};
  for (const [key, raw] of Object.entries(incoming)) {
    if (!allowed.has(key)) continue;
    const payload = raw && typeof raw === 'object' ? raw : { score: raw };
    const max = payload.max_score != null ? Number(payload.max_score) : 100;
    const score = parseMarkInput(payload.score, max);
    const existing = await db.prepare(
      'SELECT id FROM official_marks WHERE enrollment_id = ? AND component = ?'
    ).get(enrollment.id, key);
    if (score == null) {
      if (existing) await db.prepare('DELETE FROM official_marks WHERE id = ?').run(existing.id);
      continue;
    }
    if (existing) {
      await db.prepare(`
        UPDATE official_marks
        SET score = ?, max_score = ?, status = 'draft', updated_by = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(score, max, user.id, existing.id);
    } else {
      await db.prepare(`
        INSERT INTO official_marks (enrollment_id, component, score, max_score, status, updated_by)
        VALUES (?, ?, ?, ?, 'draft', ?)
      `).run(enrollment.id, key, score, max, user.id);
    }
  }
  return getOfferingRoster(user, enrollment.offering_id);
}

export async function publishEnrollment(user, enrollmentId) {
  const enrollment = await enrollmentInCollege(enrollmentId, user);
  const components = weightedComponents(enrollment);
  const rows = await db.prepare(
    'SELECT component, score, max_score, status FROM official_marks WHERE enrollment_id = ?'
  ).all(enrollment.id);
  const map = marksMap(rows);
  const computed = computeOfficialFinal(components, map);
  if (!computed.complete) {
    throw httpError(400, `Enter every required component before publishing (${computed.missing.join(', ')})`);
  }
  for (const c of components) {
    await db.prepare(`
      UPDATE official_marks
      SET status = 'published', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, updated_by = ?, updated_at = CURRENT_TIMESTAMP
      WHERE enrollment_id = ? AND component = ?
    `).run(user.id, user.id, enrollment.id, c.key);
  }
  const sc = await ensureStudentCourse(enrollment);
  await applyOfficialFinalize(sc, enrollment.user_id, computed.final);
  return getOfferingRoster(user, enrollment.offering_id);
}

export async function getMyCourseOfficial(user, studentCourseId) {
  const sc = await db.prepare(
    'SELECT id, user_id, enrollment_id, current_grade, finalized_at, passed, withdrawn, withdrawn_at FROM student_courses WHERE id = ? AND user_id = ?'
  ).get(studentCourseId, user.id);
  if (!sc) throw httpError(404, 'Course not found');
  if (isOfficialWithdrawal(sc)) {
    return { official: true, withdrawn: true, components: [], marks: {}, final: null, published: false };
  }
  if (!sc.enrollment_id) {
    return { official: false, components: [], marks: {}, final: sc.current_grade, published: false };
  }
  const enrollment = await db.prepare(`
    SELECT e.id, uc.weight_sai, uc.weight_theory, uc.weight_practical, uc.weight_midterm,
           uc.weight_practical_midterm, uc.weight_practical_final, uc.weight_theory_final
    FROM enrollments e
    INNER JOIN course_offerings o ON o.id = e.offering_id
    INNER JOIN uni_courses uc ON uc.id = o.uni_course_id
    WHERE e.id = ?
  `).get(sc.enrollment_id);
  const components = weightedComponents(enrollment || {});
  const rows = await db.prepare(
    `SELECT component, score, max_score, status, updated_at FROM official_marks WHERE enrollment_id = ?`
  ).all(sc.enrollment_id);
  const published = marksMap(rows, { publishedOnly: true });
  const computed = computeOfficialFinal(components, published);
  return {
    official: true,
    components,
    marks: published,
    final: computed.final ?? sc.current_grade,
    published: computed.complete,
    passed: computed.complete ? computed.passed : (sc.passed === 1),
    finalized_at: sc.finalized_at,
  };
}
