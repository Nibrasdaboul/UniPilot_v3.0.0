import { describe, it, expect } from 'vitest';
import {
  SPECIALIZATION_MIN_HOURS,
  isSpecializationCode,
  evaluateSpecializationRequest,
  parseSpecializationDecision,
  parseSpecializationMinHours,
} from './specialization.js';

describe('specialization requests', () => {
  it('allows only the three official majors', () => {
    expect(isSpecializationCode('SE')).toBe(true);
    expect(isSpecializationCode('NE')).toBe(true);
    expect(isSpecializationCode('AI')).toBe(true);
    expect(isSpecializationCode('PRE')).toBe(false);
  });

  it('uses 110 as the default threshold and accepts a vice dean override', () => {
    expect(SPECIALIZATION_MIN_HOURS).toBe(110);
    expect(parseSpecializationMinHours(80)).toBe(80);
    expect(parseSpecializationMinHours(250)).toBe(250);
    expect(parseSpecializationMinHours(-1)).toBe(null);
    expect(parseSpecializationMinHours(80.5)).toBe(null);
    expect(evaluateSpecializationRequest({
      completedHours: 109,
      currentDepartmentCode: 'PRE',
    }).lock_reason).toBe('hours');
    expect(evaluateSpecializationRequest({
      completedHours: 80,
      requiredHours: 80,
      currentDepartmentCode: 'PRE',
    }).can_request).toBe(true);
    expect(evaluateSpecializationRequest({
      completedHours: 80,
      requiredHours: 90,
      currentDepartmentCode: 'PRE',
    }).lock_reason).toBe('hours');
    expect(evaluateSpecializationRequest({
      completedHours: 110,
      currentDepartmentCode: 'PRE',
    }).can_request).toBe(true);
    expect(evaluateSpecializationRequest({
      completedHours: 110,
      currentDepartmentCode: 'PRE',
      windowOpen: false,
    }).lock_reason).toBe('window');
  });

  it('blocks a second request while one is pending or already assigned', () => {
    expect(evaluateSpecializationRequest({
      completedHours: 120,
      currentDepartmentCode: 'PRE',
      latestStatus: 'pending',
    }).lock_reason).toBe('pending');
    expect(evaluateSpecializationRequest({
      completedHours: 120,
      currentDepartmentCode: 'AI',
    }).lock_reason).toBe('assigned');
  });

  it('lets the vice dean approve or reject only', () => {
    expect(parseSpecializationDecision('approved')).toBe('approved');
    expect(parseSpecializationDecision('rejected')).toBe('rejected');
    expect(parseSpecializationDecision('returned')).toBe(null);
  });
});
