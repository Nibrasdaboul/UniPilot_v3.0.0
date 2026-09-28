import { listOfficialCatalog } from '../college/catalogSync.js';
import { getDeanAcademic } from './deanAcademicService.js';
import { listVdaApprovals } from './academicViceDeanApprovalsService.js';
import { listOfferingsForTerm } from './registrationService.js';

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

export async function getAcademicViceDeanCurriculum(user) {
  const cid = collegeId(user);
  const academic = await getDeanAcademic(user);
  const approvals = await listVdaApprovals(user, 'curriculum');
  const catalog = await listOfficialCatalog(cid);
  const offerings = academic.term?.id ? await listOfferingsForTerm(academic.term.id, cid) : [];
  const progressByOffering = new Map(
    (academic.syllabus?.courses || []).map((c) => [Number(c.offering_id), c]),
  );
  const offeredCodes = new Set(offerings.map((o) => String(o.course_code || '').toLowerCase()));

  const courses = catalog.map((c) => ({
    id: c.id,
    course_code: c.course_code,
    course_name: c.course_name,
    department: c.department,
    department_id: c.department_id,
    credit_hours: c.credit_hours,
    order: c.order,
    prerequisite_id: c.prerequisite_id,
    offered: offeredCodes.has(String(c.course_code || '').toLowerCase()),
  }));

  const unoffered = courses.filter((c) => !c.offered);
  const termOfferings = offerings.map((o) => {
    const progress = progressByOffering.get(Number(o.id));
    return {
      id: o.id,
      course_code: o.course_code,
      course_name: o.course_name,
      department_name: o.department_name || progress?.department,
      enrolled_count: o.enrolled_count ?? 0,
      capacity: o.capacity,
      staffed: Boolean(progress?.staffed),
      progress: n(progress?.progress),
    };
  });

  return {
    term: academic.term,
    expected_pct: academic.syllabus?.expected ?? academic.term?.elapsed_pct ?? 0,
    by_department: academic.syllabus?.by_department || [],
    courses,
    offerings: termOfferings,
    unoffered,
    pending: approvals.items || [],
    counts: {
      courses: courses.length,
      offerings: termOfferings.length,
      unoffered: unoffered.length,
      pending: (approvals.items || []).length,
    },
  };
}
