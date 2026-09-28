export function round2(value) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  return Math.round(Number(value) * 100) / 100;
}

export function averageNumbers(values) {
  const nums = (values || [])
    .filter((value) => value != null && value !== '' && Number.isFinite(Number(value)))
    .map(Number);
  if (!nums.length) return null;
  return round2(nums.reduce((sum, value) => sum + value, 0) / nums.length);
}

export function honorRankFromPercent(percent) {
  if (percent == null || !Number.isFinite(Number(percent))) return null;
  const p = Number(percent);
  if (p >= 90) return { key: 'distinction', ar: 'امتياز', en: 'Distinction' };
  if (p >= 80) return { key: 'very_good', ar: 'جيد جداً', en: 'Very good' };
  if (p >= 70) return { key: 'good', ar: 'جيد', en: 'Good' };
  if (p >= 60) return { key: 'pass', ar: 'مقبول', en: 'Pass' };
  if (p >= 50) return { key: 'weak', ar: 'ضعيف', en: 'Weak' };
  return { key: 'fail', ar: 'راسب', en: 'Fail' };
}

export function isWithdrawn(course) {
  return course?.withdrawn == 1 || course?.withdrawn === '1' || course?.withdrawn === true;
}

export function gradedCourses(courses) {
  return (courses || []).filter((course) => {
    if (isWithdrawn(course)) return false;
    const mark = course.current_grade ?? course.final_mark ?? course.percent;
    return mark != null && Number.isFinite(Number(mark));
  });
}

export function computeUnweightedTerm(courses) {
  const graded = gradedCourses(courses);
  return {
    course_count: graded.length,
    semester_gpa: averageNumbers(graded.map((course) => course.gpa_points)),
    semester_percent: averageNumbers(graded.map((course) => (
      course.percent ?? course.current_grade ?? course.final_mark
    ))),
  };
}

export function computeRunningCumulative(terms) {
  const counted = [];
  return (terms || []).map((term) => {
    if (term?.semester_gpa != null) counted.push(term);
    return {
      ...term,
      cgpa: averageNumbers(counted.map((row) => row.semester_gpa)),
      cumulative_percent: averageNumbers(counted.map((row) => row.semester_percent)),
      terms_counted: counted.length,
    };
  });
}

export function sortHistoryTermsForDisplay(terms = []) {
  return [...terms].sort((a, b) => {
    const aCurrent = Number(a.is_current) === 1 && Number(a.is_closed) !== 1;
    const bCurrent = Number(b.is_current) === 1 && Number(b.is_closed) !== 1;
    if (aCurrent !== bCurrent) return aCurrent ? -1 : 1;
    const aStart = new Date(a.starts_on || 0).getTime();
    const bStart = new Date(b.starts_on || 0).getTime();
    return bStart - aStart;
  });
}

export function annotateStanding(stats, lookupLetter) {
  const letter = typeof lookupLetter === 'function'
    ? lookupLetter(stats?.semester_percent)
    : null;
  const cumLetter = typeof lookupLetter === 'function'
    ? lookupLetter(stats?.cumulative_percent)
    : null;
  return {
    ...stats,
    semester_letter: letter || null,
    semester_rank: honorRankFromPercent(stats?.semester_percent),
    cumulative_letter: cumLetter || null,
    cumulative_rank: honorRankFromPercent(stats?.cumulative_percent),
  };
}
