import { db } from '../db.js';

function httpError(status, detail) {
  const err = new Error(detail);
  err.status = status;
  throw err;
}

function n(value) {
  return Number(value) || 0;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function collegeId(user) {
  const cid = user?.college_id != null ? Number(user.college_id) : null;
  if (cid == null) httpError(400, 'Dean is not attached to a college');
  return cid;
}

function termElapsed(term) {
  if (!term?.starts_on || !term?.ends_on) {
    return { elapsed_pct: 0, weeks_elapsed: 0, weeks_total: 0 };
  }
  const start = new Date(term.starts_on).getTime();
  const end = new Date(term.ends_on).getTime();
  const now = Date.now();
  const total = Math.max(end - start, 1);
  const done = clamp(Math.min(now, end) - start, 0, total);
  const week = 7 * 86400_000;
  return {
    elapsed_pct: Math.round((done / total) * 1000) / 10,
    weeks_elapsed: Math.max(1, Math.round(done / week)),
    weeks_total: Math.max(1, Math.round(total / week)),
  };
}

export async function getDeanAcademic(user) {
  const cid = collegeId(user);

  const term = await db.prepare(`
    SELECT t.id, t.name, t.starts_on, t.ends_on, t.is_current
    FROM academic_terms t
    INNER JOIN course_offerings o ON o.term_id = t.id
    INNER JOIN uni_courses uc ON uc.id = o.uni_course_id
    INNER JOIN departments d ON d.id = uc.department_id
    WHERE d.college_id = ?
    ORDER BY t.is_current DESC, t.starts_on DESC NULLS LAST, t.id DESC
    LIMIT 1
  `).get(cid);

  const clock = termElapsed(term);
  const expectedSessions = Math.max(1, clock.weeks_elapsed * 2);

  const offerings = term?.id
    ? await db.prepare(`
        SELECT o.id, uc.course_code, uc.course_name, d.id AS department_id, d.name AS department_name,
               (SELECT COUNT(*)::int FROM course_staff cs WHERE cs.offering_id = o.id) AS staff_count,
               (SELECT COUNT(*)::int FROM attendance_sessions s WHERE s.offering_id = o.id) AS session_count,
               (SELECT COUNT(*)::int FROM lecture_materials lm WHERE lm.offering_id = o.id) AS material_count
        FROM course_offerings o
        INNER JOIN uni_courses uc ON uc.id = o.uni_course_id
        INNER JOIN departments d ON d.id = uc.department_id
        WHERE d.college_id = ? AND o.term_id = ?
        ORDER BY d.name, uc.course_code
      `).all(cid, term.id)
    : [];

  const deptMap = new Map();
  const syllabusCourses = offerings.map((o) => {
    const taught = n(o.session_count) + n(o.material_count);
    let progress = Math.round(clamp((taught / expectedSessions) * 100, 0, 100));
    if (taught === 0 && n(o.staff_count) > 0) progress = 10;
    const row = {
      offering_id: o.id,
      course_code: o.course_code,
      course_name: o.course_name,
      department_id: o.department_id,
      department: o.department_name,
      progress,
      sessions: n(o.session_count),
      materials: n(o.material_count),
      staffed: n(o.staff_count) > 0,
    };
    const bucket = deptMap.get(o.department_name) || {
      id: o.department_id,
      department: o.department_name,
      courses: 0,
      progress_sum: 0,
    };
    bucket.courses += 1;
    bucket.progress_sum += progress;
    deptMap.set(o.department_name, bucket);
    return row;
  });

  const syllabus = [...deptMap.values()].map((d) => ({
    id: d.id,
    department: d.department,
    courses: d.courses,
    progress: d.courses ? Math.round(d.progress_sum / d.courses) : 0,
    expected: clock.elapsed_pct,
  }));

  const attendanceRows = await db.prepare(`
    SELECT d.id AS department_id, d.name AS department, uc.course_code, uc.course_name, o.id AS offering_id,
           COUNT(ar.id)::int AS marked,
           COUNT(ar.id) FILTER (WHERE lower(ar.status) = 'present')::int AS present,
           COUNT(ar.id) FILTER (WHERE lower(ar.status) IN ('absent', 'missing', 'unexcused'))::int AS absent
    FROM attendance_sessions s
    INNER JOIN course_offerings o ON o.id = s.offering_id
    INNER JOIN uni_courses uc ON uc.id = o.uni_course_id
    INNER JOIN departments d ON d.id = uc.department_id
    LEFT JOIN attendance_records ar ON ar.session_id = s.id
    WHERE d.college_id = ?
    GROUP BY d.id, d.name, uc.course_code, uc.course_name, o.id
  `).all(cid);

  const attendance = attendanceRows.map((r) => {
    const marked = n(r.marked);
    const absent = marked ? marked - n(r.present) : 0;
    const absence_rate = marked ? Math.round((absent / marked) * 1000) / 10 : 0;
    return {
      offering_id: r.offering_id,
      department_id: r.department_id,
      department: r.department,
      course_code: r.course_code,
      course_name: r.course_name,
      marked,
      present: n(r.present),
      absent,
      absence_rate,
    };
  });
  const attendanceAlerts = attendance.filter((r) => r.marked > 0 && r.absence_rate >= 15);

  const gradeRows = await db.prepare(`
    SELECT sc.current_grade, sc.passed, sc.course_code, sc.course_name
    FROM student_courses sc
    INNER JOIN users u ON u.id = sc.user_id
    WHERE u.role = 'student' AND u.college_id = ?
      AND sc.finalized_at IS NOT NULL AND COALESCE(sc.withdrawn, 0) = 0
      AND sc.current_grade IS NOT NULL
  `).all(cid);

  const buckets = [
    { key: '0-49', ar: 'راسب', en: 'Fail', min: 0, max: 49, count: 0 },
    { key: '50-59', ar: 'مقبول', en: 'Pass', min: 50, max: 59, count: 0 },
    { key: '60-69', ar: 'جيد', en: 'Good', min: 60, max: 69, count: 0 },
    { key: '70-79', ar: 'جيد جداً', en: 'Very good', min: 70, max: 79, count: 0 },
    { key: '80-89', ar: 'ممتاز', en: 'Excellent', min: 80, max: 89, count: 0 },
    { key: '90-100', ar: 'امتياز', en: 'Outstanding', min: 90, max: 100, count: 0 },
  ];
  const byCourse = new Map();
  for (const row of gradeRows) {
    const mark = Number(row.current_grade);
    const bucket = buckets.find((b) => mark >= b.min && mark <= b.max);
    if (bucket) bucket.count += 1;
    const key = row.course_code || row.course_name;
    const c = byCourse.get(key) || { course_code: row.course_code, course_name: row.course_name, graded: 0, failed: 0 };
    c.graded += 1;
    if (Number(row.passed) === 0 || mark < 50) c.failed += 1;
    byCourse.set(key, c);
  }
  const failByCourse = [...byCourse.values()]
    .map((c) => ({
      ...c,
      fail_rate: c.graded ? Math.round((c.failed / c.graded) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.fail_rate - a.fail_rate);
  const critical = failByCourse.filter((c) => c.fail_rate >= 20);

  return {
    term: term ? { id: term.id, name: term.name, starts_on: term.starts_on, ends_on: term.ends_on, ...clock } : null,
    syllabus: {
      expected: clock.elapsed_pct,
      by_department: syllabus,
      courses: syllabusCourses,
    },
    attendance: {
      courses: attendance,
      alerts: attendanceAlerts,
    },
    grades: {
      total: gradeRows.length,
      curve: buckets,
      fail_by_course: failByCourse,
      critical,
    },
  };
}
