import { describe, it, expect } from 'vitest';
import { guessDepartmentCode, labelDepartment, COLLEGE_DEPARTMENTS } from './departments.js';

describe('college departments', () => {
  it('defines the four official college departments', () => {
    expect(COLLEGE_DEPARTMENTS.map((d) => d.code)).toEqual(['SE', 'NE', 'AI', 'PRE']);
    expect(COLLEGE_DEPARTMENTS.some((d) => d.name_ar === 'هندسة البرمجيات ونظم المعلومات')).toBe(true);
    expect(COLLEGE_DEPARTMENTS.some((d) => d.name_ar === 'مواد ما قبل التخصص')).toBe(true);
  });

  it('guesses AI and pre-specialization from course text', () => {
    expect(guessDepartmentCode({ course_name: 'مدخل الى الذكاء الصنعي', department: 'متطلب جامعي' })).toBe('AI');
    expect(guessDepartmentCode({ course_name: 'علم النفس', department: 'متطلب جامعي' })).toBe('PRE');
    expect(guessDepartmentCode({ course_name: 'Introduction to Programming', department: 'Computer Engineering' })).toBe('PRE');
  });

  it('labels official departments in Arabic and English', () => {
    expect(labelDepartment({ code: 'SE', name: 'x' }, 'ar')).toBe('هندسة البرمجيات ونظم المعلومات');
    expect(labelDepartment({ code: 'PRE', name: 'x' }, 'en')).toBe('Pre-specialization');
  });
});
