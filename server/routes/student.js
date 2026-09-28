import { Router } from 'express';
import { db } from '../db.js';
import { authMiddleware, requireStudent } from '../middleware/auth.js';
import { getStudentProjects, submitStudentProjectRequest } from '../services/studentProjectsService.js';
import { getStudentSurveys, submitStudentSurvey } from '../services/studentSurveysService.js';
import { getStudentSpecialization, submitStudentSpecialization } from '../services/studentSpecializationService.js';
import { getStudentPublishedCourseWork } from '../services/courseWorkGradesService.js';
import { submitCourseWorkAppeal } from '../services/courseWorkAppealsService.js';
import { getStudentCourseAttendance } from '../services/studentAttendanceService.js';
import { submitDeprivationCancel, listStudentActiveDeprivationCatalogIds } from '../services/attendanceSheetsService.js';
import { applyDeprivationStanding } from '../college/deprivationGrade.js';
import { hideWithdrawnMarks, isOfficialWithdrawal } from '../college/withdrawalMarks.js';

async function withDeprivationFlags(user, rows) {
  const deprivedIds = await listStudentActiveDeprivationCatalogIds(user);
  return (rows || []).map((row) => {
    const deprived = deprivedIds.has(Number(row.catalog_course_id));
    return hideWithdrawnMarks(applyDeprivationStanding({ ...row, deprived }, deprived));
  });
}

async function rejectIfWithdrawn(req, res) {
  const id = parseInt(req.params.id, 10);
  const row = await db.prepare(
    'SELECT withdrawn, withdrawn_at FROM student_courses WHERE id = ? AND user_id = ?'
  ).get(id, req.user.id);
  if (!isOfficialWithdrawal(row)) return false;
  res.status(403).json({ detail: 'You withdrew from this course (W). Marks are hidden.', code: 'course_withdrawn' });
  return true;
}

export const studentRouter = Router();
studentRouter.use(authMiddleware);
studentRouter.use(requireStudent);

studentRouter.get('/courses', async (req, res) => {
  const onlyCurrent = req.query.semester === 'current';
  if (onlyCurrent) {
    const cur = await db.prepare('SELECT id FROM student_semesters WHERE user_id = ? AND is_current = 1 LIMIT 1').get(req.user.id);
    if (cur) {
      const rows = await db.prepare(`
        SELECT id, user_id, catalog_course_id, course_name, course_code, credit_hours, semester, difficulty, target_grade, professor_name, description, current_grade, progress, finalized_at, passed, created_at, semester_id, withdrawn, withdrawn_at, enrollment_id
        FROM student_courses WHERE user_id = ? AND semester_id = ?
      `).all(req.user.id, cur.id);
      return res.json(await withDeprivationFlags(req.user, rows));
    }
    const allRows = await db.prepare(`
      SELECT id, user_id, catalog_course_id, course_name, course_code, credit_hours, semester, difficulty, target_grade, professor_name, description, current_grade, progress, finalized_at, passed, created_at, semester_id, withdrawn, withdrawn_at, enrollment_id
      FROM student_courses WHERE user_id = ?
    `).all(req.user.id);
    return res.json(await withDeprivationFlags(req.user, allRows));
  }
  const rows = await db.prepare(`
    SELECT id, user_id, catalog_course_id, course_name, course_code, credit_hours, semester, difficulty, target_grade, professor_name, description, current_grade, progress, finalized_at, passed, created_at, semester_id, withdrawn, withdrawn_at, enrollment_id
    FROM student_courses WHERE user_id = ?
  `).all(req.user.id);
  return res.json(await withDeprivationFlags(req.user, rows));
});

studentRouter.get('/courses/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const row = await db.prepare(`
    SELECT id, user_id, catalog_course_id, course_name, course_code, credit_hours, semester, difficulty, target_grade, professor_name, description, current_grade, progress, finalized_at, passed, created_at, withdrawn, withdrawn_at, semester_id, enrollment_id
    FROM student_courses WHERE id = ? AND user_id = ?
  `).get(id, req.user.id);
  if (!row) return res.status(404).json({ detail: 'Course not found' });
  return res.json(hideWithdrawnMarks(row));
});

studentRouter.post('/courses', async (req, res) => {
  if (req.user.role === 'student') {
    return res.status(403).json({
      detail: 'Courses are registered only during an official registration window.',
    });
  }
  const body = req.body || {};
  const catalog_course_id = body.catalog_course_id != null ? parseInt(body.catalog_course_id, 10) : null;
  const course_name = body.course_name || body.course_code || 'Course';
  const course_code = body.course_code || '';
  const credit_hours = body.credit_hours ?? 3;
  const semester = body.semester || 'Spring 2026';
  let semester_id = body.semester_id != null ? parseInt(body.semester_id, 10) : null;
  if (semester_id == null) {
    const cur = await db.prepare('SELECT id FROM student_semesters WHERE user_id = ? AND is_current = 1 LIMIT 1').get(req.user.id);
    if (cur) semester_id = cur.id;
  }
  if (semester_id != null) {
    const sem = await db.prepare('SELECT id, is_ended FROM student_semesters WHERE id = ? AND user_id = ?').get(semester_id, req.user.id);
    if (!sem) return res.status(400).json({ detail: 'Semester not found' });
    if (Number(sem.is_ended) === 1) return res.status(400).json({ detail: 'Cannot add course to an ended semester. Choose a semester that is not ended.' });
  }
  const difficulty = body.difficulty ?? 5;
  const target_grade = body.target_grade ?? 85;
  const professor_name = body.professor_name || '';
  const description = body.description || '';

  if (catalog_course_id) {
    const already = await db.prepare('SELECT id FROM student_courses WHERE user_id = ? AND catalog_course_id = ?')
      .get(req.user.id, catalog_course_id);
    if (already) {
      return res.status(400).json({ detail: 'Already enrolled in this course' });
    }
    const catalog = await db.prepare('SELECT id, prerequisite_id FROM catalog_courses WHERE id = ?').get(catalog_course_id);
    if (!catalog) {
      return res.status(400).json({ detail: 'Catalog course not found' });
    }
    const prereqId = catalog.prerequisite_id != null ? parseInt(catalog.prerequisite_id, 10) : null;
    if (prereqId != null) {
      const prereqCourse = await db.prepare(
        'SELECT id, finalized_at FROM student_courses WHERE user_id = ? AND catalog_course_id = ?'
      ).get(req.user.id, prereqId);
      if (!prereqCourse || prereqCourse.finalized_at == null) {
        return res.status(400).json({
          detail: 'Complete the prerequisite course first: mark it as finished and enter all grades, then you can enroll in this course.',
        });
      }
    }
  }

  const result = await db.prepare(`
    INSERT INTO student_courses (user_id, catalog_course_id, course_name, course_code, credit_hours, semester, semester_id, difficulty, target_grade, professor_name, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.user.id, catalog_course_id, course_name, course_code, credit_hours, semester, semester_id, difficulty, target_grade, professor_name, description);
  const studentCourseId = result.lastInsertRowid;
  const row = await db.prepare('SELECT * FROM student_courses WHERE id = ?').get(studentCourseId);
  return res.status(201).json(row);
});

studentRouter.patch('/courses/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const row = await db.prepare('SELECT id FROM student_courses WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!row) return res.status(404).json({ detail: 'Course not found' });
  const body = req.body || {};
  if (body.semester_id !== undefined) {
    const sid = body.semester_id == null ? null : parseInt(body.semester_id, 10);
    if (sid != null) {
      const sem = await db.prepare('SELECT id, is_ended FROM student_semesters WHERE id = ? AND user_id = ?').get(sid, req.user.id);
      if (!sem) return res.status(400).json({ detail: 'Semester not found' });
      if (Number(sem.is_ended) === 1) return res.status(400).json({ detail: 'Cannot assign course to an ended semester. Choose a semester that is not ended.' });
    }
    await db.prepare('UPDATE student_courses SET semester_id = ? WHERE id = ?').run(sid, id);
  }
  const updated = await db.prepare('SELECT * FROM student_courses WHERE id = ?').get(id);
  return res.json(updated);
});

studentRouter.post('/courses/:id/withdraw', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const row = await db.prepare('SELECT id, enrollment_id FROM student_courses WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!row) return res.status(404).json({ detail: 'Course not found' });
  if (row.enrollment_id) {
    return res.status(403).json({
      detail: 'Official enrollments can only be dropped during a registration window.',
    });
  }
  await db.prepare('UPDATE student_courses SET withdrawn = 1 WHERE id = ?').run(id);
  const updated = await db.prepare('SELECT * FROM student_courses WHERE id = ?').get(id);
  return res.json(updated);
});

studentRouter.delete('/courses/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const existing = await db.prepare('SELECT id, enrollment_id FROM student_courses WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!existing) return res.status(404).json({ detail: 'Course not found' });
  if (existing.enrollment_id) {
    return res.status(403).json({
      detail: 'Official enrollments can only be dropped during a registration window.',
    });
  }
  const result = await db.prepare('DELETE FROM student_courses WHERE id = ? AND user_id = ?').run(id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ detail: 'Course not found' });
  return res.status(204).send();
});

studentRouter.get('/courses/:id/course-work', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(404).json({ detail: 'Course not found' });
    if (await rejectIfWithdrawn(req, res)) return undefined;
    return res.json(await getStudentPublishedCourseWork(req.user, id));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

studentRouter.get('/courses/:id/attendance', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(404).json({ detail: 'Course not found' });
    return res.json(await getStudentCourseAttendance(req.user, id));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

studentRouter.post('/courses/:id/deprivation-cancel', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(404).json({ detail: 'Course not found' });
    if (await rejectIfWithdrawn(req, res)) return undefined;
    return res.status(201).json(await submitDeprivationCancel(req.user, id, req.body || {}));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

studentRouter.post('/courses/:id/appeals', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(404).json({ detail: 'Course not found' });
    if (await rejectIfWithdrawn(req, res)) return undefined;
    return res.status(201).json(await submitCourseWorkAppeal(req.user, id, req.body || {}));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

function sendServiceError(res, e) {
  const status = e.status || 500;
  if (status >= 500) console.error(e);
  return res.status(status).json({ detail: e.message || 'Request failed' });
}

studentRouter.get('/projects', async (req, res) => {
  try {
    return res.json(await getStudentProjects(req.user));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

studentRouter.post('/projects', async (req, res) => {
  try {
    return res.status(201).json(await submitStudentProjectRequest(req.user, req.body || {}));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

studentRouter.get('/surveys', async (req, res) => {
  try {
    return res.json(await getStudentSurveys(req.user));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

studentRouter.post('/surveys/:id/respond', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(404).json({ detail: 'Survey not found' });
    return res.status(201).json(await submitStudentSurvey(req.user, id, req.body || {}));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

studentRouter.get('/specialization', async (req, res) => {
  try {
    return res.json(await getStudentSpecialization(req.user));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

studentRouter.post('/specialization', async (req, res) => {
  try {
    return res.status(201).json(await submitStudentSpecialization(req.user, req.body || {}));
  } catch (e) {
    return sendServiceError(res, e);
  }
});
