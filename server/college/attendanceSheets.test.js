import { describe, it, expect } from 'vitest';
import {
  normalizeAttendanceSheetStatus,
  staffCanEditAttendance,
  examsCanEditAttendance,
  publicAttendanceSheet,
} from './attendanceSheets.js';

describe('attendance sheet pipeline', () => {
  it('locks staff after submit and exams after adopt', () => {
    expect(normalizeAttendanceSheetStatus('awaiting_vda')).toBe('awaiting_vda');
    expect(staffCanEditAttendance('staff_draft')).toBe(true);
    expect(staffCanEditAttendance('at_exams')).toBe(false);
    expect(examsCanEditAttendance('at_exams')).toBe(true);
    expect(examsCanEditAttendance('staff_review')).toBe(false);
  });

  it('exposes adopt, confirm, publish, and cancel on the matching step', () => {
    expect(publicAttendanceSheet({ status: 'at_exams' }, { canAdopt: true }).can_adopt).toBe(true);
    expect(publicAttendanceSheet({ status: 'staff_review' }, { canConfirm: true }).can_confirm).toBe(true);
    const vda = publicAttendanceSheet({ status: 'awaiting_vda' }, { canPublish: true, canCancel: true });
    expect(vda.can_publish).toBe(true);
    expect(vda.can_cancel).toBe(true);
  });
});
