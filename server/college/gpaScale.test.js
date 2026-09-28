import { describe, it, expect } from 'vitest';
import { DEFAULT_GPA_SCALE, parseGpaScaleRows, lookupGpaScale } from './gpaScale.js';

describe('college GPA scale', () => {
  it('maps the vice-dean examples', () => {
    expect(lookupGpaScale(DEFAULT_GPA_SCALE, 100)).toEqual({ points: 4, letter: 'A+' });
    expect(lookupGpaScale(DEFAULT_GPA_SCALE, 97)).toEqual({ points: 4, letter: 'A+' });
    expect(lookupGpaScale(DEFAULT_GPA_SCALE, 95)).toEqual({ points: 3.75, letter: 'A+' });
    expect(lookupGpaScale(DEFAULT_GPA_SCALE, 90)).toEqual({ points: 3.5, letter: 'A-' });
    expect(lookupGpaScale(DEFAULT_GPA_SCALE, 94)).toEqual({ points: 3.5, letter: 'A-' });
  });

  it('rejects overlapping ranges', () => {
    const parsed = parseGpaScaleRows([
      { min_mark: 90, max_mark: 100, points: 4, letter: 'A+' },
      { min_mark: 95, max_mark: 96, points: 3.75, letter: 'A+' },
    ]);
    expect(parsed.error).toMatch(/overlap/i);
  });

  it('accepts a valid replacement scale', () => {
    const parsed = parseGpaScaleRows(DEFAULT_GPA_SCALE);
    expect(parsed.error).toBeNull();
    expect(parsed.rows[0].letter).toBe('A+');
  });
});
