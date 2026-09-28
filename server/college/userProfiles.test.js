import { describe, it, expect } from 'vitest';
import { parseSharedProfile, parseStudentProfile, parseFacultyProfile, parseTaProfile, parseStaffProfile, profileKindForRole } from './userProfiles.js';

describe('shared profile', () => {
  it('requires Arabic and English names when core is required', () => {
    expect(() => parseSharedProfile({ full_name_ar: 'أحمد' }, { requireCore: true })).toThrow(/English/);
    const row = parseSharedProfile({
      full_name_ar: 'أحمد علي',
      full_name_en: 'Ahmad Ali',
      national_id: '12345678901',
      gender: 'male',
      birth_date: '2004-01-15',
    }, { requireCore: true });
    expect(row.full_name).toBe('أحمد علي');
    expect(row.account_status).toBe('active');
  });

  it('rejects unknown gender and bad date', () => {
    expect(() => parseSharedProfile({ full_name: 'A', gender: 'x' })).toThrow(/gender/i);
    expect(() => parseSharedProfile({ full_name: 'Ahmad Ali', birth_date: '15-01-2004' })).toThrow(/Birth date/);
  });
});

describe('student profile', () => {
  it('defaults admission and academic status and keeps GPA out of the payload', () => {
    const row = parseStudentProfile({ department_id: 1, study_year: 2, major: 'CE' }, 1);
    expect(row.admission_type).toBe('general');
    expect(row.academic_status).toBe('new');
    expect(row.college_id).toBe(1);
    expect(row).not.toHaveProperty('gpa');
  });

  it('rejects invalid admission type', () => {
    expect(() => parseStudentProfile({ admission_type: 'vip' }, 1)).toThrow(/admission/i);
  });
});

describe('role-specific profiles', () => {
  it('maps roles to faculty, ta, or staff files', () => {
    expect(profileKindForRole('instructor')).toBe('faculty');
    expect(profileKindForRole('department_head')).toBe('faculty');
    expect(profileKindForRole('teaching_assistant')).toBe('ta');
    expect(profileKindForRole('exams_office')).toBe('staff');
    expect(profileKindForRole('student_affairs')).toBe('staff');
    expect(profileKindForRole('student')).toBe('student');
  });

  it('parses faculty rank and contract', () => {
    const row = parseFacultyProfile({ academic_rank: 'professor', contract_type: 'permanent', teaching_load_hours: 12 });
    expect(row.academic_rank).toBe('professor');
    expect(row.teaching_load_hours).toBe(12);
    expect(() => parseFacultyProfile({ academic_rank: 'intern' })).toThrow(/rank/i);
  });

  it('parses TA postgraduate flag and staff permissions', () => {
    expect(parseTaProfile({ postgraduate_studying: true, bachelor_gpa: 85 }).postgraduate_studying).toBe(1);
    const staff = parseStaffProfile({ job_title: 'Exams clerk', access_permissions: ['enter_grades', 'print_cards'] }, 1);
    expect(staff.access_permissions).toBe('enter_grades,print_cards');
    expect(staff.college_id).toBe(1);
    expect(() => parseStaffProfile({ access_permissions: ['hack'] }, 1)).toThrow(/permission/i);
  });
});
