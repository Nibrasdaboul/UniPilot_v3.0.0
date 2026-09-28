import { describe, it, expect } from 'vitest';
import { buildSessionHints } from './staffSessionHints';

const session = (over) => ({
  catalog_course_id: 5,
  session_date: '2027-01-22',
  status: 'scheduled',
  actions: { can_check_in: false },
  requests: [],
  ...over,
});

describe('buildSessionHints', () => {
  it('picks the open session, the next upcoming one and counts pending requests per course', () => {
    const hints = buildSessionHints({
      now: '2027-01-22T08:05',
      sessions: [
        session({ id: 1, session_date: '2027-01-15', status: 'absent', requests: [{ status: 'pending' }, { status: 'rejected' }] }),
        session({ id: 2, actions: { can_check_in: true } }),
        session({ id: 3, session_date: '2027-01-29' }),
        session({ id: 4, session_date: '2027-02-05' }),
        session({ id: 9, catalog_course_id: 7, session_date: '2027-01-24' }),
      ],
    });
    expect(hints.get(5).now.id).toBe(2);
    expect(hints.get(5).next.id).toBe(3);
    expect(hints.get(5).pending).toBe(1);
    expect(hints.get(7)).toEqual({ now: null, next: expect.objectContaining({ id: 9 }), pending: 0 });
  });

  it('ignores past scheduled sessions and sessions without a course', () => {
    const hints = buildSessionHints({
      now: '2027-01-22T08:05',
      sessions: [session({ id: 1, session_date: '2027-01-15' }), session({ id: 2, catalog_course_id: null })],
    });
    expect(hints.get(5)).toEqual({ now: null, next: null, pending: 0 });
    expect(hints.size).toBe(1);
  });
});
