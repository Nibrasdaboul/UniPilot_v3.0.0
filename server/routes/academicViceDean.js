import { Router } from 'express';
import { authMiddleware, requireViceDeanAcademic } from '../middleware/auth.js';
import { getAcademicViceDeanKpis } from '../services/academicViceDeanDashboardService.js';
import { listVdaApprovals, decideVdaApproval } from '../services/academicViceDeanApprovalsService.js';
import { getAcademicViceDeanBriefing } from '../services/academicViceDeanBriefingService.js';
import { getAcademicViceDeanExams } from '../services/academicViceDeanExamsService.js';
import { getAcademicViceDeanGrades } from '../services/academicViceDeanGradesService.js';
import { getAcademicViceDeanStaff } from '../services/academicViceDeanStaffService.js';
import { getAcademicViceDeanCurriculum } from '../services/academicViceDeanCurriculumService.js';
import {
  getAcademicViceDeanResearch,
  registerPublication,
  submitGraduationProject,
  decideGraduationProject,
  updateProjectRequestMinHours,
  decideStudentProjectRequest,
} from '../services/academicViceDeanResearchService.js';
import {
  listAcademicViceDeanSurveys,
  createAcademicViceDeanSurvey,
  updateAcademicViceDeanSurvey,
  publishAcademicViceDeanSurvey,
} from '../services/academicViceDeanSurveysService.js';
import {
  listAcademicViceDeanSpecializations,
  decideAcademicViceDeanSpecialization,
  updateSpecializationMinHours,
} from '../services/academicViceDeanSpecializationService.js';
import { getUserCollegeRequestWindow, updateCollegeRequestWindow } from '../services/requestWindowService.js';
import { getAbsenceThreshold, updateAbsenceThreshold } from '../services/absenceThresholdService.js';
import { getGpaScale, updateGpaScale } from '../services/gpaScaleService.js';
import {
  getStaffSessionsOverview,
  getStaffSessionSettings,
  updateStaffSessionSettings,
} from '../services/classSessionsService.js';
import {
  listVdaSessions,
  listVdaRequests,
  decideVdaRequest,
  updateVdaStaffAttendance,
  getVdaStaffReport,
} from '../services/staffSessionsVdaService.js';
import {
  listAcademicViceDeanCourseInfo,
  getAcademicViceDeanCourseInfo,
  updateAcademicViceDeanCourseSyllabus,
} from '../services/academicViceDeanCourseInfoService.js';
import { publishCourseWorkSheet } from '../services/courseWorkSheetsService.js';
import { publishAttendanceSheet, cancelAttendanceSheet, setDeprivation, decideCancelRequest } from '../services/attendanceSheetsService.js';
import { decideCourseLectureFile } from '../services/courseLectureFilesService.js';
import { listCourseStaffChat, postCourseStaffChat } from '../services/courseStaffChatService.js';
import { openCourseChatStream, subscribeCourseChat } from '../services/courseStaffChatHub.js';

export const academicViceDeanRouter = Router();
academicViceDeanRouter.use(authMiddleware);
academicViceDeanRouter.use(requireViceDeanAcademic);

function sendServiceError(res, e) {
  const status = e.status || 500;
  if (status >= 500) console.error(e);
  const body = { detail: e.message || 'Request failed' };
  if (e.status && typeof e.code === 'string') body.code = e.code;
  return res.status(status).json(body);
}

academicViceDeanRouter.get('/dashboard', async (req, res) => {
  try {
    return res.json(await getAcademicViceDeanKpis(req.user));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

academicViceDeanRouter.get('/briefing', async (req, res) => {
  try {
    return res.json(await getAcademicViceDeanBriefing(req.user));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

academicViceDeanRouter.get('/exams', async (req, res) => {
  try {
    return res.json(await getAcademicViceDeanExams(req.user));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

academicViceDeanRouter.get('/grades', async (req, res) => {
  try {
    return res.json(await getAcademicViceDeanGrades(req.user));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

academicViceDeanRouter.get('/staff', async (req, res) => {
  try {
    return res.json(await getAcademicViceDeanStaff(req.user));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

academicViceDeanRouter.get('/curriculum', async (req, res) => {
  try {
    return res.json(await getAcademicViceDeanCurriculum(req.user));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

academicViceDeanRouter.get('/course-info', async (req, res) => {
  try {
    return res.json(await listAcademicViceDeanCourseInfo(req.user));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

academicViceDeanRouter.get('/course-info/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(404).json({ detail: 'Course not found' });
    return res.json(await getAcademicViceDeanCourseInfo(req.user, id));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

academicViceDeanRouter.patch('/course-info/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(404).json({ detail: 'Course not found' });
    return res.json(await updateAcademicViceDeanCourseSyllabus(req.user, id, req.body || {}));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

academicViceDeanRouter.post('/course-info/:id/attendance/publish', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(404).json({ detail: 'Course not found' });
    return res.json(await publishAttendanceSheet(req.user, id));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

academicViceDeanRouter.post('/course-info/:id/attendance/cancel', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(404).json({ detail: 'Course not found' });
    return res.json(await cancelAttendanceSheet(req.user, id));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

academicViceDeanRouter.post('/course-info/:id/deprivations/:userId', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const userId = parseInt(req.params.userId, 10);
    if (!Number.isFinite(id) || !Number.isFinite(userId)) return res.status(404).json({ detail: 'Student not found' });
    return res.json(await setDeprivation(req.user, id, userId, req.body || {}));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

academicViceDeanRouter.post('/course-info/:id/deprivations/requests/:requestId', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const requestId = parseInt(req.params.requestId, 10);
    if (!Number.isFinite(id) || !Number.isFinite(requestId)) return res.status(404).json({ detail: 'Request not found' });
    return res.json(await decideCancelRequest(req.user, id, requestId, req.body || {}));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

academicViceDeanRouter.post('/course-info/:id/grades/publish', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(404).json({ detail: 'Course not found' });
    return res.json(await publishCourseWorkSheet(req.user, id));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

academicViceDeanRouter.get('/course-info/:id/chat', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(404).json({ detail: 'Course not found' });
    return res.json(await listCourseStaffChat(req.user, id));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

academicViceDeanRouter.get('/course-info/:id/chat/stream', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(404).json({ detail: 'Course not found' });
    await getAcademicViceDeanCourseInfo(req.user, id);
    req.socket.setTimeout(0);
    openCourseChatStream(res);
    subscribeCourseChat(req.user.college_id, id, res);
  } catch (e) {
    if (res.headersSent) return;
    return sendServiceError(res, e);
  }
});

academicViceDeanRouter.post('/course-info/:id/chat', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(404).json({ detail: 'Course not found' });
    return res.status(201).json(await postCourseStaffChat(req.user, id, req.body || {}));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

academicViceDeanRouter.post('/course-info/:id/lectures/:fileId/decide', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const fileId = parseInt(req.params.fileId, 10);
    if (!Number.isFinite(id) || !Number.isFinite(fileId)) return res.status(404).json({ detail: 'Lecture file not found' });
    return res.json(await decideCourseLectureFile(req.user, id, fileId, req.body || {}));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

academicViceDeanRouter.get('/research', async (req, res) => {
  try {
    return res.json(await getAcademicViceDeanResearch(req.user));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

academicViceDeanRouter.patch('/research/settings', async (req, res) => {
  try {
    return res.json(await updateProjectRequestMinHours(req.user, req.body || {}));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

academicViceDeanRouter.post('/research/publications', async (req, res) => {
  try {
    return res.status(201).json(await registerPublication(req.user, req.body || {}));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

academicViceDeanRouter.post('/research/projects', async (req, res) => {
  try {
    return res.status(201).json(await submitGraduationProject(req.user, req.body || {}));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

academicViceDeanRouter.post('/research/projects/:id/decide', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(404).json({ detail: 'Graduation project not found' });
    return res.json(await decideGraduationProject(req.user, id, req.body || {}));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

academicViceDeanRouter.post('/research/student-requests/:id/decide', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(404).json({ detail: 'Student project request not found' });
    return res.json(await decideStudentProjectRequest(req.user, id, req.body || {}));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

academicViceDeanRouter.get('/surveys', async (req, res) => {
  try {
    return res.json(await listAcademicViceDeanSurveys(req.user));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

academicViceDeanRouter.post('/surveys', async (req, res) => {
  try {
    return res.status(201).json(await createAcademicViceDeanSurvey(req.user, req.body || {}));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

academicViceDeanRouter.patch('/surveys/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(404).json({ detail: 'Survey not found' });
    return res.json(await updateAcademicViceDeanSurvey(req.user, id, req.body || {}));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

academicViceDeanRouter.post('/surveys/:id/publish', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(404).json({ detail: 'Survey not found' });
    return res.json(await publishAcademicViceDeanSurvey(req.user, id));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

academicViceDeanRouter.get('/request-window', async (req, res) => {
  try {
    return res.json(await getUserCollegeRequestWindow(req.user));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

academicViceDeanRouter.patch('/request-window', async (req, res) => {
  try {
    return res.json(await updateCollegeRequestWindow(req.user, req.body || {}));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

academicViceDeanRouter.get('/gpa-scale', async (req, res) => {
  try {
    return res.json(await getGpaScale(req.user));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

academicViceDeanRouter.put('/gpa-scale', async (req, res) => {
  try {
    return res.json(await updateGpaScale(req.user, req.body || {}));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

academicViceDeanRouter.get('/absence-threshold', async (req, res) => {
  try {
    return res.json(await getAbsenceThreshold(req.user));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

academicViceDeanRouter.patch('/absence-threshold', async (req, res) => {
  try {
    return res.json(await updateAbsenceThreshold(req.user, req.body || {}));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

academicViceDeanRouter.get('/staff-sessions/overview', async (req, res) => {
  try {
    return res.json(await getStaffSessionsOverview(req.user));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

academicViceDeanRouter.get('/staff-sessions/settings', async (req, res) => {
  try {
    return res.json(await getStaffSessionSettings(req.user));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

academicViceDeanRouter.patch('/staff-sessions/settings', async (req, res) => {
  try {
    return res.json(await updateStaffSessionSettings(req.user, req.body || {}));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

academicViceDeanRouter.get('/staff-sessions/sessions', async (req, res) => {
  try {
    return res.json(await listVdaSessions(req.user, req.query || {}));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

academicViceDeanRouter.patch('/staff-sessions/sessions/:id/attendance', async (req, res) => {
  try {
    return res.json(await updateVdaStaffAttendance(req.user, req.params.id, req.body || {}));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

academicViceDeanRouter.get('/staff-sessions/requests', async (req, res) => {
  try {
    return res.json(await listVdaRequests(req.user, req.query || {}));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

academicViceDeanRouter.post('/staff-sessions/requests/:id/decide', async (req, res) => {
  try {
    return res.json(await decideVdaRequest(req.user, req.params.id, req.body || {}));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

academicViceDeanRouter.get('/staff-sessions/report', async (req, res) => {
  try {
    return res.json(await getVdaStaffReport(req.user));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

academicViceDeanRouter.get('/specialization', async (req, res) => {
  try {
    return res.json(await listAcademicViceDeanSpecializations(req.user));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

academicViceDeanRouter.patch('/specialization/settings', async (req, res) => {
  try {
    return res.json(await updateSpecializationMinHours(req.user, req.body || {}));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

academicViceDeanRouter.post('/specialization/:id/decide', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(404).json({ detail: 'Specialization request not found' });
    return res.json(await decideAcademicViceDeanSpecialization(req.user, id, req.body || {}));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

academicViceDeanRouter.get('/approvals', async (req, res) => {
  try {
    return res.json(await listVdaApprovals(req.user, req.query?.kind));
  } catch (e) {
    return sendServiceError(res, e);
  }
});

academicViceDeanRouter.post('/approvals/:id/decide', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(404).json({ detail: 'Approval not found' });
    return res.json(await decideVdaApproval(req.user, id, req.body || {}));
  } catch (e) {
    return sendServiceError(res, e);
  }
});
