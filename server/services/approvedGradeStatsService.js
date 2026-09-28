import { db } from '../db.js';
import { offeringApprovedStats, summarizeApprovedMarks } from '../college/approvedGradeStats.js';

function n(value) {
  return Number(value) || 0;
}

export async function loadApprovedOfferingStats(cid, termId) {
  if (cid == null || termId == null) {
    return { byOffering: new Map(), curve: summarizeApprovedMarks([]).curve, fail_by_course: [] };
  }
  const rows = await db.prepare(`
    SELECT o.id AS offering_id, uc.catalog_course_id, uc.course_code, uc.course_name,
           e.user_id, sc.current_grade, sc.passed
    FROM course_offerings o
    INNER JOIN uni_courses uc ON uc.id = o.uni_course_id
    INNER JOIN departments d ON d.id = uc.department_id
    INNER JOIN enrollments e ON e.offering_id = o.id AND e.status = 'enrolled'
    LEFT JOIN student_courses sc
      ON sc.user_id = e.user_id
     AND sc.catalog_course_id = uc.catalog_course_id
     AND COALESCE(sc.withdrawn, 0) = 0
    WHERE d.college_id = ? AND o.term_id = ?
    ORDER BY o.id ASC, e.user_id ASC, sc.current_grade DESC NULLS LAST, sc.id DESC
  `).all(cid, termId);

  const seen = new Set();
  const byOfferingRows = new Map();
  const byCourse = new Map();
  const allPublished = [];
  for (const row of rows || []) {
    const key = `${row.offering_id}:${row.user_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const oid = Number(row.offering_id);
    if (!byOfferingRows.has(oid)) byOfferingRows.set(oid, []);
    byOfferingRows.get(oid).push(row);
    if (row.current_grade != null && Number.isFinite(Number(row.current_grade))) {
      allPublished.push(row);
      const code = row.course_code || String(row.catalog_course_id);
      const course = byCourse.get(code) || {
        course_code: row.course_code,
        course_name: row.course_name,
        graded: 0,
        failed: 0,
      };
      course.graded += 1;
      if (Number(row.passed) === 0 || Number(row.current_grade) < 50) course.failed += 1;
      byCourse.set(code, course);
    }
  }

  const byOffering = new Map();
  for (const [oid, list] of byOfferingRows.entries()) {
    const enrolled = list.length;
    const publishedRows = list.filter((row) => row.current_grade != null && Number.isFinite(Number(row.current_grade)));
    const summary = summarizeApprovedMarks(publishedRows, { enrolled });
    byOffering.set(oid, {
      ...offeringApprovedStats({
        enrolled,
        published: summary.published,
        failed: summary.failed,
        draft: Math.max(0, enrolled - summary.published),
      }),
      curve: summary.curve,
    });
  }

  const college = summarizeApprovedMarks(allPublished);
  const fail_by_course = [...byCourse.values()]
    .map((row) => ({
      ...row,
      fail_rate: row.graded ? Math.round((row.failed / row.graded) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.fail_rate - a.fail_rate);

  return { byOffering, curve: college.curve, fail_by_course, published: college.published, failed: college.failed, fail_rate: college.fail_rate };
}

export function statsForOffering(byOffering, offeringId, enrolledFallback = 0) {
  return byOffering.get(Number(offeringId)) || {
    ...offeringApprovedStats({
      enrolled: n(enrolledFallback),
      published: 0,
      failed: 0,
      draft: n(enrolledFallback),
    }),
    curve: summarizeApprovedMarks([]).curve,
  };
}
