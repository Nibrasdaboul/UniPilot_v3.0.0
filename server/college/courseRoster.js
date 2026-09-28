export const ROSTER_STATUSES = ['enrolled', 'withdrawn'];

export function mergeRosterRows(rows) {
  const byUser = new Map();
  for (const row of rows || []) {
    const uid = Number(row.user_id);
    if (!Number.isFinite(uid)) continue;
    const withdrawn = row.status === 'withdrawn';
    const current = byUser.get(uid);
    if (!current) {
      byUser.set(uid, {
        user_id: uid,
        full_name: row.full_name || '',
        person_code: row.person_code || '',
        withdrawn,
      });
    } else if (!withdrawn) {
      current.withdrawn = false;
    }
  }
  return [...byUser.values()];
}

export function activeRosterStudents(students) {
  return (students || []).filter((student) => !student?.withdrawn);
}

export function rosterEditState(statuses) {
  const list = statuses || [];
  if (list.includes('enrolled')) return 'editable';
  if (list.includes('withdrawn')) return 'withdrawn';
  return 'not_enrolled';
}
