import { db } from '../db.js';
import { getDeanAcademic } from './deanAcademicService.js';
import { listVdaApprovals } from './academicViceDeanApprovalsService.js';
import { isVdaFailAlert, VDA_FAIL_ALERT_PCT } from './academicViceDeanBriefingService.js';
import { isOfferingGradesClosed } from './academicViceDeanDashboardService.js';
import { loadApprovedOfferingStats, statsForOffering } from './approvedGradeStatsService.js';

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

export function offeringGradeProgress({ enrolled, publishedStudents, draftStudents }) {
  const total = n(enrolled);
  const published = n(publishedStudents);
  const draft = n(draftStudents);
  return {
    published_pct: total ? Math.round((published / total) * 100) : 0,
    closed: isOfferingGradesClosed(total, published),
    ready_to_approve: draft > 0 && published < total,
  };
}

export async function getAcademicViceDeanGrades(user) {
  const cid = collegeId(user);
  const academic = await getDeanAcademic(user);
  const approvals = await listVdaApprovals(user, 'grades');
  const pendingByOffering = new Map(
    (approvals.items || []).map((item) => [Number(item.source_id || item.payload?.offering_id), item]),
  );

  const approved = academic.term?.id
    ? await loadApprovedOfferingStats(cid, academic.term.id)
    : { byOffering: new Map(), curve: [], fail_by_course: [] };

  const rows = academic.term?.id
    ? await db.prepare(`
        SELECT o.id, uc.course_code, uc.course_name, d.name AS department_name
        FROM course_offerings o
        INNER JOIN uni_courses uc ON uc.id = o.uni_course_id
        INNER JOIN departments d ON d.id = uc.department_id
        WHERE d.college_id = ? AND o.term_id = ?
        ORDER BY uc.course_code ASC, o.id ASC
      `).all(cid, academic.term.id)
    : [];

  const failByCourse = (approved.fail_by_course || []).map((row) => ({
    ...row,
    alert: isVdaFailAlert(row.fail_rate),
  }));
  const failByCode = new Map(failByCourse.map((row) => [row.course_code, row]));

  const offerings = rows.map((row) => {
    const stats = statsForOffering(approved.byOffering, row.id, 0);
    const progress = offeringGradeProgress({
      enrolled: stats.enrolled,
      publishedStudents: stats.published_students,
      draftStudents: stats.draft_students,
    });
    const failRate = stats.fail_rate ?? failByCode.get(row.course_code)?.fail_rate ?? null;
    return {
      id: row.id,
      course_code: row.course_code,
      course_name: row.course_name,
      department_name: row.department_name,
      enrolled: stats.enrolled,
      published_students: stats.published_students,
      draft_students: stats.draft_students,
      failed_students: stats.failed_students,
      fail_rate: failRate,
      fail_alert: isVdaFailAlert(failRate),
      ...progress,
      approval: pendingByOffering.get(Number(row.id)) || null,
    };
  });

  return {
    term: academic.term,
    fail_limit: VDA_FAIL_ALERT_PCT,
    curve: approved.curve || [],
    fail_by_course: failByCourse,
    offerings,
    pending: approvals.items || [],
    counts: {
      offerings: offerings.length,
      closed: offerings.filter((o) => o.closed).length,
      pending: (approvals.items || []).length,
      fail_alerts: failByCourse.filter((r) => r.alert).length,
    },
  };
}
