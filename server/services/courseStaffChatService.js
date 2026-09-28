import { db } from '../db.js';
import { parseCourseChatBody } from '../college/courseChat.js';
import { publishCourseChat } from './courseStaffChatHub.js';

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

function publicMessage(row) {
  return {
    id: Number(row.id),
    user_id: Number(row.user_id),
    full_name: row.full_name || '',
    person_code: row.person_code || '',
    role: row.role,
    body: row.body,
    created_at: row.created_at,
    mine: false,
  };
}

export async function unreadIncomingChatCounts(user) {
  const cid = collegeId(user);
  try {
    const rows = await db.prepare(`
      SELECT m.catalog_course_id, COUNT(*)::int AS unread_count
      FROM course_staff_chat_messages m
      LEFT JOIN course_staff_chat_reads r
        ON r.college_id = m.college_id
       AND r.catalog_course_id = m.catalog_course_id
       AND r.user_id = ?
      WHERE m.college_id = ?
        AND m.user_id <> ?
        AND (r.last_read_at IS NULL OR m.created_at > r.last_read_at)
      GROUP BY m.catalog_course_id
    `).all(user.id, cid, user.id);
    return new Map((rows || []).map((row) => [Number(row.catalog_course_id), Number(row.unread_count) || 0]));
  } catch (err) {
    if (err?.code === '42P01') return new Map();
    throw err;
  }
}

export async function markCourseStaffChatRead(user, catalogCourseId) {
  const cid = collegeId(user);
  const catalogId = Number(catalogCourseId);
  if (!Number.isFinite(catalogId)) return;
  try {
    await db.prepare(`
      INSERT INTO course_staff_chat_reads (college_id, catalog_course_id, user_id, last_read_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT (college_id, catalog_course_id, user_id)
      DO UPDATE SET last_read_at = CURRENT_TIMESTAMP
      RETURNING id
    `).run(cid, catalogId, user.id);
  } catch (err) {
    if (err?.code === '42P01') return;
    throw err;
  }
}

export async function listCourseStaffChat(user, catalogCourseId) {
  const cid = collegeId(user);
  const catalogId = Number(catalogCourseId);
  if (!Number.isFinite(catalogId)) httpError(404, 'Course not found');
  await markCourseStaffChatRead(user, catalogId);
  try {
    const rows = await db.prepare(`
      SELECT m.id, m.user_id, m.body, m.created_at, u.full_name, u.person_code, u.role
      FROM course_staff_chat_messages m
      INNER JOIN users u ON u.id = m.user_id
      WHERE m.college_id = ? AND m.catalog_course_id = ?
      ORDER BY m.id ASC
      LIMIT 200
    `).all(cid, catalogId);
    return {
      items: (rows || []).map((row) => ({
        ...publicMessage(row),
        mine: Number(row.user_id) === Number(user.id),
      })),
    };
  } catch (err) {
    if (err?.code === '42P01') return { items: [] };
    throw err;
  }
}

export async function postCourseStaffChat(user, catalogCourseId, body) {
  const cid = collegeId(user);
  const catalogId = Number(catalogCourseId);
  if (!Number.isFinite(catalogId)) httpError(404, 'Course not found');
  const parsed = parseCourseChatBody(body?.body ?? body?.message ?? body?.content);
  if (parsed.error) httpError(400, parsed.error);
  await db.prepare(`
    INSERT INTO course_staff_chat_messages (college_id, catalog_course_id, user_id, body)
    VALUES (?, ?, ?, ?)
    RETURNING id
  `).run(cid, catalogId, user.id, parsed.body);
  const list = await listCourseStaffChat(user, catalogId);
  publishCourseChat(cid, catalogId, {
    items: (list.items || []).map((row) => ({
      id: row.id,
      user_id: row.user_id,
      full_name: row.full_name,
      person_code: row.person_code,
      role: row.role,
      body: row.body,
      created_at: row.created_at,
    })),
  });
  return list;
}
