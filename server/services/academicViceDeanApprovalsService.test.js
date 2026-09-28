import { describe, it, expect } from 'vitest';
import { isVdaApprovalKind, parseVdaDecision, VDA_APPROVAL_KINDS } from './academicViceDeanApprovalsService.js';

describe('academic vice dean approvals', () => {
  it('has exam, grade, and curriculum kinds only', () => {
    expect(VDA_APPROVAL_KINDS.map((k) => k.key)).toEqual(['exams', 'grades', 'curriculum']);
    expect(isVdaApprovalKind('exams')).toBe(true);
    expect(isVdaApprovalKind('leave')).toBe(false);
  });

  it('accepts only approve or reject', () => {
    expect(parseVdaDecision('approved')).toBe('approved');
    expect(parseVdaDecision('rejected')).toBe('rejected');
    expect(parseVdaDecision('maybe')).toBe(null);
  });
});
