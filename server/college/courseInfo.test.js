import { describe, it, expect } from 'vitest';
import { parseCourseSyllabusBody, splitCourseStaff } from './courseInfo.js';

describe('course info helpers', () => {
  it('requires at least one syllabus field and rejects oversized text', () => {
    expect(parseCourseSyllabusBody({}).error).toMatch(/required/i);
    expect(parseCourseSyllabusBody({ theory_syllabus: 'مقدمة' }).theory_syllabus).toBe('مقدمة');
    expect(parseCourseSyllabusBody({ practical_syllabus: '' }).practical_syllabus).toBe('');
    expect(parseCourseSyllabusBody({ theory_syllabus: 'x'.repeat(20001) }).error).toMatch(/20000/);
  });

  it('splits instructors and teaching assistants without duplicates', () => {
    const split = splitCourseStaff([
      { user_id: 1, full_name: 'مدرّس', person_code: '0260000010', staff_role: 'instructor' },
      { user_id: 1, full_name: 'مدرّس', person_code: '0260000010', staff_role: 'instructor' },
      { user_id: 2, full_name: 'معيد', person_code: '0260000011', staff_role: 'teaching_assistant' },
    ]);
    expect(split.theory_staff).toHaveLength(1);
    expect(split.practical_staff).toHaveLength(1);
    expect(split.practical_staff[0].staff_role).toBe('teaching_assistant');
  });
});
