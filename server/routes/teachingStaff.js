import { Router } from 'express';
import { authMiddleware, requireCurriculumAdmin } from '../middleware/auth.js';
import {
  getStaffBoard,
  assignStaff,
  unassignStaff,
  createSection,
  updateSection,
  deleteSection,
  pickSection,
  listMyCourseStaff,
  listMyTeachings,
  createMeeting,
  deleteMeeting,
} from '../services/teachingStaffService.js';
import { listStaffMyCourses, getStaffMyCourse, addStaffCourseSession, markStaffCourseAttendance, markStaffCourseEval, markStaffCourseGrade, setStaffTheoryMidtermAutomated, submitStaffCourseWorkSheet, confirmStaffCourseWorkSheet, submitStaffAttendanceSheet, confirmStaffAttendanceSheet, uploadStaffLectureFile, getStaffCourseChat, postStaffCourseChat, requireStaffAssignedCourse } from '../services/staffCourseInfoService.js';
import { openCourseChatStream, subscribeCourseChat } from '../services/courseStaffChatHub.js';
import {
  listMySessions,
  checkInSession,
  notifyAbsence,
  requestMakeup,
  cancelSessionRequest,
} from '../services/classSessionsService.js';

export const teachingStaffRouter = Router();
teachingStaffRouter.use(authMiddleware);

function sendServiceError(res, e) {
  const status = e.status || 500;
  if (status >= 500) console.error(e);
  const body = { detail: e.message || 'Request failed' };
  if (e.status && typeof e.code === 'string') body.code = e.code;
  return res.status(status).json(body);
}

teachingStaffRouter.get('/staff/sessions', async (req, res) => {
  try {
    return res.json(await listMySessions(req.user, { catalogCourseId: req.query.catalog_course_id }));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

teachingStaffRouter.post('/staff/sessions/:id/check-in', async (req, res) => {
  try {
    return res.json(await checkInSession(req.user, req.params.id));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

teachingStaffRouter.post('/staff/sessions/:id/absence-notice', async (req, res) => {
  try {
    return res.status(201).json(await notifyAbsence(req.user, req.params.id, req.body || {}));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

teachingStaffRouter.post('/staff/sessions/:id/makeup', async (req, res) => {
  try {
    return res.status(201).json(await requestMakeup(req.user, req.params.id, req.body || {}));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

teachingStaffRouter.post('/staff/session-requests/:id/cancel', async (req, res) => {
  try {
    return res.json(await cancelSessionRequest(req.user, req.params.id));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

teachingStaffRouter.get('/staff/mine', async (req, res) => {
  try {
    return res.json(await listMyCourseStaff(req.user));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

teachingStaffRouter.get('/staff/teaching', async (req, res) => {
  try {
    return res.json(await listMyTeachings(req.user));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

teachingStaffRouter.get('/staff/my-courses', async (req, res) => {
  try {
    return res.json(await listStaffMyCourses(req.user));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

teachingStaffRouter.get('/staff/my-courses/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(404).json({ detail: 'Course not assigned to you' });
    return res.json(await getStaffMyCourse(req.user, id));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

teachingStaffRouter.post('/staff/my-courses/:id/attendance/sessions', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(404).json({ detail: 'Course not assigned to you' });
    return res.status(201).json(await addStaffCourseSession(req.user, id));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

teachingStaffRouter.put('/staff/my-courses/:id/attendance', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(404).json({ detail: 'Course not assigned to you' });
    return res.json(await markStaffCourseAttendance(req.user, id, req.body || {}));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

teachingStaffRouter.post('/staff/my-courses/:id/attendance/submit', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(404).json({ detail: 'Course not assigned to you' });
    return res.status(201).json(await submitStaffAttendanceSheet(req.user, id));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

teachingStaffRouter.post('/staff/my-courses/:id/attendance/confirm', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(404).json({ detail: 'Course not assigned to you' });
    return res.json(await confirmStaffAttendanceSheet(req.user, id));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

teachingStaffRouter.put('/staff/my-courses/:id/attendance/eval', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(404).json({ detail: 'Course not assigned to you' });
    return res.json(await markStaffCourseEval(req.user, id, req.body || {}));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

teachingStaffRouter.put('/staff/my-courses/:id/grades', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(404).json({ detail: 'Course not assigned to you' });
    return res.json(await markStaffCourseGrade(req.user, id, req.body || {}));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

teachingStaffRouter.patch('/staff/my-courses/:id/grades/sheet', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(404).json({ detail: 'Course not assigned to you' });
    return res.json(await setStaffTheoryMidtermAutomated(req.user, id, req.body || {}));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

teachingStaffRouter.post('/staff/my-courses/:id/grades/submit', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(404).json({ detail: 'Course not assigned to you' });
    return res.status(201).json(await submitStaffCourseWorkSheet(req.user, id));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

teachingStaffRouter.post('/staff/my-courses/:id/grades/confirm', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(404).json({ detail: 'Course not assigned to you' });
    return res.json(await confirmStaffCourseWorkSheet(req.user, id));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

teachingStaffRouter.post('/staff/my-courses/:id/lectures', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(404).json({ detail: 'Course not assigned to you' });
    return res.status(201).json(await uploadStaffLectureFile(req.user, id, req.body || {}));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

teachingStaffRouter.get('/staff/my-courses/:id/chat', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(404).json({ detail: 'Course not assigned to you' });
    return res.json(await getStaffCourseChat(req.user, id));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

teachingStaffRouter.get('/staff/my-courses/:id/chat/stream', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(404).json({ detail: 'Course not assigned to you' });
    await requireStaffAssignedCourse(req.user, id);
    req.socket.setTimeout(0);
    openCourseChatStream(res);
    subscribeCourseChat(req.user.college_id, id, res);
  } catch (e) {
    if (res.headersSent) return;
    return sendServiceError(res, e);
  }
});

teachingStaffRouter.post('/staff/my-courses/:id/chat', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(404).json({ detail: 'Course not assigned to you' });
    return res.status(201).json(await postStaffCourseChat(req.user, id, req.body || {}));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

teachingStaffRouter.get('/staff/board', requireCurriculumAdmin, async (req, res) => {
  try {
    return res.json(await getStaffBoard(req.user));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

teachingStaffRouter.post('/staff/assignments', requireCurriculumAdmin, async (req, res) => {
  try {
    return res.status(201).json(await assignStaff(req.user, req.body || {}));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

teachingStaffRouter.delete('/staff/assignments/:id', requireCurriculumAdmin, async (req, res) => {
  try {
    await unassignStaff(req.user, parseInt(req.params.id, 10));
    return res.status(204).send();
  } catch (e) {
    return sendServiceError(res, e);
  }
});

teachingStaffRouter.post('/staff/sections', requireCurriculumAdmin, async (req, res) => {
  try {
    return res.status(201).json(await createSection(req.user, req.body || {}));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

teachingStaffRouter.patch('/staff/sections/:id', requireCurriculumAdmin, async (req, res) => {
  try {
    return res.json(await updateSection(req.user, parseInt(req.params.id, 10), req.body || {}));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

teachingStaffRouter.delete('/staff/sections/:id', requireCurriculumAdmin, async (req, res) => {
  try {
    await deleteSection(req.user, parseInt(req.params.id, 10));
    return res.status(204).send();
  } catch (e) {
    return sendServiceError(res, e);
  }
});

teachingStaffRouter.post('/staff/meetings', requireCurriculumAdmin, async (req, res) => {
  try {
    return res.status(201).json(await createMeeting(req.user, req.body || {}));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

teachingStaffRouter.delete('/staff/meetings/:id', requireCurriculumAdmin, async (req, res) => {
  try {
    await deleteMeeting(req.user, parseInt(req.params.id, 10));
    return res.status(204).send();
  } catch (e) {
    return sendServiceError(res, e);
  }
});

teachingStaffRouter.post('/staff/picks', async (req, res) => {
  try {
    return res.json(await pickSection(req.user, parseInt(req.body?.section_id, 10)));
  } catch (e) {
    return sendServiceError(res, e);
  }
});
