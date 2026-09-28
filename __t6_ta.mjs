const base = 'http://127.0.0.1:3001/api';
const login = async (id) => (await (await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ university_id: id, password: 'College123!' }) })).json()).access_token;
const get = async (t, p) => { const r = await fetch(`${base}${p}`, { headers: { Authorization: `Bearer ${t}` } }); return { status: r.status, body: await r.json() }; };
const ta = await login('0260000006');
const list = await get(ta, '/academic/staff/my-courses');
const rows = Array.isArray(list.body) ? list.body : (list.body.courses || []);
console.log('ta courses', list.status, rows.map((c) => ({ id: c.catalog_course_id || c.id, code: c.course_code })));
if (rows[0]) {
  const id = rows[0].catalog_course_id || rows[0].id;
  const card = await get(ta, `/academic/staff/my-courses/${id}`);
  console.log('ta card', card.status, 'sessions', card.body.attendance?.sessions?.length, 'makeup', card.body.attendance?.sessions?.filter((s) => s.is_makeup).length);
}
const sess = await get(ta, '/academic/staff/sessions');
console.log('ta session courses', [...new Set((sess.body.sessions || []).map((s) => s.course_code))]);
