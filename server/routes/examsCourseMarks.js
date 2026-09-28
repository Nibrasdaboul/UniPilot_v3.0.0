import { Router } from 'express';
import { authMiddleware, requireExamsOfficeOnly } from '../middleware/auth.js';
import { listExamsCourseMarks, getExamsCourseMarks, markExamsCourseGrade, adoptExamsCourseWorkSheet, markExamsCourseAttendance, adoptExamsAttendanceSheet, setExamsDeprivation, decideExamsCancelRequest } from '../services/examsCourseMarksService.js';
import { decideCourseWorkAppeal } from '../services/courseWorkAppealsService.js';
import { getAbsenceThreshold, updateAbsenceThreshold } from '../services/absenceThresholdService.js';
import { getGpaScale, updateGpaScale } from '../services/gpaScaleService.js';

export const examsCourseMarksRouter = Router();
examsCourseMarksRouter.use(authMiddleware);
examsCourseMarksRouter.use(requireExamsOfficeOnly);

function sendServiceError(res, e) {
  const status = e.status || 500;
  if (status >= 500) console.error(e);
  return res.status(status).json({ detail: e.message || 'Request failed' });
}

examsCourseMarksRouter.get('/gpa-scale', async (req, res) => {
  try {
    return res.json(await getGpaScale(req.user));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

examsCourseMarksRouter.put('/gpa-scale', async (req, res) => {
  try {
    return res.json(await updateGpaScale(req.user, req.body || {}));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

examsCourseMarksRouter.get('/absence-threshold', async (req, res) => {
  try {
    return res.json(await getAbsenceThreshold(req.user));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

examsCourseMarksRouter.patch('/absence-threshold', async (req, res) => {
  try {
    return res.json(await updateAbsenceThreshold(req.user, req.body || {}));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

examsCourseMarksRouter.get('/course-marks', async (req, res) => {
  try {
    return res.json(await listExamsCourseMarks(req.user));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

examsCourseMarksRouter.get('/course-marks/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(404).json({ detail: 'Course not found' });
    return res.json(await getExamsCourseMarks(req.user, id));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

examsCourseMarksRouter.put('/course-marks/:id/grades', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(404).json({ detail: 'Course not found' });
    return res.json(await markExamsCourseGrade(req.user, id, req.body || {}));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

examsCourseMarksRouter.post('/course-marks/:id/grades/adopt', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(404).json({ detail: 'Course not found' });
    return res.json(await adoptExamsCourseWorkSheet(req.user, id));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

examsCourseMarksRouter.put('/course-marks/:id/attendance', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(404).json({ detail: 'Course not found' });
    return res.json(await markExamsCourseAttendance(req.user, id, req.body || {}));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

examsCourseMarksRouter.post('/course-marks/:id/attendance/adopt', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(404).json({ detail: 'Course not found' });
    return res.json(await adoptExamsAttendanceSheet(req.user, id));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

examsCourseMarksRouter.post('/course-marks/:id/deprivations/:userId', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const userId = parseInt(req.params.userId, 10);
    if (!Number.isFinite(id) || !Number.isFinite(userId)) return res.status(404).json({ detail: 'Student not found' });
    return res.json(await setExamsDeprivation(req.user, id, userId, req.body || {}));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

examsCourseMarksRouter.post('/course-marks/:id/deprivations/requests/:requestId', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const requestId = parseInt(req.params.requestId, 10);
    if (!Number.isFinite(id) || !Number.isFinite(requestId)) return res.status(404).json({ detail: 'Request not found' });
    return res.json(await decideExamsCancelRequest(req.user, id, requestId, req.body || {}));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

examsCourseMarksRouter.post('/course-marks/:id/appeals/:appealId', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const appealId = parseInt(req.params.appealId, 10);
    if (!Number.isFinite(id) || !Number.isFinite(appealId)) return res.status(404).json({ detail: 'Appeal not found' });
    return res.json(await decideCourseWorkAppeal(req.user, id, appealId, req.body || {}));
  } catch (e) {
    return sendServiceError(res, e);
  }
});
