import { describe, it, expect } from 'vitest';
import { pickWithdrawalWindow } from './withdrawalWindow.js';

const now = new Date('2026-10-01T12:00:00Z');

describe('pickWithdrawalWindow', () => {
  it('is closed when there are no windows', () => {
    expect(pickWithdrawalWindow([], now)).toEqual({ window: null, open: false });
  });

  it('picks the open window', () => {
    const past = { id: 1, opens_at: '2026-09-01T00:00:00Z', closes_at: '2026-09-10T00:00:00Z' };
    const live = { id: 2, opens_at: '2026-09-30T00:00:00Z', closes_at: '2026-10-05T00:00:00Z' };
    expect(pickWithdrawalWindow([past, live], now)).toEqual({ window: live, open: true });
  });

  it('treats a window without close date as open after it starts', () => {
    const live = { id: 3, opens_at: '2026-09-30T00:00:00Z', closes_at: null };
    expect(pickWithdrawalWindow([live], now).open).toBe(true);
  });

  it('returns the latest window as closed when none is open', () => {
    const older = { id: 1, opens_at: '2026-08-01T00:00:00Z', closes_at: '2026-08-05T00:00:00Z' };
    const newer = { id: 2, opens_at: '2026-09-01T00:00:00Z', closes_at: '2026-09-05T00:00:00Z' };
    const future = { id: 3, opens_at: '2026-11-01T00:00:00Z', closes_at: null };
    const picked = pickWithdrawalWindow([older, newer, future], now);
    expect(picked.open).toBe(false);
    expect(picked.window.id).toBe(3);
  });
});
