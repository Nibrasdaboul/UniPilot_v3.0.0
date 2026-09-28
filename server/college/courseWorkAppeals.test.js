import { describe, it, expect } from 'vitest';
import {
  parseAppealReason,
  parseAppealDecision,
  appealActionForComponent,
  publicAppeal,
} from './courseWorkAppeals.js';

describe('course work appeals', () => {
  it('requires a short reason and accept/reject', () => {
    expect(parseAppealReason('no').error).toMatch(/5 characters/);
    expect(parseAppealReason('العلامة غير صحيحة').reason).toMatch(/غير صحيحة/);
    expect(parseAppealDecision('accept').decision).toBe('accepted');
    expect(parseAppealDecision('reject').decision).toBe('rejected');
    expect(parseAppealDecision('maybe').error).toMatch(/accept or reject/);
  });

  it('allows one unused appeal and locks used ones', () => {
    expect(appealActionForComponent(null).can_appeal).toBe(true);
    expect(publicAppeal({ status: 'pending' }).label_ar).toBe('قيد المراجعة');
    expect(publicAppeal({ status: 'rejected' }).tone).toBe('danger');
    expect(publicAppeal({ status: 'rejected' }).label_ar).toBe('العلامة صحيحة');
    expect(publicAppeal({ status: 'accepted' }).can_appeal).toBe(false);
  });
});
