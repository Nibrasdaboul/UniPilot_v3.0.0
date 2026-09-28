export const SPECIALIZATION_MIN_HOURS = 110;
export const SPECIALIZATION_MIN_HOURS_MAX = 250;
export const SPECIALIZATION_CODES = ['SE', 'NE', 'AI'];

export function parseSpecializationMinHours(value) {
  const hours = Number(value);
  if (!Number.isFinite(hours) || !Number.isInteger(hours) || hours < 0 || hours > SPECIALIZATION_MIN_HOURS_MAX) {
    return null;
  }
  return hours;
}

export function isSpecializationCode(code) {
  return SPECIALIZATION_CODES.includes(String(code || '').toUpperCase());
}

export function evaluateSpecializationRequest({
  completedHours,
  requiredHours = SPECIALIZATION_MIN_HOURS,
  currentDepartmentCode = null,
  latestStatus = null,
  windowOpen = true,
}) {
  const hoursMet = Number(completedHours) >= Number(requiredHours);
  const assigned = isSpecializationCode(currentDepartmentCode) || latestStatus === 'approved';
  if (assigned) {
    return { can_request: false, hours_met: hoursMet, lock_reason: 'assigned' };
  }
  if (!hoursMet) {
    return { can_request: false, hours_met: false, lock_reason: 'hours' };
  }
  if (latestStatus === 'pending') {
    return { can_request: false, hours_met: true, lock_reason: 'pending' };
  }
  if (!windowOpen) {
    return { can_request: false, hours_met: true, lock_reason: 'window' };
  }
  return { can_request: true, hours_met: true, lock_reason: null };
}

export function parseSpecializationDecision(value) {
  const decision = String(value || '').trim();
  if (decision !== 'approved' && decision !== 'rejected') return null;
  return decision;
}

export function specializationLockMessage(reason, requiredHours = SPECIALIZATION_MIN_HOURS) {
  if (reason === 'hours') return `Complete ${requiredHours} credit hours before requesting a specialization`;
  if (reason === 'pending') return 'A specialization request is already awaiting review';
  if (reason === 'assigned') return 'Specialization is already assigned';
  if (reason === 'window') return 'Project and specialization requests can only be submitted during the vice dean window';
  return 'Cannot request specialization';
}
