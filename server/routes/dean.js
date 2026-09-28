import { Router } from 'express';
import { authMiddleware, requireDean } from '../middleware/auth.js';
import { getDeanKpis } from '../services/deanDashboardService.js';
import { listDeanApprovals, decideDeanApproval } from '../services/deanApprovalsService.js';
import { getDeanAcademic } from '../services/deanAcademicService.js';
import { getDeanBriefing } from '../services/deanBriefingService.js';
import { getDeanOperations } from '../services/deanOperationsService.js';
import { getDeanReport } from '../services/deanReportService.js';

export const deanRouter = Router();
deanRouter.use(authMiddleware);

function sendServiceError(res, e) {
  const status = e.status || 500;
  if (status >= 500) console.error(e);
  return res.status(status).json({ detail: e.message || 'Request failed' });
}

deanRouter.get('/dashboard', requireDean, async (req, res) => {
  try {
    return res.json(await getDeanKpis(req.user));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

deanRouter.get('/operations', requireDean, async (req, res) => {
  try {
    return res.json(await getDeanOperations(req.user));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

deanRouter.get('/briefing', requireDean, async (req, res) => {
  try {
    return res.json(await getDeanBriefing(req.user));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

deanRouter.get('/reports/:scope/:id?', requireDean, async (req, res) => {
  try {
    return res.json(await getDeanReport(req.user, req.params.scope, req.params.id));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

deanRouter.get('/academic', requireDean, async (req, res) => {
  try {
    return res.json(await getDeanAcademic(req.user));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

deanRouter.get('/approvals', requireDean, async (req, res) => {
  try {
    return res.json(await listDeanApprovals(req.user, req.query?.kind));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

deanRouter.post('/approvals/:id/decide', requireDean, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(404).json({ detail: 'Approval not found' });
    return res.json(await decideDeanApproval(req.user, id, req.body || {}));
  } catch (e) {
    return sendServiceError(res, e);
  }
});
