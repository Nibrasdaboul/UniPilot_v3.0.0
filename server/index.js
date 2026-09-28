import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { initDb } from './db.js';
import { authRouter } from './routes/auth.js';
import { catalogRouter } from './routes/catalog.js';
import { studentRouter } from './routes/student.js';
import { semestersRouter } from './routes/semesters.js';
import { adminRouter } from './routes/admin.js';
import { plannerRouter } from './routes/planner.js';
import { aiRouter } from './routes/ai.js';
import { studyRouter } from './routes/study.js';
import { voiceRouter } from './routes/voice.js';
import { ttsRouter } from './routes/tts.js';
import { thesesRouter } from './routes/theses.js';
import { diagramsRouter } from './routes/diagrams.js';
import { notificationsRouter } from './routes/notifications.js';
import { gamificationRouter } from './routes/gamification.js';
import { billingRouter, handleStripeWebhook } from './routes/billing.js';
import { usersRouter } from './routes/users.js';
import { academicRouter } from './routes/academic.js';
import { officialGradesRouter } from './routes/officialGrades.js';
import { examsRouter } from './routes/exams.js';
import { examsCourseMarksRouter } from './routes/examsCourseMarks.js';
import { teachingStaffRouter } from './routes/teachingStaff.js';
import { studentAffairsRouter } from './routes/studentAffairs.js';
import { deanRouter } from './routes/dean.js';
import { academicViceDeanRouter } from './routes/academicViceDean.js';
import { listApprovedLectureFilesForCatalog } from './services/courseLectureFilesService.js';
import { uploadsRoot } from './college/avatar.js';
import { nextUniversityId } from './college/universityId.js';
import { ROLES } from './college/roles.js';
import { syncCollegeCurriculum } from './college/catalogSync.js';
import { ensureCollegeDepartments } from './college/departments.js';
import { isOfficialWithdrawal } from './college/withdrawalMarks.js';
import { authMiddleware, requireStudent } from './middleware/auth.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { requireAiQuota } from './middleware/requireAiQuota.js';
import * as subscriptionService from './services/subscriptionService.js';
import { captureException as sentryCapture } from './lib/sentry.js';
import { db } from './db.js';
import * as groq from './ai/groq.js';
import {
  computeFinalMarkFromItems,
  computeRequiredFinalGrade,
  getGradeStatus,
} from './lib/gradeUtils.js';
import { applyScaleToCourses } from './services/gpaScaleService.js';
import { getStudentGpaSnapshot, syncStudentAcademicRecordByUserId } from './services/studentGpaService.js';
import bcrypt from 'bcryptjs';
import {
  RECOMMENDATIONS,
  ENCOURAGEMENT,
  upsertAppNoteForCourse,
  upsertGeneralAppNote,
} from './services/appNotesService.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let compressionMiddleware = (req, res, next) => next();
try {
  const comp = await import('compression');
  compressionMiddleware = comp.default({
    filter: (req, res) => {
      if (String(req.originalUrl || req.url).includes('/chat/stream')) return false;
      return comp.default.filter(req, res);
    },
  });
} catch (_) {}

await initDb();

async function seedCollegeBootstrap() {
  const year = new Date().getFullYear();
  const passwordHash = bcrypt.hashSync('College123!', 10);

  async function assignLogin(role, fullNameHint) {
    const row = await db.prepare(
      'SELECT id, person_code, full_name FROM users WHERE role = ? ORDER BY id ASC LIMIT 1'
    ).get(role);
    if (!row) return null;
    if (row.person_code && /^\d{10}$/.test(row.person_code)) return row.person_code;
    const code = await nextUniversityId(year);
    await db.prepare('UPDATE users SET person_code = ?, password_hash = ? WHERE id = ?').run(code, passwordHash, row.id);
    console.log(`Bootstrap ${role} (${row.full_name || fullNameHint}):`, code, '/ College123!');
    return code;
  }

  await assignLogin(ROLES.DEAN, 'Dean');
  await assignLogin(ROLES.STUDENT_AFFAIRS, 'Student Affairs');

  const demoStudentCode = '0260000003';
  const existingDemoStudent = await db.prepare('SELECT id FROM users WHERE person_code = ?').get(demoStudentCode);
  if (!existingDemoStudent) {
    const student = await db.prepare(`
      SELECT id, full_name FROM users
      WHERE role = ? AND college_id IS NOT NULL AND (person_code IS NULL OR person_code = '')
      ORDER BY id ASC LIMIT 1
    `).get(ROLES.STUDENT);
    if (student) {
      await db.prepare('UPDATE users SET person_code = ?, password_hash = ? WHERE id = ?')
        .run(demoStudentCode, passwordHash, student.id);
      console.log(`Bootstrap student (${student.full_name}):`, demoStudentCode, '/ College123!');
    }
  }

  const examsRow = await db.prepare(`
    SELECT id, person_code, role, full_name FROM users
    WHERE role IN ('exams_office', 'exams_officer')
    ORDER BY id ASC LIMIT 1
  `).get();
  if (examsRow) {
    if (examsRow.role !== ROLES.EXAMS_OFFICE) {
      await db.prepare('UPDATE users SET role = ? WHERE id = ?').run(ROLES.EXAMS_OFFICE, examsRow.id);
    }
    if (!examsRow.person_code || !/^\d{10}$/.test(examsRow.person_code)) {
      const preferred = '0260000004';
      const taken = await db.prepare('SELECT id FROM users WHERE person_code = ?').get(preferred);
      const code = taken && Number(taken.id) !== Number(examsRow.id) ? await nextUniversityId(year) : preferred;
      await db.prepare('UPDATE users SET person_code = ?, password_hash = ? WHERE id = ?')
        .run(code, passwordHash, examsRow.id);
      console.log(`Bootstrap exams_office (${examsRow.full_name}):`, code, '/ College123!');
    }
  }

  const hallCount = await db.prepare('SELECT COUNT(*)::int AS n FROM exam_halls WHERE university_id = 1').get();
  if (!Number(hallCount?.n || 0)) {
    await db.prepare('INSERT INTO exam_halls (university_id, name, capacity, building) VALUES (1, ?, 80, ?)').run('قاعة 1', 'A');
    await db.prepare('INSERT INTO exam_halls (university_id, name, capacity, building) VALUES (1, ?, 40, ?)').run('قاعة 2', 'B');
    console.log('Bootstrap exam halls: قاعة 1 (80), قاعة 2 (40)');
  }

  async function assignPreferred(role, preferred, hint) {
    const row = await db.prepare(
      'SELECT id, person_code, full_name FROM users WHERE role = ? AND college_id = 1 ORDER BY id ASC LIMIT 1'
    ).get(role);
    if (!row) return;
    if (row.person_code && /^\d{10}$/.test(row.person_code)) return;
    const taken = await db.prepare('SELECT id FROM users WHERE person_code = ?').get(preferred);
    const code = taken && Number(taken.id) !== Number(row.id) ? await nextUniversityId(year) : preferred;
    await db.prepare('UPDATE users SET person_code = ?, password_hash = ? WHERE id = ?').run(code, passwordHash, row.id);
    console.log(`Bootstrap ${hint} (${row.full_name}):`, code, '/ College123!');
  }
  await assignPreferred('doctor', '0260000005', 'instructor');
  await assignPreferred('engineer', '0260000006', 'teaching_assistant');
  await assignPreferred('vice_dean_students', '0260000007', 'vice_dean_students');

  const activityCount = await db.prepare('SELECT COUNT(*)::int AS n FROM student_activities WHERE college_id = 1').get();
  if (!Number(activityCount?.n || 0)) {
    const start = new Date(Date.now() + 7 * 86400_000);
    start.setHours(10, 0, 0, 0);
    const end = new Date(start.getTime() + 2 * 3600_000);
    await db.prepare(`
      INSERT INTO student_activities (college_id, title, description, location, starts_at, ends_at, capacity)
      VALUES (1, ?, ?, ?, ?, ?, 80)
    `).run('يوم تعريف الكلية', 'نشاط تجريبي من شؤون الطلاب', 'قاعة 1', start.toISOString(), end.toISOString());
    console.log('Bootstrap student activity: يوم تعريف الكلية');
  }

  const depts = await ensureCollegeDepartments(1);
  console.log(`Bootstrap departments: ${depts.map((d) => d.code).join(', ')}`);
  const synced = await syncCollegeCurriculum(1);
  console.log(`Bootstrap curriculum sync: ${synced.length} official catalog courses`);
}
await seedCollegeBootstrap();

// Recalculate final mark for a student_course from grade_items and update student_courses.current_grade
async function recalcCourseGrade(studentCourseId) {
  const items = await db.prepare('SELECT score, max_score, weight FROM grade_items WHERE student_course_id = ?').all(studentCourseId);
  const finalMark = computeFinalMarkFromItems(items);
  await db.prepare('UPDATE student_courses SET current_grade = ? WHERE id = ?').run(finalMark ?? null, studentCourseId);
  return finalMark;
}

// When total weight >= 100%, finalize course: add credits to completed (pass) or carried (fail)
async function maybeFinalizeCourse(studentCourseId, userId) {
  const uid = Number(userId);
  const course = await db.prepare('SELECT id, user_id, credit_hours, current_grade, finalized_at FROM student_courses WHERE id = ?').get(studentCourseId);
  if (!course || Number(course.user_id) !== uid) return;
  if (course.finalized_at != null) return; // already finalized
  const items = await db.prepare('SELECT weight FROM grade_items WHERE student_course_id = ?').all(studentCourseId);
  const totalWeight = items.reduce((s, i) => s + (Number(i.weight) || 0), 0);
  const finalMark = course.current_grade;
  if (totalWeight < 99.5 || finalMark == null) return; // allow 99.5 for float rounding
  await applyFinalize(studentCourseId, uid, course, finalMark);
}

// Apply finalize: set finalized_at, passed, and update academic record (used by manual finalize and maybeFinalizeCourse)
async function applyFinalize(studentCourseId, uid, course, finalMark) {
  const passed = (Number(finalMark) ?? 0) >= 50 ? 1 : 0;
  await db.prepare('UPDATE student_courses SET finalized_at = CURRENT_TIMESTAMP, passed = ? WHERE id = ?').run(passed, studentCourseId);
  await syncStudentAcademicRecordByUserId(uid);
}

// Manual finalize: student clicks "انتهى" — recalc grade then finalize (no weight requirement)
async function finalizeCourseManually(courseId, userId) {
  const uid = Number(userId);
  const course = await db.prepare('SELECT id, user_id, credit_hours, current_grade, finalized_at FROM student_courses WHERE id = ?').get(courseId);
  if (!course || Number(course.user_id) !== uid) return { ok: false, code: 404 };
  if (course.finalized_at != null) return { ok: true, already: true };
  await recalcCourseGrade(courseId);
  const updated = await db.prepare('SELECT current_grade FROM student_courses WHERE id = ?').get(courseId);
  const finalMark = updated?.current_grade != null ? Number(updated.current_grade) : null;
  if (finalMark == null) return { ok: false, code: 400, message: 'Enter at least one grade before marking course as finished.' };
  await applyFinalize(courseId, uid, { ...course, credit_hours: course.credit_hours }, finalMark);
  return { ok: true };
}

const app = express();
const PORT = process.env.PORT || 3001;

// Security headers (ISO/OWASP). Disable CSP in dev for Vite HMR.
app.use(helmet({ contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false }));

// Global rate limit: 2400 requests per 15 min per IP (allow multiple users / classroom use; was 900)
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 2400,
  standardHeaders: true,
  legacyHeaders: false,
  message: { detail: 'Too many requests. Try again later.' },
}));

// Stricter rate limit for auth (brute-force protection): 50 attempts per 15 min per IP (was 10; increased to avoid blocking normal use)
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { detail: 'Too many login attempts. Try again later.' },
});

// CORS: in production restrict to FRONTEND_ORIGIN if set; otherwise allow same-origin
const corsOrigin = process.env.NODE_ENV === 'production' && process.env.FRONTEND_ORIGIN
  ? process.env.FRONTEND_ORIGIN.split(',').map(s => s.trim()).filter(Boolean)
  : true;
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(compressionMiddleware);
app.use(requestIdMiddleware);
// Stripe webhook must receive raw body (mount before express.json)
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), handleStripeWebhook);
// Allow large payloads for TTS file upload and voice audio (base64 PDF/DOCX/PPTX and audio)
app.use(express.json({ limit: '30mb' }));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.get('/api/ready', async (req, res) => {
  try {
    await db.query('SELECT 1');
    return res.json({ status: 'ready', database: 'connected' });
  } catch (e) {
    res.status(503).json({ status: 'not ready', database: 'disconnected', error: process.env.NODE_ENV === 'production' ? undefined : e.message });
  }
});

app.use(['/api/auth/login', '/api/auth/register'], authRateLimiter);
app.use('/api/auth', authRouter);
app.use('/api/catalog', catalogRouter);
app.use('/api/student/semesters', semestersRouter);
app.use('/api/student', studentRouter);
app.use('/api/admin', adminRouter);
app.use('/api/planner', plannerRouter);
app.use('/api/ai', aiRouter);
app.use('/api/study', studyRouter);
app.use('/api/voice', voiceRouter);
app.use('/api/tts', ttsRouter);
app.use('/api/theses', thesesRouter);
app.use('/api/diagrams', diagramsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/gamification', gamificationRouter);
app.use('/api/billing', billingRouter);
app.use('/api/users', usersRouter);
app.use('/api/academic', academicRouter);
app.use('/api/academic', officialGradesRouter);
app.use('/api/academic', examsRouter);
app.use('/api/academic', teachingStaffRouter);
app.use('/api/exams', examsCourseMarksRouter);
app.use('/api/affairs', studentAffairsRouter);
app.use('/api/dean', deanRouter);
app.use('/api/vda', academicViceDeanRouter);

app.get('/api/dashboard/summary', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const coursesList = await db.prepare(`
    SELECT id, course_name, course_code, current_grade, credit_hours, finalized_at, passed, semester_id, withdrawn FROM student_courses WHERE user_id = ?
  `).all(userId);
  const snap = await getStudentGpaSnapshot(req.user);
  const creditsCompleted = snap.credits_completed;
  const creditsCarried = snap.credits_carried;
  const semesterGpa = snap.semester_gpa;
  const semesterPercent = snap.semester_percent;
  const creditsCurrent = snap.credits_current;
  const cgpa = snap.cgpa;
  const cumulativePercent = snap.cumulative_percent;
  const avgProgress = coursesList.length ? coursesList.reduce((s, c) => s + (c.current_grade || 0), 0) / coursesList.length : 0;
  const finalizedPassed = coursesList.filter((c) => c.finalized_at != null && c.passed === 1 && c.withdrawn != 1);
  const finalizedFailed = coursesList.filter((c) => c.finalized_at != null && c.passed === 0 && c.withdrawn != 1);
  const completed_courses = await applyScaleToCourses(req.user, finalizedPassed);
  const carried_courses = await applyScaleToCourses(req.user, finalizedFailed);
  return res.json({
    pending_tasks: 0,
    today_sessions: 0,
    courses_count: coursesList.length,
    avg_progress: avgProgress,
    upcoming_tasks: [],
    semester_gpa: semesterGpa,
    cgpa,
    semester_percent: semesterPercent,
    cumulative_percent: cumulativePercent,
    credits_completed: creditsCompleted,
    credits_carried: creditsCarried,
    credits_current: creditsCurrent,
    completed_courses,
    carried_courses,
    courses: coursesList.map((c) => ({
      id: c.id,
      course_name: c.course_name,
      course_code: c.course_code,
      current_grade: c.current_grade,
      credit_hours: c.credit_hours,
      progress: c.current_grade || 0,
      grade_status: getGradeStatus(c.current_grade),
      finalized_at: c.finalized_at,
      passed: c.passed,
    })),
  });
});

app.get('/api/dashboard/chart-data', authMiddleware, async (req, res) => {
  const snap = await getStudentGpaSnapshot(req.user);
  return res.json((snap.terms || []).map((term) => ({
    semester_id: term.key,
    semester_name: term.name || 'Semester',
    gpa: term.semester_gpa || 0,
    credits: term.hours_completed || 0,
  })));
});

app.get('/api/courses/:courseId', authMiddleware, async (req, res) => {
  const id = parseInt(req.params.courseId, 10);
  const row = await db.prepare('SELECT * FROM student_courses WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!row) return res.status(404).json({ detail: 'Not found' });
  return res.json(row);
});

app.get('/api/courses/:courseId/resources', authMiddleware, async (req, res) => {
  const courseId = parseInt(req.params.courseId, 10);
  const row = await db.prepare('SELECT id, catalog_course_id FROM student_courses WHERE id = ? AND user_id = ?').get(courseId, req.user.id);
  if (!row) return res.status(404).json({ detail: 'Not found' });
  const catalogId = row.catalog_course_id;
  if (!catalogId) return res.json([]);
  const rows = await db.prepare('SELECT id, catalog_course_id, title, url, created_at FROM catalog_resources WHERE catalog_course_id = ? ORDER BY id').all(catalogId);
  const lectures = await listApprovedLectureFilesForCatalog(catalogId);
  return res.json([...(rows || []), ...lectures]);
});

app.post('/api/courses/:courseId/finalize', authMiddleware, async (req, res) => {
  if (req.user.role === 'student') {
    return res.status(403).json({ detail: 'Official grades are entered by the Exams Office.' });
  }
  const courseId = parseInt(req.params.courseId, 10);
  const result = await finalizeCourseManually(courseId, req.user.id);
  if (result.code === 404) return res.status(404).json({ detail: 'Not found' });
  if (result.code === 400) return res.status(400).json({ detail: result.message || 'Add at least one grade before marking as finished.' });
  return res.json({ finalized: true, already: result.already || false });
});

// Modules (units) CRUD — verify course belongs to user
async function ensureCourseOwnership(courseId, userId) {
  const row = await db.prepare('SELECT id FROM student_courses WHERE id = ? AND user_id = ?').get(courseId, userId);
  if (!row) return null;
  return row;
}
app.get('/api/courses/:courseId/modules', authMiddleware, async (req, res) => {
  const courseId = parseInt(req.params.courseId, 10);
  if (!(await ensureCourseOwnership(courseId, req.user.id))) return res.status(404).json({ detail: 'Not found' });
  const list = await db.prepare('SELECT id, student_course_id, title, description, sort_order, created_at FROM course_modules WHERE student_course_id = ? ORDER BY sort_order ASC, id ASC').all(courseId);
  const withItems = await Promise.all(list.map(async (m) => {
    const items = await db.prepare('SELECT id, course_module_id, type, title, url_or_content, sort_order, created_at FROM course_module_items WHERE course_module_id = ? ORDER BY sort_order ASC, id ASC').all(m.id);
    return { ...m, items };
  }));
  return res.json(withItems);
});
app.post('/api/courses/:courseId/modules', authMiddleware, async (req, res) => {
  const courseId = parseInt(req.params.courseId, 10);
  if (!(await ensureCourseOwnership(courseId, req.user.id))) return res.status(404).json({ detail: 'Not found' });
  const b = req.body || {};
  const title = (b.title || '').trim() || (req.body?.title ? String(req.body.title) : 'Unit');
  const description = b.description != null ? String(b.description) : null;
  const maxOrder = await db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS mx FROM course_modules WHERE student_course_id = ?').get(courseId);
  const sortOrder = (maxOrder?.mx ?? 0) + 1;
  const r = await db.prepare('INSERT INTO course_modules (student_course_id, title, description, sort_order) VALUES (?, ?, ?, ?)').run(courseId, title, description, sortOrder);
  const id = r.lastInsertRowid;
  const row = await db.prepare('SELECT id, student_course_id, title, description, sort_order, created_at FROM course_modules WHERE id = ?').get(id);
  const items = await db.prepare('SELECT id, course_module_id, type, title, url_or_content, sort_order, created_at FROM course_module_items WHERE course_module_id = ? ORDER BY sort_order ASC, id ASC').all(id);
  return res.status(201).json({ ...row, items: items || [] });
});
app.patch('/api/courses/:courseId/modules/:moduleId', authMiddleware, async (req, res) => {
  const courseId = parseInt(req.params.courseId, 10);
  const moduleId = parseInt(req.params.moduleId, 10);
  if (!(await ensureCourseOwnership(courseId, req.user.id))) return res.status(404).json({ detail: 'Not found' });
  const mod = await db.prepare(`
    SELECT cm.id, cm.student_course_id
    FROM course_modules cm
    JOIN student_courses sc ON sc.id = cm.student_course_id
    WHERE cm.id = ? AND sc.user_id = ?
  `).get(moduleId, req.user.id);
  if (!mod) return res.status(404).json({ detail: 'Module not found' });
  const b = req.body || {};
  if (b.title != null) await db.prepare('UPDATE course_modules SET title = ? WHERE id = ?').run((b.title || '').trim() || 'Unit', moduleId);
  if (b.description !== undefined) await db.prepare('UPDATE course_modules SET description = ? WHERE id = ?').run(b.description == null ? null : String(b.description), moduleId);
  const row = await db.prepare('SELECT id, student_course_id, title, description, sort_order, created_at FROM course_modules WHERE id = ?').get(moduleId);
  const items = await db.prepare('SELECT id, course_module_id, type, title, url_or_content, sort_order, created_at FROM course_module_items WHERE course_module_id = ? ORDER BY sort_order ASC, id ASC').all(moduleId);
  return res.json({ ...row, items: items || [] });
});
app.delete('/api/courses/:courseId/modules/:moduleId', authMiddleware, async (req, res) => {
  const courseId = parseInt(req.params.courseId, 10);
  const moduleId = parseInt(req.params.moduleId, 10);
  if (!(await ensureCourseOwnership(courseId, req.user.id))) return res.status(404).json({ detail: 'Not found' });
  const mod = await db.prepare(`
    SELECT cm.id, cm.student_course_id
    FROM course_modules cm
    JOIN student_courses sc ON sc.id = cm.student_course_id
    WHERE cm.id = ? AND sc.user_id = ?
  `).get(moduleId, req.user.id);
  if (!mod) return res.status(404).json({ detail: 'Module not found' });
  await db.prepare('DELETE FROM course_module_items WHERE course_module_id = ?').run(moduleId);
  await db.prepare('DELETE FROM course_modules WHERE id = ?').run(moduleId);
  return res.status(204).send();
});
// Module items (folders / files) CRUD
app.get('/api/courses/:courseId/modules/:moduleId/items', authMiddleware, async (req, res) => {
  const courseId = parseInt(req.params.courseId, 10);
  const moduleId = parseInt(req.params.moduleId, 10);
  if (!(await ensureCourseOwnership(courseId, req.user.id))) return res.status(404).json({ detail: 'Not found' });
  const mod = await db.prepare('SELECT id FROM course_modules WHERE id = ? AND student_course_id = ?').get(moduleId, courseId);
  if (!mod) return res.status(404).json({ detail: 'Module not found' });
  const items = await db.prepare('SELECT id, course_module_id, type, title, url_or_content, sort_order, created_at FROM course_module_items WHERE course_module_id = ? ORDER BY sort_order ASC, id ASC').all(moduleId);
  return res.json(items);
});
app.post('/api/courses/:courseId/modules/:moduleId/items', authMiddleware, async (req, res) => {
  const courseId = parseInt(req.params.courseId, 10);
  const moduleId = parseInt(req.params.moduleId, 10);
  if (!(await ensureCourseOwnership(courseId, req.user.id))) return res.status(404).json({ detail: 'Not found' });
  const mod = await db.prepare('SELECT id FROM course_modules WHERE id = ? AND student_course_id = ?').get(moduleId, courseId);
  if (!mod) return res.status(404).json({ detail: 'Module not found' });
  const b = req.body || {};
  const type = (b.type === 'folder' || b.type === 'file') ? b.type : 'file';
  const title = (b.title || '').trim() || (type === 'folder' ? 'Folder' : 'File');
  const urlOrContent = b.url_or_content != null ? String(b.url_or_content) : null;
  const maxOrder = await db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS mx FROM course_module_items WHERE course_module_id = ?').get(moduleId);
  const sortOrder = (maxOrder?.mx ?? 0) + 1;
  const r = await db.prepare('INSERT INTO course_module_items (course_module_id, type, title, url_or_content, sort_order) VALUES (?, ?, ?, ?, ?)').run(moduleId, type, title, urlOrContent, sortOrder);
  const id = r.lastInsertRowid;
  const row = await db.prepare('SELECT id, course_module_id, type, title, url_or_content, sort_order, created_at FROM course_module_items WHERE id = ?').get(id);
  return res.status(201).json(row);
});
app.patch('/api/courses/:courseId/modules/:moduleId/items/:itemId', authMiddleware, async (req, res) => {
  const courseId = parseInt(req.params.courseId, 10);
  const moduleId = parseInt(req.params.moduleId, 10);
  const itemId = parseInt(req.params.itemId, 10);
  if (!(await ensureCourseOwnership(courseId, req.user.id))) return res.status(404).json({ detail: 'Not found' });
  const mod = await db.prepare('SELECT id FROM course_modules WHERE id = ? AND student_course_id = ?').get(moduleId, courseId);
  if (!mod) return res.status(404).json({ detail: 'Module not found' });
  const item = await db.prepare('SELECT id FROM course_module_items WHERE id = ? AND course_module_id = ?').get(itemId, moduleId);
  if (!item) return res.status(404).json({ detail: 'Item not found' });
  const b = req.body || {};
  if (b.type != null && (b.type === 'folder' || b.type === 'file')) await db.prepare('UPDATE course_module_items SET type = ? WHERE id = ?').run(b.type, itemId);
  if (b.title != null) await db.prepare('UPDATE course_module_items SET title = ? WHERE id = ?').run((b.title || '').trim(), itemId);
  if (b.url_or_content !== undefined) await db.prepare('UPDATE course_module_items SET url_or_content = ? WHERE id = ?').run(b.url_or_content == null ? null : String(b.url_or_content), itemId);
  const row = await db.prepare('SELECT id, course_module_id, type, title, url_or_content, sort_order, created_at FROM course_module_items WHERE id = ?').get(itemId);
  return res.json(row);
});
app.delete('/api/courses/:courseId/modules/:moduleId/items/:itemId', authMiddleware, async (req, res) => {
  const courseId = parseInt(req.params.courseId, 10);
  const moduleId = parseInt(req.params.moduleId, 10);
  const itemId = parseInt(req.params.itemId, 10);
  if (!(await ensureCourseOwnership(courseId, req.user.id))) return res.status(404).json({ detail: 'Not found' });
  const mod = await db.prepare('SELECT id FROM course_modules WHERE id = ? AND student_course_id = ?').get(moduleId, courseId);
  if (!mod) return res.status(404).json({ detail: 'Module not found' });
  const item = await db.prepare('SELECT id FROM course_module_items WHERE id = ? AND course_module_id = ?').get(itemId, moduleId);
  if (!item) return res.status(404).json({ detail: 'Item not found' });
  await db.prepare('DELETE FROM course_module_items WHERE id = ?').run(itemId);
  return res.status(204).send();
});

// Grades CRUD (simple, no enforced catalog scheme)
app.get('/api/courses/:courseId/grades', authMiddleware, async (req, res) => {
  const courseId = parseInt(req.params.courseId, 10);
  const row = await db.prepare('SELECT id, withdrawn, withdrawn_at FROM student_courses WHERE id = ? AND user_id = ?').get(courseId, req.user.id);
  if (!row) return res.status(404).json({ detail: 'Not found' });
  if (isOfficialWithdrawal(row)) return res.json([]);
  const items = await db.prepare('SELECT id, item_type, title, score, max_score, weight, created_at FROM grade_items WHERE student_course_id = ? ORDER BY created_at').all(courseId);
  return res.json(items);
});
app.get('/api/courses/:courseId/required-final', authMiddleware, async (req, res) => {
  const courseId = parseInt(req.params.courseId, 10);
  const target = parseFloat(req.query.target);
  const row = await db.prepare('SELECT id FROM student_courses WHERE id = ? AND user_id = ?').get(courseId, req.user.id);
  if (!row) return res.status(404).json({ detail: 'Not found' });
  const items = await db.prepare('SELECT id, item_type, title, score, max_score, weight FROM grade_items WHERE student_course_id = ? ORDER BY created_at').all(courseId);
  if (Number.isFinite(target) && target >= 0 && target <= 100 && items.length > 0) {
    const result = computeRequiredFinalGrade(items, target);
    if (result) return res.json(result);
  }
  return res.json({ requiredFinalPercent: null, possible: false, message: 'Add grade items and set a target (0–100).' });
});
app.post('/api/courses/:courseId/grades', authMiddleware, async (req, res) => {
  if (req.user.role === 'student') {
    return res.status(403).json({ detail: 'Official grades are entered by the Exams Office.' });
  }
  const courseId = parseInt(req.params.courseId, 10);
  const row = await db.prepare('SELECT id, user_id, course_name FROM student_courses WHERE id = ? AND user_id = ?').get(courseId, req.user.id);
  if (!row) return res.status(404).json({ detail: 'Not found' });
  const b = req.body || {};
  const itemType = b.item_type || 'quiz';
  const title = b.title || 'Grade';
  const score = Number(b.score) ?? 0;
  const maxScore = Number(b.max_score) ?? 100;
  const weight = Number(b.weight) ?? 0;
  if (score < 0 || score > maxScore) {
    return res.status(400).json({ detail: 'Score cannot exceed max score' });
  }
  const r = await db.prepare('INSERT INTO grade_items (student_course_id, item_type, title, score, max_score, weight) VALUES (?, ?, ?, ?, ?, ?)').run(courseId, itemType, title, score, maxScore, weight);
  const id = r.lastInsertRowid;
  const finalMark = await recalcCourseGrade(courseId);
  await upsertAppNoteForCourse(req.user.id, courseId, row.course_name, finalMark);
  await maybeFinalizeCourse(courseId, req.user.id);
  const item = await db.prepare('SELECT id, item_type, title, score, max_score, weight, from_scheme, created_at FROM grade_items WHERE id = ?').get(id);
  return res.status(201).json(item);
});
app.patch('/api/grades/:id', authMiddleware, async (req, res) => {
  if (req.user.role === 'student') {
    return res.status(403).json({ detail: 'Official grades are entered by the Exams Office.' });
  }
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id) || id < 1) return res.status(400).json({ detail: 'Invalid grade id' });
  const item = await db.prepare('SELECT gi.id, gi.student_course_id, gi.max_score, sc.user_id, sc.course_name FROM grade_items gi JOIN student_courses sc ON sc.id = gi.student_course_id WHERE gi.id = ?').get(id);
  if (!item) return res.status(404).json({ detail: 'Grade not found' });
  const userId = Number(req.user.id);
  const ownerId = Number(item.user_id);
  if (userId !== ownerId) return res.status(404).json({ detail: 'Not found' });
  const b = req.body || {};
  if (b.item_type != null) await db.prepare('UPDATE grade_items SET item_type = ? WHERE id = ?').run(b.item_type, id);
  if (b.title != null) await db.prepare('UPDATE grade_items SET title = ? WHERE id = ?').run(b.title, id);
  if (b.weight != null) await db.prepare('UPDATE grade_items SET weight = ? WHERE id = ?').run(Number(b.weight), id);
  if (b.max_score != null) await db.prepare('UPDATE grade_items SET max_score = ? WHERE id = ?').run(Number(b.max_score), id);
  if (b.score != null) {
    const maxScore = b.max_score != null ? Number(b.max_score) : Number(item.max_score);
    const newScore = Number(b.score);
    if (newScore < 0 || newScore > maxScore) {
      return res.status(400).json({ detail: 'Score cannot exceed max score' });
    }
    await db.prepare('UPDATE grade_items SET score = ? WHERE id = ?').run(newScore, id);
  }
  const finalMark = await recalcCourseGrade(item.student_course_id);
  await upsertAppNoteForCourse(req.user.id, item.student_course_id, item.course_name, finalMark);
  await maybeFinalizeCourse(item.student_course_id, req.user.id);
  const updated = await db.prepare('SELECT id, item_type, title, score, max_score, weight, from_scheme, created_at FROM grade_items WHERE id = ?').get(id);
  return res.json(updated);
});
app.delete('/api/grades/:id', authMiddleware, async (req, res) => {
  if (req.user.role === 'student') {
    return res.status(403).json({ detail: 'Official grades are entered by the Exams Office.' });
  }
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id) || id < 1) return res.status(400).json({ detail: 'Invalid grade id' });
  const item = await db.prepare('SELECT gi.id, gi.student_course_id, sc.user_id, sc.course_name FROM grade_items gi JOIN student_courses sc ON sc.id = gi.student_course_id WHERE gi.id = ?').get(id);
  if (!item) return res.status(404).json({ detail: 'Grade not found' });
  const userId = Number(req.user.id);
  const ownerId = Number(item.user_id);
  if (userId !== ownerId) return res.status(404).json({ detail: 'Not found' });
  await db.prepare('DELETE FROM grade_items WHERE id = ?').run(id);
  const finalMark = await recalcCourseGrade(item.student_course_id);
  await upsertAppNoteForCourse(req.user.id, item.student_course_id, item.course_name, finalMark);
  await maybeFinalizeCourse(item.student_course_id, req.user.id);
  return res.status(204).send();
});

// Notes — AI improve student note content
app.post('/api/notes/improve', authMiddleware, requireStudent, requireAiQuota, async (req, res) => {
  try {
    if (!groq.isConfigured()) return res.status(503).json({ detail: 'AI not configured' });
    const content = (req.body && req.body.content) || '';
    const lang = req.body && req.body.lang === 'en' ? 'en' : 'ar';
    const improved = await groq.improveNote(content, lang);
    await subscriptionService.incrementAiUsage(req.user.id, 'note_improve', 400);
    await subscriptionService.logAiRequest(req.user.id, 'note_improve', 'groq', 400);
    return res.json({ improved });
  } catch (e) {
    console.error('Notes improve error:', e);
    return res.status(500).json({ detail: e.message || 'Improve failed' });
  }
});

// Notes — sync app notes for all graded courses and general recommendation, then return list
app.get('/api/notes', authMiddleware, requireStudent, async (req, res) => {
  const userId = req.user.id;
  const type = req.query.type; // 'student' | 'app' | omit for all

  const gradedCourses = await db.prepare('SELECT id, course_name, current_grade FROM student_courses WHERE user_id = ? AND current_grade IS NOT NULL').all(userId);
  let atRiskCount = 0;
  for (const c of gradedCourses) {
    await upsertAppNoteForCourse(userId, c.id, c.course_name, c.current_grade);
    const status = getGradeStatus(c.current_grade);
    if (status === 'at_risk' || status === 'high_risk') atRiskCount++;
  }
  if (atRiskCount >= 2) {
    const generalContent = RECOMMENDATIONS.general_ar + '\n\n' + ENCOURAGEMENT.high_risk;
    await upsertGeneralAppNote(userId, generalContent);
  } else {
    await db.prepare(
      "DELETE FROM notes WHERE user_id = ? AND type = 'app' AND student_course_id IS NULL AND (note_category IS NULL OR note_category = '')"
    ).run(userId);
  }

  let sql = 'SELECT n.id, n.student_course_id, n.content, n.type, n.created_at, n.note_category, n.ref_id, n.ref_type FROM notes n WHERE n.user_id = ?';
  const params = [userId];
  if (type === 'student' || type === 'app') {
    sql += ' AND n.type = ?';
    params.push(type);
  }
  sql += ' ORDER BY n.created_at DESC';
  const rows = await db.prepare(sql).all(...params);
  const courseIds = [...new Set(rows.map(r => r.student_course_id).filter(Boolean))];
  const names = {};
  if (courseIds.length) {
    const placeholders = courseIds.map((_, i) => '?').join(',');
    const courses = await db.prepare(`SELECT id, course_name FROM student_courses WHERE id IN (${placeholders})`).all(...courseIds);
    courses.forEach(c => { names[c.id] = c.course_name; });
  }
  const quizIds = [...new Set(rows.filter(r => r.note_category === 'exam_insight' && r.ref_type === 'quiz' && r.ref_id).map(r => r.ref_id))];
  const quizTitles = {};
  if (quizIds.length) {
    const placeholders = quizIds.map((_, i) => '?').join(',');
    const quizzes = await db.prepare(`SELECT id, title FROM study_quizzes WHERE id IN (${placeholders})`).all(...quizIds);
    quizzes.forEach(q => { quizTitles[q.id] = q.title || ''; });
  }
  const list = rows.map(r => {
    const out = { ...r, course_name: r.student_course_id ? names[r.student_course_id] : null };
    if (r.note_category === 'exam_insight' && r.ref_type === 'quiz' && r.ref_id) {
      out.quiz_title = quizTitles[r.ref_id] || null;
    }
    return out;
  });
  return res.json(list);
});
app.post('/api/notes', authMiddleware, requireStudent, async (req, res) => {
  const b = req.body || {};
  const content = b.content || '';
  const studentCourseId = b.student_course_id != null ? parseInt(b.student_course_id, 10) : null;
  if (studentCourseId != null) {
    const ok = await db.prepare('SELECT id FROM student_courses WHERE id = ? AND user_id = ?').get(studentCourseId, req.user.id);
    if (!ok) return res.status(404).json({ detail: 'Course not found' });
  }
  const r = await db.prepare('INSERT INTO notes (user_id, student_course_id, content, type) VALUES (?, ?, ?, ?)').run(req.user.id, studentCourseId, content, 'student');
  const row = await db.prepare('SELECT id, student_course_id, content, type, created_at FROM notes WHERE id = ?').get(r.lastInsertRowid);
  return res.status(201).json(row);
});
app.patch('/api/notes/:id', authMiddleware, requireStudent, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const row = await db.prepare('SELECT id, type FROM notes WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!row) return res.status(404).json({ detail: 'Not found' });
  if (row.type !== 'student') return res.status(403).json({ detail: 'Only student notes can be edited' });
  const content = req.body?.content;
  if (content != null) await db.prepare('UPDATE notes SET content = ? WHERE id = ?').run(content, id);
  const updated = await db.prepare('SELECT id, student_course_id, content, type, created_at FROM notes WHERE id = ?').get(id);
  return res.json(updated);
});
app.delete('/api/notes/:id', authMiddleware, requireStudent, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const row = await db.prepare('SELECT id FROM notes WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!row) return res.status(404).json({ detail: 'Not found' });
  await db.prepare('DELETE FROM notes WHERE id = ?').run(id);
  return res.status(204).send();
});

// Analytics
app.get('/api/analytics', authMiddleware, requireStudent, async (req, res) => {
  const userId = req.user.id;
  const coursesList = await db.prepare(`
    SELECT id, course_name, course_code, current_grade, credit_hours, finalized_at, passed, semester_id, withdrawn FROM student_courses WHERE user_id = ?
  `).all(userId);
  const snap = await getStudentGpaSnapshot(req.user);
  const scaledCourses = await applyScaleToCourses(req.user, coursesList);
  const courses = scaledCourses.map((c) => ({
    id: c.id,
    course_name: c.course_name,
    course_code: c.course_code,
    credit_hours: c.credit_hours,
    final_mark: c.current_grade,
    percent: c.percent,
    letter: c.letter_grade,
    gpa_points: c.gpa_points,
    status: getGradeStatus(c.current_grade),
  }));
  return res.json({
    courses,
    semester_gpa: snap.semester_gpa,
    semester_percent: snap.semester_percent,
    cgpa: snap.cgpa,
    cumulative_percent: snap.cumulative_percent,
    credits_completed: snap.credits_completed,
    credits_carried: snap.credits_carried,
    credits_current: snap.credits_current,
  });
});
app.get('/api/courses/:courseId/chat', authMiddleware, (req, res) => res.json([]));
app.post('/api/courses/:courseId/chat', authMiddleware, (req, res) => res.status(201).send());
app.delete('/api/courses/:courseId/chat', authMiddleware, (req, res) => res.status(204).send());
app.get('/api/tasks/upcoming', authMiddleware, async (req, res) => {
  const date = new Date().toISOString().slice(0, 10);
  const tasks = await db.prepare(`
    SELECT t.id, t.title, t.due_date, t.completed, sc.course_name FROM planner_tasks t
    LEFT JOIN student_courses sc ON sc.id = t.student_course_id
    WHERE t.user_id = ? AND t.due_date >= ? ORDER BY t.due_date LIMIT 20
  `).all(req.user.id, date);
  return res.json(tasks.map(t => ({ ...t, status: t.completed ? 'completed' : 'pending' })));
});
app.get('/api/insights/predictions', authMiddleware, (req, res) => res.json([]));
app.patch('/api/auth/settings', authMiddleware, async (req, res) => {
  const b = req.body || {};
  if (b.full_name) await db.prepare('UPDATE users SET full_name = ? WHERE id = ?').run(b.full_name, req.user.id);
  const user = await db.prepare('SELECT id, email, full_name, role FROM users WHERE id = ?').get(req.user.id);
  return res.json(user);
});

const uploadsDir = uploadsRoot();
mkdirSync(join(uploadsDir, 'avatars'), { recursive: true });
mkdirSync(join(uploadsDir, 'project-pdfs'), { recursive: true });
mkdirSync(join(uploadsDir, 'lecture-pdfs'), { recursive: true });
app.use('/uploads', (req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}, express.static(uploadsDir));

// Serve built frontend (Vite) when running as a full web app (e.g. on Render Web Service)
const distPath = join(__dirname, '..', 'dist');
if (existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ detail: 'Not found' });
    res.sendFile(join(distPath, 'index.html'));
  });
} else {
  app.get('/', (req, res) => res.send('Run "npm run build" then restart the server.'));
}

// Global error handler (uncaught errors in route handlers)
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  sentryCapture(err, { requestId: req.id, path: req.path, method: req.method });
  res.status(500).json({ detail: process.env.NODE_ENV === 'production' ? 'Internal server error' : (err.message || 'Internal server error') });
});

const isEntry = process.argv[1] && resolve(process.argv[1]) === __filename;
if (isEntry) {
  app.listen(PORT, () => {
    console.log(`UniPilot API running at http://localhost:${PORT}`);
    console.log(`Auth: POST /api/auth/login (university_id), GET /api/auth/me`);
    console.log(`Users: GET/POST /api/users (provisioned by responsible office)`);
    console.log(`Academic: terms, windows, offerings, registration, official grades, exams, teaching staff, student affairs`);
    console.log(`Catalog: GET/POST /api/catalog/courses, PATCH/DELETE /api/catalog/courses/:id`);
    console.log(`Student: GET/POST/DELETE /api/student/courses`);
    console.log(process.env.GROQ_API_KEY ? 'AI (Groq): configured' : 'AI (Groq): not configured — set GROQ_API_KEY in .env (see AI_SETUP.md)');
  });
}

export { app, PORT };
