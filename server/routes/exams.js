import { Router } from 'express';
import { authMiddleware, requireExamsOffice } from '../middleware/auth.js';
import {
  listHalls,
  createHall,
  updateHall,
  deleteHall,
  listExamBoard,
  createSession,
  updateSession,
  deleteSession,
  publishSession,
  getSessionDetail,
  listMyExams,
} from '../services/examsService.js';

export const examsRouter = Router();
examsRouter.use(authMiddleware);

function sendServiceError(res, e) {
  const status = e.status || 500;
  if (status >= 500) console.error(e);
  return res.status(status).json({ detail: e.message || 'Request failed' });
}

examsRouter.get('/exams/mine', async (req, res) => {
  try {
    return res.json(await listMyExams(req.user));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

examsRouter.get('/exams/board', requireExamsOffice, async (req, res) => {
  try {
    return res.json(await listExamBoard(req.user));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

examsRouter.get('/exams/halls', requireExamsOffice, async (req, res) => {
  try {
    return res.json(await listHalls(req.user));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

examsRouter.post('/exams/halls', requireExamsOffice, async (req, res) => {
  try {
    return res.status(201).json(await createHall(req.user, req.body || {}));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

examsRouter.patch('/exams/halls/:id', requireExamsOffice, async (req, res) => {
  try {
    return res.json(await updateHall(req.user, parseInt(req.params.id, 10), req.body || {}));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

examsRouter.delete('/exams/halls/:id', requireExamsOffice, async (req, res) => {
  try {
    await deleteHall(req.user, parseInt(req.params.id, 10));
    return res.status(204).send();
  } catch (e) {
    return sendServiceError(res, e);
  }
});

examsRouter.post('/exams/sessions', requireExamsOffice, async (req, res) => {
  try {
    return res.status(201).json(await createSession(req.user, req.body || {}));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

examsRouter.patch('/exams/sessions/:id', requireExamsOffice, async (req, res) => {
  try {
    return res.json(await updateSession(req.user, parseInt(req.params.id, 10), req.body || {}));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

examsRouter.delete('/exams/sessions/:id', requireExamsOffice, async (req, res) => {
  try {
    await deleteSession(req.user, parseInt(req.params.id, 10));
    return res.status(204).send();
  } catch (e) {
    return sendServiceError(res, e);
  }
});

examsRouter.post('/exams/sessions/:id/publish', requireExamsOffice, async (req, res) => {
  try {
    return res.json(await publishSession(req.user, parseInt(req.params.id, 10)));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

examsRouter.get('/exams/sessions/:id', requireExamsOffice, async (req, res) => {
  try {
    return res.json(await getSessionDetail(req.user, parseInt(req.params.id, 10)));
  } catch (e) {
    return sendServiceError(res, e);
  }
});
