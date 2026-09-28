import { describe, it, expect } from 'vitest';
import { withdrawalWindowStatus, formatWindowTime } from './withdrawalWindowStatus.js';

const now = new Date('2026-10-01T12:00:00Z');

describe('withdrawalWindowStatus', () => {
  it('is scheduled before it opens', () => {
    expect(withdrawalWindowStatus({ opens_at: '2026-10-02T00:00:00Z', closes_at: '2026-10-05T00:00:00Z' }, now)).toBe('scheduled');
  });

  it('is open between open and close', () => {
    expect(withdrawalWindowStatus({ opens_at: '2026-09-30T00:00:00Z', closes_at: '2026-10-05T00:00:00Z' }, now)).toBe('open');
  });

  it('is open without a close date', () => {
    expect(withdrawalWindowStatus({ opens_at: '2026-09-30T00:00:00Z', closes_at: null }, now)).toBe('open');
  });

  it('is closed after the close date', () => {
    expect(withdrawalWindowStatus({ opens_at: '2026-09-01T00:00:00Z', closes_at: '2026-09-05T00:00:00Z' }, now)).toBe('closed');
  });
});

describe('formatWindowTime', () => {
  it('returns a dash for empty values', () => {
    expect(formatWindowTime(null)).toBe('—');
  });

  it('formats as local date and time', () => {
    const local = new Date(2026, 9, 3, 8, 5);
    expect(formatWindowTime(local.toISOString())).toBe('2026-10-03 08:05');
  });
});
