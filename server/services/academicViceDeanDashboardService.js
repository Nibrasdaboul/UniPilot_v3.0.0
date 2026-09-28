import { db } from '../db.js';
import { getDeanAcademic } from './deanAcademicService.js';
import { researchSummary } from './academicViceDeanResearchService.js';

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

export function isOfferingGradesClosed(enrolled, publishedStudents) {
  return n(enrolled) > 0 && n(publishedStudents) >= n(enrolled);
}

export async function getAcademicViceDeanKpis(user) {
  const cid = collegeId(user);
  const academic = await getDeanAcademic(user);
  const courses = academic.syllabus?.courses || [];
  const coverage = courses.length
    ? Math.round(courses.reduce((s, c) => s + n(c.progress), 0) / courses.length)
    : 0;

  const gradeRows = academic.term?.id
    ? await db.prepare(`
        SELECT o.id,
          (SELECT COUNT(*)::int FROM enrollments e WHERE e.offering_id = o.id AND e.status = 'enrolled') AS enrolled,
          (SELECT COUNT(DISTINCT e.id)::int
           FROM enrollments e
           INNER JOIN official_marks om ON om.enrollment_id = e.id
           WHERE e.offering_id = o.id AND e.status = 'enrolled' AND om.status = 'published') AS published_students
        FROM course_offerings o
        INNER JOIN uni_courses uc ON uc.id = o.uni_course_id
        INNER JOIN departments d ON d.id = uc.department_id
        WHERE d.college_id = ? AND o.term_id = ?
      `).all(cid, academic.term.id)
    : [];

  const totalOfferings = gradeRows.length;
  const closedOfferings = gradeRows.filter((r) => isOfferingGradesClosed(r.enrolled, r.published_students)).length;

  return {
    term: academic.term,
    syllabus: {
      coverage_pct: coverage,
      offerings: courses.length,
      expected_pct: academic.syllabus?.expected ?? academic.term?.elapsed_pct ?? 0,
    },
    grades: {
      closed: closedOfferings,
      total: totalOfferings,
      rate: totalOfferings ? Math.round((closedOfferings / totalOfferings) * 100) : 0,
    },
    research: await researchSummary(cid),
  };
}
