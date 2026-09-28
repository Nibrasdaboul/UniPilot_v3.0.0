export const CGPA_WARNING_THRESHOLD = 2;

export function historyViewFromPath(pathname) {
  const path = String(pathname || '');
  if (path.endsWith('/progress')) return 'progress';
  if (path.endsWith('/all')) return 'all';
  return 'current';
}

export function pickCurrentHistoryTerm(terms) {
  const list = Array.isArray(terms) ? terms : [];
  return list.find((term) => Number(term.is_current) === 1 && Number(term.is_closed) !== 1)
    || list.find((term) => Number(term.is_current) === 1)
    || null;
}

export function termsForHistoryView(terms, view) {
  const list = Array.isArray(terms) ? terms : [];
  if (view === 'all') return list;
  const current = pickCurrentHistoryTerm(list);
  return current ? [current] : [];
}

/** A term counts as finished once it is closed, or it is no longer the open current term. */
export function isProgressTermFinished(term) {
  if (Number(term?.is_closed) === 1) return true;
  const openCurrent = Number(term?.is_current) === 1 && Number(term?.is_closed) !== 1;
  return !openCurrent;
}

export function isCgpaAtRisk(cgpa, finished) {
  if (!finished) return false;
  if (cgpa == null || cgpa === '') return false;
  const value = Number(cgpa);
  return Number.isFinite(value) && value < CGPA_WARNING_THRESHOLD;
}

export function progressRowsFromTerms(terms) {
  const list = Array.isArray(terms) ? [...terms] : [];
  list.sort((a, b) => {
    const startA = a?.starts_on ? String(a.starts_on) : '';
    const startB = b?.starts_on ? String(b.starts_on) : '';
    if (startA && startB && startA !== startB) return startA < startB ? -1 : 1;
    return Number(a?.academic_term_id || 0) - Number(b?.academic_term_id || 0);
  });
  return list.map((term) => {
    const finished = isProgressTermFinished(term);
    const cgpa = term.cgpa ?? null;
    const atRisk = isCgpaAtRisk(cgpa, finished);
    return {
      key: term.key,
      name: term.name,
      semester_gpa: term.semester_gpa ?? null,
      semester_percent: term.semester_percent ?? null,
      cgpa,
      cumulative_percent: term.cumulative_percent ?? null,
      finished,
      at_risk: atRisk,
      warning: atRisk,
    };
  });
}
