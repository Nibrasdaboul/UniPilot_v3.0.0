function toTime(value) {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

export function withdrawalWindowStatus(window, now = new Date()) {
  const t = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const opens = toTime(window?.opens_at);
  if (opens == null || t < opens) return 'scheduled';
  const closes = toTime(window?.closes_at);
  if (closes != null && t > closes) return 'closed';
  return 'open';
}

function pad(n) {
  return String(n).padStart(2, '0');
}

export function formatWindowTime(value) {
  const t = toTime(value);
  if (t == null) return '—';
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
