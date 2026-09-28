import { db } from '../db.js';
import {
  evaluateStudentProjectTrack,
  normalizeProjectKind,
  parseProjectTeamMembers,
  projectRequestLockMessage,
} from '../college/research.js';
import { parseProjectPdfPayload, saveProjectPdfFile } from '../college/projectRequestFiles.js';
import { getProjectRequestSettings } from './academicViceDeanResearchService.js';
import { attachProjectRequestDetails, saveProjectRequestMembers } from './projectRequestDetails.js';
import { getCollegeRequestWindow } from './requestWindowService.js';

function httpError(status, detail) {
  const err = new Error(detail);
  err.status = status;
  throw err;
}

function collegeId(user) {
  const cid = user?.college_id != null ? Number(user.college_id) : 1;
  return cid || 1;
}

function trimOrNull(value) {
  const text = String(value || '').trim();
  return text || null;
}

async function completedHoursFor(userId) {
  const record = await db.prepare(
    'SELECT total_credits_completed FROM student_academic_record WHERE user_id = ?'
  ).get(userId);
  return Number(record?.total_credits_completed) || 0;
}

async function passedKindsFor(userId, tracks) {
  const passed = [];
  for (const track of tracks) {
    const catalogId = track.course?.id;
    if (!catalogId) continue;
    const row = await db.prepare(`
      SELECT id FROM student_courses
      WHERE user_id = ? AND catalog_course_id = ?
        AND passed = 1
        AND (withdrawn IS NULL OR withdrawn != 1)
      LIMIT 1
    `).get(userId, catalogId);
    if (row) passed.push(track.kind);
  }
  return passed;
}

async function latestRequestsByKind(userId, cid) {
  const raw = await db.prepare(`
    SELECT id, kind, title, notes, status, vda_note, created_at, decided_at,
           team_size, pdf_url, pdf_name
    FROM student_project_requests
    WHERE student_user_id = ? AND college_id = ?
    ORDER BY id DESC
  `).all(userId, cid);
  const rows = await attachProjectRequestDetails(raw);
  const latest = {};
  for (const row of rows) {
    if (!latest[row.kind]) latest[row.kind] = row;
  }
  return { rows, latest };
}

async function submitterSnapshot(user, completedHours) {
  const record = await db.prepare(
    'SELECT cgpa, cumulative_percent, total_credits_completed FROM student_academic_record WHERE user_id = ?'
  ).get(user.id);
  const percent = record?.cumulative_percent != null ? Number(record.cumulative_percent) : null;
  const cgpa = record?.cgpa != null ? Number(record.cgpa) : null;
  return {
    full_name: user.full_name || '',
    university_id: user.person_code || '',
    gpa: percent != null && Number.isFinite(percent) ? percent : (cgpa != null && Number.isFinite(cgpa) ? cgpa : null),
    completed_hours: completedHours,
  };
}

function decorateTrack(track, { completedHours, passedKinds, latest, windowOpen }) {
  const request = latest[track.kind] || null;
  const evalState = evaluateStudentProjectTrack({
    kind: track.kind,
    completedHours,
    requiredHours: track.request_min_hours,
    passedKinds,
    latestStatus: request?.status || null,
    windowOpen,
  });
  return {
    ...track,
    ...evalState,
    request,
  };
}

export async function getStudentProjects(user) {
  const cid = collegeId(user);
  const settings = await getProjectRequestSettings(cid);
  const completedHours = await completedHoursFor(user.id);
  const passedKinds = await passedKindsFor(user.id, settings.tracks);
  const { rows, latest } = await latestRequestsByKind(user.id, cid);
  const requestWindow = await getCollegeRequestWindow(cid);
  return {
    completed_hours: completedHours,
    submitter: await submitterSnapshot(user, completedHours),
    request_window: requestWindow,
    tracks: settings.tracks.map((track) => decorateTrack(track, {
      completedHours,
      passedKinds,
      latest,
      windowOpen: requestWindow.open,
    })),
    requests: rows,
  };
}

export async function submitStudentProjectRequest(user, body) {
  const cid = collegeId(user);
  const kind = normalizeProjectKind(body?.kind);
  if (!kind) httpError(400, 'kind must be term, graduation_1, or graduation_2');
  const title = String(body?.title || '').trim();
  if (!title) httpError(400, 'Project title is required');
  const notes = trimOrNull(body?.notes);
  const team = parseProjectTeamMembers(body?.members, body?.team_size);
  if (team.error) httpError(400, team.error);
  const pdf = parseProjectPdfPayload(body?.pdf_base64, body?.pdf_filename || body?.pdf_name);

  const page = await getStudentProjects(user);
  const track = page.tracks.find((t) => t.kind === kind);
  if (!track) httpError(404, 'Project track not found');
  if (!track.can_request) {
    httpError(400, projectRequestLockMessage(track.lock_reason, kind));
  }

  const savedPdf = saveProjectPdfFile(user.id, pdf);
  const inserted = await db.prepare(`
    INSERT INTO student_project_requests
      (college_id, student_user_id, kind, title, notes, status, team_size, pdf_url, pdf_name)
    VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)
  `).run(cid, user.id, kind, title, notes, team.team_size, savedPdf.pdf_url, savedPdf.pdf_name);
  await saveProjectRequestMembers(inserted.lastInsertRowid, team.members);
  const row = (await attachProjectRequestDetails([
    await db.prepare(
      'SELECT id, kind, title, notes, status, vda_note, created_at, decided_at, team_size, pdf_url, pdf_name FROM student_project_requests WHERE id = ?'
    ).get(inserted.lastInsertRowid),
  ]))[0];
  const refreshed = await getStudentProjects(user);
  return { request: row, ...refreshed };
}
