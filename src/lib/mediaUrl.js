export function mediaUrl(path) {
  if (!path) return '';
  if (/^https?:\/\//i.test(path) || String(path).startsWith('data:')) return path;
  const env = (import.meta.env.VITE_BACKEND_URL || '').trim().replace(/\/$/, '');
  let base = env;
  if (!base && typeof window !== 'undefined') {
    base = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ? 'http://localhost:3001'
      : window.location.origin;
  }
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
