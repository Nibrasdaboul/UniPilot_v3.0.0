import { Router } from 'express';
import { authMiddleware, requireStudentAffairs, requireRegisterStudent } from '../middleware/auth.js';
import {
  listMine,
  getBoard,
  fileComplaint,
  updateComplaint,
  createActivity,
  deleteActivity,
  signupActivity,
  leaveActivity,
  openCase,
  updateCase,
  registrationOptions,
  registerStudent,
  listRegisteredStudents,
} from '../services/studentAffairsService.js';
import { loadUserDetail, updateUserRecord } from '../services/userProvisionService.js';
import { ROLES } from '../college/roles.js';

export const studentAffairsRouter = Router();
studentAffairsRouter.use(authMiddleware);

function sendServiceError(res, e) {
  const status = e.status || 500;
  if (status >= 500) console.error(e);
  return res.status(status).json({ detail: e.message || 'Request failed' });
}

studentAffairsRouter.get('/mine', async (req, res) => {
  try {
    return res.json(await listMine(req.user));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

studentAffairsRouter.get('/registration-options', requireRegisterStudent, async (req, res) => {
  try {
    return res.json(await registrationOptions(req.user));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

studentAffairsRouter.get('/students', requireRegisterStudent, async (req, res) => {
  try {
    return res.json(await listRegisteredStudents(req.user));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

studentAffairsRouter.get('/students/:id', requireRegisterStudent, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(404).json({ detail: 'Student not found' });
    const detail = await loadUserDetail(id);
    if (!detail || detail.user.role !== ROLES.STUDENT) return res.status(404).json({ detail: 'Student not found' });
    return res.json(detail);
  } catch (e) {
    return sendServiceError(res, e);
  }
});

studentAffairsRouter.patch('/students/:id', requireRegisterStudent, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(404).json({ detail: 'Student not found' });
    const existing = await loadUserDetail(id);
    if (!existing || existing.user.role !== ROLES.STUDENT) return res.status(404).json({ detail: 'Student not found' });
    return res.json(await updateUserRecord(req.user, existing.user.id, req.body || {}));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

studentAffairsRouter.post('/students', requireRegisterStudent, async (req, res) => {
  try {
    return res.status(201).json(await registerStudent(req.user, req.body || {}));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

studentAffairsRouter.get('/board', requireStudentAffairs, async (req, res) => {
  try {
    return res.json(await getBoard(req.user));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

studentAffairsRouter.post('/complaints', async (req, res) => {
  try {
    return res.status(201).json(await fileComplaint(req.user, req.body || {}));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

studentAffairsRouter.patch('/complaints/:id', requireStudentAffairs, async (req, res) => {
  try {
    return res.json(await updateComplaint(req.user, parseInt(req.params.id, 10), req.body || {}));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

studentAffairsRouter.post('/activities', requireStudentAffairs, async (req, res) => {
  try {
    return res.status(201).json(await createActivity(req.user, req.body || {}));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

studentAffairsRouter.delete('/activities/:id', requireStudentAffairs, async (req, res) => {
  try {
    await deleteActivity(req.user, parseInt(req.params.id, 10));
    return res.status(204).send();
  } catch (e) {
    return sendServiceError(res, e);
  }
});

studentAffairsRouter.post('/activities/:id/signup', async (req, res) => {
  try {
    return res.json(await signupActivity(req.user, parseInt(req.params.id, 10)));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

studentAffairsRouter.delete('/activities/:id/signup', async (req, res) => {
  try {
    return res.json(await leaveActivity(req.user, parseInt(req.params.id, 10)));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

studentAffairsRouter.post('/cases', requireStudentAffairs, async (req, res) => {
  try {
    return res.status(201).json(await openCase(req.user, req.body || {}));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

studentAffairsRouter.patch('/cases/:id', requireStudentAffairs, async (req, res) => {
  try {
    return res.json(await updateCase(req.user, parseInt(req.params.id, 10), req.body || {}));
  } catch (e) {
    return sendServiceError(res, e);
  }
});
