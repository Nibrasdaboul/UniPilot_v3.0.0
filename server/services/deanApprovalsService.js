import { db } from '../db.js';
import { publishEnrollment } from './officialGradesService.js';

export const APPROVAL_KINDS = [
  { key: 'grades', ar: 'اعتماد النتائج', en: 'Grade approvals' },
  { key: 'status', ar: 'تأجيل / إيقاف / فصل', en: 'Deferral / suspension / dismissal' },
  { key: 'leave', ar: 'إجازات وتعويضات', en: 'Leave and compensation' },
  { key: 'curriculum', ar: 'خطط ومستحقات', en: 'Curriculum and finance' },
  { key: 'council', ar: 'مقترحات المجالس', en: 'Council proposals' },
];

const KIND_KEYS = new Set(APPROVAL_KINDS.map((k) => k.key));

function httpError(status, detail) {
  const err = new Error(detail);
  err.status = status;
  throw err;
}

function collegeId(user) {
  const cid = user?.college_id != null ? Number(user.college_id) : null;
  if (cid == null) httpError(400, 'Dean is not attached to a college');
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
    INSERT INTO dean_approvals (college_id, kind, title, body, source_table, source_id, submitted_by, payload, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    ON CONFLICT (college_id, kind, source_table, source_id) DO NOTHING
    RETURNING id
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

async function syncCaseApprovals(cid) {
  const rows = await db.prepare(`
    SELECT cs.id, cs.case_type, cs.title, cs.body, cs.opened_by, cs.student_user_id,
           u.full_name AS student_name, u.person_code AS student_code
    FROM student_cases cs
    INNER JOIN users u ON u.id = cs.student_user_id
    WHERE cs.college_id = ? AND cs.status IN ('open', 'in_review')
  `).all(cid);
  for (const row of rows) {
    const kind = row.case_type === 'financial' ? 'curriculum' : 'status';
    await upsertApproval({
      collegeId: cid,
      kind,
      title: row.title,
      body: [row.student_name, row.student_code, row.case_type].filter(Boolean).join(' · '),
      sourceTable: 'student_cases',
      sourceId: row.id,
      submittedBy: row.opened_by,
      payload: { case_id: row.id, case_type: row.case_type, student_user_id: row.student_user_id },
    });
  }
}

const SEEDS = [
  { kind: 'leave', sourceId: 1, titleAr: 'إجازة دراسية — معيد', body: 'طلب إجازة أسبوعين خلال فترة الامتحانات.' },
  { kind: 'curriculum', sourceId: 2, titleAr: 'تعديل خطة قسم الحاسوب', body: 'رفع ساعات مادة الشبكات من 3 إلى 4.' },
  { kind: 'council', sourceId: 3, titleAr: 'مقترح مجلس القسم: شعبة مسائية', body: 'فتح شعبة مسائية لمادة البرمجة 1.' },
];

async function seedEmptyKinds(cid) {
  for (const seed of SEEDS) {
    const existing = await db.prepare(
      'SELECT id FROM dean_approvals WHERE college_id = ? AND kind = ? LIMIT 1'
    ).get(cid, seed.kind);
    if (existing) continue;
    await upsertApproval({
      collegeId: cid,
      kind: seed.kind,
      title: seed.titleAr,
      body: seed.body,
      sourceTable: 'seed',
      sourceId: seed.sourceId,
    });
  }
}

export async function ensureDeanInbox(user) {
  const cid = collegeId(user);
  await syncGradeApprovals(cid);
  await syncCaseApprovals(cid);
  await seedEmptyKinds(cid);
  return cid;
}

export async function pendingSummary(user) {
  const cid = await ensureDeanInbox(user);
  const rows = await db.prepare(`
    SELECT kind, COUNT(*)::int AS count
    FROM dean_approvals
    WHERE college_id = ? AND status = 'pending'
    GROUP BY kind
  `).all(cid);
  const map = Object.fromEntries(rows.map((r) => [r.kind, Number(r.count) || 0]));
  const items = APPROVAL_KINDS.map((k) => ({ ...k, count: map[k.key] || 0 }));
  return {
    total: items.reduce((s, i) => s + i.count, 0),
    items,
  };
}

export async function listDeanApprovals(user, kind) {
  const cid = await ensureDeanInbox(user);
  const filter = kind && KIND_KEYS.has(kind);
  const rows = filter
    ? await db.prepare(`
        SELECT * FROM dean_approvals
        WHERE college_id = ? AND status = 'pending' AND kind = ?
        ORDER BY created_at ASC, id ASC
      `).all(cid, kind)
    : await db.prepare(`
        SELECT * FROM dean_approvals
        WHERE college_id = ? AND status = 'pending'
        ORDER BY created_at ASC, id ASC
      `).all(cid);
  return {
    kinds: await pendingSummary(user).then((s) => s.items),
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

async function applyDecision(user, row, decision, note) {
  if (row.source_table === 'student_cases') {
    const nextNote = note || (decision === 'approved' ? 'Approved by dean' : 'Rejected by dean');
    await db.prepare(`
      UPDATE student_cases
      SET status = 'closed', staff_note = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND college_id = ?
    `).run(nextNote, row.source_id, row.college_id);
  }
  if (decision === 'approved' && row.source_table === 'course_offerings') {
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
        // Incomplete drafts stay unpublished until exams office finishes them.
      }
    }
  }
}

export async function decideDeanApproval(user, id, body) {
  const cid = collegeId(user);
  const decision = String(body?.decision || '').trim();
  if (decision !== 'approved' && decision !== 'rejected') {
    httpError(400, 'Decision must be approved or rejected');
  }
  const row = await db.prepare(
    'SELECT * FROM dean_approvals WHERE id = ? AND college_id = ?'
  ).get(id, cid);
  if (!row) httpError(404, 'Approval not found');
  if (row.status !== 'pending') httpError(400, 'This request was already decided');
  const note = body?.note != null ? String(body.note).trim() : null;
  await applyDecision(user, row, decision, note);
  await db.prepare(`
    UPDATE dean_approvals
    SET status = ?, decided_by = ?, decision_note = ?, decided_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(decision, user.id, note, row.id);
  return db.prepare('SELECT id, kind, title, status, decided_at, decision_note FROM dean_approvals WHERE id = ?').get(row.id);
}
