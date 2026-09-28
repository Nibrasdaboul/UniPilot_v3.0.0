export function isPassedCourse(course) {
  return Number(course?.passed) === 1 || course?.passed === true;
}

export function isWithdrawnCourse(course) {
  return course?.withdrawn === 1 || course?.withdrawn === '1' || course?.withdrawn === true;
}

/** Priority: current-term open → past completed → locked → enroll or closed. */
export function subjectTreeActionKind({
  unlocked,
  currentTermEnrolled,
  pastCompleted,
  windowOpen,
}) {
  if (currentTermEnrolled) return 'open';
  if (pastCompleted) return 'completed';
  if (!unlocked) return 'locked';
  return windowOpen ? 'enroll' : 'closed';
}
