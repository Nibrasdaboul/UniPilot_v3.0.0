import { describe, it, expect } from 'vitest';
import { isWithdrawnW, isCancelledRegistration } from './courseWithdrawal.js';

describe('courseWithdrawal', () => {
  it('detects official W from the server flag', () => {
    expect(isWithdrawnW({ withdrawn_w: true })).toBe(true);
  });

  it('detects official W from the withdrawal time', () => {
    expect(isWithdrawnW({ withdrawn: 1, withdrawn_at: '2026-09-27T20:00:00Z' })).toBe(true);
  });

  it('treats withdrawn without time as a cancelled registration', () => {
    const course = { withdrawn: 1, withdrawn_at: null };
    expect(isWithdrawnW(course)).toBe(false);
    expect(isCancelledRegistration(course)).toBe(true);
  });

  it('normal course is neither', () => {
    const course = { withdrawn: 0 };
    expect(isWithdrawnW(course)).toBe(false);
    expect(isCancelledRegistration(course)).toBe(false);
  });
});
