import { db } from '../db.js';
import { EXAM_TYPES } from '../college/exams.js';
import { listOfferingsForTerm } from './registrationService.js';
import { listHalls } from './examsService.js';
import { getDeanAcademic } from './deanAcademicService.js';
import { listVdaApprovals } from './academicViceDeanApprovalsService.js';

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

function overlap(a, b) {
  if (!a?.starts_at || !a?.ends_at || !b?.starts_at || !b?.ends_at) return false;
  return new Date(a.starts_at) < new Date(b.ends_at) && new Date(b.starts_at) < new Date(a.ends_at);
}

export function analyzeExamBoard(board) {
  const sessions = board?.sessions || [];
  const offerings = board?.offerings || [];
  const halls = board?.halls || [];
  const published = sessions.filter((s) => Number(s.is_published) === 1);
  const drafts = sessions.filter((s) => Number(s.is_published) !== 1);
  const scheduledIds = new Set(sessions.map((s) => Number(s.offering_id)));
  const unscheduled = offerings.filter((o) => !scheduledIds.has(Number(o.id)));
  const noHall = sessions.filter((s) => !s.hall_id);
  const shortCapacity = sessions.filter((s) => (
    s.hall_id
    && s.hall_capacity != null
    && Number(s.enrolled_count || 0) > Number(s.hall_capacity)
  ));
  const usedHalls = new Set(sessions.filter((s) => s.hall_id).map((s) => Number(s.hall_id)));
  const unusedHalls = halls.filter((h) => !usedHalls.has(Number(h.id)));
  const clashes = [];
  for (let i = 0; i < sessions.length; i += 1) {
    for (let j = i + 1; j < sessions.length; j += 1) {
      const a = sessions[i];
      const b = sessions[j];
      if (a.hall_id && b.hall_id && Number(a.hall_id) === Number(b.hall_id) && overlap(a, b)) {
        clashes.push({ key: `${a.id}-${b.id}`, hall: a.hall_name, a, b });
      }
    }
  }
  const issues = [
    ...clashes.map((c) => ({
      key: `clash-${c.key}`,
      severity: 'critical',
      kind: 'clash',
      ar: `تعارض قاعة ${c.hall}: ${c.a.course_code} و ${c.b.course_code}`,
      en: `Hall clash in ${c.hall}: ${c.a.course_code} and ${c.b.course_code}`,
    })),
    ...shortCapacity.map((s) => ({
      key: `cap-${s.id}`,
      severity: 'critical',
      kind: 'capacity',
      ar: `سعة ${s.hall_name} لا تكفي ${s.course_code} (${s.enrolled_count}/${s.hall_capacity})`,
      en: `${s.hall_name} is too small for ${s.course_code} (${s.enrolled_count}/${s.hall_capacity})`,
    })),
    ...noHall.map((s) => ({
      key: `hall-${s.id}`,
      severity: 'warning',
      kind: 'no_hall',
      ar: `${s.course_code} بلا قاعة`,
      en: `${s.course_code} has no hall`,
    })),
    ...unscheduled.map((o) => ({
      key: `none-${o.id}`,
      severity: 'warning',
      kind: 'unscheduled',
      ar: `${o.course_code} بلا جلسة امتحان`,
      en: `${o.course_code} has no exam session`,
    })),
  ];
  return { published, drafts, unscheduled, noHall, unusedHalls, clashes, shortCapacity, issues };
}

export async function getAcademicViceDeanExams(user) {
  const cid = collegeId(user);
  const academic = await getDeanAcademic(user);
  const term = academic.term;
  const termRow = term?.id
    ? await db.prepare('SELECT id, university_id, name, starts_on, ends_on FROM academic_terms WHERE id = ?').get(term.id)
    : null;
  const uni = termRow?.university_id != null ? Number(termRow.university_id) : null;
  const halls = uni ? await listHalls({ org_university_id: uni }) : [];
  const offerings = term?.id ? await listOfferingsForTerm(term.id, cid) : [];
  const sessions = term?.id && uni
    ? await db.prepare(`
        SELECT
          s.id, s.university_id, s.offering_id, s.hall_id, s.exam_type, s.room_name, s.starts_at, s.ends_at,
          s.proctor_user_id, s.notes, s.is_published, s.created_at,
          h.name AS hall_name, h.capacity AS hall_capacity, h.building,
          uc.course_code, uc.course_name, o.term_id,
          (SELECT COUNT(*)::int FROM enrollments e WHERE e.offering_id = s.offering_id AND e.status = 'enrolled') AS enrolled_count
        FROM exam_sessions s
        LEFT JOIN exam_halls h ON h.id = s.hall_id
        INNER JOIN course_offerings o ON o.id = s.offering_id
        INNER JOIN uni_courses uc ON uc.id = o.uni_course_id
        INNER JOIN departments d ON d.id = uc.department_id
        WHERE s.university_id = ? AND o.term_id = ? AND d.college_id = ?
        ORDER BY s.starts_at ASC NULLS LAST, s.id ASC
      `).all(uni, term.id, cid)
    : [];

  const analysis = analyzeExamBoard({ halls, offerings, sessions });
  const approvals = await listVdaApprovals(user, 'exams');
  const pendingByOffering = new Map(
    (approvals.items || []).map((item) => [Number(item.source_id || item.payload?.offering_id), item]),
  );
  const drafts = analysis.drafts.map((session) => ({
    ...session,
    approval: pendingByOffering.get(Number(session.offering_id)) || null,
  }));
  return {
    term,
    exam_types: EXAM_TYPES,
    halls,
    published: analysis.published,
    drafts,
    unused_halls: analysis.unusedHalls,
    issues: analysis.issues,
    pending: approvals.items || [],
    counts: {
      halls: halls.length,
      published: analysis.published.length,
      drafts: analysis.drafts.length,
      pending: (approvals.items || []).length,
      issues: analysis.issues.length,
    },
  };
}
