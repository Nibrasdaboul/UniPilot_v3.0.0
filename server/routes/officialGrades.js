import { Router } from 'express';
import { authMiddleware, requireExamsOffice } from '../middleware/auth.js';
import { assertManualOfficialEntryLocked } from '../college/officialGrades.js';
import {
  listGradeOfferings,
  getOfferingRoster,
  saveEnrollmentMarks,
  publishEnrollment,
  getMyCourseOfficial,
} from '../services/officialGradesService.js';

export const officialGradesRouter = Router();
officialGradesRouter.use(authMiddleware);

function sendServiceError(res, e) {
  const status = e.status || 500;
  if (status >= 500) console.error(e);
  return res.status(status).json({ detail: e.message || 'Request failed' });
}

officialGradesRouter.get('/grades/offerings', requireExamsOffice, async (req, res) => {
  try {
    return res.json(await listGradeOfferings(req.user));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

officialGradesRouter.get('/grades/offerings/:id', requireExamsOffice, async (req, res) => {
  try {
    return res.json(await getOfferingRoster(req.user, parseInt(req.params.id, 10)));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

officialGradesRouter.put('/grades/enrollments/:id', requireExamsOffice, async (req, res) => {
  try {
    assertManualOfficialEntryLocked();
    return res.json(await saveEnrollmentMarks(req.user, parseInt(req.params.id, 10), req.body?.marks || req.body || {}));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

officialGradesRouter.post('/grades/enrollments/:id/publish', requireExamsOffice, async (req, res) => {
  try {
    assertManualOfficialEntryLocked();
    return res.json(await publishEnrollment(req.user, parseInt(req.params.id, 10)));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

officialGradesRouter.get('/grades/my-course/:studentCourseId', async (req, res) => {
  try {
    return res.json(await getMyCourseOfficial(req.user, parseInt(req.params.studentCourseId, 10)));
  } catch (e) {
    return sendServiceError(res, e);
  }
});
