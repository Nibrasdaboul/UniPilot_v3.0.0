import { db } from '../db.js';
import { getDeanAcademic } from './deanAcademicService.js';

function httpError(status, detail) {
  const err = new Error(detail);
  err.status = status;
  throw err;
}

function collegeId(user) {
  const cid = user?.college_id != null ? Number(user.college_id) : null;
  if (cid == null) httpError(400, 'Dean is not attached to a college');
  return cid;
}

function iso(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export async function getDeanBriefing(user) {
  const cid = collegeId(user);
  const academic = await getDeanAcademic(user);
  const alerts = [];

  for (const course of academic.syllabus?.courses || []) {
    if (!course.staffed) {
      alerts.push({
        key: `unstaffed-${course.offering_id}`,
        severity: 'critical',
        kind: 'unstaffed',
        course_code: course.course_code,
        department_id: course.department_id,
        ar: `مادة بلا مدرّس: ${course.course_code} — ${course.course_name}`,
        en: `No instructor assigned: ${course.course_code} — ${course.course_name}`,
      });
    }
  }

  const late = academic.term?.id
    ? await db.prepare(`
        SELECT o.id, uc.course_code, uc.course_name, d.name AS department_name
        FROM course_offerings o
        INNER JOIN uni_courses uc ON uc.id = o.uni_course_id
        INNER JOIN departments d ON d.id = uc.department_id
        WHERE d.college_id = ? AND o.term_id = ?
          AND EXISTS (SELECT 1 FROM enrollments e WHERE e.offering_id = o.id AND e.status = 'enrolled')
          AND NOT EXISTS (
            SELECT 1 FROM enrollments e
            INNER JOIN official_marks om ON om.enrollment_id = e.id
            WHERE e.offering_id = o.id AND om.status = 'published'
          )
          AND (
            EXISTS (SELECT 1 FROM exam_sessions s WHERE s.offering_id = o.id AND s.starts_at < CURRENT_TIMESTAMP)
            OR ? >= 70
          )
      `).all(cid, academic.term.id, Number(academic.term.elapsed_pct) || 0)
    : [];

  for (const row of late) {
    alerts.push({
      key: `late-${row.id}`,
      severity: 'critical',
      kind: 'late_results',
      course_code: row.course_code,
      ar: `نتائج متأخرة: ${row.course_code} — ${row.department_name}`,
      en: `Late results: ${row.course_code} — ${row.department_name}`,
    });
  }

  for (const row of academic.attendance?.alerts || []) {
    alerts.push({
      key: `absence-${row.offering_id}`,
      severity: 'warning',
      kind: 'absence',
      course_code: row.course_code,
      department_id: row.department_id,
      ar: `غياب مرتفع ${row.absence_rate}% في ${row.course_code}`,
      en: `High absence ${row.absence_rate}% in ${row.course_code}`,
    });
  }

  for (const row of academic.grades?.critical || []) {
    alerts.push({
      key: `fail-${row.course_code}`,
      severity: 'warning',
      kind: 'fail_rate',
      course_code: row.course_code,
      ar: `رسوب مرتفع ${row.fail_rate}% في ${row.course_code}`,
      en: `High fail rate ${row.fail_rate}% in ${row.course_code}`,
    });
  }

  const events = [];
  if (academic.term) {
    events.push({
      key: `term-start-${academic.term.id}`,
      kind: 'term',
      at: iso(academic.term.starts_on ? academic.term.starts_on : null) || null,
      ar: `بداية ${academic.term.name}`,
      en: `Start of ${academic.term.name}`,
    });
    if (academic.term.starts_on && academic.term.ends_on) {
      const start = new Date(academic.term.starts_on).getTime();
      const end = new Date(academic.term.ends_on).getTime();
      events.push({
        key: `midterm-${academic.term.id}`,
        kind: 'exam',
        at: new Date(start + (end - start) / 2).toISOString(),
        ar: `منتصف ${academic.term.name}`,
        en: `Midpoint of ${academic.term.name}`,
      });
    }
    events.push({
      key: `grades-deadline-${academic.term.id}`,
      kind: 'deadline',
      at: iso(academic.term.ends_on),
      ar: `الموعد النهائي لتسليم درجات ${academic.term.name}`,
      en: `Grade deadline for ${academic.term.name}`,
    });
    events.push({
      key: `term-end-${academic.term.id}`,
      kind: 'term',
      at: iso(academic.term.ends_on),
      ar: `نهاية ${academic.term.name}`,
      en: `End of ${academic.term.name}`,
    });
  }

  const windows = await db.prepare(`
    SELECT w.id, w.name, w.opens_at, w.closes_at
    FROM registration_windows w
    WHERE w.college_id = ? OR w.college_id IS NULL
    ORDER BY w.opens_at DESC
    LIMIT 8
  `).all(cid);
  for (const w of windows) {
    events.push({
      key: `window-open-${w.id}`,
      kind: 'registration',
      at: iso(w.opens_at),
      ar: `فتح التسجيل: ${w.name}`,
      en: `Registration opens: ${w.name}`,
    });
    events.push({
      key: `window-close-${w.id}`,
      kind: 'registration',
      at: iso(w.closes_at),
      ar: `إغلاق التسجيل: ${w.name}`,
      en: `Registration closes: ${w.name}`,
    });
  }

  const exams = await db.prepare(`
    SELECT s.id, s.starts_at, s.exam_type, s.room_name, uc.course_code, uc.course_name
    FROM exam_sessions s
    INNER JOIN course_offerings o ON o.id = s.offering_id
    INNER JOIN uni_courses uc ON uc.id = o.uni_course_id
    INNER JOIN departments d ON d.id = uc.department_id
    WHERE d.college_id = ?
    ORDER BY s.starts_at ASC
    LIMIT 12
  `).all(cid);
  for (const s of exams) {
    const mid = String(s.exam_type || '').toLowerCase().includes('mid');
    events.push({
      key: `exam-${s.id}`,
      kind: 'exam',
      at: iso(s.starts_at),
      ar: `${mid ? 'امتحان نصفي' : 'امتحان'}: ${s.course_code}${s.room_name ? ` — ${s.room_name}` : ''}`,
      en: `${mid ? 'Midterm' : 'Exam'}: ${s.course_code}${s.room_name ? ` — ${s.room_name}` : ''}`,
    });
  }

  const activities = await db.prepare(`
    SELECT id, title, starts_at, location
    FROM student_activities
    WHERE college_id = ?
    ORDER BY starts_at ASC
    LIMIT 8
  `).all(cid);
  for (const a of activities) {
    events.push({
      key: `activity-${a.id}`,
      kind: 'activity',
      at: iso(a.starts_at),
      ar: `${a.title}${a.location ? ` — ${a.location}` : ''}`,
      en: `${a.title}${a.location ? ` — ${a.location}` : ''}`,
    });
  }

  const now = Date.now() - 12 * 3600_000;
  const upcoming = events
    .filter((e) => e.at && new Date(e.at).getTime() >= now)
    .sort((a, b) => new Date(a.at) - new Date(b.at))
    .slice(0, 8);

  return {
    alerts,
    calendar: upcoming,
  };
}
