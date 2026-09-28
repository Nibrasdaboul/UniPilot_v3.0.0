import { Router } from 'express';
import { db } from '../db.js';
import { authMiddleware, requireAcademicAdmin, requireCurriculumAdmin, requireStudent } from '../middleware/auth.js';
import { getStudentAcademicHistory } from '../services/studentGpaService.js';
import {
  getCurrentTerm,
  listCollegeUniCourses,
  listOfferingsForTerm,
  createOffering,
  updateOfferingCapacity,
  deleteOffering,
  createWindow,
  updateWindow,
  deleteWindow,
  listWithdrawalWindows,
  createWithdrawalWindow,
  updateWithdrawalWindow,
  deleteWithdrawalWindow,
  getWithdrawalState,
  getRegistrationOverview,
  enrollStudent,
  dropStudent,
  withdrawCourse,
  freezeTerm,
} from '../services/registrationService.js';
import { confirmRegistrationSections } from '../services/registrationSectionsService.js';
import { lockDeprivedCoursesForTerm } from '../services/attendanceSheetsService.js';
import { getStudentClassSessions, reportStaffAbsence } from '../services/studentClassSessionsService.js';

export const academicRouter = Router();
academicRouter.use(authMiddleware);

function orgUniversityId(user) {
  if (user?.org_university_id != null) return Number(user.org_university_id);
  return 1;
}

function termSelect() {
  return `id, university_id, name, starts_on, ends_on, is_current, is_closed, closed_at, opened_by, created_at`;
}

academicRouter.get('/terms', async (req, res) => {
  const uni = orgUniversityId(req.user);
  if (!uni) return res.json([]);
  const rows = await db.prepare(`
    SELECT ${termSelect()}
    FROM academic_terms
    WHERE university_id = ?
    ORDER BY starts_on DESC NULLS LAST, id DESC
  `).all(uni);
  return res.json(rows);
});

academicRouter.get('/terms/current', async (req, res) => {
  const uni = orgUniversityId(req.user);
  if (!uni) return res.json(null);
  const row = await db.prepare(`
    SELECT ${termSelect()}
    FROM academic_terms
    WHERE university_id = ? AND is_current = 1 AND COALESCE(is_closed, 0) = 0
    ORDER BY id DESC
    LIMIT 1
  `).get(uni);
  return res.json(row || null);
});

academicRouter.get('/terms/:id', async (req, res) => {
  const uni = orgUniversityId(req.user);
  const id = parseInt(req.params.id, 10);
  if (!uni) return res.status(400).json({ detail: 'User is not attached to a university' });
  const row = await db.prepare(`SELECT ${termSelect()} FROM academic_terms WHERE id = ? AND university_id = ?`).get(id, uni);
  if (!row) return res.status(404).json({ detail: 'Term not found' });
  return res.json(row);
});

academicRouter.get('/my-history', requireStudent, async (req, res) => {
  try {
    return res.json(await getStudentAcademicHistory(req.user));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

academicRouter.get('/terms/:id/my-summary', requireStudent, async (req, res) => {
  const uni = orgUniversityId(req.user);
  const id = parseInt(req.params.id, 10);
  if (!uni) return res.status(400).json({ detail: 'User is not attached to a university' });
  const term = await db.prepare(`SELECT ${termSelect()} FROM academic_terms WHERE id = ? AND university_id = ?`).get(id, uni);
  if (!term) return res.status(404).json({ detail: 'Term not found' });
  const history = await getStudentAcademicHistory(req.user);
  const match = (history.terms || []).find((row) => Number(row.academic_term_id) === id);
  return res.json({
    ...term,
    courses: match?.courses || [],
    hours_registered: match?.hours_registered ?? 0,
    hours_completed: match?.hours_completed ?? 0,
    hours_carried: match?.hours_carried ?? 0,
    semester_gpa: match?.semester_gpa ?? 0,
    semester_percent: match?.semester_percent ?? 0,
    semester_letter: match?.semester_letter ?? null,
    semester_rank: match?.semester_rank ?? null,
    cgpa: match?.cgpa ?? history.cgpa,
    cumulative_percent: match?.cumulative_percent ?? history.cumulative_percent,
    cumulative_letter: match?.cumulative_letter ?? history.cumulative_letter,
    cumulative_rank: match?.cumulative_rank ?? history.cumulative_rank,
  });
});

academicRouter.get('/windows', async (req, res) => {
  const uni = orgUniversityId(req.user);
  if (!uni) return res.json([]);
  const termId = req.query.term_id != null ? parseInt(req.query.term_id, 10) : null;
  let sql = `
    SELECT w.id, w.term_id, w.college_id, w.name, w.opens_at, w.closes_at,
           w.min_completed_credits, w.min_semester_gpa, w.max_credits, w.year_level
    FROM registration_windows w
    INNER JOIN academic_terms t ON t.id = w.term_id
    WHERE t.university_id = ?
  `;
  const params = [uni];
  if (termId) {
    sql += ' AND w.term_id = ?';
    params.push(termId);
  }
  sql += ' ORDER BY w.opens_at DESC';
  const rows = await db.prepare(sql).all(...params);
  return res.json(rows);
});

function sendServiceError(res, e) {
  const status = e.status || 500;
  if (status >= 500) console.error(e);
  const body = { detail: e.message || 'Request failed' };
  if (e.status && typeof e.code === 'string') body.code = e.code;
  return res.status(status).json(body);
}

academicRouter.post('/windows', requireAcademicAdmin, async (req, res) => {
  try {
    const row = await createWindow(req.user, req.body || {});
    return res.status(201).json(row);
  } catch (e) {
    return sendServiceError(res, e);
  }
});

academicRouter.patch('/windows/:id', requireAcademicAdmin, async (req, res) => {
  try {
    const row = await updateWindow(req.user, parseInt(req.params.id, 10), req.body || {});
    return res.json(row);
  } catch (e) {
    return sendServiceError(res, e);
  }
});

academicRouter.delete('/windows/:id', requireAcademicAdmin, async (req, res) => {
  try {
    await deleteWindow(req.user, parseInt(req.params.id, 10));
    return res.status(204).send();
  } catch (e) {
    return sendServiceError(res, e);
  }
});

academicRouter.get('/withdrawal-windows', async (req, res) => {
  try {
    const termId = req.query.term_id != null ? parseInt(req.query.term_id, 10) : null;
    return res.json(await listWithdrawalWindows(req.user, termId));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

academicRouter.get('/withdrawal-windows/current', async (req, res) => {
  try {
    return res.json(await getWithdrawalState(req.user));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

academicRouter.post('/withdrawal-windows', requireAcademicAdmin, async (req, res) => {
  try {
    return res.status(201).json(await createWithdrawalWindow(req.user, req.body || {}));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

academicRouter.patch('/withdrawal-windows/:id', requireAcademicAdmin, async (req, res) => {
  try {
    return res.json(await updateWithdrawalWindow(req.user, parseInt(req.params.id, 10), req.body || {}));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

academicRouter.delete('/withdrawal-windows/:id', requireAcademicAdmin, async (req, res) => {
  try {
    await deleteWithdrawalWindow(req.user, parseInt(req.params.id, 10));
    return res.status(204).send();
  } catch (e) {
    return sendServiceError(res, e);
  }
});

academicRouter.get('/uni-courses', requireCurriculumAdmin, async (req, res) => {
  const rows = await listCollegeUniCourses(req.user);
  return res.json(rows);
});

academicRouter.get('/offerings', async (req, res) => {
  const uni = orgUniversityId(req.user);
  if (!uni) return res.json([]);
  let termId = req.query.term_id != null ? parseInt(req.query.term_id, 10) : null;
  if (!termId) {
    const current = await getCurrentTerm(uni);
    termId = current?.id || null;
  }
  if (!termId) return res.json([]);
  const college = req.user.college_id != null ? Number(req.user.college_id) : null;
  const rows = await listOfferingsForTerm(termId, college);
  return res.json(rows);
});

academicRouter.post('/offerings', requireCurriculumAdmin, async (req, res) => {
  try {
    const row = await createOffering(req.user, req.body || {});
    return res.status(201).json(row);
  } catch (e) {
    return sendServiceError(res, e);
  }
});

academicRouter.patch('/offerings/:id', requireCurriculumAdmin, async (req, res) => {
  try {
    const row = await updateOfferingCapacity(req.user, parseInt(req.params.id, 10), req.body?.capacity);
    return res.json(row);
  } catch (e) {
    return sendServiceError(res, e);
  }
});

academicRouter.delete('/offerings/:id', requireCurriculumAdmin, async (req, res) => {
  try {
    await deleteOffering(req.user, parseInt(req.params.id, 10));
    return res.status(204).send();
  } catch (e) {
    return sendServiceError(res, e);
  }
});

academicRouter.get('/registration', requireStudent, async (req, res) => {
  try {
    const data = await getRegistrationOverview(req.user);
    return res.json(data);
  } catch (e) {
    return sendServiceError(res, e);
  }
});

academicRouter.post('/registration/enroll', requireStudent, async (req, res) => {
  try {
    const data = await enrollStudent(req.user, req.body?.offering_id);
    return res.status(201).json(data);
  } catch (e) {
    return sendServiceError(res, e);
  }
});

academicRouter.post('/registration/drop', requireStudent, async (req, res) => {
  try {
    const data = await dropStudent(req.user, req.body?.offering_id);
    return res.json(data);
  } catch (e) {
    return sendServiceError(res, e);
  }
});

academicRouter.post('/registration/withdraw', requireStudent, async (req, res) => {
  try {
    return res.json(await withdrawCourse(req.user, req.body || {}));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

academicRouter.post('/registration/freeze', requireStudent, async (req, res) => {
  try {
    return res.json(await freezeTerm(req.user, req.body || {}));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

academicRouter.post('/registration/sections', requireStudent, async (req, res) => {
  try {
    return res.json(await confirmRegistrationSections(req.user, req.body?.items || req.body || []));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

academicRouter.get('/student/class-sessions', requireStudent, async (req, res) => {
  try {
    return res.json(await getStudentClassSessions(req.user));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

academicRouter.post('/student/class-sessions/:id/report', requireStudent, async (req, res) => {
  try {
    return res.status(201).json(await reportStaffAbsence(req.user, req.params.id));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

academicRouter.post('/terms', requireAcademicAdmin, async (req, res) => {
  const uni = orgUniversityId(req.user);
  if (!uni) return res.status(400).json({ detail: 'User is not attached to a university' });
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ detail: 'Term name is required' });
  const starts_on = req.body?.starts_on || null;
  const ends_on = req.body?.ends_on || null;
  const setCurrent = req.body?.set_current !== false;
  if (setCurrent) {
    await db.prepare('UPDATE academic_terms SET is_current = 0 WHERE university_id = ?').run(uni);
  }
  const r = await db.prepare(`
    INSERT INTO academic_terms (university_id, name, starts_on, ends_on, is_current, is_closed, opened_by)
    VALUES (?, ?, ?, ?, ?, 0, ?)
  `).run(uni, name, starts_on, ends_on, setCurrent ? 1 : 0, req.user.id);
  const row = await db.prepare(`SELECT ${termSelect()} FROM academic_terms WHERE id = ?`).get(r.lastInsertRowid);
  return res.status(201).json(row);
});

academicRouter.patch('/terms/:id/open', requireAcademicAdmin, async (req, res) => {
  const uni = orgUniversityId(req.user);
  const id = parseInt(req.params.id, 10);
  const existing = await db.prepare('SELECT id FROM academic_terms WHERE id = ? AND university_id = ?').get(id, uni);
  if (!existing) return res.status(404).json({ detail: 'Term not found' });
  await db.prepare('UPDATE academic_terms SET is_current = 0 WHERE university_id = ?').run(uni);
  await db.prepare(`
    UPDATE academic_terms SET is_current = 1, is_closed = 0, closed_at = NULL, opened_by = ?
    WHERE id = ?
  `).run(req.user.id, id);
  const row = await db.prepare(`SELECT ${termSelect()} FROM academic_terms WHERE id = ?`).get(id);
  return res.json(row);
});

academicRouter.patch('/terms/:id/close', requireAcademicAdmin, async (req, res) => {
  const uni = orgUniversityId(req.user);
  const id = parseInt(req.params.id, 10);
  const existing = await db.prepare('SELECT id FROM academic_terms WHERE id = ? AND university_id = ?').get(id, uni);
  if (!existing) return res.status(404).json({ detail: 'Term not found' });
  await db.prepare(`
    UPDATE academic_terms SET is_current = 0, is_closed = 1, closed_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(id);
  const locked = await lockDeprivedCoursesForTerm(id);
  const row = await db.prepare(`SELECT ${termSelect()} FROM academic_terms WHERE id = ?`).get(id);
  return res.json({ ...row, deprived_locked: locked.locked });
});
