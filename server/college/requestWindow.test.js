import { describe, it, expect } from 'vitest';
import { parseRequestWindow, evaluateRequestWindow } from './requestWindow.js';

describe('shared request window', () => {
  it('requires both dates or an explicit clear', () => {
    expect(parseRequestWindow('', '', { clear: true })).toEqual({ error: null, start: null, end: null });
    expect(parseRequestWindow('2026-09-24T10:00:00.000Z', '').error).toMatch(/Both window/i);
    const ok = parseRequestWindow('2026-09-24T10:00:00.000Z', '2026-09-25T10:00:00.000Z');
    expect(ok.error).toBe(null);
    expect(ok.start).toBe('2026-09-24T10:00:00.000Z');
    expect(parseRequestWindow('2026-09-25T10:00:00.000Z', '2026-09-24T10:00:00.000Z').error).toMatch(/after start/i);
  });

  it('is closed when unset, before start, or after end', () => {
    expect(evaluateRequestWindow({}).open).toBe(false);
    expect(evaluateRequestWindow({}).configured).toBe(false);
    const start = '2026-09-24T10:00:00.000Z';
    const end = '2026-09-24T12:00:00.000Z';
    expect(evaluateRequestWindow({ start, end, now: new Date('2026-09-24T09:59:00.000Z') }).open).toBe(false);
    expect(evaluateRequestWindow({ start, end, now: new Date('2026-09-24T11:00:00.000Z') }).open).toBe(true);
    expect(evaluateRequestWindow({ start, end, now: new Date('2026-09-24T12:01:00.000Z') }).open).toBe(false);
  });
});
