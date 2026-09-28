import { db } from '../db.js';
import { isExamsOfficeRole, isViceDeanAcademic } from '../college/roles.js';
import {
  DEFAULT_GPA_SCALE,
  parseGpaScaleRows,
  publicGpaScale,
  lookupGpaScale,
} from '../college/gpaScale.js';

function httpError(status, detail) {
  const err = new Error(detail);
  err.status = status;
  throw err;
}

function collegeId(user) {
  const cid = user?.college_id != null ? Number(user.college_id) : null;
  if (cid == null) httpError(400, 'User is not attached to a college');
  return cid;
}

function requireEditors(user) {
  if (!isViceDeanAcademic(user?.role) && !isExamsOfficeRole(user?.role)) {
    httpError(403, 'Academic Vice Dean or Exams Office only');
  }
}

async function loadRows(cid) {
  try {
    const rows = await db.prepare(`
      SELECT min_mark, max_mark, points, letter
      FROM college_gpa_scale
      WHERE college_id = ?
      ORDER BY min_mark DESC, max_mark DESC, id ASC
    `).all(cid);
    return rows || [];
  } catch (err) {
    if (err?.code === '42P01') return [];
    throw err;
  }
}

async function seedDefaults(cid, actorId) {
  for (let i = 0; i < DEFAULT_GPA_SCALE.length; i += 1) {
    const row = DEFAULT_GPA_SCALE[i];
    await db.prepare(`
      INSERT INTO college_gpa_scale (college_id, min_mark, max_mark, points, letter, sort_order, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(cid, row.min_mark, row.max_mark, row.points, row.letter, i, actorId || null);
  }
}

export async function getGpaScale(user) {
  requireEditors(user);
  const cid = collegeId(user);
  let rows = await loadRows(cid);
  if (!rows.length) {
    await seedDefaults(cid, user.id);
    rows = await loadRows(cid);
  }
  return publicGpaScale(rows);
}

export async function updateGpaScale(user, body) {
  requireEditors(user);
  const cid = collegeId(user);
  const parsed = parseGpaScaleRows(body?.rows);
  if (parsed.error) httpError(400, parsed.error);
  await db.prepare('DELETE FROM college_gpa_scale WHERE college_id = ?').run(cid);
  for (let i = 0; i < parsed.rows.length; i += 1) {
    const row = parsed.rows[i];
    await db.prepare(`
      INSERT INTO college_gpa_scale (college_id, min_mark, max_mark, points, letter, sort_order, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(cid, row.min_mark, row.max_mark, row.points, row.letter, i, user.id);
  }
  return publicGpaScale(parsed.rows);
}

export async function previewGpaScale(user, mark) {
  const scale = await getGpaScale(user);
  return { mark: Number(mark), ...lookupGpaScale(scale.rows, mark) };
}

export async function getCollegeGpaScaleRows(cid) {
  if (cid == null || !Number.isFinite(Number(cid))) return DEFAULT_GPA_SCALE;
  let rows = await loadRows(Number(cid));
  if (!rows.length) {
    await seedDefaults(Number(cid), null);
    rows = await loadRows(Number(cid));
  }
  return publicGpaScale(rows).rows;
}

export function applyScaleToMark(rows, mark) {
  if (mark == null || Number.isNaN(Number(mark))) {
    return { percent: null, gpa_points: null, letter: null };
  }
  const percent = Number(mark);
  const found = lookupGpaScale(rows, percent);
  return { percent, gpa_points: found.points, letter: found.letter };
}

export async function applyScaleToUserMark(user, mark) {
  const cid = user?.college_id != null ? Number(user.college_id) : null;
  const rows = await getCollegeGpaScaleRows(cid);
  return applyScaleToMark(rows, mark);
}

export async function applyScaleToCourses(user, courses) {
  const cid = user?.college_id != null ? Number(user.college_id) : null;
  const rows = await getCollegeGpaScaleRows(cid);
  return (courses || []).map((course) => {
    const grade = course.current_grade != null
      ? Number(course.current_grade)
      : (course.final_mark != null ? Number(course.final_mark) : null);
    const scaled = applyScaleToMark(rows, grade);
    return {
      ...course,
      percent: scaled.percent,
      letter_grade: scaled.letter,
      gpa_points: scaled.gpa_points,
    };
  });
}
