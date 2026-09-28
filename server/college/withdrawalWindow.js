import { isWindowOpen } from './registration.js';

function openedAtMs(window) {
  const t = new Date(window?.opens_at).getTime();
  return Number.isNaN(t) ? 0 : t;
}

export function pickWithdrawalWindow(windows, now = new Date()) {
  const list = (windows || []).filter(Boolean);
  const open = list.filter((w) => isWindowOpen(w, now));
  if (open.length) {
    return { window: open.sort((a, b) => openedAtMs(b) - openedAtMs(a))[0], open: true };
  }
  const latest = [...list].sort((a, b) => openedAtMs(b) - openedAtMs(a))[0] || null;
  return { window: latest, open: false };
}
