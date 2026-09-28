import { describe, it, expect } from 'vitest';
import { halfHourSlots, meetingFillsSlot, buildPickerGrid, buildWeeklyProgramGrid, PICKER_DAYS, meetingsOverlap, findPickerClashes, formatClashMessage } from './sectionPicker.js';

describe('section picker grid', () => {
  it('builds half-hour slots from 8:00 to 16:30', () => {
    const slots = halfHourSlots();
    expect(slots[0].label).toBe('8:00-8:30');
    expect(slots.at(-1).label).toBe('16:00-16:30');
  });

  it('paints theory and practical letters on matching days', () => {
    const saturday = PICKER_DAYS[0];
    const slots = halfHourSlots();
    const grid = buildPickerGrid({
      slots,
      placements: [
        {
          kind: 'practical',
          color: '#eab308',
          course_code: 'CHEM',
          day_of_week: 6,
          start_time: '08:00',
          end_time: '09:30',
        },
        {
          kind: 'theory',
          color: '#22d3ee',
          course_code: 'ENG',
          weekday: 'friday',
          start_time: '08:00',
          end_time: '09:00',
        },
      ],
    });
    expect(grid.cells.saturday[0]).toEqual({ letter: 'ع', color: '#eab308', course_code: 'CHEM' });
    expect(grid.cells.saturday[2]).toEqual({ letter: 'ع', color: '#eab308', course_code: 'CHEM' });
    expect(grid.cells.friday[0].letter).toBe('ن');
    expect(meetingFillsSlot({ day_of_week: 0, start_time: '10:00', end_time: '12:00' }, slots[4], saturday)).toBe(false);
  });

  it('detects overlapping sections on the same day and names them', () => {
    const a = {
      section_id: 16, section_code: 'T1', course_code: 'c32SQ123', kind: 'theory',
      day_of_week: 5, start_time: '08:00', end_time: '10:00',
    };
    const b = {
      section_id: 19, section_code: 'T3', course_code: 'RQT123', kind: 'theory',
      weekday: 'friday', start_time: '08:30', end_time: '10:00',
    };
    const c = {
      section_id: 17, section_code: 'T2', course_code: 'RQT123', kind: 'theory',
      day_of_week: 6, start_time: '10:00', end_time: '12:00',
    };
    expect(meetingsOverlap(a, b)).toBe(true);
    expect(meetingsOverlap(a, c)).toBe(false);
    const clashes = findPickerClashes([a, b, c]);
    expect(clashes).toHaveLength(1);
    expect(formatClashMessage(clashes, true)).toContain('c32SQ123 T1');
    expect(formatClashMessage(clashes, true)).toContain('RQT123 T3');
    expect(formatClashMessage(clashes, true)).toContain('الجمعة');
  });

  it('merges consecutive half-hour slots into one weekly block', () => {
    const grid = buildWeeklyProgramGrid({
      placements: [{
        section_id: 16,
        kind: 'theory',
        color: '#eab308',
        course_code: 'c32SQ123',
        course_name: 'Intro',
        section_code: 'T1',
        staff_name: 'Dr A',
        room_number: 'قاعة 1',
        day_of_week: 5,
        start_time: '08:00',
        end_time: '10:00',
      }],
    });
    expect(grid.cells.friday[0]).toMatchObject({ type: 'block', span: 4, course_code: 'c32SQ123', section_code: 'T1', room_number: 'قاعة 1' });
    expect(grid.cells.friday[1].type).toBe('skip');
    expect(grid.cells.friday[3].type).toBe('skip');
    expect(grid.cells.friday[4].type).toBe('empty');
    expect(grid.cells.saturday[0].type).toBe('empty');
    expect(grid.cells.friday[0].withdrawn).toBe(false);
  });

  it('flags blocks of withdrawn courses', () => {
    const grid = buildWeeklyProgramGrid({
      placements: [{
        section_id: 9,
        kind: 'practical',
        color: '#d4d4d8',
        course_code: 'RQT123',
        section_code: 'P1',
        day_of_week: 6,
        start_time: '08:00',
        end_time: '09:00',
        withdrawn: true,
      }],
    });
    expect(grid.cells.saturday[0]).toMatchObject({ type: 'block', span: 2, withdrawn: true });
  });
});
