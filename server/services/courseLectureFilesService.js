import { db } from '../db.js';
import {
  parseLectureKind,
  parseLectureTitle,
  parseLecturePdf,
  parseReviewDecision,
  saveLecturePdfFile,
} from '../college/lectureFiles.js';

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

function publicFile(row) {
  return {
    id: Number(row.id),
    catalog_course_id: Number(row.catalog_course_id),
    title: row.title,
    kind: row.kind,
    file_url: row.file_url,
    file_name: row.file_name,
    status: row.status,
    review_note: row.review_note || '',
    uploaded_by: row.uploaded_by != null ? Number(row.uploaded_by) : null,
    created_at: row.created_at,
    reviewed_at: row.reviewed_at || null,
  };
}

export async function listCourseLectureFiles(user, catalogCourseId, { approvedOnly = false } = {}) {
  const cid = collegeId(user);
  const catalogId = Number(catalogCourseId);
  if (!Number.isFinite(catalogId)) httpError(404, 'Course not found');
  try {
    const rows = approvedOnly
      ? await db.prepare(`
          SELECT id, catalog_course_id, title, kind, file_url, file_name, status, review_note, uploaded_by, created_at, reviewed_at
          FROM course_lecture_files
          WHERE college_id = ? AND catalog_course_id = ? AND status = 'approved'
          ORDER BY id DESC
        `).all(cid, catalogId)
      : await db.prepare(`
          SELECT id, catalog_course_id, title, kind, file_url, file_name, status, review_note, uploaded_by, created_at, reviewed_at
          FROM course_lecture_files
          WHERE college_id = ? AND catalog_course_id = ?
          ORDER BY id DESC
        `).all(cid, catalogId);
    return { items: (rows || []).map(publicFile) };
  } catch (err) {
    if (err?.code === '42P01') return { items: [] };
    throw err;
  }
}

export async function listApprovedLectureFilesForCatalog(catalogCourseId) {
  const catalogId = Number(catalogCourseId);
  if (!Number.isFinite(catalogId)) return [];
  try {
    const rows = await db.prepare(`
      SELECT id, catalog_course_id, title, kind, file_url, file_name, status, created_at
      FROM course_lecture_files
      WHERE catalog_course_id = ? AND status = 'approved'
      ORDER BY id DESC
    `).all(catalogId);
    return (rows || []).map((row) => ({
      id: `lecture-${row.id}`,
      catalog_course_id: Number(row.catalog_course_id),
      title: row.title,
      url: row.file_url,
      kind: row.kind,
      source: 'lecture',
      created_at: row.created_at,
    }));
  } catch (err) {
    if (err?.code === '42P01') return [];
    throw err;
  }
}

export async function pendingLectureCountsForCollege(collegeIdValue) {
  const cid = Number(collegeIdValue);
  if (!Number.isFinite(cid)) return new Map();
  try {
    const rows = await db.prepare(`
      SELECT catalog_course_id, COUNT(*)::int AS pending_count
      FROM course_lecture_files
      WHERE college_id = ? AND status = 'pending'
      GROUP BY catalog_course_id
    `).all(cid);
    return new Map((rows || []).map((row) => [Number(row.catalog_course_id), Number(row.pending_count) || 0]));
  } catch (err) {
    if (err?.code === '42P01') return new Map();
    throw err;
  }
}

export async function uploadCourseLectureFile(user, catalogCourseId, body) {
  const cid = collegeId(user);
  const catalogId = Number(catalogCourseId);
  if (!Number.isFinite(catalogId)) httpError(404, 'Course not found');
  const title = parseLectureTitle(body?.title);
  if (title.error) httpError(400, title.error);
  const kind = parseLectureKind(body?.kind);
  if (kind.error) httpError(400, kind.error);
  let payload;
  try {
    payload = parseLecturePdf(body?.pdf_base64 || body?.file_base64, body?.pdf_filename || body?.pdf_name || body?.filename);
  } catch (err) {
    if (err.status) throw err;
    httpError(400, err.message || 'The file must be a PDF');
  }
  const saved = saveLecturePdfFile(user.id, payload);
  await db.prepare(`
    INSERT INTO course_lecture_files
      (college_id, catalog_course_id, title, kind, file_url, file_name, status, uploaded_by)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
    RETURNING id
  `).run(cid, catalogId, title.title, kind.kind, saved.file_url, saved.file_name, user.id);
  return listCourseLectureFiles(user, catalogId);
}

export async function decideCourseLectureFile(user, catalogCourseId, fileId, body) {
  const cid = collegeId(user);
  const catalogId = Number(catalogCourseId);
  const id = Number(fileId);
  if (!Number.isFinite(catalogId) || !Number.isFinite(id)) httpError(404, 'Lecture file not found');
  const parsed = parseReviewDecision(body);
  if (parsed.error) httpError(400, parsed.error);
  const row = await db.prepare(`
    SELECT id, status FROM course_lecture_files
    WHERE id = ? AND college_id = ? AND catalog_course_id = ?
  `).get(id, cid, catalogId);
  if (!row) httpError(404, 'Lecture file not found');
  if (row.status !== 'pending') httpError(400, 'This file was already reviewed');
  await db.prepare(`
    UPDATE course_lecture_files
    SET status = ?, review_note = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(parsed.status, parsed.note || null, user.id, id);
  return listCourseLectureFiles(user, catalogId);
}
