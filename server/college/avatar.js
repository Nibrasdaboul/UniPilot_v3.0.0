import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';

const MAX_BYTES = 2 * 1024 * 1024;
const TYPES = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function httpError(status, detail) {
  const err = new Error(detail);
  err.status = status;
  return err;
}

export function parseAvatarPayload(base64, filename) {
  if (base64 == null || String(base64).trim() === '') return null;
  let mime = '';
  let data = String(base64).trim();
  const match = data.match(/^data:([^;]+);base64,(.+)$/i);
  if (match) {
    mime = match[1].toLowerCase();
    data = match[2];
  } else {
    const name = String(filename || '').toLowerCase();
    if (name.endsWith('.png')) mime = 'image/png';
    else if (name.endsWith('.webp')) mime = 'image/webp';
    else mime = 'image/jpeg';
  }
  if (!TYPES[mime]) throw httpError(400, 'Photo must be JPG, PNG, or WebP');
  const buffer = Buffer.from(data, 'base64');
  if (!buffer.length) throw httpError(400, 'Photo is empty');
  if (buffer.length > MAX_BYTES) throw httpError(400, 'Photo must be 2 MB or smaller');
  return { buffer, ext: TYPES[mime] };
}

export function saveAvatarFile(userId, payload) {
  if (!payload) return null;
  const dir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'uploads', 'avatars');
  mkdirSync(dir, { recursive: true });
  const name = `${Number(userId) || 0}-${randomBytes(6).toString('hex')}.${payload.ext}`;
  writeFileSync(join(dir, name), payload.buffer);
  return `/uploads/avatars/${name}`;
}

export function uploadsRoot() {
  return join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'uploads');
}
