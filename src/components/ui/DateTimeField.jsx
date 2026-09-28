import { useEffect, useMemo, useRef, useState, forwardRef } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { CalendarDays, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/LanguageContext';
import { cn } from '@/lib/utils';

const MONTHS = {
  ar: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};

const WEEKDAYS = {
  ar: ['سبت', 'أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة'],
  en: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
};

function pad(n) {
  return String(n).padStart(2, '0');
}

function modeFromType(type) {
  if (type === 'datetime-local') return 'datetime';
  if (type === 'time') return 'time';
  return 'date';
}

function isoDate(value) {
  const m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function clampIso(iso, min, max) {
  if (min && iso < min) return min;
  if (max && iso > max) return max;
  return iso;
}

function parseValue(value, mode, min = null, max = null) {
  const now = new Date();
  const base = {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
    hour: now.getHours(),
    minute: now.getMinutes(),
  };
  if (!value) {
    if (mode === 'time' || (!min && !max)) return base;
    const todayIso = `${base.year}-${pad(base.month)}-${pad(base.day)}`;
    const [y, mo, d] = clampIso(todayIso, min, max).split('-').map(Number);
    return { ...base, year: y, month: mo, day: d };
  }
  if (mode === 'time') {
    const [h, m] = String(value).split(':');
    return { ...base, hour: Number(h) || 0, minute: Number(m) || 0 };
  }
  const [datePart, timePart] = String(value).split('T');
  const [y, mo, d] = (datePart || '').split('-').map((x) => Number(x));
  const [h, mi] = (timePart || '00:00').split(':').map((x) => Number(x));
  return {
    year: y || base.year,
    month: mo || base.month,
    day: d || base.day,
    hour: Number.isFinite(h) ? h : base.hour,
    minute: Number.isFinite(mi) ? mi : base.minute,
  };
}

function toValue(parts, mode) {
  if (mode === 'time') return `${pad(parts.hour)}:${pad(parts.minute)}`;
  const date = `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
  if (mode === 'date') return date;
  return `${date}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function clampDay(year, month, day) {
  return Math.min(day, daysInMonth(year, month));
}

function firstWeekdayIndex(year, month, ar) {
  const jsDay = new Date(year, month - 1, 1).getDay();
  if (!ar) return jsDay;
  return (jsDay + 1) % 7;
}

function buildCells(year, month, ar) {
  const total = daysInMonth(year, month);
  const start = firstWeekdayIndex(year, month, ar);
  const cells = Array.from({ length: start }, () => null);
  for (let d = 1; d <= total; d += 1) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function displayLabel(value, mode, ar) {
  if (!value) return ar ? 'اختر...' : 'Select...';
  const p = parseValue(value, mode);
  if (mode === 'time') return `${pad(p.hour)}:${pad(p.minute)}`;
  const monthName = MONTHS[ar ? 'ar' : 'en'][p.month - 1];
  const dateText = ar
    ? `${p.day} ${monthName} ${p.year}`
    : `${monthName} ${p.day}, ${p.year}`;
  if (mode === 'date') return dateText;
  return `${dateText} · ${pad(p.hour)}:${pad(p.minute)}`;
}

export const DateTimeField = forwardRef(function DateTimeField(
  {
    type = 'date',
    mode: modeProp,
    value = '',
    onChange,
    required,
    disabled,
    className,
    name,
    id,
    min,
    max,
    'data-testid': testId,
  },
  ref,
) {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const mode = modeProp || modeFromType(type);
  const minIso = mode === 'time' ? null : isoDate(min);
  const maxIso = mode === 'time' ? null : isoDate(max);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const [draft, setDraft] = useState(() => parseValue(value, mode, minIso, maxIso));

  useEffect(() => {
    if (open) setDraft(parseValue(value, mode, minIso, maxIso));
  }, [open, value, mode, minIso, maxIso]);

  const years = useMemo(() => {
    const y = new Date().getFullYear();
    const set = new Set(Array.from({ length: 21 }, (_, i) => y - 8 + i));
    if (draft.year) set.add(draft.year);
    if (minIso) set.add(Number(minIso.slice(0, 4)));
    if (maxIso) set.add(Number(maxIso.slice(0, 4)));
    return [...set].sort((a, b) => a - b);
  }, [draft.year, minIso, maxIso]);
  const outOfRange = (iso) => Boolean((minIso && iso < minIso) || (maxIso && iso > maxIso));
  const draftIso = `${draft.year}-${pad(draft.month)}-${pad(clampDay(draft.year, draft.month, draft.day))}`;
  const draftInvalid = mode !== 'time' && outOfRange(draftIso);
  const now = new Date();
  const todayOutOfRange = mode !== 'time' && outOfRange(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`);
  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
  const minutes = useMemo(() => Array.from({ length: 60 }, (_, i) => i), []);
  const cells = useMemo(() => buildCells(draft.year, draft.month, ar), [draft.year, draft.month, ar]);
  const today = new Date();

  const emit = (next) => {
    onChange?.({ target: { value: next, name: name || '' } });
  };

  const confirm = () => {
    if (draftInvalid) return;
    const safe = { ...draft, day: clampDay(draft.year, draft.month, draft.day) };
    emit(toValue(safe, mode));
    setOpen(false);
  };

  const title = mode === 'time'
    ? (ar ? 'اختر الوقت' : 'Pick a time')
    : mode === 'datetime'
      ? (ar ? 'اختر التاريخ والوقت' : 'Pick date and time')
      : (ar ? 'اختر التاريخ' : 'Pick a date');

  const modal = (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-black/80" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          data-testid="date-time-picker"
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            triggerRef.current?.focus();
          }}
          className="fixed left-1/2 top-1/2 z-[81] w-[calc(100%-2rem)] max-w-md max-h-[90vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl sm:rounded-3xl border border-border bg-card p-5 sm:p-6 shadow-lg space-y-4 focus:outline-none"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
              e.preventDefault();
              confirm();
            }
          }}
        >
        <DialogPrimitive.Title className="text-lg font-semibold text-center">{title}</DialogPrimitive.Title>

        {mode !== 'time' && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <select
                className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                value={draft.month}
                onChange={(e) => {
                  const month = Number(e.target.value);
                  setDraft((d) => ({ ...d, month, day: clampDay(d.year, month, d.day) }));
                }}
              >
                {MONTHS[ar ? 'ar' : 'en'].map((label, i) => (
                  <option key={label} value={i + 1}>{label}</option>
                ))}
              </select>
              <select
                className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                value={draft.year}
                onChange={(e) => {
                  const year = Number(e.target.value);
                  setDraft((d) => ({ ...d, year, day: clampDay(year, d.month, d.day) }));
                }}
              >
                {years.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
              {WEEKDAYS[ar ? 'ar' : 'en'].map((d) => (
                <div key={d} className="py-1 font-medium">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((day, i) => {
                if (!day) return <div key={`e-${i}`} />;
                const selected = day === draft.day;
                const isToday = day === today.getDate()
                  && draft.month === today.getMonth() + 1
                  && draft.year === today.getFullYear();
                const blocked = outOfRange(`${draft.year}-${pad(draft.month)}-${pad(day)}`);
                return (
                  <button
                    key={`${draft.year}-${draft.month}-${day}`}
                    type="button"
                    disabled={blocked}
                    data-day={day}
                    onClick={() => setDraft((d) => ({ ...d, day }))}
                    className={cn(
                      'h-9 rounded-xl text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-30',
                      selected && 'bg-primary text-primary-foreground font-semibold',
                      !selected && isToday && 'ring-1 ring-primary text-primary',
                      !selected && !isToday && 'hover:bg-accent text-foreground',
                    )}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {(mode === 'datetime' || mode === 'time') && (
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">{ar ? 'الساعة' : 'Hour'}</span>
              <select
                className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
                value={draft.hour}
                onChange={(e) => setDraft((d) => ({ ...d, hour: Number(e.target.value) }))}
              >
                {hours.map((h) => (
                  <option key={h} value={h}>{pad(h)}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">{ar ? 'الدقيقة' : 'Minute'}</span>
              <select
                className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
                value={draft.minute}
                onChange={(e) => setDraft((d) => ({ ...d, minute: Number(e.target.value) }))}
              >
                {minutes.map((m) => (
                  <option key={m} value={m}>{pad(m)}</option>
                ))}
              </select>
            </label>
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          {!required && (
            <Button type="button" variant="ghost" className="rounded-xl" onClick={() => { emit(''); setOpen(false); }}>
              {ar ? 'مسح' : 'Clear'}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            className="rounded-xl"
            disabled={todayOutOfRange}
            onClick={() => {
              const n = new Date();
              setDraft({
                year: n.getFullYear(),
                month: n.getMonth() + 1,
                day: n.getDate(),
                hour: n.getHours(),
                minute: n.getMinutes(),
              });
            }}
          >
            {mode === 'time' ? (ar ? 'الآن' : 'Now') : (ar ? 'اليوم' : 'Today')}
          </Button>
          <Button type="button" className="rounded-xl" disabled={draftInvalid} onClick={confirm} data-testid="date-time-picker-confirm">
            {ar ? 'تأكيد' : 'Confirm'}
          </Button>
        </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        data-testid={testId}
        disabled={disabled}
        onClick={() => !disabled && setOpen(true)}
        className={cn(
          'flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-input bg-background px-3 text-sm text-start transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
          !value && 'text-muted-foreground',
          className,
        )}
      >
        <span className="truncate">{displayLabel(value, mode, ar)}</span>
        {mode === 'time'
          ? <Clock className="w-4 h-4 shrink-0 text-primary" />
          : <CalendarDays className="w-4 h-4 shrink-0 text-primary" />}
      </button>
      <input
        ref={ref}
        type="text"
        name={name}
        value={value || ''}
        required={required}
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        onChange={() => {}}
        onFocus={() => { if (!disabled) setOpen(true); }}
        onInvalid={(e) => {
          e.preventDefault();
          setOpen(true);
        }}
      />
      {modal}
    </>
  );
});
