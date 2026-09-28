export function buildSessionHints(data) {
  const today = String(data?.now || '').slice(0, 10);
  const hints = new Map();
  for (const s of data?.sessions || []) {
    const key = s.catalog_course_id != null ? Number(s.catalog_course_id) : null;
    if (key == null) continue;
    const hint = hints.get(key) || { now: null, next: null, pending: 0 };
    if (!hint.now && s.actions?.can_check_in) hint.now = s;
    else if (!hint.next && s.status === 'scheduled' && s.session_date >= today) hint.next = s;
    hint.pending += (s.requests || []).filter((r) => r.status === 'pending').length;
    hints.set(key, hint);
  }
  return hints;
}
