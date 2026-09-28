import { db } from '../db.js';

export function normalizeCourseCode(code) {
  return String(code || '').trim().toLowerCase();
}

export async function ensureCatalogRowForUniCourse(uc) {
  if (uc.catalog_course_id) {
    const exists = await db.prepare('SELECT id FROM catalog_courses WHERE id = ?').get(uc.catalog_course_id);
    if (exists) return Number(exists.id);
  }
  const code = String(uc.course_code || '').trim();
  if (!code) return null;
  let cat = await db.prepare(
    'SELECT id FROM catalog_courses WHERE lower(trim(course_code)) = lower(trim(?)) LIMIT 1'
  ).get(code);
  if (!cat) {
    const r = await db.prepare(`
      INSERT INTO catalog_courses (course_code, course_name, department, credit_hours, "order")
      VALUES (?, ?, ?, ?, ?)
    `).run(
      code,
      uc.course_name || code,
      uc.department_name || 'College',
      Math.round(Number(uc.credit_hours) || 3),
      Number(uc.id) || 999,
    );
    cat = { id: r.lastInsertRowid };
  }
  await db.prepare('UPDATE uni_courses SET catalog_course_id = ? WHERE id = ?').run(cat.id, uc.id);
  return Number(cat.id);
}

export async function ensureUniCourseForCatalog(catalog, collegeId) {
  if (!collegeId || !catalog?.id) return null;
  const linked = await db.prepare(`
    SELECT uc.id FROM uni_courses uc
    INNER JOIN departments d ON d.id = uc.department_id
    WHERE d.college_id = ? AND uc.catalog_course_id = ?
    LIMIT 1
  `).get(collegeId, catalog.id);
  if (linked) return Number(linked.id);

  const byCode = await db.prepare(`
    SELECT uc.id FROM uni_courses uc
    INNER JOIN departments d ON d.id = uc.department_id
    WHERE d.college_id = ? AND lower(trim(uc.course_code)) = lower(trim(?))
    LIMIT 1
  `).get(collegeId, catalog.course_code);
  if (byCode) {
    await db.prepare('UPDATE uni_courses SET catalog_course_id = ? WHERE id = ?').run(catalog.id, byCode.id);
    return Number(byCode.id);
  }

  let dept = catalog.department
    ? await db.prepare(
      'SELECT id FROM departments WHERE college_id = ? AND lower(trim(name)) = lower(trim(?)) LIMIT 1'
    ).get(collegeId, catalog.department)
    : null;
  if (!dept) {
    dept = await db.prepare('SELECT id FROM departments WHERE college_id = ? ORDER BY id ASC LIMIT 1').get(collegeId);
  }
  if (!dept) return null;
  const r = await db.prepare(`
    INSERT INTO uni_courses (department_id, course_code, course_name, credit_hours, catalog_course_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    dept.id,
    String(catalog.course_code || '').trim(),
    catalog.course_name,
    Math.round(Number(catalog.credit_hours) || 3),
    catalog.id,
  );
  return Number(r.lastInsertRowid);
}

export async function listOfficialCatalog(collegeId) {
  if (!collegeId) return [];
  return db.prepare(`
    SELECT DISTINCT ON (cc.id)
      cc.id, cc.course_code, cc.course_name, d.name AS department, d.id AS department_id,
      d.code AS department_code, cc.description,
      cc.credit_hours, cc."order", cc.prerequisite_id, cc.created_at
    FROM catalog_courses cc
    INNER JOIN uni_courses uc ON uc.catalog_course_id = cc.id
    INNER JOIN departments d ON d.id = uc.department_id
    WHERE d.college_id = ?
    ORDER BY cc.id, cc."order" ASC
  `).all(collegeId);
}

export async function linkOfficialStudentCourses() {
  const rows = await db.prepare(`
    SELECT sc.id, sc.user_id, uc.catalog_course_id
    FROM student_courses sc
    INNER JOIN enrollments e ON e.id = sc.enrollment_id
    INNER JOIN course_offerings o ON o.id = e.offering_id
    INNER JOIN uni_courses uc ON uc.id = o.uni_course_id
    WHERE sc.catalog_course_id IS NULL AND uc.catalog_course_id IS NOT NULL
    ORDER BY sc.id DESC
  `).all();
  for (const row of rows) {
    const clash = await db.prepare(
      'SELECT id FROM student_courses WHERE user_id = ? AND catalog_course_id = ? AND id <> ?'
    ).get(row.user_id, row.catalog_course_id, row.id);
    if (clash) continue;
    await db.prepare('UPDATE student_courses SET catalog_course_id = ? WHERE id = ?')
      .run(row.catalog_course_id, row.id);
  }
}

export async function syncCollegeCurriculum(collegeId) {
  if (!collegeId) return [];
  const uniRows = await db.prepare(`
    SELECT uc.id, uc.course_code, uc.course_name, uc.credit_hours, uc.catalog_course_id,
           d.name AS department_name
    FROM uni_courses uc
    INNER JOIN departments d ON d.id = uc.department_id
    WHERE d.college_id = ?
  `).all(collegeId);
  for (const uc of uniRows) {
    await ensureCatalogRowForUniCourse(uc);
  }
  const catalogRows = await db.prepare(
    'SELECT id, course_code, course_name, department, credit_hours FROM catalog_courses ORDER BY id'
  ).all();
  for (const cc of catalogRows) {
    await ensureUniCourseForCatalog(cc, collegeId);
  }
  await linkOfficialStudentCourses();
  return listOfficialCatalog(collegeId);
}
