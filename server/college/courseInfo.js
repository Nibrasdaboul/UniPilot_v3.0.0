export const COURSE_SYLLABUS_MAX = 20000;

export function parseCourseSyllabusBody(body) {
  const hasTheory = Object.prototype.hasOwnProperty.call(body || {}, 'theory_syllabus');
  const hasPractical = Object.prototype.hasOwnProperty.call(body || {}, 'practical_syllabus');
  if (!hasTheory && !hasPractical) {
    return { error: 'theory_syllabus or practical_syllabus is required' };
  }
  const theory = hasTheory ? String(body.theory_syllabus ?? '') : undefined;
  const practical = hasPractical ? String(body.practical_syllabus ?? '') : undefined;
  if (theory != null && theory.length > COURSE_SYLLABUS_MAX) {
    return { error: `theory_syllabus must be ${COURSE_SYLLABUS_MAX} characters or fewer` };
  }
  if (practical != null && practical.length > COURSE_SYLLABUS_MAX) {
    return { error: `practical_syllabus must be ${COURSE_SYLLABUS_MAX} characters or fewer` };
  }
  return { error: null, theory_syllabus: theory, practical_syllabus: practical };
}

export function splitCourseStaff(list) {
  const theory = [];
  const practical = [];
  const seenTheory = new Set();
  const seenPractical = new Set();
  for (const row of list || []) {
    const userId = Number(row.user_id);
    if (!userId) continue;
    const person = {
      user_id: userId,
      full_name: row.full_name || '',
      person_code: row.person_code || '',
      staff_role: row.staff_role === 'teaching_assistant' ? 'teaching_assistant' : 'instructor',
    };
    if (person.staff_role === 'teaching_assistant') {
      if (seenPractical.has(userId)) continue;
      seenPractical.add(userId);
      practical.push(person);
    } else {
      if (seenTheory.has(userId)) continue;
      seenTheory.add(userId);
      theory.push(person);
    }
  }
  return { theory_staff: theory, practical_staff: practical };
}
