import { describe, it, expect } from 'vitest';
import { guideKeyForRole, systemPromptFor } from './userGuide.js';

describe('role user guides', () => {
  it('dean and academic vice dean use separate guide keys from students', () => {
    expect(guideKeyForRole('dean')).toBe('dean');
    expect(guideKeyForRole('vice_dean_academic')).toBe('vice_dean_academic');
    expect(guideKeyForRole('student')).toBe('student');
    expect(guideKeyForRole('student_affairs')).toBe('student');
  });

  it('dean system prompt covers oversight pages and not student study tools', () => {
    const ar = systemPromptFor('dean', 'ar');
    const en = systemPromptFor('dean', 'en');
    expect(ar).toContain('عميد');
    expect(ar).toContain('الموافقات');
    expect(ar).toContain('شؤون الطلاب');
    expect(ar).not.toContain('البطاقات التعليمية');
    expect(en).toContain('Dean');
    expect(en).toContain('Approvals');
    expect(en).toContain('Do not explain student study tools');
  });

  it('academic vice dean prompt covers approvals and not student study tools', () => {
    const ar = systemPromptFor('vice_dean_academic', 'ar');
    const en = systemPromptFor('vice_dean_academic', 'en');
    expect(ar).toContain('نائب العميد للشؤون الأكاديمية');
    expect(ar).toContain('أعمال السنة');
    expect(ar).toContain('/research');
    expect(ar).toContain('/course-info');
    expect(ar).not.toContain('البطاقات التعليمية');
    expect(en).toContain('Vice Dean for Academic Affairs');
    expect(en).toContain('Do not explain student study tools');
    expect(en).toContain('Academic Vice Dean pages only');
  });

  it('student system prompt stays on study features', () => {
    const ar = systemPromptFor('student', 'ar');
    expect(ar).toContain('أدوات الدراسة');
    expect(ar).not.toContain('صفحات العميد');
    expect(ar).not.toContain('النائب الأكاديمي');
  });
});
