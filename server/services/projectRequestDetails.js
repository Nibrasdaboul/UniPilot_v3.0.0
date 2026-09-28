import { db } from '../db.js';

export async function attachProjectRequestDetails(rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return list;
  const ids = [...new Set(list.map((row) => Number(row.id)).filter(Boolean))];
  if (!ids.length) {
    return list.map((row) => ({
      ...row,
      team_size: Number(row.team_size) || 0,
      members: [],
      pdf_url: row.pdf_url || null,
      pdf_name: row.pdf_name || null,
    }));
  }
  const placeholders = ids.map(() => '?').join(', ');
  const members = await db.prepare(`
    SELECT request_id, full_name, university_id, gpa, completed_hours, sort_order
    FROM student_project_request_members
    WHERE request_id IN (${placeholders})
    ORDER BY sort_order ASC, id ASC
  `).all(...ids);
  const byId = new Map();
  for (const member of members || []) {
    const key = Number(member.request_id);
    const group = byId.get(key) || [];
    group.push({
      full_name: member.full_name,
      university_id: member.university_id,
      gpa: member.gpa != null ? Number(member.gpa) : null,
      completed_hours: member.completed_hours != null ? Number(member.completed_hours) : null,
    });
    byId.set(key, group);
  }
  return list.map((row) => {
    const attached = byId.get(Number(row.id)) || [];
    return {
      ...row,
      team_size: row.team_size != null ? Number(row.team_size) : attached.length,
      members: attached,
      pdf_url: row.pdf_url || null,
      pdf_name: row.pdf_name || null,
    };
  });
}

export async function saveProjectRequestMembers(requestId, members) {
  for (let i = 0; i < (members || []).length; i += 1) {
    const member = members[i];
    await db.prepare(`
      INSERT INTO student_project_request_members
        (request_id, full_name, university_id, gpa, completed_hours, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      requestId,
      member.full_name,
      member.university_id,
      member.gpa,
      member.completed_hours,
      i,
    );
  }
}
