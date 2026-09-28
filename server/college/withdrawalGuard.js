import { normalizeUniversityId } from './universityId.js';

export const WITHDRAW_MAX_FAILED_ATTEMPTS = 5;
export const WITHDRAW_LOCK_MS = 15 * 60 * 1000;

export function universityIdMatches(user, universityId) {
  const typed = normalizeUniversityId(universityId);
  const own = normalizeUniversityId(user?.person_code);
  return Boolean(typed) && Boolean(own) && typed === own;
}

export function createAttemptLimiter({ max = WITHDRAW_MAX_FAILED_ATTEMPTS, windowMs = WITHDRAW_LOCK_MS } = {}) {
  const failures = new Map();
  const recent = (key, now) => (failures.get(key) || []).filter((t) => now - t < windowMs);
  return {
    isLocked(key, now = Date.now()) {
      return recent(key, now).length >= max;
    },
    fail(key, now = Date.now()) {
      const list = recent(key, now);
      list.push(now);
      failures.set(key, list);
      return max - list.length;
    },
    reset(key) {
      failures.delete(key);
    },
  };
}
