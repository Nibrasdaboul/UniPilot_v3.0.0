import { describe, it, expect } from 'vitest';
import { universityIdMatches, createAttemptLimiter } from './withdrawalGuard.js';

describe('universityIdMatches', () => {
  it('matches the account university id ignoring spaces', () => {
    expect(universityIdMatches({ person_code: '0260000003' }, ' 0260 000003 ')).toBe(true);
  });

  it('rejects another student id', () => {
    expect(universityIdMatches({ person_code: '0260000003' }, '0260000004')).toBe(false);
  });

  it('rejects empty input', () => {
    expect(universityIdMatches({ person_code: '0260000003' }, '')).toBe(false);
  });
});

describe('createAttemptLimiter', () => {
  it('locks after max failures and unlocks after the window', () => {
    const limiter = createAttemptLimiter({ max: 3, windowMs: 1000 });
    expect(limiter.isLocked(1, 0)).toBe(false);
    limiter.fail(1, 0);
    limiter.fail(1, 10);
    expect(limiter.isLocked(1, 20)).toBe(false);
    limiter.fail(1, 20);
    expect(limiter.isLocked(1, 30)).toBe(true);
    expect(limiter.isLocked(1, 1100)).toBe(false);
  });

  it('reset clears failures', () => {
    const limiter = createAttemptLimiter({ max: 1, windowMs: 1000 });
    limiter.fail(7, 0);
    expect(limiter.isLocked(7, 1)).toBe(true);
    limiter.reset(7);
    expect(limiter.isLocked(7, 2)).toBe(false);
  });
});
