import { Router } from 'express';
import { db } from '../db.js';
import { authMiddleware, requireCurriculumAdmin } from '../middleware/auth.js';
import * as cache from '../lib/cache.js';
import { syncCollegeCurriculum, ensureUniCourseForCatalog } from '../college/catalogSync.js';
import { setCatalogDepartment } from '../college/departments.js';

async function resolveCollegeDepartment(b, collegeId) {
  if (!collegeId) return null;
  if (b.department_id != null && b.department_id !== '') {
    return db.prepare(
      'SELECT id, name FROM departments WHERE id = ? AND college_id = ?'
    ).get(Number(b.department_id), collegeId);
  }
  if (b.department) {
    return db.prepare(
      'SELECT id, name FROM departments WHERE college_id = ? AND lower(trim(name)) = lower(trim(?)) LIMIT 1'
    ).get(collegeId, b.department);
  }
  return null;
}

export const catalogRouter = Router();

const CATALOG_CACHE_KEY = 'catalog:courses';
const CATALOG_CACHE_TTL = 300; // 5 min

catalogRouter.get('/courses', authMiddleware, async (req, res) => {
  const cid = req.user?.college_id != null ? Number(req.user.college_id) : null;
  if (!cid) return res.json([]);
  const rows = await syncCollegeCurriculum(cid);
  return res.json(rows);
});

catalogRouter.get('/courses/:id', async (req, res) => {
  const row = await db.prepare(`
    SELECT id, course_code, course_name, department, description, credit_hours, "order", prerequisite_id, created_at
    FROM catalog_courses WHERE id = ?
  `).get(parseInt(req.params.id, 10));
  if (!row) return res.status(404).json({ detail: 'Course not found' });
  return res.json(row);
});

catalogRouter.post('/courses', authMiddleware, requireCurriculumAdmin, async (req, res) => {
  const b = req.body || {};
  const course_code = b.course_code;
  const course_name = b.course_name;
  const cid = req.user?.college_id != null ? Number(req.user.college_id) : null;
  const dept = await resolveCollegeDepartment(b, cid);
  if (!dept) {
    return res.status(400).json({ detail: 'Choose an official college department' });
  }
  const department = dept.name;
  const description = b.description ?? null;
  const credit_hours = b.credit_hours ?? 3;
  const order = b.order ?? 999;
  const prerequisite_id = b.prerequisite_id ? parseInt(b.prerequisite_id, 10) : null;
  if (!course_code || !course_name) {
    return res.status(400).json({ detail: 'course_code, course_name, department required' });
  }
  const result = await db.prepare(`
    INSERT INTO catalog_courses (course_code, course_name, department, description, credit_hours, "order", prerequisite_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(course_code, course_name, department, description, credit_hours, order, prerequisite_id);
  const row = await db.prepare('SELECT * FROM catalog_courses WHERE id = ?').get(result.lastInsertRowid);
  if (cid) {
    await ensureUniCourseForCatalog(row, cid);
    await setCatalogDepartment(row.id, cid, dept.id);
  }
  await cache.cacheDel(CATALOG_CACHE_KEY).catch(() => {});
  try {
    const students = await db.prepare("SELECT id FROM users WHERE role = 'student'").all();
    if (students.length) {
      const title = `مادة جديدة في الكتالوج: ${course_name}`;
      const body =
        description ||
        `تمت إضافة مادة جديدة (${course_code}) إلى الكتالوج في قسم ${department}.`;
      const link = '/courses';
      for (const s of students) {
        try {
          await db.prepare(
            'INSERT INTO notifications (user_id, title, body, type, link, source) VALUES (?, ?, ?, ?, ?, ?)'
          ).run(s.id, title, body, 'info', link, 'catalog');
        } catch (_) {}
      }
    }
  } catch (_) {}
  return res.status(201).json(row);
});

catalogRouter.patch('/courses/:id', authMiddleware, requireCurriculumAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const b = req.body || {};
  const existing = await db.prepare('SELECT id FROM catalog_courses WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ detail: 'Course not found' });
  const row = await db.prepare('SELECT * FROM catalog_courses WHERE id = ?').get(id);
  const cid = req.user?.college_id != null ? Number(req.user.college_id) : null;
  const dept = await resolveCollegeDepartment(b, cid);
  if ((b.department_id != null && b.department_id !== '') || b.department !== undefined) {
    if (!dept) return res.status(400).json({ detail: 'Choose an official college department' });
  }
  const course_code = b.course_code !== undefined ? b.course_code : row.course_code;
  const course_name = b.course_name !== undefined ? b.course_name : row.course_name;
  const department = dept ? dept.name : row.department;
  const description = b.description !== undefined ? b.description : row.description;
  const credit_hours = b.credit_hours !== undefined ? b.credit_hours : row.credit_hours;
  const order = b.order !== undefined ? b.order : row.order;
  const prerequisite_id = b.prerequisite_id !== undefined ? (b.prerequisite_id ? parseInt(b.prerequisite_id, 10) : null) : row.prerequisite_id;
  await db.prepare(`
    UPDATE catalog_courses SET course_code=?, course_name=?, department=?, description=?, credit_hours=?, "order"=?, prerequisite_id=? WHERE id=?
  `).run(course_code, course_name, department, description, credit_hours, order, prerequisite_id, id);
  await db.prepare(
    'UPDATE uni_courses SET course_code = ?, course_name = ?, credit_hours = ? WHERE catalog_course_id = ?'
  ).run(course_code, course_name, credit_hours, id);
  if (cid && dept) {
    await setCatalogDepartment(id, cid, dept.id);
  }
  await cache.cacheDel(CATALOG_CACHE_KEY).catch(() => {});
  const updated = await db.prepare('SELECT * FROM catalog_courses WHERE id = ?').get(id);
  return res.json({ ...updated, department, department_id: dept?.id ?? null });
});

catalogRouter.delete('/courses/:id', authMiddleware, requireCurriculumAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const result = await db.prepare('DELETE FROM catalog_courses WHERE id = ?').run(id);
  if (result.changes === 0) return res.status(404).json({ detail: 'Course not found' });
  await cache.cacheDel(CATALOG_CACHE_KEY).catch(() => {});
  return res.status(204).send();
});

catalogRouter.get('/courses/:id/resources', authMiddleware, requireCurriculumAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const exists = await db.prepare('SELECT id FROM catalog_courses WHERE id = ?').get(id);
  if (!exists) return res.status(404).json({ detail: 'Course not found' });
  const rows = await db.prepare('SELECT id, catalog_course_id, title, url, created_at FROM catalog_resources WHERE catalog_course_id = ? ORDER BY id').all(id);
  return res.json(rows);
});
catalogRouter.post('/courses/:id/resources', authMiddleware, requireCurriculumAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const exists = await db.prepare('SELECT id FROM catalog_courses WHERE id = ?').get(id);
  if (!exists) return res.status(404).json({ detail: 'Course not found' });
  const b = req.body || {};
  const title = (b.title || '').trim() || 'File';
  const url = b.url != null ? String(b.url).trim() : null;
  const r = await db.prepare('INSERT INTO catalog_resources (catalog_course_id, title, url) VALUES (?, ?, ?)').run(id, title, url || null);
  const row = await db.prepare('SELECT id, catalog_course_id, title, url, created_at FROM catalog_resources WHERE id = ?').get(r.lastInsertRowid);
  return res.status(201).json(row);
});
catalogRouter.patch('/courses/:id/resources/:rid', authMiddleware, requireCurriculumAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const rid = parseInt(req.params.rid, 10);
  const row = await db.prepare('SELECT id FROM catalog_resources WHERE id = ? AND catalog_course_id = ?').get(rid, id);
  if (!row) return res.status(404).json({ detail: 'Resource not found' });
  const b = req.body || {};
  if (b.title != null) await db.prepare('UPDATE catalog_resources SET title = ? WHERE id = ?').run((b.title || '').trim(), rid);
  if (b.url !== undefined) await db.prepare('UPDATE catalog_resources SET url = ? WHERE id = ?').run(b.url == null ? null : String(b.url).trim(), rid);
  const updated = await db.prepare('SELECT id, catalog_course_id, title, url, created_at FROM catalog_resources WHERE id = ?').get(rid);
  return res.json(updated);
});
catalogRouter.delete('/courses/:id/resources/:rid', authMiddleware, requireCurriculumAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const rid = parseInt(req.params.rid, 10);
  const row = await db.prepare('SELECT id FROM catalog_resources WHERE id = ? AND catalog_course_id = ?').get(rid, id);
  if (!row) return res.status(404).json({ detail: 'Resource not found' });
  await db.prepare('DELETE FROM catalog_resources WHERE id = ?').run(rid);
  return res.status(204).send();
});

catalogRouter.get('/courses/:id/grade-scheme', authMiddleware, requireCurriculumAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const exists = await db.prepare('SELECT id FROM catalog_courses WHERE id = ?').get(id);
  if (!exists) return res.status(404).json({ detail: 'Course not found' });
  const rows = await db.prepare('SELECT id, catalog_course_id, item_type, title, weight, max_score, sort_order, created_at FROM catalog_grade_items WHERE catalog_course_id = ? ORDER BY sort_order, id').all(id);
  return res.json(rows);
});
catalogRouter.put('/courses/:id/grade-scheme', authMiddleware, requireCurriculumAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const exists = await db.prepare('SELECT id FROM catalog_courses WHERE id = ?').get(id);
  if (!exists) return res.status(404).json({ detail: 'Course not found' });
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (items.length === 0) {
    return res.status(400).json({ detail: 'Grade distribution is required: add at least one item (type, title, weight, max score)' });
  }
  const totalWeight = items.reduce((sum, it) => sum + (Number(it.weight) || 0), 0);
  if (Math.abs(totalWeight - 100) > 0.01) {
    return res.status(400).json({ detail: 'Total weight must equal 100%' });
  }
  await db.prepare('DELETE FROM catalog_grade_items WHERE catalog_course_id = ?').run(id);
  const types = ['quiz', 'midterm', 'final', 'assignment', 'project', 'lab', 'presentation'];
  for (let idx = 0; idx < items.length; idx++) {
    const it = items[idx];
    const type = types.includes(it.item_type) ? it.item_type : 'quiz';
    const title = (it.title || '').trim() || type;
    const weight = Number(it.weight) || 0;
    const maxScore = Number(it.max_score) != null && Number(it.max_score) >= 0 ? Number(it.max_score) : 100;
    await db.prepare('INSERT INTO catalog_grade_items (catalog_course_id, item_type, title, weight, max_score, sort_order) VALUES (?, ?, ?, ?, ?, ?)').run(id, type, title, weight, maxScore, idx);
  }
  const rows = await db.prepare('SELECT id, catalog_course_id, item_type, title, weight, max_score, sort_order, created_at FROM catalog_grade_items WHERE catalog_course_id = ? ORDER BY sort_order, id').all(id);
  return res.json(rows);
});
