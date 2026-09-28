export function sessionKind(value) {
  const kind = String(value || '').trim().toLowerCase();
  if (kind === 'practical' || kind === 'lab' || kind === 'tutorial') return 'practical';
  return 'theory';
}

export function splitAttendanceByKind(attendance) {
  const students = attendance?.students || [];
  const all = attendance?.sessions || [];
  const marks = attendance?.marks || [];
  const split = (kind) => {
    const sessions = all.filter((row) => sessionKind(row.kind) === kind);
    const ids = new Set(sessions.map((row) => Number(row.id)));
    return {
      students,
      sessions,
      marks: marks.filter((row) => ids.has(Number(row.session_id))),
    };
  };
  return {
    theory: split('theory'),
    practical: split('practical'),
  };
}
