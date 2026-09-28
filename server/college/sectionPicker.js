export const PICKER_DAYS = [
  { key: 'saturday', dow: 6, ar: 'السبت', en: 'Saturday' },
  { key: 'sunday', dow: 0, ar: 'الأحد', en: 'Sunday' },
  { key: 'monday', dow: 1, ar: 'الإثنين', en: 'Monday' },
  { key: 'tuesday', dow: 2, ar: 'الثلاثاء', en: 'Tuesday' },
  { key: 'wednesday', dow: 3, ar: 'الأربعاء', en: 'Wednesday' },
  { key: 'thursday', dow: 4, ar: 'الخميس', en: 'Thursday' },
  { key: 'friday', dow: 5, ar: 'الجمعة', en: 'Friday' },
];

export const COURSE_PICKER_COLORS = ['#eab308', '#22d3ee', '#a78bfa', '#fb7185', '#4ade80', '#60a5fa', '#f97316'];

export function coursePickerColor(id) {
  return COURSE_PICKER_COLORS[Math.abs(Number(id) || 0) % COURSE_PICKER_COLORS.length];
}

export function parseTimeToMinutes(value) {
  const parts = String(value || '00:00').slice(0, 8).split(':');
  const hours = Number(parts[0]) || 0;
  const minutes = Number(parts[1]) || 0;
  return hours * 60 + minutes;
}

export function formatMinutes(total) {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${hours}:${String(minutes).padStart(2, '0')}`;
}

export function halfHourSlots(startHour = 8, lastStartHour = 16, lastStartMinute = 0) {
  const slots = [];
  const end = lastStartHour * 60 + lastStartMinute;
  for (let start = startHour * 60; start <= end; start += 30) {
    slots.push({
      startMin: start,
      endMin: start + 30,
      label: `${formatMinutes(start)}-${formatMinutes(start + 30)}`,
    });
  }
  return slots;
}

export function meetingFillsSlot(meeting, slot, day) {
  if (!meeting || !slot || !day) return false;
  const dow = meeting.day_of_week != null && meeting.day_of_week !== '' ? Number(meeting.day_of_week) : null;
  const weekday = meeting.weekday || null;
  const dayMatch = Number.isFinite(dow) ? dow === day.dow : weekday === day.key;
  if (!dayMatch) return false;
  const start = parseTimeToMinutes(meeting.start_time);
  const end = parseTimeToMinutes(meeting.end_time);
  return start < slot.endMin && end > slot.startMin;
}

export function meetingDayKey(meeting) {
  if (!meeting) return null;
  const dow = meeting.day_of_week != null && meeting.day_of_week !== '' ? Number(meeting.day_of_week) : NaN;
  if (Number.isFinite(dow)) {
    const hit = PICKER_DAYS.find((day) => day.dow === dow);
    return hit?.key || null;
  }
  return meeting.weekday || null;
}

export function meetingsOverlap(a, b) {
  if (!a || !b) return false;
  const dayA = meetingDayKey(a);
  const dayB = meetingDayKey(b);
  if (!dayA || dayA !== dayB) return false;
  const startA = parseTimeToMinutes(a.start_time);
  const endA = parseTimeToMinutes(a.end_time);
  const startB = parseTimeToMinutes(b.start_time);
  const endB = parseTimeToMinutes(b.end_time);
  return startA < endB && startB < endA;
}

export function findPickerClashes(placements = []) {
  const clashes = [];
  for (let i = 0; i < placements.length; i += 1) {
    for (let j = i + 1; j < placements.length; j += 1) {
      const a = placements[i];
      const b = placements[j];
      const sameSection = a.section_id != null && Number(a.section_id) === Number(b.section_id);
      if (sameSection) continue;
      if (meetingsOverlap(a, b)) clashes.push({ a, b });
    }
  }
  return clashes;
}

function placementLabel(item, ar) {
  const kind = item?.kind === 'practical' ? (ar ? 'عملي' : 'practical') : (ar ? 'نظري' : 'theory');
  const code = item?.section_code || item?.section_id || '';
  return `${item?.course_code || ''} ${code} (${kind})`.trim();
}

export function formatClashMessage(clashes = [], ar = true) {
  if (!clashes.length) return '';
  const lines = clashes.map(({ a, b }) => {
    const key = meetingDayKey(a);
    const day = PICKER_DAYS.find((item) => item.key === key);
    const dayName = ar ? (day?.ar || key) : (day?.en || key);
    return ar
      ? `${placementLabel(a, true)} تتعارض مع ${placementLabel(b, true)} يوم ${dayName}`
      : `${placementLabel(a, false)} clashes with ${placementLabel(b, false)} on ${dayName}`;
  });
  return ar ? `تعارض في الجدول: ${lines.join(' · ')}` : `Schedule clash: ${lines.join(' · ')}`;
}

function sameProgramBlock(a, b) {
  if (!a || !b) return false;
  return Number(a.section_id) === Number(b.section_id)
    && String(a.start_time || '') === String(b.start_time || '')
    && String(a.end_time || '') === String(b.end_time || '');
}

export function buildWeeklyProgramGrid({ placements = [], days = PICKER_DAYS, slots = halfHourSlots() } = {}) {
  const cells = {};
  for (const day of days) {
    const filled = slots.map((slot) => placements.find((item) => meetingFillsSlot(item, slot, day)) || null);
    const row = [];
    let i = 0;
    while (i < filled.length) {
      const hit = filled[i];
      if (!hit) {
        row.push({ type: 'empty' });
        i += 1;
        continue;
      }
      let span = 1;
      while (i + span < filled.length && sameProgramBlock(filled[i + span], hit)) span += 1;
      row.push({
        type: 'block',
        span,
        color: hit.color,
        course_code: hit.course_code || null,
        course_name: hit.course_name || null,
        section_code: hit.section_code || null,
        kind: hit.kind || 'theory',
        staff_name: hit.staff_name || null,
        room_number: hit.room_number || null,
        start_time: hit.start_time || null,
        end_time: hit.end_time || null,
        withdrawn: Boolean(hit.withdrawn),
      });
      for (let skip = 1; skip < span; skip += 1) row.push({ type: 'skip' });
      i += span;
    }
    cells[day.key] = row;
  }
  return { days, slots, cells };
}

export function buildPickerGrid({ placements = [], days = PICKER_DAYS, slots = halfHourSlots() } = {}) {
  const cells = {};
  for (const day of days) {
    cells[day.key] = slots.map((slot) => {
      const hit = placements.find((item) => meetingFillsSlot(item, slot, day));
      if (!hit) return null;
      return {
        letter: hit.kind === 'practical' ? 'ع' : 'ن',
        color: hit.color,
        course_code: hit.course_code || null,
      };
    });
  }
  return { days, slots, cells };
}
