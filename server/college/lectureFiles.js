import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';
import { parseProjectPdfPayload } from './projectRequestFiles.js';

export const LECTURE_KINDS = ['theory', 'practical'];
export const LECTURE_TITLE_MAX = 200;
export const LECTURE_NOTE_MAX = 2000;

export function parseLectureKind(value) {
  const kind = String(value || '').trim();
  if (!LECTURE_KINDS.includes(kind)) {
    return { error: 'kind must be theory or practical' };
  }
  return { error: null, kind };
}

export function parseLectureTitle(value) {
  const title = String(value || '').trim();
  if (!title) return { error: 'title is required' };
  if (title.length > LECTURE_TITLE_MAX) return { error: `title must be ${LECTURE_TITLE_MAX} characters or fewer` };
  return { error: null, title };
}

export function parseReviewDecision(body) {
  const decision = String(body?.decision || body?.status || '').trim().toLowerCase();
  if (decision !== 'approve' && decision !== 'reject') {
    return { error: 'decision must be approve or reject' };
  }
  const note = String(body?.note || body?.review_note || '').trim();
  if (decision === 'reject' && !note) return { error: 'A rejection note is required' };
  if (note.length > LECTURE_NOTE_MAX) return { error: `note must be ${LECTURE_NOTE_MAX} characters or fewer` };
  return { error: null, status: decision === 'approve' ? 'approved' : 'rejected', note };
}

export function parseLecturePdf(base64, filename) {
  return parseProjectPdfPayload(base64, filename);
}

export function saveLecturePdfFile(userId, payload) {
  if (!payload) return null;
  const dir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'uploads', 'lecture-pdfs');
  mkdirSync(dir, { recursive: true });
  const stored = `${Number(userId) || 0}-${randomBytes(6).toString('hex')}.pdf`;
  writeFileSync(join(dir, stored), payload.buffer);
  return { file_url: `/uploads/lecture-pdfs/${stored}`, file_name: payload.filename };
}
