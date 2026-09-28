import { db } from '../db.js';

export const COLLEGE_DEPARTMENTS = [
  { code: 'SE', name_ar: 'هندسة البرمجيات ونظم المعلومات', name_en: 'Software Engineering and Information Systems' },
  { code: 'NE', name_ar: 'هندسة الشبكات ونظم التشغيل', name_en: 'Network Engineering and Operating Systems' },
  { code: 'AI', name_ar: 'هندسة الذكاء الصنعي', name_en: 'Artificial Intelligence Engineering' },
  { code: 'PRE', name_ar: 'مواد ما قبل التخصص', name_en: 'Pre-specialization' },
];

const BY_CODE = Object.fromEntries(COLLEGE_DEPARTMENTS.map((d) => [d.code, d]));

export function labelDepartment(row, lang = 'ar') {
  const official = row?.code ? BY_CODE[String(row.code).toUpperCase()] : null;
  if (official) return lang === 'en' ? official.name_en : official.name_ar;
  return row?.name || '';
}

export function guessDepartmentCode(course) {
  const t = `${course?.course_name || ''} ${course?.department || ''} ${course?.course_code || ''}`.toLowerCase();
  if (/ذكاء|ai\b|artificial/.test(t)) return 'AI';
  if (/شبك|تشغيل|network|operating/.test(t)) return 'NE';
  if (/متطلب|نفس|رياض|خوارز|جامع|كليه|كلية|digital logic|introduction|مدخل|pre-?spec/.test(t)) return 'PRE';
  if (/برمج|software|غرضية/.test(t)) return 'SE';
  return 'PRE';
}

export function toPublicDepartment(row, lang) {
  return {
    id: row.id,
    code: row.code,
    name: labelDepartment(row, lang),
    name_ar: labelDepartment(row, 'ar'),
    name_en: labelDepartment(row, 'en'),
  };
}

export async function listCollegeDepartments(collegeId) {
  if (!collegeId) return [];
  return db.prepare(
    'SELECT id, college_id, code, name FROM departments WHERE college_id = ? ORDER BY id'
  ).all(collegeId);
}

export async function ensureCollegeDepartments(collegeId) {
  if (!collegeId) return [];
  const existing = await listCollegeDepartments(collegeId);
  const byCode = {};
  for (const row of existing) {
    if (row.code) byCode[String(row.code).toUpperCase()] = row;
  }

  const leftover = existing.find((d) => {
    const code = String(d.code || '').toUpperCase();
    const name = String(d.name || '').toLowerCase();
    return code === 'CE' || name === 'computer engineering';
  });
  if (leftover && !byCode.SE) {
    const se = BY_CODE.SE;
    await db.prepare('UPDATE departments SET code = ?, name = ? WHERE id = ?').run(se.code, se.name_ar, leftover.id);
    leftover.code = se.code;
    leftover.name = se.name_ar;
    byCode.SE = leftover;
  }

  for (const spec of COLLEGE_DEPARTMENTS) {
    if (byCode[spec.code]) {
      if (byCode[spec.code].name !== spec.name_ar) {
        await db.prepare('UPDATE departments SET name = ? WHERE id = ?').run(spec.name_ar, byCode[spec.code].id);
        byCode[spec.code].name = spec.name_ar;
      }
      continue;
    }
    const r = await db.prepare(
      'INSERT INTO departments (college_id, code, name) VALUES (?, ?, ?)'
    ).run(collegeId, spec.code, spec.name_ar);
    byCode[spec.code] = { id: r.lastInsertRowid, college_id: collegeId, code: spec.code, name: spec.name_ar };
  }

  await remapCatalogDepartments(collegeId, byCode);
  return listCollegeDepartments(collegeId);
}

async function remapCatalogDepartments(collegeId, byCode) {
  const catalog = await db.prepare(`
    SELECT cc.id, cc.course_code, cc.course_name, cc.department, uc.department_id
    FROM catalog_courses cc
    INNER JOIN uni_courses uc ON uc.catalog_course_id = cc.id
    INNER JOIN departments d ON d.id = uc.department_id
    WHERE d.college_id = ?
    ORDER BY cc.id
  `).all(collegeId);

  const seen = new Set();
  for (const course of catalog) {
    if (seen.has(course.id)) continue;
    seen.add(course.id);
    const code = guessDepartmentCode(course);
    const dept = byCode[code] || byCode.PRE;
    if (!dept) continue;
    await setCatalogDepartment(course.id, collegeId, dept.id);
  }
}

export async function setCatalogDepartment(catalogId, collegeId, departmentId) {
  const dept = await db.prepare(
    'SELECT id, code, name FROM departments WHERE id = ? AND college_id = ?'
  ).get(departmentId, collegeId);
  if (!dept) return null;
  await db.prepare('UPDATE catalog_courses SET department = ? WHERE id = ?').run(dept.name, catalogId);
  await db.prepare(`
    UPDATE uni_courses SET department_id = ?
    WHERE catalog_course_id = ?
      AND department_id IN (SELECT id FROM departments WHERE college_id = ?)
  `).run(departmentId, catalogId, collegeId);
  return dept;
}
