export const DEPRIVATION_STANDING = {
  current_grade: 0,
  percent: 0,
  gpa_points: 0,
  letter_grade: 'F',
  passed: 0,
};

export function applyDeprivationStanding(course, deprived) {
  if (!deprived) return course;
  return {
    ...course,
    ...DEPRIVATION_STANDING,
    deprived: true,
    registered: false,
  };
}

/** Term-close write: only an active deprivation is persisted as 0/F. A lift before close keeps the stored grade. */
export function standingToPersistOnTermClose(course, deprivationActiveAtClose) {
  if (!deprivationActiveAtClose) return course;
  return { ...course, ...DEPRIVATION_STANDING };
}
