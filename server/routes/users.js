import { Router } from 'express';
import { db } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { directoryCreatableRolesFor, ROLE_LABELS } from '../college/roles.js';
import { sharedCatalogs, roleCatalogs, studentCatalogs } from '../college/userProfiles.js';
import { toPublicDepartment } from '../college/departments.js';
import { provisionUser, toPublicUser, loadUserDetail, updateUserRecord, canAccessPersonFile } from '../services/userProvisionService.js';

export const usersRouter = Router();
usersRouter.use(authMiddleware);

usersRouter.get('/roles', (req, res) => {
  const creatable = directoryCreatableRolesFor(req.user.role);
  return res.json({
    creatable_roles: creatable,
    labels: ROLE_LABELS,
  });
});

usersRouter.get('/profile-options', async (req, res) => {
  const cid = req.user?.college_id != null ? Number(req.user.college_id) : null;
  const supervisors = cid != null
    ? await db.prepare(`
        SELECT id, full_name, person_code, role
        FROM users
        WHERE role IN ('instructor', 'department_head', 'vice_dean_academic', 'dean')
          AND college_id = ?
        ORDER BY full_name ASC, id ASC
      `).all(cid)
    : await db.prepare(`
        SELECT id, full_name, person_code, role
        FROM users
        WHERE role IN ('instructor', 'department_head', 'vice_dean_academic', 'dean')
        ORDER BY full_name ASC, id ASC
      `).all();
  return res.json({
    ...sharedCatalogs(),
    ...roleCatalogs(),
    ...studentCatalogs(),
    supervisors,
  });
});

usersRouter.get('/departments', async (req, res) => {
  const cid = req.user?.college_id != null ? Number(req.user.college_id) : null;
  const rows = cid
    ? await db.prepare('SELECT id, code, name FROM departments WHERE college_id = ? ORDER BY id').all(cid)
    : await db.prepare('SELECT id, code, name FROM departments ORDER BY id').all();
  return res.json(rows.map((d) => toPublicDepartment(d)));
});

usersRouter.get('/', async (req, res) => {
  const creatable = directoryCreatableRolesFor(req.user.role);
  if (!creatable.length) {
    return res.status(403).json({ detail: 'Not allowed to list users' });
  }
  const rows = await db.prepare(`
    SELECT u.id, u.person_code, u.email, u.full_name, u.full_name_ar, u.full_name_en, u.role, u.department_id, u.enrollment_year, u.created_at, u.avatar_url, u.account_status, u.phone,
           d.name AS department_name, d.name AS department_name_ar
    FROM users u
    LEFT JOIN departments d ON d.id = u.department_id
    WHERE u.role <> 'student'
    ORDER BY u.id DESC
  `).all();
  return res.json(rows.map((row) => toPublicUser(row)));
});

usersRouter.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(404).json({ detail: 'User not found' });
    const detail = await loadUserDetail(id);
    if (!detail) return res.status(404).json({ detail: 'User not found' });
    if (!canAccessPersonFile(req.user, detail.user.role)) {
      return res.status(403).json({ detail: 'You cannot view this person' });
    }
    return res.json(detail);
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error(e);
    return res.status(status).json({ detail: e.message || 'Failed to load user' });
  }
});

usersRouter.patch('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(404).json({ detail: 'User not found' });
    const detail = await updateUserRecord(req.user, id, req.body || {});
    return res.json(detail);
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error(e);
    return res.status(status).json({ detail: e.message || 'Failed to update user' });
  }
});

usersRouter.post('/', async (req, res) => {
  try {
    const row = await provisionUser({
      actor: req.user,
      ...req.body,
      role: req.body?.role,
      password: req.body?.password,
    });
    const user = toPublicUser(row);
    return res.status(201).json({
      user,
      university_id: user?.university_id || row?.person_code,
      profile: row?.role_profile || null,
    });
  } catch (e) {
    const status = e.status || (e.message?.includes('year') ? 400 : 500);
    if (status >= 500) console.error('Provision user error:', e);
    return res.status(status).json({ detail: e.message || 'Failed to create user' });
  }
});
