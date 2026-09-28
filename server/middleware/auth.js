import jwt from 'jsonwebtoken';
import { db } from '../db.js';
import { directoryCreatableRolesFor, isLeadership, canManageAcademicCalendar, canManageCurriculum, canEnterOfficialGrades, canManageStudentAffairs, canRegisterStudent, isStudentRole, isViceDeanAcademic, isExamsOfficeRole } from '../college/roles.js';

// Production: JWT_SECRET is required (no fallback). Prevents weak default secrets.
const JWT_SECRET = process.env.JWT_SECRET;
if (process.env.NODE_ENV === 'production' && (!JWT_SECRET || JWT_SECRET.length < 32)) {
  throw new Error(
    'JWT_SECRET must be set in production and at least 32 characters. Set it in .env or Render Environment.'
  );
}
const SECRET = JWT_SECRET || 'unipilot-dev-secret-change-in-production';

export async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ detail: 'Missing or invalid authorization' });
  }
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, SECRET);
    const user = await db.prepare(`
      SELECT u.id, u.email, u.full_name, u.role, u.person_code, u.department_id, u.enrollment_year,
             u.college_id, u.avatar_url, u.university_id AS org_university_id,
             d.name AS department_name, d.name AS department_name_ar
      FROM users u
      LEFT JOIN departments d ON d.id = u.department_id
      WHERE u.id = ?
    `).get(payload.userId);
    if (!user) return res.status(401).json({ detail: 'User not found' });
    user.creatable_roles = directoryCreatableRolesFor(user.role);
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ detail: 'Invalid or expired token' });
  }
}

export function requireAdmin(req, res, next) {
  if (!isLeadership(req.user?.role)) {
    return res.status(403).json({ detail: 'Admin only' });
  }
  next();
}

export function requireAcademicAdmin(req, res, next) {
  if (!canManageAcademicCalendar(req.user?.role)) {
    return res.status(403).json({ detail: 'Academic administration only' });
  }
  next();
}

export function requireCurriculumAdmin(req, res, next) {
  if (!canManageCurriculum(req.user?.role)) {
    return res.status(403).json({ detail: 'Curriculum is managed by academic administration' });
  }
  next();
}

export function requireExamsOffice(req, res, next) {
  if (!canEnterOfficialGrades(req.user?.role)) {
    return res.status(403).json({ detail: 'Official grades are entered by the Exams Office' });
  }
  next();
}

export function requireExamsOfficeOnly(req, res, next) {
  if (!isExamsOfficeRole(req.user?.role)) {
    return res.status(403).json({ detail: 'Exams Office only' });
  }
  next();
}

export function requireStudentAffairs(req, res, next) {
  if (!canManageStudentAffairs(req.user?.role)) {
    return res.status(403).json({ detail: 'Student affairs is managed by the Student Affairs office' });
  }
  next();
}

export function requireRegisterStudent(req, res, next) {
  if (!canRegisterStudent(req.user?.role)) {
    return res.status(403).json({ detail: 'Only Student Affairs can register students' });
  }
  next();
}

export function requireDean(req, res, next) {
  if (req.user?.role !== 'dean') {
    return res.status(403).json({ detail: 'Dean only' });
  }
  next();
}

export function requireViceDeanAcademic(req, res, next) {
  if (!isViceDeanAcademic(req.user?.role)) {
    return res.status(403).json({ detail: 'Vice Dean for Academic Affairs only' });
  }
  next();
}

export function requireStudent(req, res, next) {
  if (!isStudentRole(req.user?.role)) {
    return res.status(403).json({ detail: 'This is available to students only' });
  }
  next();
}

export function signToken(userId) {
  return jwt.sign({ userId }, SECRET, { expiresIn: '7d' });
}
