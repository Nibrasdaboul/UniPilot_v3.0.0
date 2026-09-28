import { db } from '../db.js';
import { getDeanAcademic } from './deanAcademicService.js';

export const VDA_FAIL_ALERT_PCT = 40;
export const VDA_COURSEWORK_LATE_ELAPSED_PCT = 40;

export function isVdaFailAlert(failRate) {
  return Number(failRate) > VDA_FAIL_ALERT_PCT;
}

export function isCourseworkLate({ elapsedPct, weightSai, enrolled, saiCount }) {
  return Number(elapsedPct) >= VDA_COURSEWORK_LATE_ELAPSED_PCT
    && Number(weightSai) > 0
    && Number(enrolled) > 0
    && Number(saiCount) < Number(enrolled);
}

function httpError(status, detail) {
  const err = new Error(detail);
  err.status = status;
  throw err;
}

function collegeId(user) {
  const cid = user?.college_id != null ? Number(user.college_id) : null;
  if (cid == null) httpError(400, 'Vice Dean is not attached to a college');
  return cid;
}

export async function getAcademicViceDeanBriefing(user) {
  const cid = collegeId(user);
  const academic = await getDeanAcademic(user);
  const elapsed = Number(academic.term?.elapsed_pct) || 0;
  const alerts = [];

  for (const row of academic.grades?.fail_by_course || []) {
    if (!isVdaFailAlert(row.fail_rate)) continue;
    alerts.push({
      key: `fail-${row.course_code}`,
      severity: 'critical',
      kind: 'fail_rate',
      course_code: row.course_code,
      fail_rate: row.fail_rate,
      ar: `رسوب ${row.fail_rate}% في ${row.course_code} (الحد ${VDA_FAIL_ALERT_PCT}%)`,
      en: `Fail rate ${row.fail_rate}% in ${row.course_code} (limit ${VDA_FAIL_ALERT_PCT}%)`,
    });
  }

  const lateRows = academic.term?.id
    ? await db.prepare(`
        SELECT o.id, uc.course_code, uc.course_name, d.name AS department_name,
               COALESCE(uc.weight_sai, 0)::float AS weight_sai,
               (SELECT COUNT(*)::int FROM enrollments e WHERE e.offering_id = o.id AND e.status = 'enrolled') AS enrolled,
               (SELECT COUNT(DISTINCT e.id)::int
                FROM enrollments e
                INNER JOIN official_marks om ON om.enrollment_id = e.id
                WHERE e.offering_id = o.id AND e.status = 'enrolled' AND om.component = 'sai') AS sai_count,
               (SELECT string_agg(DISTINCT u.full_name, '، ')
                FROM course_staff cs
                INNER JOIN users u ON u.id = cs.user_id
                WHERE cs.offering_id = o.id
                  AND cs.staff_role IN ('instructor', 'doctor')) AS instructors
        FROM course_offerings o
        INNER JOIN uni_courses uc ON uc.id = o.uni_course_id
        INNER JOIN departments d ON d.id = uc.department_id
        WHERE d.college_id = ? AND o.term_id = ?
      `).all(cid, academic.term.id)
    : [];

  for (const row of lateRows) {
    if (!isCourseworkLate({
      elapsedPct: elapsed,
      weightSai: row.weight_sai,
      enrolled: row.enrolled,
      saiCount: row.sai_count,
    })) continue;
    const whoAr = row.instructors || 'المدرّس';
    const whoEn = row.instructors || 'Instructor';
    alerts.push({
      key: `sai-late-${row.id}`,
      severity: 'warning',
      kind: 'late_coursework',
      course_code: row.course_code,
      offering_id: row.id,
      ar: `${whoAr} متأخر عن رفع أعمال السنة في ${row.course_code} — ${row.department_name}`,
      en: `${whoEn} is late submitting coursework for ${row.course_code} — ${row.department_name}`,
    });
  }

  return {
    term: academic.term,
    fail_limit: VDA_FAIL_ALERT_PCT,
    coursework_late_after: VDA_COURSEWORK_LATE_ELAPSED_PCT,
    alerts,
  };
}
