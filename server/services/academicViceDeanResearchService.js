import { db } from '../db.js';
import {
  PROJECT_KINDS,
  PROJECT_TRACKS,
  COMMITTEE_ROLES,
  DEFAULT_PROJECT_REQUEST_MIN_HOURS,
  normalizeProjectKind,
  parseProjectDecision,
  parseStudentRequestDecision,
  parseCommitteeMembers,
  parseProjectMinHours,
  projectTrackSpec,
} from '../college/research.js';
import { ensureUniCourseForCatalog } from '../college/catalogSync.js';
import { ensureCollegeDepartments } from '../college/departments.js';
import { attachProjectRequestDetails } from './projectRequestDetails.js';
import { getCollegeRequestWindow } from './requestWindowService.js';

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

function trimOrNull(value) {
  const text = String(value || '').trim();
  return text || null;
}

async function loadProject(id, cid) {
  const row = await db.prepare(`
    SELECT p.*, d.name AS department_name
    FROM graduation_projects p
    LEFT JOIN departments d ON d.id = p.department_id
    WHERE p.id = ? AND p.college_id = ?
  `).get(id, cid);
  if (!row) httpError(404, 'Graduation project not found');
  const committee = await db.prepare(`
    SELECT id, full_name, committee_role, user_id
    FROM graduation_committee_members
    WHERE project_id = ?
    ORDER BY id ASC
  `).all(row.id);
  return { ...row, committee };
}

function publicTrack(row) {
  const spec = projectTrackSpec(row.kind) || {};
  return {
    kind: spec.key || row.kind,
    ar: spec.ar || row.kind,
    en: spec.en || row.kind,
    unlocks_after: spec.unlocks_after || null,
    request_min_hours: Number(row.request_min_hours) || spec.default_min_hours || DEFAULT_PROJECT_REQUEST_MIN_HOURS,
    updated_at: row.updated_at || null,
    course: row.catalog_course_id ? {
      id: Number(row.catalog_course_id),
      course_code: row.course_code,
      course_name: row.course_name,
      credit_hours: Number(row.credit_hours) || spec.credit_hours || 3,
    } : null,
  };
}

async function listProjectTracks(collegeIdValue) {
  const rows = await db.prepare(`
    SELECT t.id, t.kind, t.request_min_hours, t.updated_at, t.catalog_course_id,
           c.course_code, c.course_name, c.credit_hours
    FROM college_project_tracks t
    LEFT JOIN catalog_courses c ON c.id = t.catalog_course_id
    WHERE t.college_id = ?
  `).all(collegeIdValue);
  const byKind = Object.fromEntries((rows || []).map((row) => [row.kind, row]));
  return PROJECT_TRACKS.map((spec) => publicTrack(byKind[spec.key] || {
    kind: spec.key,
    request_min_hours: spec.default_min_hours,
  }));
}

export async function ensureCollegeProjectTracks(collegeIdValue) {
  const depts = await ensureCollegeDepartments(collegeIdValue);
  const pre = depts.find((d) => String(d.code || '').toUpperCase() === 'PRE') || depts[0];
  const deptName = pre?.name || 'مواد ما قبل التخصص';
  const legacy = await db.prepare(
    'SELECT project_request_min_hours FROM college_academic_settings WHERE college_id = ?'
  ).get(collegeIdValue);
  const seedHours = Number(legacy?.project_request_min_hours) || DEFAULT_PROJECT_REQUEST_MIN_HOURS;

  const created = [];
  for (const spec of PROJECT_TRACKS) {
    let course = await db.prepare(`
      SELECT id, course_code, course_name, credit_hours, prerequisite_id, department
      FROM catalog_courses
      WHERE lower(trim(course_code)) = lower(trim(?))
      LIMIT 1
    `).get(spec.course_code);
    if (!course) {
      const inserted = await db.prepare(`
        INSERT INTO catalog_courses (course_code, course_name, department, description, credit_hours, "order")
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        spec.course_code,
        spec.course_name,
        deptName,
        spec.ar,
        spec.credit_hours,
        spec.order,
      );
      course = await db.prepare(`
        SELECT id, course_code, course_name, credit_hours, prerequisite_id, department
        FROM catalog_courses WHERE id = ?
      `).get(inserted.lastInsertRowid);
    }
    await ensureUniCourseForCatalog({ ...course, department: deptName }, collegeIdValue);
    created.push({ spec, course });
  }

  const byKey = Object.fromEntries(created.map((item) => [item.spec.key, item.course]));
  for (const { spec, course } of created) {
    if (!spec.unlocks_after) continue;
    const prev = byKey[spec.unlocks_after];
    if (prev && Number(course.prerequisite_id) !== Number(prev.id)) {
      await db.prepare('UPDATE catalog_courses SET prerequisite_id = ? WHERE id = ?').run(prev.id, course.id);
      course.prerequisite_id = prev.id;
    }
  }

  for (const { spec, course } of created) {
    await db.prepare(`
      INSERT INTO college_project_tracks (college_id, kind, catalog_course_id, request_min_hours)
      VALUES (?, ?, ?, ?)
      ON CONFLICT (college_id, kind) DO UPDATE SET
        catalog_course_id = EXCLUDED.catalog_course_id
      RETURNING id
    `).run(collegeIdValue, spec.key, course.id, seedHours);
  }

  return listProjectTracks(collegeIdValue);
}

export async function getProjectRequestSettings(collegeIdValue) {
  const tracks = await ensureCollegeProjectTracks(collegeIdValue);
  const term = tracks.find((t) => t.kind === 'term');
  return {
    project_request_min_hours: term?.request_min_hours ?? DEFAULT_PROJECT_REQUEST_MIN_HOURS,
    tracks,
    updated_at: tracks.reduce((latest, t) => {
      if (!t.updated_at) return latest;
      if (!latest) return t.updated_at;
      return String(t.updated_at) > String(latest) ? t.updated_at : latest;
    }, null),
  };
}

export async function updateProjectRequestMinHours(user, body) {
  const cid = collegeId(user);
  const kind = normalizeProjectKind(body?.kind);
  if (!kind) httpError(400, 'kind must be term, graduation_1, or graduation_2');
  const hours = parseProjectMinHours(body?.project_request_min_hours);
  if (hours == null) httpError(400, 'project_request_min_hours must be a whole number from 0 to 250');
  await ensureCollegeProjectTracks(cid);
  const row = await db.prepare(
    'SELECT id FROM college_project_tracks WHERE college_id = ? AND kind = ?'
  ).get(cid, kind);
  if (!row) httpError(404, 'Project track not found');
  await db.prepare(`
    UPDATE college_project_tracks
    SET request_min_hours = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(hours, user.id, row.id);
  const settings = await getProjectRequestSettings(cid);
  return {
    ...settings,
    kind,
    project_request_min_hours: hours,
    track: settings.tracks.find((t) => t.kind === kind) || null,
  };
}

export async function researchSummary(collegeIdValue) {
  const published = await db.prepare(
    `SELECT COUNT(*)::int AS n FROM research_publications WHERE college_id = ? AND status = 'published'`
  ).get(collegeIdValue);
  const pending = await db.prepare(
    `SELECT COUNT(*)::int AS n FROM graduation_projects WHERE college_id = ? AND status = 'pending'`
  ).get(collegeIdValue);
  const approved = await db.prepare(
    `SELECT COUNT(*)::int AS n FROM graduation_projects WHERE college_id = ? AND status = 'approved'`
  ).get(collegeIdValue);
  const studentPending = await db.prepare(
    `SELECT COUNT(*)::int AS n FROM student_project_requests WHERE college_id = ? AND status = 'pending'`
  ).get(collegeIdValue);
  return {
    available: true,
    total: Number(published?.n) || 0,
    projects_pending: Number(pending?.n) || 0,
    projects_approved: Number(approved?.n) || 0,
    student_requests_pending: Number(studentPending?.n) || 0,
  };
}

export async function listStudentProjectRequests(collegeIdValue) {
  const raw = await db.prepare(`
    SELECT r.id, r.kind, r.title, r.notes, r.status, r.vda_note, r.created_at, r.decided_at,
           r.team_size, r.pdf_url, r.pdf_name,
           r.student_user_id, u.full_name AS student_name, u.person_code AS university_id
    FROM student_project_requests r
    LEFT JOIN users u ON u.id = r.student_user_id
    WHERE r.college_id = ?
    ORDER BY CASE r.kind
      WHEN 'term' THEN 0
      WHEN 'graduation_1' THEN 1
      WHEN 'graduation_2' THEN 2
      ELSE 3
    END, CASE r.status WHEN 'pending' THEN 0 WHEN 'returned' THEN 1 ELSE 2 END, r.id DESC
  `).all(collegeIdValue);
  const rows = await attachProjectRequestDetails(raw);
  return PROJECT_TRACKS.map((spec) => ({
    kind: spec.key,
    ar: spec.ar,
    en: spec.en,
    items: (rows || []).filter((row) => row.kind === spec.key),
  }));
}

async function loadStudentProjectRequest(id, cid) {
  const raw = await db.prepare(`
    SELECT r.id, r.kind, r.title, r.notes, r.status, r.vda_note, r.created_at, r.decided_at,
           r.team_size, r.pdf_url, r.pdf_name,
           r.student_user_id, u.full_name AS student_name, u.person_code AS university_id
    FROM student_project_requests r
    LEFT JOIN users u ON u.id = r.student_user_id
    WHERE r.id = ? AND r.college_id = ?
  `).get(id, cid);
  if (!raw) httpError(404, 'Student project request not found');
  return (await attachProjectRequestDetails([raw]))[0];
}

export async function decideStudentProjectRequest(user, id, body) {
  const cid = collegeId(user);
  const decision = parseStudentRequestDecision(body?.decision);
  if (!decision) httpError(400, 'Decision must be approved, rejected, or returned');
  const note = trimOrNull(body?.note);
  if (decision === 'returned' && !note) httpError(400, 'A note is required when returning a request');
  const row = await db.prepare(
    'SELECT id, status FROM student_project_requests WHERE id = ? AND college_id = ?'
  ).get(id, cid);
  if (!row) httpError(404, 'Student project request not found');
  if (row.status !== 'pending' && row.status !== 'returned') {
    httpError(400, 'This request was already decided');
  }
  await db.prepare(`
    UPDATE student_project_requests
    SET status = ?, vda_note = ?, decided_by = ?, decided_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(decision, note, user.id, row.id);
  return loadStudentProjectRequest(row.id, cid);
}

export async function getAcademicViceDeanResearch(user) {
  const cid = collegeId(user);
  const publications = await db.prepare(`
    SELECT p.id, p.title, p.authors, p.venue, p.published_on, p.status, p.notes,
           p.created_at, d.name AS department_name
    FROM research_publications p
    LEFT JOIN departments d ON d.id = p.department_id
    WHERE p.college_id = ?
    ORDER BY p.published_on DESC NULLS LAST, p.id DESC
  `).all(cid);
  const projects = await db.prepare(`
    SELECT p.id, p.title, p.student_name, p.supervisor_name, p.kind, p.status,
           p.decision_note, p.decided_at, p.created_at, d.name AS department_name
    FROM graduation_projects p
    LEFT JOIN departments d ON d.id = p.department_id
    WHERE p.college_id = ?
    ORDER BY CASE p.kind
      WHEN 'term' THEN 0
      WHEN 'graduation_1' THEN 1
      WHEN 'graduation_2' THEN 2
      ELSE 3
    END, CASE p.status WHEN 'pending' THEN 0 ELSE 1 END, p.id DESC
  `).all(cid);
  const committeeByProject = new Map();
  if (projects.length) {
    const placeholders = projects.map(() => '?').join(', ');
    const members = await db.prepare(`
      SELECT project_id, id, full_name, committee_role
      FROM graduation_committee_members
      WHERE project_id IN (${placeholders})
      ORDER BY id ASC
    `).all(...projects.map((p) => p.id));
    for (const m of members) {
      const list = committeeByProject.get(Number(m.project_id)) || [];
      list.push(m);
      committeeByProject.set(Number(m.project_id), list);
    }
  }
  return {
    kinds: PROJECT_KINDS,
    committee_roles: COMMITTEE_ROLES,
    settings: await getProjectRequestSettings(cid),
    publications,
    projects: projects.map((p) => ({ ...p, committee: committeeByProject.get(Number(p.id)) || [] })),
    student_requests: await listStudentProjectRequests(cid),
    request_window: await getCollegeRequestWindow(cid),
    counts: await researchSummary(cid),
  };
}

export async function registerPublication(user, body) {
  const cid = collegeId(user);
  const title = String(body?.title || '').trim();
  if (!title) httpError(400, 'Publication title is required');
  const r = await db.prepare(`
    INSERT INTO research_publications
      (college_id, title, authors, venue, published_on, department_id, notes, status, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'published', ?)
  `).run(
    cid,
    title,
    trimOrNull(body?.authors),
    trimOrNull(body?.venue),
    trimOrNull(body?.published_on),
    body?.department_id ? Number(body.department_id) : null,
    trimOrNull(body?.notes),
    user.id,
  );
  return db.prepare('SELECT * FROM research_publications WHERE id = ?').get(r.lastInsertRowid);
}

export async function submitGraduationProject(user, body) {
  const cid = collegeId(user);
  const title = String(body?.title || '').trim();
  const studentName = String(body?.student_name || '').trim();
  if (!title) httpError(400, 'Project title is required');
  if (!studentName) httpError(400, 'Student name is required');
  const kind = normalizeProjectKind(body?.kind || 'term');
  if (!kind) httpError(400, 'kind must be term, graduation_1, or graduation_2');
  const r = await db.prepare(`
    INSERT INTO graduation_projects
      (college_id, title, student_name, supervisor_name, department_id, kind, status, created_by)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
  `).run(
    cid,
    title,
    studentName,
    trimOrNull(body?.supervisor_name),
    body?.department_id ? Number(body.department_id) : null,
    kind,
    user.id,
  );
  const id = r.lastInsertRowid;
  for (const member of parseCommitteeMembers(body?.committee)) {
    await db.prepare(`
      INSERT INTO graduation_committee_members (project_id, user_id, full_name, committee_role)
      VALUES (?, ?, ?, ?)
    `).run(id, member.user_id, member.full_name, member.committee_role);
  }
  return loadProject(id, cid);
}

export async function decideGraduationProject(user, id, body) {
  const cid = collegeId(user);
  const decision = parseProjectDecision(body?.decision);
  if (!decision) httpError(400, 'Decision must be approved or rejected');
  const row = await db.prepare(
    'SELECT id, status FROM graduation_projects WHERE id = ? AND college_id = ?'
  ).get(id, cid);
  if (!row) httpError(404, 'Graduation project not found');
  if (row.status !== 'pending') httpError(400, 'This project was already decided');
  const note = trimOrNull(body?.note);
  await db.prepare(`
    UPDATE graduation_projects
    SET status = ?, decided_by = ?, decision_note = ?, decided_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(decision, user.id, note, row.id);
  return loadProject(row.id, cid);
}
