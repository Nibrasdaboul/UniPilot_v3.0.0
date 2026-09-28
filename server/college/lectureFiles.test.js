import { describe, it, expect } from 'vitest';
import { parseLectureKind, parseLectureTitle, parseReviewDecision } from './lectureFiles.js';

describe('lecture file helpers', () => {
  it('accepts theory or practical titles', () => {
    expect(parseLectureKind('theory').kind).toBe('theory');
    expect(parseLectureKind('practical').kind).toBe('practical');
    expect(parseLectureKind('lab').error).toMatch(/theory or practical/);
    expect(parseLectureTitle('محاضرة 1').title).toBe('محاضرة 1');
    expect(parseLectureTitle('').error).toMatch(/required/);
  });

  it('requires a note only when rejecting', () => {
    expect(parseReviewDecision({ decision: 'approve' }).status).toBe('approved');
    expect(parseReviewDecision({ decision: 'reject' }).error).toMatch(/rejection note/);
    expect(parseReviewDecision({ decision: 'reject', note: 'الملف غير واضح' }).status).toBe('rejected');
  });
});
