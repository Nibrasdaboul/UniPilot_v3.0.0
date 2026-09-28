import { describe, it, expect } from 'vitest';
import { legalLoadHours, loadStatus, VDA_DEFAULT_LOAD } from './academicViceDeanStaffService.js';

describe('academic vice dean teaching load', () => {
  it('uses stored legal hours and defaults by role', () => {
    expect(legalLoadHours('instructor', 10)).toBe(10);
    expect(legalLoadHours('instructor', null)).toBe(VDA_DEFAULT_LOAD.instructor);
    expect(legalLoadHours('teaching_assistant', '')).toBe(VDA_DEFAULT_LOAD.teaching_assistant);
  });

  it('flags overload, underload, and unassigned', () => {
    expect(loadStatus({ assigned: 16, legal: 12 })).toBe('overload');
    expect(loadStatus({ assigned: 12, legal: 12 })).toBe('ok');
    expect(loadStatus({ assigned: 6, legal: 12 })).toBe('underload');
    expect(loadStatus({ assigned: 0, legal: 12 })).toBe('unassigned');
    expect(loadStatus({ assigned: 3, legal: null })).toBe('unspecified');
  });
});
