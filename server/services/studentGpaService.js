import { db } from '../db.js';
import { COURSE_WORK_COMPONENTS } from '../college/courseWorkGrades.js';
import { lookupGpaScale } from '../college/gpaScale.js';
import {
  computeRunningCumulative,
  computeUnweightedTerm,
  honorRankFromPercent,
  isWithdrawn,
  sortHistoryTermsForDisplay,
} from '../college/unweightedGpa.js';
import { applyDeprivationStanding } from '../college/deprivationGrade.js';
import { hideWithdrawnMarks, isOfficialWithdrawal } from '../college/withdrawalMarks.js';
import { applyScaleToCourses, getCollegeGpaScaleRows } from './gpaScaleService.js';
import { listStudentActiveDeprivationCatalogIds } from './attendanceSheetsService.js';

function creditHours(course) {
  return Number(course?.credit_hours) || 0;
}

function formatMarkDetail(component, cell, arabic) {
  const label = arabic ? component.ar : component.en;
  if (!cell || cell.score == null) return `${label}: —`;
  return `${label}: ${cell.score}/${cell.max_score || 100}`;
}

function emptyCell() {
  return { score: null, max_score: 100, practical_kind: null };
}

async function loadMarkMap(userId, collegeId, catalogIds) {
  const ids = [...new Set((catalogIds || []).map(Number).filter(Boolean))];
  const map = new Map();
  if (!ids.length || collegeId == null) return map;
  let rows = [];
  try {
    const placeholders = ids.map(() => '?').join(', ');
    rows = await db.prepare(`
      SELECT catalog_course_id, component, score, max_score, practical_kind
      FROM course_work_marks
      WHERE college_id = ? AND user_id = ? AND catalog_course_id IN (${placeholders})
    `).all(collegeId, userId, ...ids);
  } catch (err) {
    if (err?.code !== '42P01') throw err;
    return map;
  }
  for (const row of rows || []) {
    const catalogId = Number(row.catalog_course_id);
    const current = map.get(catalogId) || {};
    current[row.component] = {
      score: row.score == null ? null : Number(row.score),
      max_score: Number(row.max_score) || 100,
      practical_kind: row.component === 'practical' ? (row.practical_kind || 'exam') : null,
    };
    map.set(catalogId, current);
  }
  return map;
}

function decorateCourse(course, marks, arabic, deprivedIds) {
  const deprived = deprivedIds?.has(Number(course.catalog_course_id));
  const byKey = marks.get(Number(course.catalog_course_id)) || {};
  const cells = {
    midterm_theory: byKey.midterm_theory || emptyCell(),
    sai_theory: byKey.sai_theory || emptyCell(),
    final_theory: byKey.final_theory || emptyCell(),
    practical: byKey.practical || { ...emptyCell(), practical_kind: 'exam' },
  };
  const details = COURSE_WORK_COMPONENTS.map((component) => (
    formatMarkDetail(component, cells[component.key], arabic)
  ));
  return applyDeprivationStanding({
    ...course,
    mark_details: cells,
    mark_details_ar: details.join(' · '),
    mark_details_en: COURSE_WORK_COMPONENTS.map((component) => (
      formatMarkDetail(component, cells[component.key], false)
    )).join(' · '),
    deprived: Boolean(deprived),
    registered: course.finalized_at == null && !isWithdrawn(course),
  }, deprived);
}

async function currentAcademicTerm(universityId) {
  if (!universityId) return null;
  return db.prepare(`
    SELECT id, university_id, name, starts_on, ends_on, is_current, is_closed
    FROM academic_terms
    WHERE university_id = ? AND is_current = 1 AND COALESCE(is_closed, 0) = 0
    ORDER BY id DESC
    LIMIT 1
  `).get(universityId);
}

async function ensureCurrentTermHistoryRows(user) {
  const term = await currentAcademicTerm(user?.org_university_id);
  if (!term) return;
  let sem = await db.prepare(
    'SELECT * FROM student_semesters WHERE user_id = ? AND academic_term_id = ?'
  ).get(user.id, term.id);
  if (!sem) {
    await db.prepare('UPDATE student_semesters SET is_current = 0 WHERE user_id = ?').run(user.id);
    const maxOrder = await db.prepare(
      'SELECT COALESCE(MAX(sort_order), 0) AS m FROM student_semesters WHERE user_id = ?'
    ).get(user.id);
    const created = await db.prepare(`
      INSERT INTO student_semesters (user_id, name, sort_order, is_current, is_ended, academic_term_id)
      VALUES (?, ?, ?, 1, 0, ?)
    `).run(user.id, term.name, (maxOrder?.m ?? 0) + 1, term.id);
    sem = await db.prepare('SELECT * FROM student_semesters WHERE id = ?').get(created.lastInsertRowid);
  }
  const enrolls = await db.prepare(`
    SELECT e.id, uc.course_code, uc.course_name, uc.credit_hours, uc.catalog_course_id
    FROM enrollments e
    INNER JOIN course_offerings o ON o.id = e.offering_id
    INNER JOIN uni_courses uc ON uc.id = o.uni_course_id
    WHERE e.user_id = ? AND e.term_id = ? AND e.status = 'enrolled'
  `).all(user.id, term.id);
  for (const row of enrolls || []) {
    const linked = await db.prepare('SELECT id FROM student_courses WHERE enrollment_id = ?').get(row.id);
    if (linked) {
      await db.prepare('UPDATE student_courses SET withdrawn = 0, semester_id = ? WHERE id = ?')
        .run(sem.id, linked.id);
      continue;
    }
    const sameTerm = row.catalog_course_id
      ? await db.prepare(`
          SELECT id FROM student_courses
          WHERE user_id = ? AND catalog_course_id = ? AND semester_id = ?
        `).get(user.id, row.catalog_course_id, sem.id)
      : null;
    if (sameTerm) {
      await db.prepare('UPDATE student_courses SET enrollment_id = ?, withdrawn = 0 WHERE id = ?')
        .run(row.id, sameTerm.id);
      continue;
    }
    await db.prepare(`
      INSERT INTO student_courses
        (user_id, catalog_course_id, course_name, course_code, credit_hours, semester, semester_id, enrollment_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      user.id,
      row.catalog_course_id || null,
      row.course_name,
      row.course_code,
      Math.round(Number(row.credit_hours) || 3),
      term.name,
      sem.id,
      row.id,
    );
  }
}

export async function getStudentAcademicHistory(user) {
  await ensureCurrentTermHistoryRows(user);
  const userId = Number(user.id);
  const collegeId = user?.college_id != null ? Number(user.college_id) : null;
  const scaleRows = await getCollegeGpaScaleRows(collegeId);
  const letterOf = (percent) => lookupGpaScale(scaleRows, percent).letter;

  const rows = await db.prepare(`
    SELECT
      sc.id, sc.course_name, sc.course_code, sc.credit_hours, sc.current_grade,
      sc.finalized_at, sc.passed, sc.withdrawn, sc.withdrawn_at, sc.catalog_course_id, sc.semester_id,
      ss.name AS semester_name, ss.sort_order, ss.is_current AS semester_is_current,
      ss.academic_term_id,
      t.name AS term_name, t.starts_on, t.ends_on, t.is_current AS term_is_current, t.is_closed
    FROM student_courses sc
    LEFT JOIN student_semesters ss ON ss.id = sc.semester_id
    LEFT JOIN academic_terms t ON t.id = ss.academic_term_id
    WHERE sc.user_id = ?
    ORDER BY
      t.starts_on ASC NULLS LAST,
      ss.sort_order ASC,
      sc.id ASC
  `).all(userId);

  const groups = new Map();
  for (const row of rows || []) {
    const key = row.academic_term_id != null
      ? `term-${row.academic_term_id}`
      : (row.semester_id != null ? `sem-${row.semester_id}` : 'unassigned');
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        academic_term_id: row.academic_term_id != null ? Number(row.academic_term_id) : null,
        semester_id: row.semester_id != null ? Number(row.semester_id) : null,
        name: row.term_name || row.semester_name || 'فصل دراسي',
        starts_on: row.starts_on || null,
        ends_on: row.ends_on || null,
        is_current: Number(row.term_is_current || row.semester_is_current) === 1 ? 1 : 0,
        is_closed: Number(row.is_closed) === 1 ? 1 : 0,
        courses: [],
      });
    }
    groups.get(key).courses.push(row);
  }

  const catalogIds = (rows || []).map((row) => Number(row.catalog_course_id)).filter(Boolean);
  const marks = await loadMarkMap(userId, collegeId, catalogIds);
  const deprivedIds = await listStudentActiveDeprivationCatalogIds(user);
  const terms = [];
  for (const group of groups.values()) {
    const scaled = await applyScaleToCourses(user, group.courses);
    const visible = scaled.filter((course) => !isWithdrawn(course) || isOfficialWithdrawal(course));
    const decorated = visible.map((course) => hideWithdrawnMarks({
      ...decorateCourse(course, marks, true, deprivedIds),
      in_current_term: Number(group.is_current) === 1 && Number(group.is_closed) !== 1,
    }));
    const counted = decorated.filter((course) => !course.withdrawn_w);
    const hoursRegistered = counted.reduce((sum, course) => sum + creditHours(course), 0);
    const hoursCompleted = counted
      .filter((course) => course.finalized_at != null && Number(course.passed) === 1)
      .reduce((sum, course) => sum + creditHours(course), 0);
    const hoursCarried = counted
      .filter((course) => course.finalized_at != null && Number(course.passed) === 0)
      .reduce((sum, course) => sum + creditHours(course), 0);
    const termStats = computeUnweightedTerm(counted);
    terms.push({
      ...group,
      courses: decorated,
      hours_registered: hoursRegistered,
      hours_completed: hoursCompleted,
      hours_carried: hoursCarried,
      withdrawn_count: decorated.length - counted.length,
      ...termStats,
    });
  }

  const withCum = computeRunningCumulative(terms).map((term) => ({
    ...term,
    semester_letter: term.semester_percent == null ? null : letterOf(term.semester_percent),
    semester_rank: honorRankFromPercent(term.semester_percent),
    cumulative_letter: term.cumulative_percent == null ? null : letterOf(term.cumulative_percent),
    cumulative_rank: honorRankFromPercent(term.cumulative_percent),
  }));

  const current = [...withCum].reverse().find((term) => Number(term.is_current) === 1)
    || withCum[withCum.length - 1]
    || null;
  const latest = withCum[withCum.length - 1] || null;
  const allCourses = withCum.flatMap((term) => term.courses).filter((course) => !course.withdrawn_w);
  const creditsCompleted = allCourses
    .filter((course) => course.finalized_at != null && Number(course.passed) === 1)
    .reduce((sum, course) => sum + creditHours(course), 0);
  const creditsCarried = allCourses
    .filter((course) => course.finalized_at != null && Number(course.passed) === 0)
    .reduce((sum, course) => sum + creditHours(course), 0);
  const creditsCurrent = (current?.courses || [])
    .filter((course) => course.finalized_at == null && !course.withdrawn_w)
    .reduce((sum, course) => sum + creditHours(course), 0);

  const displayTerms = sortHistoryTermsForDisplay(withCum);
  const currentOpenKey = displayTerms.find((term) => (
    Number(term.is_current) === 1 && Number(term.is_closed) !== 1
  ))?.key;
  const termsForUi = displayTerms.map((term) => ({
    ...term,
    courses: (term.courses || []).map((course) => ({
      ...course,
      in_current_term: term.key === currentOpenKey,
    })),
  }));

  return {
    terms: termsForUi,
    current_term: current,
    semester_gpa: current?.semester_gpa ?? 0,
    semester_percent: current?.semester_percent ?? 0,
    semester_letter: current?.semester_letter ?? null,
    semester_rank: current?.semester_rank ?? null,
    cgpa: latest?.cgpa ?? 0,
    cumulative_percent: latest?.cumulative_percent ?? 0,
    cumulative_letter: latest?.cumulative_letter ?? null,
    cumulative_rank: latest?.cumulative_rank ?? null,
    credits_completed: creditsCompleted,
    credits_carried: creditsCarried,
    credits_current: creditsCurrent,
  };
}

export async function getStudentGpaSnapshot(user) {
  const history = await getStudentAcademicHistory(user);
  return {
    semester_gpa: history.semester_gpa,
    semester_percent: history.semester_percent,
    semester_letter: history.semester_letter,
    semester_rank: history.semester_rank,
    cgpa: history.cgpa,
    cumulative_percent: history.cumulative_percent,
    cumulative_letter: history.cumulative_letter,
    cumulative_rank: history.cumulative_rank,
    credits_completed: history.credits_completed,
    credits_carried: history.credits_carried,
    credits_current: history.credits_current,
    terms: (history.terms || []).map((term) => ({
      key: term.key,
      name: term.name,
      semester_gpa: term.semester_gpa,
      hours_completed: term.hours_completed,
      is_current: term.is_current,
    })),
  };
}

export async function syncStudentAcademicRecordByUserId(userId) {
  const uid = Number(userId);
  if (!Number.isFinite(uid)) return null;
  const user = await db.prepare('SELECT id, college_id, role FROM users WHERE id = ?').get(uid);
  if (!user) return null;
  const snap = await getStudentGpaSnapshot(user);
  const existing = await db.prepare('SELECT user_id FROM student_academic_record WHERE user_id = ?').get(uid);
  if (!existing) {
    await db.prepare(`
      INSERT INTO student_academic_record (user_id, cgpa, cumulative_percent, total_credits_completed, total_credits_carried)
      VALUES (?, ?, ?, ?, ?)
    `).run(uid, snap.cgpa || 0, snap.cumulative_percent || 0, snap.credits_completed || 0, snap.credits_carried || 0);
  } else {
    await db.prepare(`
      UPDATE student_academic_record
      SET cgpa = ?, cumulative_percent = ?, total_credits_completed = ?, total_credits_carried = ?, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).run(snap.cgpa || 0, snap.cumulative_percent || 0, snap.credits_completed || 0, snap.credits_carried || 0, uid);
  }
  return snap;
}

export { honorRankFromPercent };
