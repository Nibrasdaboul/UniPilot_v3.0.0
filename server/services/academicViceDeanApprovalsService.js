import { db } from '../db.js';
import { publishEnrollment } from './officialGradesService.js';

export const VDA_APPROVAL_KINDS = [
  { key: 'exams', ar: 'جداول امتحانات', en: 'Exam timetables' },
  { key: 'grades', ar: 'نتائج للاعتماد', en: 'Results to approve' },
  { key: 'curriculum', ar: 'طلبات الخطة', en: 'Curriculum requests' },
];

const KIND_KEYS = new Set(VDA_APPROVAL_KINDS.map((k) => k.key));

export function isVdaApprovalKind(kind) {
  return KIND_KEYS.has(kind);
}

export function parseVdaDecision(value) {
  const decision = String(value || '').trim();
  if (decision !== 'approved' && decision !== 'rejected') return null;
  return decision;
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

function parsePayload(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function upsertApproval({ collegeId: cid, kind, title, body, sourceTable, sourceId, submittedBy, payload }) {
  await db.prepare(`
    INSERT INTO academic_approvals (college_id, kind, title, body, source_table, source_id, submitted_by, payload, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    ON CONFLICT (college_id, kind, source_table, source_id) DO NOTHING
  `).run(
    cid,
    kind,
    title,
    body || null,
    sourceTable,
    sourceId,
    submittedBy || null,
    payload ? JSON.stringify(payload) : null,
  );
}

async function syncExamApprovals(cid) {
  const rows = await db.prepare(`
    SELECT o.id, uc.course_code, uc.course_name, d.name AS department_name, t.name AS term_name,
           COUNT(s.id)::int AS sessions
    FROM exam_sessions s
    INNER JOIN course_offerings o ON o.id = s.offering_id
    INNER JOIN uni_courses uc ON uc.id = o.uni_course_id
    INNER JOIN departments d ON d.id = uc.department_id
    INNER JOIN academic_terms t ON t.id = o.term_id
    WHERE d.college_id = ? AND COALESCE(s.is_published, 0) = 0
    GROUP BY o.id, uc.course_code, uc.course_name, d.name, t.name
    ORDER BY uc.course_code
  `).all(cid);
  for (const row of rows) {
    await upsertApproval({
      collegeId: cid,
      kind: 'exams',
      title: `${row.course_code} — ${row.course_name}`,
      body: [row.department_name, row.term_name, `${row.sessions} ${row.sessions === 1 ? 'جلسة' : 'جلسات'}`].filter(Boolean).join(' · '),
      sourceTable: 'exam_sessions',
      sourceId: row.id,
      payload: { offering_id: row.id, course_code: row.course_code },
    });
  }
}

async function syncGradeApprovals(cid) {
  const rows = await db.prepare(`
    SELECT DISTINCT o.id, uc.course_code, uc.course_name, t.name AS term_name, d.name AS department_name
    FROM official_marks om
    INNER JOIN enrollments e ON e.id = om.enrollment_id
    INNER JOIN course_offerings o ON o.id = e.offering_id
    INNER JOIN uni_courses uc ON uc.id = o.uni_course_id
    INNER JOIN departments d ON d.id = uc.department_id
    INNER JOIN academic_terms t ON t.id = o.term_id
    WHERE om.status = 'draft' AND d.college_id = ?
  `).all(cid);
  for (const row of rows) {
    await upsertApproval({
      collegeId: cid,
      kind: 'grades',
      title: `${row.course_code} — ${row.course_name}`,
      body: [row.department_name, row.term_name].filter(Boolean).join(' · '),
      sourceTable: 'course_offerings',
      sourceId: row.id,
      payload: { offering_id: row.id, course_code: row.course_code },
    });
  }
}

async function ensureInbox(user) {
  const cid = collegeId(user);
  await syncExamApprovals(cid);
  await syncGradeApprovals(cid);
  return cid;
}

export async function pendingVdaSummary(user) {
  const cid = await ensureInbox(user);
  const rows = await db.prepare(`
    SELECT kind, COUNT(*)::int AS count
    FROM academic_approvals
    WHERE college_id = ? AND status = 'pending'
    GROUP BY kind
  `).all(cid);
  const map = Object.fromEntries(rows.map((r) => [r.kind, Number(r.count) || 0]));
  const items = VDA_APPROVAL_KINDS.map((k) => ({ ...k, count: map[k.key] || 0 }));
  return {
    total: items.reduce((s, i) => s + i.count, 0),
    items,
  };
}

export async function listVdaApprovals(user, kind) {
  const cid = await ensureInbox(user);
  const filter = kind && isVdaApprovalKind(kind);
  const rows = filter
    ? await db.prepare(`
        SELECT * FROM academic_approvals
        WHERE college_id = ? AND status = 'pending' AND kind = ?
        ORDER BY created_at ASC, id ASC
      `).all(cid, kind)
    : await db.prepare(`
        SELECT * FROM academic_approvals
        WHERE college_id = ? AND status = 'pending'
        ORDER BY created_at ASC, id ASC
      `).all(cid);
  return {
    kinds: (await pendingVdaSummary(user)).items,
    items: rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      title: row.title,
      body: row.body,
      source_table: row.source_table,
      source_id: row.source_id,
      payload: parsePayload(row.payload),
      created_at: row.created_at,
    })),
  };
}

async function applyDecision(user, row, decision) {
  if (decision !== 'approved') return;
  if (row.kind === 'exams' && row.source_id) {
    await db.prepare(`
      UPDATE exam_sessions SET is_published = 1
      WHERE offering_id = ? AND COALESCE(is_published, 0) = 0
    `).run(row.source_id);
  }
  if (row.kind === 'grades' && row.source_table === 'course_offerings') {
    const enrollments = await db.prepare(`
      SELECT DISTINCT e.id
      FROM enrollments e
      INNER JOIN official_marks om ON om.enrollment_id = e.id
      WHERE e.offering_id = ? AND e.status = 'enrolled'
    `).all(row.source_id);
    for (const enr of enrollments) {
      try {
        await publishEnrollment(user, enr.id);
      } catch {
        // Incomplete drafts stay unpublished until the Exams Office finishes them.
      }
    }
  }
}

export async function decideVdaApproval(user, id, body) {
  const cid = collegeId(user);
  const decision = parseVdaDecision(body?.decision);
  if (!decision) httpError(400, 'Decision must be approved or rejected');
  const row = await db.prepare(
    'SELECT * FROM academic_approvals WHERE id = ? AND college_id = ?'
  ).get(id, cid);
  if (!row) httpError(404, 'Approval not found');
  if (row.status !== 'pending') httpError(400, 'This request was already decided');
  const note = body?.note != null ? String(body.note).trim() : null;
  await applyDecision(user, row, decision);
  await db.prepare(`
    UPDATE academic_approvals
    SET status = ?, decided_by = ?, decision_note = ?, decided_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(decision, user.id, note, row.id);
  return db.prepare(
    'SELECT id, kind, title, status, decided_at, decision_note FROM academic_approvals WHERE id = ?'
  ).get(row.id);
}
