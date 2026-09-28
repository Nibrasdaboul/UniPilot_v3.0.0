/**
 * Pure registration-window rules. No database.
 * Students may add/drop only while a matching window is open and they meet its thresholds.
 */

export function isWindowOpen(window, now = new Date()) {
  if (!window?.opens_at) return false;
  const t = now instanceof Date ? now : new Date(now);
  const opens = new Date(window.opens_at);
  if (Number.isNaN(opens.getTime()) || t < opens) return false;
  if (!window.closes_at) return true;
  const closes = new Date(window.closes_at);
  if (Number.isNaN(closes.getTime())) return true;
  return t <= closes;
}

export function studentYearLevel(enrollmentYear, now = new Date()) {
  if (enrollmentYear == null || enrollmentYear === '') return null;
  const year = Number(enrollmentYear);
  if (!Number.isFinite(year) || year < 1900) return null;
  const current = now instanceof Date ? now.getFullYear() : new Date(now).getFullYear();
  return current - year + 1;
}

export function isEligibleForWindow(window, stats = {}) {
  if (!window) return false;
  const completed = Number(stats.completedCredits || 0);
  const gpa = Number(stats.gpa || 0);
  const yearLevel = stats.yearLevel == null || stats.yearLevel === '' ? null : Number(stats.yearLevel);
  if (Number(window.min_completed_credits || 0) > completed) return false;
  if (Number(window.min_semester_gpa || 0) > gpa) return false;
  if (window.year_level != null && window.year_level !== '' && yearLevel != null) {
    if (Number(window.year_level) !== yearLevel) return false;
  }
  return true;
}

export function eligibilityReasons(window, stats = {}, now = new Date()) {
  if (!window) return ['No registration window is open for this term.'];
  if (!isWindowOpen(window, now)) return ['The registration window is closed.'];
  const reasons = [];
  const completed = Number(stats.completedCredits || 0);
  const gpa = Number(stats.gpa || 0);
  const yearLevel = stats.yearLevel == null || stats.yearLevel === '' ? null : Number(stats.yearLevel);
  const minCredits = Number(window.min_completed_credits || 0);
  const minGpa = Number(window.min_semester_gpa || 0);
  if (minCredits > completed) {
    reasons.push(`Complete at least ${minCredits} credits before registering.`);
  }
  if (minGpa > gpa) {
    reasons.push(`A GPA of at least ${minGpa} is required.`);
  }
  if (window.year_level != null && window.year_level !== '' && yearLevel != null && Number(window.year_level) !== yearLevel) {
    reasons.push(`This window is for year ${window.year_level} only.`);
  }
  return reasons;
}

/**
 * Prefer an open window the student qualifies for.
 * If several match, pick the one with the highest credit cap (null = unlimited).
 */
export function pickRegistrationWindow(windows, stats, now = new Date()) {
  const list = Array.isArray(windows) ? windows : [];
  const open = list.filter((w) => isWindowOpen(w, now));
  const eligible = open.filter((w) => isEligibleForWindow(w, stats));
  if (!eligible.length) {
    const fallback = open.slice().sort((a, b) => Number(a.min_completed_credits || 0) - Number(b.min_completed_credits || 0))[0] || null;
    return { window: fallback, eligible: false, openCount: open.length };
  }
  eligible.sort((a, b) => {
    const aCap = a.max_credits == null || a.max_credits === '' ? Number.POSITIVE_INFINITY : Number(a.max_credits);
    const bCap = b.max_credits == null || b.max_credits === '' ? Number.POSITIVE_INFINITY : Number(b.max_credits);
    return bCap - aCap;
  });
  return { window: eligible[0], eligible: true, openCount: open.length };
}

export function wouldExceedCreditCap(window, registeredCredits, addingCredits) {
  if (!window || window.max_credits == null || window.max_credits === '') return false;
  return Number(registeredCredits || 0) + Number(addingCredits || 0) > Number(window.max_credits);
}

/** Why the student cannot register right now. Null when the window is open and they qualify. */
export function registrationBlockKind(windows, stats = {}, now = new Date()) {
  const list = Array.isArray(windows) ? windows : [];
  const anyOpen = list.some((item) => isWindowOpen(item, now));
  if (!list.length) return 'no_window';
  if (!anyOpen) return 'window_closed';
  const picked = pickRegistrationWindow(list, stats, now);
  if (!picked.eligible || !picked.window) return 'not_eligible';
  return null;
}

/** Latest window to show on the page when every window is already closed. */
export function evaluateRegistrationCatalog({
  prerequisiteId,
  passedCatalogIds,
  minHours,
  completedHours,
}) {
  const prereq = prerequisiteId != null && prerequisiteId !== '' ? Number(prerequisiteId) : null;
  const passed = passedCatalogIds instanceof Set ? passedCatalogIds : new Set(passedCatalogIds || []);
  if (Number.isFinite(prereq) && !passed.has(prereq)) {
    return { eligible: false, lock_reason: 'prerequisite' };
  }
  const need = minHours == null || minHours === '' ? null : Number(minHours);
  if (Number.isFinite(need) && need > 0 && Number(completedHours || 0) < need) {
    return { eligible: false, lock_reason: 'hours' };
  }
  return { eligible: true, lock_reason: null };
}

export function sortRegistrationCatalogCards(cards) {
  return [...(cards || [])].sort((a, b) => {
    const aLock = a.eligible ? 0 : 1;
    const bLock = b.eligible ? 0 : 1;
    if (aLock !== bLock) return aLock - bLock;
    const order = (Number(a.order) || 999) - (Number(b.order) || 999);
    if (order !== 0) return order;
    return String(a.course_code || '').localeCompare(String(b.course_code || ''));
  });
}

export function latestRegistrationWindow(windows) {
  const list = Array.isArray(windows) ? windows.filter(Boolean) : [];
  if (!list.length) return null;
  return list.slice().sort((a, b) => {
    const aAt = new Date(a.closes_at || a.opens_at || 0).getTime();
    const bAt = new Date(b.closes_at || b.opens_at || 0).getTime();
    return bAt - aAt;
  })[0];
}
