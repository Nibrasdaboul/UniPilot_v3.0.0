import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';

const MAX_BYTES = 15 * 1024 * 1024;

function httpError(status, detail) {
  const err = new Error(detail);
  err.status = status;
  return err;
}

export function parseProjectPdfPayload(base64, filename) {
  if (base64 == null || String(base64).trim() === '') {
    throw httpError(400, 'A PDF file is required');
  }
  let data = String(base64).trim();
  const match = data.match(/^data:([^;]+);base64,(.+)$/i);
  let mime = '';
  if (match) {
    mime = match[1].toLowerCase();
    data = match[2];
  }
  const name = String(filename || '').toLowerCase();
  if (mime && mime !== 'application/pdf' && mime !== 'application/x-pdf') {
    throw httpError(400, 'The file must be a PDF');
  }
  if (!mime && name && !name.endsWith('.pdf')) {
    throw httpError(400, 'The file must be a PDF');
  }
  const buffer = Buffer.from(data, 'base64');
  if (!buffer.length) throw httpError(400, 'PDF is empty');
  if (buffer.length > MAX_BYTES) throw httpError(400, 'PDF must be 15 MB or smaller');
  const header = buffer.slice(0, 5).toString('latin1');
  if (!header.startsWith('%PDF')) throw httpError(400, 'The file must be a PDF');
  const rawName = String(filename || 'project.pdf').replace(/[^\w.\u0600-\u06FF-]+/g, '_').slice(0, 80);
  const display = rawName.toLowerCase().endsWith('.pdf') ? rawName : `${rawName || 'project'}.pdf`;
  return { buffer, filename: display };
}

export function saveProjectPdfFile(userId, payload) {
  if (!payload) return null;
  const dir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'uploads', 'project-pdfs');
  mkdirSync(dir, { recursive: true });
  const stored = `${Number(userId) || 0}-${randomBytes(6).toString('hex')}.pdf`;
  writeFileSync(join(dir, stored), payload.buffer);
  return { pdf_url: `/uploads/project-pdfs/${stored}`, pdf_name: payload.filename };
}
