import { describe, it, expect } from 'vitest';
import { isPassedCourse, subjectTreeActionKind } from './subjectTreeAction.js';

describe('subjectTreeActionKind', () => {
  it('uses Open for a course registered this term', () => {
    expect(subjectTreeActionKind({
      unlocked: true,
      currentTermEnrolled: true,
      pastCompleted: true,
      windowOpen: false,
    })).toBe('open');
  });

  it('marks a past completed course as already completed', () => {
    expect(subjectTreeActionKind({
      unlocked: true,
      currentTermEnrolled: false,
      pastCompleted: true,
      windowOpen: true,
    })).toBe('completed');
  });

  it('shows enroll from registration while the window is open', () => {
    expect(subjectTreeActionKind({
      unlocked: true,
      currentTermEnrolled: false,
      pastCompleted: false,
      windowOpen: true,
    })).toBe('enroll');
  });

  it('shows closed after the window closes', () => {
    expect(subjectTreeActionKind({
      unlocked: true,
      currentTermEnrolled: false,
      pastCompleted: false,
      windowOpen: false,
    })).toBe('closed');
  });

  it('keeps a prerequisite lock when the course is not taken', () => {
    expect(subjectTreeActionKind({
      unlocked: false,
      currentTermEnrolled: false,
      pastCompleted: false,
      windowOpen: true,
    })).toBe('locked');
  });

  it('treats passed=1 as completed', () => {
    expect(isPassedCourse({ passed: 1 })).toBe(true);
    expect(isPassedCourse({ passed: 0 })).toBe(false);
  });
});
