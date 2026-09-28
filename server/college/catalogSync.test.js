import { describe, it, expect } from 'vitest';
import { normalizeCourseCode } from './catalogSync.js';

describe('college catalog sync', () => {
  it('matches official and catalog course codes case-insensitively', () => {
    expect(normalizeCourseCode('CE101')).toBe('ce101');
    expect(normalizeCourseCode(' ce101 ')).toBe('ce101');
    expect(normalizeCourseCode('CE101')).toBe(normalizeCourseCode('ce101'));
    expect(normalizeCourseCode('')).toBe('');
  });
});
