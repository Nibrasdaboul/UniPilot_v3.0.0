function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function parseRequestWindow(start, end, { clear } = {}) {
  if (clear) return { error: null, start: null, end: null };
  const startRaw = String(start || '').trim();
  const endRaw = String(end || '').trim();
  if (!startRaw || !endRaw) {
    return { error: 'Both window start and end are required' };
  }
  const startDate = toDate(startRaw);
  const endDate = toDate(endRaw);
  if (!startDate || !endDate) {
    return { error: 'Window dates must be valid' };
  }
  if (endDate.getTime() <= startDate.getTime()) {
    return { error: 'Window end must be after start' };
  }
  return { error: null, start: startDate.toISOString(), end: endDate.toISOString() };
}

export function evaluateRequestWindow({ start, end, now = new Date() } = {}) {
  const startDate = toDate(start);
  const endDate = toDate(end);
  if (!startDate || !endDate) {
    return { configured: false, open: false, start: null, end: null };
  }
  const nowDate = toDate(now) || new Date();
  const nowMs = nowDate.getTime();
  return {
    configured: true,
    open: nowMs >= startDate.getTime() && nowMs <= endDate.getTime(),
    start: startDate.toISOString(),
    end: endDate.toISOString(),
  };
}

export function requestWindowLockMessage() {
  return 'Project and specialization requests can only be submitted during the vice dean window';
}
