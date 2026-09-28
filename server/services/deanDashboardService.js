import { db } from '../db.js';
import { ROLE_LABELS } from '../college/roles.js';
import { ACADEMIC_RANKS, ACADEMIC_STATUSES, STAFF_ROLES, GENDERS } from '../college/userProfiles.js';
import { pendingSummary } from './deanApprovalsService.js';

function collegeId(user) {
  return user?.college_id != null ? Number(user.college_id) : null;
}

function n(value) {
  return Number(value) || 0;
}

function labeledCounts(rows, catalog, labels) {
  const map = new Map((rows || []).map((r) => [String(r.key || ''), n(r.count)]));
  if (catalog) {
    return catalog.map((item) => ({
      key: item.key,
      ar: item.ar,
      en: item.en,
      count: map.get(item.key) || 0,
    }));
  }
  return [...map.entries()].map(([key, count]) => ({
    key,
    ar: labels?.ar?.[key] || key,
    en: labels?.en?.[key] || key,
    count,
  }));
}

async function countBy(sql, params) {
  const rows = await db.prepare(sql).all(...params);
  return rows.map((r) => ({ key: r.key == null || r.key === '' ? 'unknown' : String(r.key), count: n(r.count) }));
}

export async function getDeanKpis(user) {
  const cid = collegeId(user);
  if (cid == null) {
    const err = new Error('Dean is not attached to a college');
    err.status = 400;
    throw err;
  }

  const studentTotal = n((await db.prepare(
    `SELECT COUNT(*)::int AS n FROM users WHERE role = 'student' AND college_id = ?`
  ).get(cid)).n);

  const byGender = labeledCounts(
    await countBy(
      `SELECT COALESCE(gender, 'unknown') AS key, COUNT(*)::int AS count
       FROM users WHERE role = 'student' AND college_id = ?
       GROUP BY 1`,
      [cid],
    ),
    [...GENDERS, { key: 'unknown', ar: 'غير محدد', en: 'Unspecified' }],
  );

  const byStatus = labeledCounts(
    await countBy(
      `SELECT COALESCE(p.academic_status, 'new') AS key, COUNT(*)::int AS count
       FROM users u
       LEFT JOIN student_profiles p ON p.user_id = u.id
       WHERE u.role = 'student' AND u.college_id = ?
       GROUP BY 1`,
      [cid],
    ),
    ACADEMIC_STATUSES,
  );

  const byYearRaw = await countBy(
    `SELECT COALESCE(p.study_year::text, 'unknown') AS key, COUNT(*)::int AS count
     FROM users u
     LEFT JOIN student_profiles p ON p.user_id = u.id
     WHERE u.role = 'student' AND u.college_id = ?
     GROUP BY 1
     ORDER BY 1`,
    [cid],
  );
  const byYear = byYearRaw.map((row) => ({
    key: row.key,
    ar: row.key === 'unknown' ? 'غير محددة' : `السنة ${row.key}`,
    en: row.key === 'unknown' ? 'Unspecified' : `Year ${row.key}`,
    count: row.count,
  }));

  const complainants = n((await db.prepare(
    `SELECT COUNT(DISTINCT student_user_id)::int AS n
     FROM student_complaints
     WHERE college_id = ? AND status = 'open'`
  ).get(cid)).n);

  const academicIn = `role IN ('instructor', 'department_head', 'vice_dean_academic', 'dean', 'teaching_assistant')`;
  const facultyIn = `role IN ('instructor', 'department_head', 'vice_dean_academic', 'dean')`;
  const staffIn = `role IN ('student_affairs', 'exams_office', 'hr', 'finance', 'library', 'it', 'quality', 'archive', 'vice_dean_students')`;

  const academicTotal = n((await db.prepare(
    `SELECT COUNT(*)::int AS n FROM users WHERE college_id = ? AND ${academicIn}`
  ).get(cid)).n);

  const byRank = labeledCounts(
    await countBy(
      `SELECT COALESCE(fp.academic_rank, 'unspecified') AS key, COUNT(*)::int AS count
       FROM users u
       LEFT JOIN faculty_profiles fp ON fp.user_id = u.id
       WHERE u.college_id = ? AND u.${facultyIn}
       GROUP BY 1`,
      [cid],
    ),
    [...ACADEMIC_RANKS, { key: 'unspecified', ar: 'بدون رتبة', en: 'Unranked' }],
  );

  const assistants = n((await db.prepare(
    `SELECT COUNT(*)::int AS n FROM users WHERE college_id = ? AND role = 'teaching_assistant'`
  ).get(cid)).n);

  const adminTotal = n((await db.prepare(
    `SELECT COUNT(*)::int AS n FROM users WHERE college_id = ? AND ${staffIn}`
  ).get(cid)).n);

  const byOffice = labeledCounts(
    await countBy(
      `SELECT role AS key, COUNT(*)::int AS count
       FROM users WHERE college_id = ? AND ${staffIn}
       GROUP BY 1`,
      [cid],
    ),
    STAFF_ROLES.map((key) => ({ key, ar: ROLE_LABELS.ar[key] || key, en: ROLE_LABELS.en[key] || key })),
  );

  let departments = await db.prepare(`
    SELECT d.id, d.code, d.name,
           COUNT(u.id) FILTER (WHERE u.role = 'student' AND u.college_id = ?)::int AS student_count
    FROM departments d
    LEFT JOIN users u ON u.department_id = d.id
    WHERE d.college_id = ?
    GROUP BY d.id, d.code, d.name
    ORDER BY d.id
  `).all(cid, cid);
  if (!departments.length) {
    departments = await db.prepare(`
      SELECT d.id, d.code, d.name,
             COUNT(u.id) FILTER (WHERE u.role = 'student' AND u.college_id = ?)::int AS student_count
      FROM departments d
      LEFT JOIN users u ON u.department_id = d.id
      GROUP BY d.id, d.code, d.name
      ORDER BY d.id
    `).all(cid);
  }

  const currentTerm = await db.prepare(`
    SELECT t.id, t.name, t.is_current, t.is_closed
    FROM academic_terms t
    WHERE t.is_current = 1
    ORDER BY t.id DESC
    LIMIT 1
  `).get();

  const previousTerm = await db.prepare(`
    SELECT t.id, t.name, t.is_current, t.is_closed
    FROM academic_terms t
    WHERE COALESCE(t.is_closed, 0) = 1 OR t.is_current = 0
    ORDER BY t.starts_on DESC NULLS LAST, t.id DESC
    LIMIT 1
  `).get();

  async function passForTerm(term) {
    if (!term?.id) return null;
    try {
      const row = await db.prepare(`
        SELECT
          COUNT(*) FILTER (WHERE sc.finalized_at IS NOT NULL AND COALESCE(sc.withdrawn, 0) = 0)::int AS graded,
          COUNT(*) FILTER (WHERE sc.finalized_at IS NOT NULL AND COALESCE(sc.withdrawn, 0) = 0 AND sc.passed = 1)::int AS passed
        FROM student_courses sc
        INNER JOIN users u ON u.id = sc.user_id
        INNER JOIN enrollments e ON e.id = sc.enrollment_id
        INNER JOIN course_offerings o ON o.id = e.offering_id
        WHERE u.role = 'student' AND u.college_id = ? AND o.term_id = ?
      `).get(cid, term.id);
      return {
        term_id: term.id,
        term_name: term.name,
        graded: n(row?.graded),
        passed: n(row?.passed),
        rate: n(row?.graded) ? Math.round((n(row.passed) / n(row.graded)) * 1000) / 10 : null,
      };
    } catch {
      return { term_id: term.id, term_name: term.name, graded: 0, passed: 0, rate: null };
    }
  }

  let currentPass = await passForTerm(currentTerm);
  let previousPass = await passForTerm(previousTerm);
  if ((currentPass?.graded || 0) === 0 && (previousPass?.graded || 0) === 0) {
    const all = await db.prepare(`
      SELECT
        COUNT(*) FILTER (WHERE sc.finalized_at IS NOT NULL AND COALESCE(sc.withdrawn, 0) = 0)::int AS graded,
        COUNT(*) FILTER (WHERE sc.finalized_at IS NOT NULL AND COALESCE(sc.withdrawn, 0) = 0 AND sc.passed = 1)::int AS passed
      FROM student_courses sc
      INNER JOIN users u ON u.id = sc.user_id
      WHERE u.role = 'student' AND u.college_id = ?
    `).get(cid);
    currentPass = {
      term_id: currentTerm?.id || null,
      term_name: currentTerm?.name || null,
      graded: n(all?.graded),
      passed: n(all?.passed),
      rate: n(all?.graded) ? Math.round((n(all.passed) / n(all.graded)) * 1000) / 10 : null,
    };
  }

  return {
    college_id: cid,
    students: {
      total: studentTotal,
      complainants,
      by_gender: byGender,
      by_status: byStatus,
      by_year: byYear,
    },
    academic_staff: {
      total: academicTotal,
      teaching_assistants: assistants,
      by_rank: byRank,
    },
    admin_staff: {
      total: adminTotal,
      by_office: byOffice,
    },
    departments: {
      total: departments.length,
      items: departments.map((d) => ({
        id: d.id,
        code: d.code,
        name: d.name,
        student_count: n(d.student_count),
      })),
    },
    success: {
      current: currentPass,
      previous: previousPass,
    },
    pending: await pendingSummary(user),
  };
}
