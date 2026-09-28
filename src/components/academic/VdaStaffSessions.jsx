import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, MapPin, Megaphone, UserRound } from 'lucide-react';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/lib/AuthContext';
import { useLanguage } from '@/lib/LanguageContext';
import { staffSessionErrorMessage, VDA_MESSAGES } from '@/lib/staffSessionErrors';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const DAYS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const DAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const LIVE_STATE = {
  upcoming: { ar: 'لم تبدأ بعد', en: 'Upcoming', className: 'border-muted-foreground/30 text-muted-foreground' },
  waiting: { ar: 'بانتظار البدء', en: 'Waiting', className: 'border-amber-500/50 text-amber-700 dark:text-amber-400' },
  started: { ar: 'بدأت', en: 'Started', className: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' },
  late: { ar: 'بدأت متأخرة', en: 'Started late', className: 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400' },
  no_show: { ar: 'غياب غير مبلّغ', en: 'No-show', className: 'border-destructive bg-destructive text-destructive-foreground' },
  absent: { ar: 'غياب', en: 'Absent', className: 'border-destructive/50 bg-destructive/10 text-destructive' },
  cancelled: { ar: 'ملغاة', en: 'Cancelled', className: 'border-muted-foreground/30 bg-muted text-muted-foreground' },
};

export const LIVE_STATE_ORDER = ['no_show', 'waiting', 'upcoming', 'started', 'late', 'absent', 'cancelled'];

export function dayName(iso, ar) {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  if (!y) return '';
  return (ar ? DAYS_AR : DAYS_EN)[new Date(y, m - 1, d).getDay()];
}

export function minutesAr(n) {
  const v = Number(n);
  return `${v} ${v >= 3 && v <= 10 ? 'دقائق' : 'دقيقة'}`;
}

function clock(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function sectionLabel(s, ar) {
  const kind = s.section_kind === 'practical' ? (ar ? 'عملي' : 'Practical') : (ar ? 'نظري' : 'Theory');
  return `${s.section_code || ''} · ${kind}`;
}

function attendanceLine(att, ar) {
  if (!att) return null;
  const source = att.source === 'vda' ? (ar ? ' (تعديل نائب العميد)' : ' (set by vice dean)') : '';
  if (att.source === 'auto') return ar ? 'لم تُبدأ الجلسة، فسُجّل غياب تلقائياً' : 'No check-in, marked absent automatically';
  const at = clock(att.checked_in_at);
  const when = at ? (ar ? ` ${at}` : ` ${at}`) : '';
  if (att.status === 'present') return (ar ? `حاضر${when}` : `Present${when}`) + source;
  if (att.status === 'late') return (ar ? `تأخّر ${minutesAr(att.late_minutes)}${when}` : `${att.late_minutes} min late${when}`) + source;
  if (att.status === 'absent') return (ar ? `غائب${att.late_minutes ? ` (تأخير ${minutesAr(att.late_minutes)})` : ''}` : 'Absent') + source;
  if (att.status === 'excused') return (ar ? 'غياب بعذر' : 'Excused') + source;
  return null;
}

export function LiveStateBadge({ state, ar, testId }) {
  const meta = LIVE_STATE[state] || LIVE_STATE.upcoming;
  return (
    <Badge variant="outline" className={cn('rounded-full', meta.className)} data-testid={testId} data-state={state}>
      {ar ? meta.ar : meta.en}
    </Badge>
  );
}

export function StatCard({ label, value, testId, tone }) {
  return (
    <Card className={cn('rounded-2xl', tone)}>
      <CardHeader className="pb-2 p-4">
        <CardDescription className="text-xs">{label}</CardDescription>
        <CardTitle className="text-2xl" data-testid={testId}>{value ?? '—'}</CardTitle>
      </CardHeader>
    </Card>
  );
}

const EDIT_STATUSES = [
  { key: 'present', ar: 'حاضر', en: 'Present' },
  { key: 'late', ar: 'متأخر', en: 'Late' },
  { key: 'absent', ar: 'غائب', en: 'Absent' },
  { key: 'excused', ar: 'غياب بعذر (تُلغى الجلسة)', en: 'Excused (cancel session)' },
];

export function AttendanceEditDialog({ session, ar, onClose, onSaved }) {
  const { api } = useAuth();
  const [form, setForm] = useState({ status: 'present', late_minutes: '', note: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setBusy(false);
    const current = session?.attendance?.status;
    setForm({
      status: current && current !== 'excused' ? current : 'present',
      late_minutes: session?.attendance?.late_minutes ? String(session.attendance.late_minutes) : '',
      note: '',
    });
  }, [session]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.patch(`/vda/staff-sessions/sessions/${session.id}/attendance`, {
        status: form.status,
        late_minutes: form.status === 'late' ? Number(form.late_minutes) : undefined,
        note: form.note,
      });
      toast.success(ar ? 'حُفظت حالة حضور الكادر وأُبلغ المدرّس' : 'Staff attendance saved');
      onSaved?.();
      onClose();
    } catch (err) {
      toast.error(staffSessionErrorMessage(err, ar, VDA_MESSAGES));
      setBusy(false);
    }
  };

  return (
    <Dialog open={Boolean(session)} onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent className="rounded-3xl sm:max-w-md" data-testid="vda-attendance-dialog">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{ar ? 'تعديل حضور الكادر' : 'Edit staff attendance'}</DialogTitle>
            <DialogDescription className="text-start">
              {session && `${session.course_code} · ${sectionLabel(session, ar)} · ${dayName(session.session_date, ar)} ${session.session_date} · ${session.start_time}–${session.end_time}`}
              {session?.staff?.name ? ` · ${session.staff.name}` : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            {EDIT_STATUSES.map((opt) => (
              <Button
                key={opt.key}
                type="button"
                variant={form.status === opt.key ? 'default' : 'outline'}
                className={cn('rounded-xl h-auto py-2 whitespace-normal', opt.key === 'excused' && 'col-span-2')}
                onClick={() => setForm((f) => ({ ...f, status: opt.key }))}
                data-testid={`vda-attendance-status-${opt.key}`}
              >
                {ar ? opt.ar : opt.en}
              </Button>
            ))}
          </div>
          {form.status === 'late' && (
            <div className="space-y-1">
              <Label htmlFor="vda-late-minutes">{ar ? 'دقائق التأخير' : 'Late minutes'}</Label>
              <Input
                id="vda-late-minutes"
                type="number"
                min={1}
                max={300}
                value={form.late_minutes}
                onChange={(e) => setForm((f) => ({ ...f, late_minutes: e.target.value }))}
                className="rounded-xl w-32"
                data-testid="vda-attendance-late"
              />
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="vda-attendance-note">{ar ? 'ملاحظة (إلزامية)' : 'Note (required)'}</Label>
            <Textarea
              id="vda-attendance-note"
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              className="rounded-xl"
              rows={2}
              placeholder={ar ? 'مثال: نسي الضغط على «بدء الجلسة» وتأكدنا من حضوره' : 'e.g. forgot to check in, attendance confirmed'}
              data-testid="vda-attendance-note"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" className="rounded-xl" disabled={busy} onClick={onClose}>
              {ar ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button type="submit" className="rounded-xl" disabled={busy} data-testid="vda-attendance-save">
              {ar ? 'حفظ' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const REQUEST_KIND = {
  absence_notice: { ar: 'إبلاغ غياب', en: 'Absence notice' },
  makeup: { ar: 'طلب تعويض', en: 'Makeup request' },
};

const REQUEST_STATUS = {
  pending: { ar: 'معلّق', en: 'Pending', variant: 'outline' },
  approved: { ar: 'مقبول', en: 'Approved', variant: 'default' },
  rejected: { ar: 'مرفوض', en: 'Rejected', variant: 'destructive' },
  cancelled: { ar: 'سحبه المدرّس', en: 'Withdrawn', variant: 'secondary' },
};

export function VdaSessionRow({ s, ar, onEdit, showCourse = true, showDate = false }) {
  const att = attendanceLine(s.attendance, ar);
  return (
    <div
      className={cn('rounded-2xl border p-4 space-y-2', s.live_state === 'no_show' && 'border-destructive/60 bg-destructive/5')}
      data-testid={`vda-session-${s.id}`}
      data-state={s.live_state}
    >
      <div className="flex flex-wrap items-center gap-2">
        {showDate && <span className="font-semibold">{dayName(s.session_date, ar)} {s.session_date}</span>}
        <span className="text-sm font-medium flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{s.start_time}–{s.end_time}</span>
        {s.room && <span className="text-sm text-muted-foreground flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{s.room}</span>}
        {s.kind === 'makeup' && (
          <Badge variant="secondary" className="rounded-full">
            {ar ? `تعويضية${s.makeup_for_date ? ` عن ${s.makeup_for_date}` : ''}` : `Makeup${s.makeup_for_date ? ` for ${s.makeup_for_date}` : ''}`}
          </Badge>
        )}
        <span className="ms-auto flex items-center gap-2">
          {s.student_reports > 0 && (
            <Badge variant="outline" className="rounded-full gap-1 border-destructive/50 text-destructive" data-testid={`vda-session-reports-${s.id}`}>
              <Megaphone className="w-3 h-3" />
              {ar ? `${s.student_reports} بلاغ من الطلاب` : `${s.student_reports} student reports`}
            </Badge>
          )}
          <LiveStateBadge state={s.live_state} ar={ar} testId={`vda-session-state-${s.id}`} />
        </span>
      </div>
      <div className="text-sm">
        {showCourse && <><span className="font-medium">{s.course_code}</span> — {s.course_name} · </>}
        <span className="text-muted-foreground">{sectionLabel(s, ar)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="flex items-center gap-1"><UserRound className="w-3.5 h-3.5" />{s.staff?.name || (ar ? 'غير محدد' : 'Unassigned')}</span>
        {att && <span className="text-muted-foreground" data-testid={`vda-session-attendance-${s.id}`}>· {att}</span>}
        {s.attendance?.note && s.attendance.source === 'vda' && <span className="text-muted-foreground">«{s.attendance.note}»</span>}
        {onEdit && s.staff && (
          <Button type="button" variant="ghost" size="sm" className="rounded-xl h-7 ms-auto" onClick={() => onEdit(s)} data-testid={`vda-session-edit-${s.id}`}>
            {ar ? 'تعديل الحضور' : 'Edit attendance'}
          </Button>
        )}
      </div>
      {s.requests?.length > 0 && (
        <div className="space-y-1 border-t pt-2">
          {s.requests.map((r) => {
            const rs = REQUEST_STATUS[r.status] || REQUEST_STATUS.pending;
            return (
              <div key={r.id} className="flex flex-wrap items-center gap-2 text-xs" data-testid={`vda-session-request-${r.id}`}>
                <span className="font-medium">{ar ? REQUEST_KIND[r.kind]?.ar : REQUEST_KIND[r.kind]?.en}</span>
                {r.kind === 'makeup' && r.proposed_date && (
                  <span className="text-muted-foreground">{r.proposed_date} · {r.proposed_start}–{r.proposed_end}{r.proposed_room ? ` · ${r.proposed_room}` : ''}</span>
                )}
                {r.reason && <span className="text-muted-foreground">«{r.reason}»</span>}
                <Badge variant={rs.variant} className="rounded-full text-[10px]">{ar ? rs.ar : rs.en}</Badge>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const COURSE_TABS = [
  { key: 'past', ar: 'السابقة', en: 'Past' },
  { key: 'upcoming', ar: 'القادمة', en: 'Upcoming' },
  { key: 'all', ar: 'الكل', en: 'All' },
];

export default function VdaCourseSessionsPanel({ catalogId }) {
  const { api } = useAuth();
  const { language } = useLanguage();
  const ar = language === 'ar';
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('past');
  const [editing, setEditing] = useState(null);

  const load = async () => {
    try {
      const res = await api.get('/vda/staff-sessions/sessions', { params: { catalog_course_id: catalogId } });
      setData(res.data);
    } catch (err) {
      toast.error(staffSessionErrorMessage(err, ar, VDA_MESSAGES));
    }
  };

  useEffect(() => { if (catalogId) load(); }, [api, catalogId]);

  const sessions = data?.sessions || [];
  const today = String(data?.now || '').slice(0, 10);
  const visible = useMemo(() => {
    if (tab === 'upcoming') return sessions.filter((s) => s.session_date >= today);
    if (tab === 'past') return sessions.filter((s) => s.session_date <= today).reverse();
    return sessions;
  }, [sessions, tab, today]);
  const count = (fn) => sessions.filter(fn).length;
  const pendingHere = sessions.reduce((n, s) => n + (s.requests || []).filter((r) => r.status === 'pending').length, 0);

  return (
    <div className="space-y-4" data-testid="vda-course-sessions">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatCard label={ar ? 'الجلسات' : 'Sessions'} value={sessions.length} />
        <StatCard label={ar ? 'بدأت' : 'Held'} value={count((s) => s.live_state === 'started')} />
        <StatCard label={ar ? 'متأخرة' : 'Late'} value={count((s) => s.live_state === 'late')} />
        <StatCard label={ar ? 'غياب' : 'Absent'} value={count((s) => ['absent', 'no_show'].includes(s.live_state))} />
        <StatCard label={ar ? 'تعويضية' : 'Makeup'} value={count((s) => s.kind === 'makeup')} />
      </div>
      {pendingHere > 0 && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-3 text-sm flex flex-wrap items-center gap-2">
          {ar ? `يوجد ${pendingHere} طلب معلّق لهذه المادة.` : `${pendingHere} pending request(s) for this course.`}
          <Button asChild size="sm" variant="outline" className="rounded-xl ms-auto">
            <Link to="/staff-attendance?tab=requests">{ar ? 'فتح صندوق الطلبات' : 'Open requests'}</Link>
          </Button>
        </div>
      )}
      <div className="flex gap-2">
        {COURSE_TABS.map((t) => (
          <Button key={t.key} type="button" size="sm" variant={tab === t.key ? 'default' : 'outline'} className="rounded-xl" onClick={() => setTab(t.key)} data-testid={`vda-course-sessions-tab-${t.key}`}>
            {ar ? t.ar : t.en}
          </Button>
        ))}
      </div>
      <div className="space-y-3" data-testid="vda-course-sessions-list">
        {data && visible.length === 0 && (
          <p className="text-sm text-muted-foreground">{ar ? 'لا جلسات هنا.' : 'No sessions here.'}</p>
        )}
        {visible.map((s) => (
          <VdaSessionRow key={s.id} s={s} ar={ar} onEdit={setEditing} showCourse={false} showDate />
        ))}
      </div>
      <AttendanceEditDialog session={editing} ar={ar} onClose={() => setEditing(null)} onSaved={load} />
    </div>
  );
}
