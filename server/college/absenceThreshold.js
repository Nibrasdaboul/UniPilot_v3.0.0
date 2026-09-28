export const DEFAULT_ABSENCE_LIMIT = 4;
export const MIN_ABSENCE_LIMIT = 1;
export const MAX_ABSENCE_LIMIT = 20;

export function parseAbsenceLimit(value) {
  const raw = Number(value);
  if (!Number.isFinite(raw) || !Number.isInteger(raw) || raw < MIN_ABSENCE_LIMIT || raw > MAX_ABSENCE_LIMIT) {
    return { error: `absence_limit must be an integer from ${MIN_ABSENCE_LIMIT} to ${MAX_ABSENCE_LIMIT}` };
  }
  return { error: null, limit: raw };
}

export function normalizeAbsenceLimit(value) {
  const parsed = parseAbsenceLimit(value);
  return parsed.error ? DEFAULT_ABSENCE_LIMIT : parsed.limit;
}

export function warningMessages(absentCount, limit, remaining) {
  const n = Number(absentCount) || 0;
  const cap = Number(limit) || DEFAULT_ABSENCE_LIMIT;
  const left = Number(remaining) || 0;
  return {
    25: {
      ar: `تنبيه: هذا غيابك رقم ${n} من أصل ${cap}. التزم بالحضور.`,
      en: `Notice: this is absence ${n} of ${cap}. Please attend.`,
    },
    50: {
      ar: `انتبه لغياباتك، أصبح لديك ${n} غيابات من أصل ${cap}.`,
      en: `Watch your absences: you now have ${n} of ${cap}.`,
    },
    75: {
      ar: left <= 1
        ? `لم يتبقَّ لديك غيابات، في الغياب التالي سيتم حرمانك.`
        : `اقتربت من حد الحرمان. تبقّى لك ${left} غيابات من أصل ${cap}.`,
      en: left <= 1
        ? 'You have no absences left. The next one will deprive you of the course.'
        : `You are close to deprivation. ${left} absences remain of ${cap}.`,
    },
    100: {
      ar: `بلغت حد الغياب المسموح (${cap}).`,
      en: `You reached the allowed absence limit (${cap}).`,
    },
  };
}

export function computeAbsenceWarning(absentCount, limit) {
  const absences = Math.max(0, Number(absentCount) || 0);
  const cap = normalizeAbsenceLimit(limit);
  const remaining = Math.max(0, cap - absences);
  const percent = cap > 0 ? Math.min(100, Math.round((absences / cap) * 100)) : 0;
  let level = 0;
  if (percent >= 100) level = 100;
  else if (percent >= 75) level = 75;
  else if (percent >= 50) level = 50;
  else if (percent >= 25) level = 25;
  const messages = warningMessages(absences, cap, remaining);
  const message = level ? messages[level] : null;
  return {
    absent_count: absences,
    limit: cap,
    remaining,
    percent,
    level,
    message_ar: message?.ar || null,
    message_en: message?.en || null,
  };
}

export function isOfficialAbsence(status) {
  return String(status || '').trim() === 'absent';
}
