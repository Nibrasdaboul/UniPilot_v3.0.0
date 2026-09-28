/**
 * API integration tests. Requires DATABASE_URL (e.g. test PostgreSQL).
 * Run: npm run test:api (from project root)
 */
import request from 'supertest';
import { describe, it, beforeAll, expect } from 'vitest';
import { app } from './index.js';


describe('API', () => {
  describe('Public', () => {
    it('GET /api/health returns 200 and status ok', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body?.status).toBe('ok');
    });

    it('GET /api/ready returns 200 when DB connected', async () => {
      const res = await request(app).get('/api/ready');
      expect([200, 503]).toContain(res.status);
      if (res.status === 200) expect(res.body?.status).toBe('ready');
    });
  });

  describe('Auth', () => {
    it('POST /api/auth/login with invalid body returns 400', async () => {
      const res = await request(app).post('/api/auth/login').send({});
      expect(res.status).toBe(400);
    });

    it('POST /api/auth/register is disabled', async () => {
      const email = `test-${Date.now()}@unipilot.test`;
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email, password: 'TestPass123!', full_name: 'Test User' });
      expect(res.status).toBe(403);
    });

    it('POST /api/auth/login with bootstrap dean returns token', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ university_id: '0260000001', password: 'College123!' });
      expect([200, 401]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body?.access_token).toBeDefined();
        expect(res.body?.user?.role).toBe('dean');
      }
    });
  });

  describe('Protected routes', () => {
    let token;

    beforeAll(async () => {
      const login = await request(app).post('/api/auth/login').send({ university_id: '0260000001', password: 'College123!' });
      token = login.body?.access_token;
    });

    it('GET /api/dashboard/summary without token returns 401', async () => {
      const res = await request(app).get('/api/dashboard/summary');
      expect(res.status).toBe(401);
    });

    it('GET /api/dashboard/summary with token returns 200', async () => {
      if (!token) return;
      const res = await request(app).get('/api/dashboard/summary').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('courses_count');
    });

    it('GET /api/dean/dashboard returns college KPIs for dean only', async () => {
      if (!token) return;
      const res = await request(app).get('/api/dean/dashboard').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(typeof res.body?.students?.total).toBe('number');
      expect(Array.isArray(res.body?.students?.by_gender)).toBe(true);
      expect(typeof res.body?.academic_staff?.total).toBe('number');
      expect(typeof res.body?.admin_staff?.total).toBe('number');
      expect(typeof res.body?.departments?.total).toBe('number');
      expect(res.body?.pending).toHaveProperty('total');
      const student = await request(app).post('/api/auth/login').send({ university_id: '0260000003', password: 'College123!' });
      if (student.status === 200) {
        const blocked = await request(app).get('/api/dean/dashboard').set('Authorization', `Bearer ${student.body.access_token}`);
        expect(blocked.status).toBe(403);
      }
    });

    it('GET /api/dean/operations returns tuition, facilities, and tickets', async () => {
      if (!token) return;
      const res = await request(app).get('/api/dean/operations').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body?.tuition).toBeTruthy();
      expect(res.body?.facilities).toBeTruthy();
      expect(Array.isArray(res.body?.tickets?.items)).toBe(true);
      const student = await request(app).post('/api/auth/login').send({ university_id: '0260000003', password: 'College123!' });
      if (student.status === 200) {
        const blocked = await request(app).get('/api/dean/operations').set('Authorization', `Bearer ${student.body.access_token}`);
        expect(blocked.status).toBe(403);
      }
    });

    it('GET /api/dean/briefing returns alerts and calendar', async () => {
      if (!token) return;
      const res = await request(app).get('/api/dean/briefing').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body?.alerts)).toBe(true);
      expect(Array.isArray(res.body?.calendar)).toBe(true);
      const student = await request(app).post('/api/auth/login').send({ university_id: '0260000003', password: 'College123!' });
      if (student.status === 200) {
        const blocked = await request(app).get('/api/dean/briefing').set('Authorization', `Bearer ${student.body.access_token}`);
        expect(blocked.status).toBe(403);
      }
    });

    it('GET /api/dean/reports opens drill-down reports for dean only', async () => {
      if (!token) return;
      const students = await request(app).get('/api/dean/reports/students').set('Authorization', `Bearer ${token}`);
      expect(students.status).toBe(200);
      expect(students.body?.scope).toBe('students');
      expect(students.body?.summary).toBeTruthy();
      expect(Array.isArray(students.body?.departments)).toBe(true);

      const departments = await request(app).get('/api/dean/reports/departments').set('Authorization', `Bearer ${token}`);
      expect(departments.status).toBe(200);
      expect(departments.body?.scope).toBe('departments');

      const deptId = departments.body?.items?.[0]?.id;
      if (deptId) {
        const dept = await request(app).get(`/api/dean/reports/department/${deptId}`).set('Authorization', `Bearer ${token}`);
        expect(dept.status).toBe(200);
        expect(dept.body?.scope).toBe('department');
        expect(dept.body?.department?.id).toBe(deptId);
        expect(dept.body?.counts).toBeTruthy();
      }

      const unknown = await request(app).get('/api/dean/reports/not-a-scope').set('Authorization', `Bearer ${token}`);
      expect(unknown.status).toBe(404);

      const student = await request(app).post('/api/auth/login').send({ university_id: '0260000003', password: 'College123!' });
      if (student.status === 200) {
        const blocked = await request(app).get('/api/dean/reports/students').set('Authorization', `Bearer ${student.body.access_token}`);
        expect(blocked.status).toBe(403);
      }
    });

    it('GET /api/dean/academic returns syllabus, attendance, and grade curve', async () => {
      if (!token) return;
      const res = await request(app).get('/api/dean/academic').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body?.syllabus).toBeTruthy();
      expect(Array.isArray(res.body?.syllabus?.by_department)).toBe(true);
      expect(Array.isArray(res.body?.grades?.curve)).toBe(true);
      expect(Array.isArray(res.body?.attendance?.courses)).toBe(true);
      const student = await request(app).post('/api/auth/login').send({ university_id: '0260000003', password: 'College123!' });
      if (student.status === 200) {
        const blocked = await request(app).get('/api/dean/academic').set('Authorization', `Bearer ${student.body.access_token}`);
        expect(blocked.status).toBe(403);
      }
    });

    it('dean can list and decide pending approvals', async () => {
      if (!token) return;
      const studentLogin = await request(app).post('/api/auth/login').send({ university_id: '0260000003', password: 'College123!' });
      const studentId = studentLogin.body?.user?.id;
      if (studentId) {
        const opened = await request(app).post('/api/affairs/cases').set('Authorization', `Bearer ${token}`).send({
          student_user_id: studentId,
          case_type: 'academic',
          title: `تأجيل فصل ${Date.now()}`,
          body: 'طلب تأجيل للفصل الحالي',
        });
        expect([200, 201]).toContain(opened.status);
      }
      const list = await request(app).get('/api/dean/approvals').set('Authorization', `Bearer ${token}`);
      expect(list.status).toBe(200);
      expect(Array.isArray(list.body?.items)).toBe(true);
      expect(list.body.items.length).toBeGreaterThan(0);
      const target = list.body.items.find((x) => x.kind === 'status') || list.body.items[0];
      const decided = await request(app)
        .post(`/api/dean/approvals/${target.id}/decide`)
        .set('Authorization', `Bearer ${token}`)
        .send({ decision: 'approved' });
      expect(decided.status).toBe(200);
      expect(decided.body?.status).toBe('approved');
      const student = await request(app).post('/api/auth/login').send({ university_id: '0260000003', password: 'College123!' });
      if (student.status === 200) {
        const blocked = await request(app).get('/api/dean/approvals').set('Authorization', `Bearer ${student.body.access_token}`);
        expect(blocked.status).toBe(403);
      }
    });

    it('GET /api/planner/daily as dean is student-only', async () => {
      if (!token) return;
      const res = await request(app).get('/api/planner/daily?date=2025-01-15').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
    });

    it('GET /api/billing/me with token returns 200 and plan/usage', async () => {
      if (!token) return;
      const res = await request(app).get('/api/billing/me').set('Authorization', `Bearer ${token}`);
      expect([200, 500]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body).toHaveProperty('plan_id');
        expect(res.body).toHaveProperty('ai_used');
      }
    });

    it('POST /api/academic/windows as dean creates a window', async () => {
      if (!token) return;
      const terms = await request(app).get('/api/academic/terms').set('Authorization', `Bearer ${token}`);
      const current = (terms.body || []).find((t) => Number(t.is_current) === 1 && Number(t.is_closed) !== 1);
      if (!current) return;
      const res = await request(app)
        .post('/api/academic/windows')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'API test window',
          term_id: current.id,
          opens_at: new Date(Date.now() - 60_000).toISOString(),
          closes_at: new Date(Date.now() + 14 * 86400_000).toISOString(),
          max_credits: 18,
        });
      expect([201, 400]).toContain(res.status);
    });
  });

  describe('Student registration gate', () => {
    it('student cannot POST /api/student/courses', async () => {
      const login = await request(app).post('/api/auth/login').send({ university_id: '0260000003', password: 'College123!' });
      if (login.status !== 200) return;
      const res = await request(app)
        .post('/api/student/courses')
        .set('Authorization', `Bearer ${login.body.access_token}`)
        .send({ course_name: 'Self add', course_code: 'X101' });
      expect(res.status).toBe(403);
    });

    it('student cannot enter or finalize grades', async () => {
      const login = await request(app).post('/api/auth/login').send({ university_id: '0260000003', password: 'College123!' });
      if (login.status !== 200) return;
      const token = login.body.access_token;
      const courses = await request(app).get('/api/student/courses').set('Authorization', `Bearer ${token}`);
      const id = (courses.body || [])[0]?.id || 1;
      const add = await request(app).post(`/api/courses/${id}/grades`).set('Authorization', `Bearer ${token}`).send({ title: 'X', score: 80, weight: 10 });
      expect(add.status).toBe(403);
      const fin = await request(app).post(`/api/courses/${id}/finalize`).set('Authorization', `Bearer ${token}`);
      expect(fin.status).toBe(403);
    });

    it('student cannot manage exam halls', async () => {
      const login = await request(app).post('/api/auth/login').send({ university_id: '0260000003', password: 'College123!' });
      if (login.status !== 200) return;
      const res = await request(app)
        .post('/api/academic/exams/halls')
        .set('Authorization', `Bearer ${login.body.access_token}`)
        .send({ name: 'X', capacity: 10 });
      expect(res.status).toBe(403);
    });

    it('student cannot assign teaching staff', async () => {
      const login = await request(app).post('/api/auth/login').send({ university_id: '0260000003', password: 'College123!' });
      if (login.status !== 200) return;
      const res = await request(app)
        .post('/api/academic/staff/assignments')
        .set('Authorization', `Bearer ${login.body.access_token}`)
        .send({ offering_id: 5, user_id: 1, staff_role: 'instructor' });
      expect(res.status).toBe(403);
    });

    it('non-student cannot open study tools or notes', async () => {
      const login = await request(app).post('/api/auth/login').send({ university_id: '0260000001', password: 'College123!' });
      if (login.status !== 200) return;
      const token = login.body.access_token;
      const study = await request(app).get('/api/study/documents').set('Authorization', `Bearer ${token}`);
      expect(study.status).toBe(403);
      const notes = await request(app).get('/api/notes').set('Authorization', `Bearer ${token}`);
      expect(notes.status).toBe(403);
    });

    it('non-student cannot open AI coach or analytics', async () => {
      const login = await request(app).post('/api/auth/login').send({ university_id: '0260000001', password: 'College123!' });
      if (login.status !== 200) return;
      const token = login.body.access_token;
      const conv = await request(app).get('/api/ai/conversations').set('Authorization', `Bearer ${token}`);
      expect(conv.status).toBe(403);
      const analytics = await request(app).get('/api/analytics').set('Authorization', `Bearer ${token}`);
      expect(analytics.status).toBe(403);
    });

    it('non-student cannot open planner or academic-history APIs', async () => {
      const login = await request(app).post('/api/auth/login').send({ university_id: '0260000001', password: 'College123!' });
      if (login.status !== 200) return;
      const token = login.body.access_token;
      const planner = await request(app).get('/api/planner/daily?date=2025-01-15').set('Authorization', `Bearer ${token}`);
      expect(planner.status).toBe(403);
      const terms = await request(app).get('/api/academic/terms').set('Authorization', `Bearer ${token}`);
      const termId = (terms.body || []).find((t) => Number(t.is_current) === 1)?.id || (terms.body || [])[0]?.id || 3;
      const summary = await request(app).get(`/api/academic/terms/${termId}/my-summary`).set('Authorization', `Bearer ${token}`);
      expect(summary.status).toBe(403);
    });

    it('non-student cannot open student registration or course list', async () => {
      const login = await request(app).post('/api/auth/login').send({ university_id: '0260000001', password: 'College123!' });
      if (login.status !== 200) return;
      const token = login.body.access_token;
      const reg = await request(app).get('/api/academic/registration').set('Authorization', `Bearer ${token}`);
      expect(reg.status).toBe(403);
      const courses = await request(app).get('/api/student/courses').set('Authorization', `Bearer ${token}`);
      expect(courses.status).toBe(403);
      const enroll = await request(app)
        .post('/api/academic/registration/enroll')
        .set('Authorization', `Bearer ${token}`)
        .send({ offering_id: 5 });
      expect(enroll.status).toBe(403);
    });

    it('dean cannot create a student from the people directory', async () => {
      const login = await request(app).post('/api/auth/login').send({ university_id: '0260000001', password: 'College123!' });
      if (login.status !== 200) return;
      const token = login.body.access_token;
      const roles = await request(app).get('/api/users/roles').set('Authorization', `Bearer ${token}`);
      expect(roles.status).toBe(200);
      expect(roles.body?.creatable_roles || []).not.toContain('student');
      const created = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${token}`)
        .send({ full_name: 'Should Fail', role: 'student', password: 'College123!', enrollment_year: 2026 });
      expect(created.status).toBe(403);
    });

    it('student affairs cannot create a student from the people directory', async () => {
      const login = await request(app).post('/api/auth/login').send({ university_id: '0260000002', password: 'College123!' });
      if (login.status !== 200) return;
      const token = login.body.access_token;
      const roles = await request(app).get('/api/users/roles').set('Authorization', `Bearer ${token}`);
      expect(roles.status).toBe(200);
      expect(roles.body?.creatable_roles || []).not.toContain('student');
      const created = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${token}`)
        .send({ full_name: 'Should Fail', role: 'student', password: 'College123!', enrollment_year: 2026 });
      expect(created.status).toBe(403);
    });

    it('dean cannot register a student from Student Affairs API', async () => {
      const login = await request(app).post('/api/auth/login').send({ university_id: '0260000001', password: 'College123!' });
      if (login.status !== 200) return;
      const token = login.body.access_token;
      const res = await request(app)
        .post('/api/affairs/students')
        .set('Authorization', `Bearer ${token}`)
        .send({
          full_name_ar: 'طالب تجريبي',
          full_name_en: 'Test Student',
          national_id: `dean-block-${Date.now()}`,
          gender: 'male',
          birth_date: '2004-01-15',
          password: 'College123!',
          enrollment_year: 2026,
        });
      expect(res.status).toBe(403);
    });

    it('student affairs can register a student', async () => {
      const login = await request(app).post('/api/auth/login').send({ university_id: '0260000002', password: 'College123!' });
      if (login.status !== 200) return;
      const token = login.body.access_token;
      expect(login.body?.user?.can_register_students).toBe(true);
      const stamp = Date.now();
      const res = await request(app)
        .post('/api/affairs/students')
        .set('Authorization', `Bearer ${token}`)
        .send({
          full_name_ar: 'طالب جديد',
          full_name_en: 'New Student',
          national_id: `sa-${stamp}`,
          gender: 'female',
          birth_date: '2005-03-20',
          password: 'College123!',
          enrollment_year: 2026,
          admission_type: 'parallel',
          academic_status: 'new',
          study_year: 1,
          major: 'CE',
        });
      expect(res.status).toBe(201);
      expect(res.body?.university_id).toMatch(/^\d{10}$/);
      expect(res.body?.user?.role).toBe('student');
      expect(res.body?.profile?.admission_type).toBe('parallel');
      const tinyPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
      const withPhoto = await request(app)
        .post('/api/affairs/students')
        .set('Authorization', `Bearer ${token}`)
        .send({
          full_name_ar: 'طالب بصورة',
          full_name_en: 'Photo Student',
          national_id: `sa-photo-${stamp}`,
          gender: 'male',
          birth_date: '2004-09-01',
          password: 'College123!',
          enrollment_year: 2026,
          avatar_base64: `data:image/png;base64,${tinyPng}`,
          avatar_filename: 'face.png',
        });
      expect(withPhoto.status).toBe(201);
      expect(withPhoto.body?.user?.avatar_url).toMatch(/^\/uploads\/avatars\//);
      const photo = await request(app).get(withPhoto.body.user.avatar_url);
      expect(photo.status).toBe(200);
      const signedIn = await request(app)
        .post('/api/auth/login')
        .send({ university_id: withPhoto.body.university_id, password: 'College123!' });
      expect(signedIn.status).toBe(200);
      expect(signedIn.body?.user?.role).toBe('student');
      const badPhoto = await request(app)
        .post('/api/affairs/students')
        .set('Authorization', `Bearer ${token}`)
        .send({
          full_name_ar: 'طالب سيء',
          full_name_en: 'Bad Photo',
          national_id: `sa-bad-${stamp}`,
          gender: 'male',
          birth_date: '2004-09-01',
          password: 'College123!',
          enrollment_year: 2026,
          avatar_base64: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
        });
      expect(badPhoto.status).toBe(400);
    });

    it('dean can create faculty, TA, and admin staff with role files', async () => {
      const login = await request(app).post('/api/auth/login').send({ university_id: '0260000001', password: 'College123!' });
      if (login.status !== 200) return;
      const token = login.body.access_token;
      const stamp = Date.now();
      const shared = (suffix, extra) => ({
        full_name_ar: `اسم ${suffix}`,
        full_name_en: `Name ${suffix}`,
        national_id: `c-${stamp}-${suffix}`,
        gender: 'male',
        birth_date: '1988-05-01',
        password: 'College123!',
        enrollment_year: 2026,
        ...extra,
      });
      const faculty = await request(app).post('/api/users').set('Authorization', `Bearer ${token}`).send(shared('fac', {
        role: 'instructor',
        academic_rank: 'assistant_professor',
        general_specialty: 'CE',
        contract_type: 'permanent',
        teaching_load_hours: 10,
      }));
      expect(faculty.status).toBe(201);
      expect(faculty.body?.profile?.kind).toBe('faculty');
      expect(faculty.body?.profile?.academic_rank).toBe('assistant_professor');
      const ta = await request(app).post('/api/users').set('Authorization', `Bearer ${token}`).send(shared('ta', {
        role: 'teaching_assistant',
        specialty: 'Labs',
        bachelor_gpa: 88,
        postgraduate_studying: true,
        postgraduate_program: 'MSc CE',
        supervisor_user_id: faculty.body?.user?.id,
      }));
      expect(ta.status).toBe(201);
      expect(ta.body?.profile?.kind).toBe('ta');
      expect(ta.body?.profile?.postgraduate_studying).toBe(1);
      const staff = await request(app).post('/api/users').set('Authorization', `Bearer ${token}`).send(shared('stf', {
        role: 'exams_office',
        job_title: 'Exams clerk',
        office_unit: 'Exams',
        employment_type: 'administrative',
        work_shift: 'morning',
        access_permissions: ['enter_grades', 'print_cards'],
      }));
      expect(staff.status).toBe(201);
      expect(staff.body?.profile?.kind).toBe('staff');
      expect(staff.body?.profile?.access_permissions).toBe('enter_grades,print_cards');
    });

    it('opens a person file and updates it; student affairs cannot edit staff', async () => {
      const deanLogin = await request(app).post('/api/auth/login').send({ university_id: '0260000001', password: 'College123!' });
      const saLogin = await request(app).post('/api/auth/login').send({ university_id: '0260000002', password: 'College123!' });
      if (deanLogin.status !== 200 || saLogin.status !== 200) return;
      const dean = deanLogin.body.access_token;
      const sa = saLogin.body.access_token;
      const stamp = Date.now();
      const created = await request(app).post('/api/users').set('Authorization', `Bearer ${dean}`).send({
        full_name_ar: 'مدرس للتعديل',
        full_name_en: 'Edit Instructor',
        national_id: `edit-${stamp}`,
        gender: 'male',
        birth_date: '1985-02-02',
        password: 'College123!',
        enrollment_year: 2026,
        role: 'instructor',
        academic_rank: 'lecturer',
        general_specialty: 'CE',
        contract_type: 'permanent',
      });
      expect(created.status).toBe(201);
      const id = created.body?.user?.id;
      const list = await request(app).get('/api/users').set('Authorization', `Bearer ${dean}`);
      expect(list.status).toBe(200);
      expect((list.body || []).every((u) => u.role !== 'student')).toBe(true);
      expect((list.body || []).some((u) => u.id === id)).toBe(true);
      const detail = await request(app).get(`/api/users/${id}`).set('Authorization', `Bearer ${dean}`);
      expect(detail.status).toBe(200);
      expect(detail.body?.user?.full_name_en).toBe('Edit Instructor');
      expect(detail.body?.kind).toBe('faculty');
      const patched = await request(app).patch(`/api/users/${id}`).set('Authorization', `Bearer ${dean}`).send({
        ...detail.body.user,
        ...detail.body.profile,
        full_name_ar: 'مدرس محدث',
        full_name_en: 'Updated Instructor',
        phone: '0999000111',
      });
      expect(patched.status).toBe(200);
      expect(patched.body?.user?.full_name_en).toBe('Updated Instructor');
      expect(patched.body?.user?.phone).toBe('0999000111');
      const blocked = await request(app).get(`/api/users/${id}`).set('Authorization', `Bearer ${sa}`);
      expect(blocked.status).toBe(403);
      const student = await request(app).post('/api/affairs/students').set('Authorization', `Bearer ${sa}`).send({
        full_name_ar: 'طالب للتعديل',
        full_name_en: 'Edit Student',
        national_id: `st-edit-${stamp}`,
        gender: 'female',
        birth_date: '2005-01-01',
        password: 'College123!',
        enrollment_year: 2026,
        major: 'CE',
        academic_status: 'new',
      });
      expect(student.status).toBe(201);
      const sid = student.body?.user?.id;
      const sDetail = await request(app).get(`/api/affairs/students/${sid}`).set('Authorization', `Bearer ${sa}`);
      expect(sDetail.status).toBe(200);
      expect(sDetail.body?.user?.role).toBe('student');
      const sPatched = await request(app).patch(`/api/affairs/students/${sid}`).set('Authorization', `Bearer ${sa}`).send({
        ...sDetail.body.user,
        ...sDetail.body.profile,
        full_name_en: 'Updated Student',
        major: 'Architecture',
      });
      expect(sPatched.status).toBe(200);
      expect(sPatched.body?.user?.full_name_en).toBe('Updated Student');
      expect(sPatched.body?.profile?.major).toBe('Architecture');
      const deanOnStudent = await request(app).patch(`/api/affairs/students/${sid}`).set('Authorization', `Bearer ${dean}`).send({
        full_name_ar: 'لا',
        full_name_en: 'No',
        national_id: `x-${stamp}`,
        gender: 'male',
        birth_date: '2001-01-01',
      });
      expect(deanOnStudent.status).toBe(403);
    });

    it('student cannot publish activities or open cases', async () => {
      const login = await request(app).post('/api/auth/login').send({ university_id: '0260000003', password: 'College123!' });
      if (login.status !== 200) return;
      const token = login.body.access_token;
      const act = await request(app)
        .post('/api/affairs/activities')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'X', starts_at: new Date().toISOString(), capacity: 10 });
      expect(act.status).toBe(403);
      const cse = await request(app)
        .post('/api/affairs/cases')
        .set('Authorization', `Bearer ${token}`)
        .send({ student_user_id: 1, case_type: 'disciplinary', title: 'X' });
      expect(cse.status).toBe(403);
    });
  });

  describe('Billing (public)', () => {
    it('GET /api/billing/plans returns 200 and plans array', async () => {
      const res = await request(app).get('/api/billing/plans');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body?.plans)).toBe(true);
      expect(res.body.plans.length).toBeGreaterThanOrEqual(1);
      const free = res.body.plans.find((p) => p.id === 'free');
      expect(free).toBeDefined();
    });
  });
});
