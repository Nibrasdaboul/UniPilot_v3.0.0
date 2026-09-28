function isFlagged(value) {
  return value === 1 || value === '1' || value === true;
}

export function isWithdrawnW(course) {
  if (course?.withdrawn_w === true) return true;
  return isFlagged(course?.withdrawn) && course?.withdrawn_at != null;
}

export function isCancelledRegistration(course) {
  return isFlagged(course?.withdrawn) && !isWithdrawnW(course);
}
