import { describe, it, expect } from 'vitest';
import {
  isProjectKind,
  normalizeProjectKind,
  requestHoursForKind,
  canOpenProjectTrack,
  parseProjectDecision,
  parseStudentRequestDecision,
  parseCommitteeMembers,
  parseProjectTeamMembers,
  parseProjectMinHours,
  canSubmitProjectRequest,
  evaluateStudentProjectTrack,
} from './research.js';

describe('research and graduation helpers', () => {
  it('accepts the college project chain and maps leftover kinds', () => {
    expect(isProjectKind('term')).toBe(true);
    expect(isProjectKind('graduation_1')).toBe(true);
    expect(isProjectKind('graduation_2')).toBe(true);
    expect(isProjectKind('bachelor')).toBe(false);
    expect(normalizeProjectKind('bachelor')).toBe('graduation_1');
    expect(normalizeProjectKind('master')).toBe('graduation_2');
    expect(isProjectKind('phd')).toBe(false);
  });

  it('reads a separate hour threshold for each project course', () => {
    const tracks = [
      { kind: 'term', request_min_hours: 90 },
      { kind: 'graduation_1', request_min_hours: 110 },
      { kind: 'graduation_2', request_min_hours: 130 },
    ];
    expect(requestHoursForKind(tracks, 'term')).toBe(90);
    expect(requestHoursForKind(tracks, 'graduation_1')).toBe(110);
    expect(requestHoursForKind(tracks, 'graduation_2')).toBe(130);
  });

  it('opens the chain only after the previous project course is passed', () => {
    expect(canOpenProjectTrack({ kind: 'term', passedKinds: [] })).toBe(true);
    expect(canOpenProjectTrack({ kind: 'graduation_1', passedKinds: [] })).toBe(false);
    expect(canOpenProjectTrack({ kind: 'graduation_1', passedKinds: ['term'] })).toBe(true);
    expect(canOpenProjectTrack({ kind: 'graduation_2', passedKinds: ['term'] })).toBe(false);
    expect(canOpenProjectTrack({ kind: 'graduation_2', passedKinds: ['term', 'graduation_1'] })).toBe(true);
  });

  it('parses approve or reject only', () => {
    expect(parseProjectDecision('approved')).toBe('approved');
    expect(parseProjectDecision('rejected')).toBe('rejected');
    expect(parseProjectDecision('maybe')).toBe(null);
  });

  it('lets the vice dean approve, reject, or return a student project request', () => {
    expect(parseStudentRequestDecision('approved')).toBe('approved');
    expect(parseStudentRequestDecision('rejected')).toBe('rejected');
    expect(parseStudentRequestDecision('returned')).toBe('returned');
    expect(parseStudentRequestDecision('maybe')).toBe(null);
  });

  it('accepts a whole-hour project threshold between 0 and 250', () => {
    expect(parseProjectMinHours(90)).toBe(90);
    expect(parseProjectMinHours(0)).toBe(0);
    expect(parseProjectMinHours(250)).toBe(250);
    expect(parseProjectMinHours(-1)).toBe(null);
    expect(parseProjectMinHours(90.5)).toBe(null);
    expect(parseProjectMinHours('x')).toBe(null);
  });

  it('blocks a project request until completed hours meet the vice dean threshold', () => {
    expect(canSubmitProjectRequest({ completedHours: 89, requiredHours: 90 })).toBe(false);
    expect(canSubmitProjectRequest({ completedHours: 90, requiredHours: 90 })).toBe(true);
    expect(canSubmitProjectRequest({ completedHours: 110, requiredHours: 90 })).toBe(true);
  });

  it('keeps graduation 2 closed until graduation 1 is passed even if hours are enough', () => {
    const hoursOk = { completedHours: 130, requiredHours: 90, passedKinds: [] };
    expect(evaluateStudentProjectTrack({ kind: 'term', ...hoursOk }).can_request).toBe(true);
    expect(evaluateStudentProjectTrack({ kind: 'graduation_1', ...hoursOk }).lock_reason).toBe('chain');
    expect(evaluateStudentProjectTrack({
      kind: 'graduation_1',
      ...hoursOk,
      passedKinds: ['term'],
    }).can_request).toBe(true);
    expect(evaluateStudentProjectTrack({
      kind: 'graduation_2',
      ...hoursOk,
      passedKinds: ['term'],
    }).lock_reason).toBe('chain');
    expect(evaluateStudentProjectTrack({
      kind: 'graduation_2',
      ...hoursOk,
      passedKinds: ['term', 'graduation_1'],
    }).can_request).toBe(true);
    expect(evaluateStudentProjectTrack({
      kind: 'term',
      ...hoursOk,
      windowOpen: false,
    }).lock_reason).toBe('window');
  });

  it('keeps named committee members and drops empty rows', () => {
    expect(parseCommitteeMembers([
      { full_name: 'د. سامي', committee_role: 'chair' },
      { name: '  ' },
      { full_name: 'م. ليلى', committee_role: 'unknown' },
    ])).toEqual([
      { full_name: 'د. سامي', committee_role: 'chair', user_id: null },
      { full_name: 'م. ليلى', committee_role: 'member', user_id: null },
    ]);
  });

  it('requires a matching team of 1 to 8 students with ID, GPA, and hours', () => {
    const ok = parseProjectTeamMembers([
      { full_name: 'أحمد', university_id: '0260000003', gpa: 78.5, completed_hours: 92 },
      { name: 'ليلى', person_code: '0260000004', gpa: 81, completed_hours: 90 },
    ], 2);
    expect(ok.error).toBe(null);
    expect(ok.team_size).toBe(2);
    expect(ok.members).toEqual([
      { full_name: 'أحمد', university_id: '0260000003', gpa: 78.5, completed_hours: 92 },
      { full_name: 'ليلى', university_id: '0260000004', gpa: 81, completed_hours: 90 },
    ]);
    expect(parseProjectTeamMembers(ok.members, 1).error).toMatch(/match/i);
    expect(parseProjectTeamMembers([{ full_name: 'أ', university_id: '123', gpa: 70, completed_hours: 10 }], 1).error).toMatch(/10-digit/i);
    expect(parseProjectTeamMembers([], 9).error).toMatch(/1 to 8/i);
  });
});
