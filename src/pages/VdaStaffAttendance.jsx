import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Download, Megaphone, UserCheck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import StaffSessionsCard from '@/components/academic/StaffSessionsCard';
import {
  AttendanceEditDialog,
  LIVE_STATE,
  LIVE_STATE_ORDER,
  StatCard,
  VdaSessionRow,
  dayName,
  minutesAr,
  sectionLabel,
} from '@/components/academic/VdaStaffSessions';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const PAGE_TABS = ['board', 'requests', 'report', 'settings'];

function localIso(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function shiftIso(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  return localIso(new Date(y, m - 1, d + days));
}

function stamp(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${localIso(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function clashText(clash, ar) {
  if (!clash) return null;
  if (clash.code === 'makeup_room_clash') {
    return ar
      ? `القاعة ${clash.room || ''} محجوزة لـ ${clash.course_code} ${clash.start}–${clash.end}`
      : `${clash.room || 'Room'} is booked for ${clash.course_code} ${clash.start}–${clash.end}`;
  }
  if (clash.course_code) {
    return ar
      ? `المدرّس لديه ${clash.course_code} ${clash.start}–${clash.end} في هذا الوقت`
      : `The staff member teaches ${clash.course_code} ${clash.start}–${clash.end}`;
  }
  return ar
    ? `للمدرّس طلب تعويض آخر ${clash.start}–${clash.end} في هذا الوقت`
    : `The staff member proposed another makeup ${clash.start}–${clash.end}`;
}

function Board({ ar, onPendingCount }) {
  const { api } = useAuth();
  const [date, setDate] = useState(localIso());
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState(null);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    try {
      const res = await api.get('/vda/staff-sessions/sessions', { params: { date } });
      setData(res.data);
      onPendingCount?.(res.data?.pending_requests ?? 0);
    } catch (err) {
      toast.error(staffSessionErrorMessage(err, ar, VDA_MESSAGES));
    }
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, [api, date]);

  useEffect(() => { setFilter(null); }, [date]);

  const sessions = data?.sessions || [];
  const counts = data?.counts || {};
  const alerts = sessions.filter((s) => s.live_state === 'no_show'
    || (s.student_reports > 0 && ['waiting', 'no_show', 'upcoming'].includes(s.live_state)));
  const visible = filter ? sessions.filter((s) => s.live_state === filter) : sessions;
  const isToday = date === localIso();

  return (
    <div className="space-y-4" data-testid="vda-board">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label className="text-xs">{ar ? 'اليوم المعروض' : 'Day'}</Label>
          <div className="flex items-center gap-1">
            <Button type="button" variant="outline" size="icon" className="rounded-xl" onClick={() => setDate((d) => shiftIso(d, -1))} aria-label={ar ? 'اليوم السابق' : 'Previous day'} data-testid="vda-board-prev">
              {ar ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </Button>
            <Input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="rounded-xl w-44" data-testid="vda-board-date" />
            <Button type="button" variant="outline" size="icon" className="rounded-xl" onClick={() => setDate((d) => shiftIso(d, 1))} aria-label={ar ? 'اليوم التالي' : 'Next day'} data-testid="vda-board-next">
              {ar ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </Button>
          </div>
        </div>
        {!isToday && (
          <Button type="button" variant="ghost" className="rounded-xl" onClick={() => setDate(localIso())} data-testid="vda-board-today">
            {ar ? 'العودة لليوم' : 'Back to today'}
          </Button>
        )}
        <span className="text-sm text-muted-foreground ms-auto">
          {dayName(date, ar)} {date}
          {data?.settings && (ar
            ? ` · السماح ${minutesAr(data.settings.staff_grace_minutes)}، والغياب بعد ${minutesAr(data.settings.staff_late_absent_minutes)}`
            : ` · grace ${data.settings.staff_grace_minutes} min, absent after ${data.settings.staff_late_absent_minutes} min`)}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        <button type="button" onClick={() => setFilter(null)} className="text-start" data-testid="vda-board-filter-all">
          <StatCard label={ar ? 'كل الجلسات' : 'All'} value={counts.total} testId="vda-board-count-total" tone={cn(!filter && 'border-primary')} />
        </button>
        {LIVE_STATE_ORDER.map((key) => (
          <button key={key} type="button" onClick={() => setFilter((f) => (f === key ? null : key))} className="text-start" data-testid={`vda-board-filter-${key}`}>
            <StatCard
              label={ar ? LIVE_STATE[key].ar : LIVE_STATE[key].en}
              value={counts[key] ?? 0}
              testId={`vda-board-count-${key}`}
              tone={cn(filter === key && 'border-primary', key === 'no_show' && counts[key] > 0 && 'border-destructive/60 bg-destructive/5')}
            />
          </button>
        ))}
      </div>

      {alerts.length > 0 && (
        <Card className="rounded-2xl border-destructive/50 bg-destructive/5" data-testid="vda-board-alerts">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-4 h-4" />
              {ar ? 'تنبيهات تحتاج متابعة' : 'Needs attention'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {alerts.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-2" data-testid={`vda-board-alert-${s.id}`}>
                <span className="font-medium">{s.course_code}</span>
                <span className="text-muted-foreground">{sectionLabel(s, ar)} · {s.start_time}–{s.end_time}{s.room ? ` · ${s.room}` : ''}</span>
                <span>· {s.staff?.name || '—'}</span>
                {s.live_state === 'no_show' && <Badge variant="destructive" className="rounded-full">{ar ? 'لم يبدأ الجلسة ولم يبلّغ' : 'No check-in, no notice'}</Badge>}
                {s.student_reports > 0 && (
                  <Badge variant="outline" className="rounded-full gap-1 border-destructive/50 text-destructive">
                    <Megaphone className="w-3 h-3" />
                    {ar ? `${s.student_reports} بلاغ من الطلاب` : `${s.student_reports} student reports`}
                  </Badge>
                )}
                <Button type="button" variant="outline" size="sm" className="rounded-xl h-7 ms-auto" onClick={() => setEditing(s)}>
                  {ar ? 'تسجيل الحالة' : 'Set status'}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="space-y-3" data-testid="vda-board-list">
        {data && visible.length === 0 && (
          <p className="text-sm text-muted-foreground" data-testid="vda-board-empty">
            {filter
              ? (ar ? 'لا جلسات بهذه الحالة.' : 'No sessions in this state.')
              : (ar ? 'لا جلسات في هذا اليوم.' : 'No sessions on this day.')}
          </p>
        )}
        {visible.map((s) => <VdaSessionRow key={s.id} s={s} ar={ar} onEdit={setEditing} />)}
      </div>
      <AttendanceEditDialog session={editing} ar={ar} onClose={() => setEditing(null)} onSaved={load} />
    </div>
  );
}

const KIND_LABEL = {
  absence_notice: { ar: 'إبلاغ غياب مسبق', en: 'Absence notice' },
  makeup: { ar: 'طلب جلسة تعويضية', en: 'Makeup request' },
};

const SESSION_STATUS_AR = { scheduled: 'مجدولة', held: 'تمّت', late: 'تأخّر', absent: 'غياب', cancelled: 'ملغاة' };
const SESSION_STATUS_EN = { scheduled: 'Scheduled', held: 'Held', late: 'Late', absent: 'Absent', cancelled: 'Cancelled' };

function DecisionDialog({ state, ar, termRange, onClose, onDone }) {
  const { api } = useAuth();
  const request = state?.request;
  const mode = state?.mode;
  const [note, setNote] = useState('');
  const [form, setForm] = useState({ proposed_date: '', proposed_start: '', proposed_end: '', proposed_room: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setBusy(false);
    setNote('');
    setForm({
      proposed_date: request?.proposed_date || '',
      proposed_start: request?.proposed_start || '',
      proposed_end: request?.proposed_end || '',
      proposed_room: request?.proposed_room || '',
    });
  }, [state]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { decision: mode === 'reject' ? 'reject' : 'approve', note };
      if (mode === 'reschedule') Object.assign(body, form);
      const res = await api.post(`/vda/staff-sessions/requests/${request.id}/decide`, body);
      toast.success(mode === 'reject'
        ? (ar ? 'رُفض الطلب وأُبلغ المدرّس' : 'Request rejected')
        : request.kind === 'makeup'
          ? (ar ? `اعتُمدت الجلسة التعويضية ${res.data?.proposal?.date || ''}` : 'Makeup session approved')
          : (ar ? 'اعتُمد الغياب وأُلغيت الجلسة' : 'Absence approved, session cancelled'));
      onDone();
      onClose();
    } catch (err) {
      toast.error(staffSessionErrorMessage(err, ar, VDA_MESSAGES));
      setBusy(false);
    }
  };

  const titles = {
    approve: ar ? 'اعتماد الطلب' : 'Approve request',
    reschedule: ar ? 'تعديل الموعد ثم الاعتماد' : 'Reschedule and approve',
    reject: ar ? 'رفض الطلب' : 'Reject request',
  };

  return (
    <Dialog open={Boolean(request)} onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent className="rounded-3xl sm:max-w-md" data-testid="vda-decision-dialog">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{titles[mode] || ''}</DialogTitle>
            <DialogDescription className="text-start">
              {request && `${ar ? KIND_LABEL[request.kind].ar : KIND_LABEL[request.kind].en} · ${request.session.course_code} · ${request.session.session_date} ${request.session.start_time}–${request.session.end_time} · ${request.staff?.name || ''}`}
              {mode === 'approve' && request?.kind === 'absence_notice' && (
                <><br />{ar ? 'ستُلغى الجلسة ولن تُحسب على الطلاب، ويمكن للمدرّس بعدها طلب تعويض.' : 'The session will be cancelled and will not count against students.'}</>
              )}
              {mode === 'approve' && request?.kind === 'makeup' && (
                <><br />{ar ? `ستُنشأ جلسة تعويضية ${request.proposed_date} ${request.proposed_start}–${request.proposed_end}${request.proposed_room ? ` · ${request.proposed_room}` : ''}.` : `A makeup session will be created on ${request.proposed_date}.`}</>
              )}
            </DialogDescription>
          </DialogHeader>
          {mode === 'reschedule' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1 col-span-2">
                <Label htmlFor="vda-makeup-date">{ar ? 'التاريخ' : 'Date'}</Label>
                <Input id="vda-makeup-date" type="date" min={termRange.min} max={termRange.max} value={form.proposed_date} onChange={set('proposed_date')} className="rounded-xl" data-testid="vda-makeup-date" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="vda-makeup-start">{ar ? 'من' : 'From'}</Label>
                <Input id="vda-makeup-start" type="time" value={form.proposed_start} onChange={set('proposed_start')} className="rounded-xl" data-testid="vda-makeup-start" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="vda-makeup-end">{ar ? 'إلى' : 'To'}</Label>
                <Input id="vda-makeup-end" type="time" value={form.proposed_end} onChange={set('proposed_end')} className="rounded-xl" data-testid="vda-makeup-end" />
              </div>
              <div className="space-y-1 col-span-2">
                <Label htmlFor="vda-makeup-room">{ar ? 'القاعة' : 'Room'}</Label>
                <Input id="vda-makeup-room" value={form.proposed_room} onChange={set('proposed_room')} className="rounded-xl" data-testid="vda-makeup-room" />
              </div>
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="vda-decision-note">
              {mode === 'reject' ? (ar ? 'سبب الرفض (إلزامي)' : 'Reason (required)') : (ar ? 'ملاحظة للمدرّس (اختياري)' : 'Note (optional)')}
            </Label>
            <Textarea id="vda-decision-note" value={note} onChange={(e) => setNote(e.target.value)} className="rounded-xl" rows={2} data-testid="vda-decision-note" />
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" className="rounded-xl" disabled={busy} onClick={onClose}>
              {ar ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button type="submit" variant={mode === 'reject' ? 'destructive' : 'default'} className="rounded-xl" disabled={busy} data-testid="vda-decision-submit">
              {mode === 'reject' ? (ar ? 'رفض' : 'Reject') : (ar ? 'اعتماد' : 'Approve')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RequestCard({ r, ar, onDecide }) {
  const s = r.session;
  const statusLabel = ar ? SESSION_STATUS_AR[s.status] : SESSION_STATUS_EN[s.status];
  const blocked = r.kind === 'makeup' && (r.clash || r.expired);
  return (
    <Card className={cn('rounded-2xl', r.status === 'pending' && 'border-primary/30')} data-testid={`vda-request-${r.id}`} data-status={r.status}>
      <CardContent className="p-4 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={r.kind === 'makeup' ? 'default' : 'secondary'} className="rounded-full">{ar ? KIND_LABEL[r.kind].ar : KIND_LABEL[r.kind].en}</Badge>
          <span className="font-medium">{r.staff?.name}</span>
          <span className="text-xs text-muted-foreground">{r.staff?.person_code}</span>
          {r.staff_missed_this_term > 0 && (
            <Badge variant="outline" className="rounded-full text-[10px]">
              {ar ? `جلسات غاب عنها هذا الفصل: ${r.staff_missed_this_term}` : `Missed this term: ${r.staff_missed_this_term}`}
            </Badge>
          )}
          <span className="text-xs text-muted-foreground ms-auto">{stamp(r.created_at)}</span>
        </div>
        <div className="text-sm">
          <span className="font-medium">{s.course_code}</span> — {s.course_name} · <span className="text-muted-foreground">{sectionLabel(s, ar)}</span>
        </div>
        <div className="text-sm text-muted-foreground">
          {ar ? 'الجلسة: ' : 'Session: '}{dayName(s.session_date, ar)} {s.session_date} · {s.start_time}–{s.end_time}{s.room ? ` · ${s.room}` : ''} · {statusLabel}
          {s.student_reports > 0 && (ar ? ` · ${s.student_reports} بلاغ من الطلاب` : ` · ${s.student_reports} student reports`)}
        </div>
        {r.reason && <p className="text-sm">«{r.reason}»</p>}
        {r.kind === 'makeup' && (
          <div className="rounded-xl bg-muted/50 p-3 text-sm space-y-1">
            <div className="font-medium" data-testid={`vda-request-proposal-${r.id}`}>
              {ar ? 'الموعد المقترح: ' : 'Proposed: '}{dayName(r.proposed_date, ar)} {r.proposed_date} · {r.proposed_start}–{r.proposed_end}{r.proposed_room ? ` · ${r.proposed_room}` : ''}
            </div>
            {r.status === 'pending' && (
              r.expired ? (
                <div className="text-destructive flex items-center gap-1" data-testid={`vda-request-expired-${r.id}`}>
                  <AlertTriangle className="w-3.5 h-3.5" />{ar ? 'مضى الموعد المقترح، عدّل الموعد قبل الاعتماد.' : 'The proposed time has passed.'}
                </div>
              ) : r.clash ? (
                <div className="text-destructive flex items-center gap-1" data-testid={`vda-request-clash-${r.id}`}>
                  <AlertTriangle className="w-3.5 h-3.5" />{ar ? 'تعارض: ' : 'Clash: '}{clashText(r.clash, ar)}
                </div>
              ) : (
                <div className="text-emerald-700 dark:text-emerald-400 flex items-center gap-1" data-testid={`vda-request-noclash-${r.id}`}>
                  <CheckCircle2 className="w-3.5 h-3.5" />{ar ? 'لا تعارض مع جلسات المدرّس أو القاعة' : 'No staff or room clash'}
                </div>
              )
            )}
          </div>
        )}
        {r.status !== 'pending' && (
          <div className="text-sm flex flex-wrap items-center gap-2">
            <Badge variant={r.status === 'approved' ? 'default' : r.status === 'rejected' ? 'destructive' : 'secondary'} className="rounded-full">
              {ar
                ? ({ approved: 'مقبول', rejected: 'مرفوض', cancelled: 'سحبه المدرّس' })[r.status]
                : r.status}
            </Badge>
            {r.decided_by?.name && <span className="text-muted-foreground">{ar ? 'بواسطة' : 'by'} {r.decided_by.name} · {stamp(r.decided_at)}</span>}
            {r.decision_note && <span>— {r.decision_note}</span>}
          </div>
        )}
        {r.status === 'pending' && (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button type="button" className="rounded-xl" disabled={blocked} onClick={() => onDecide(r, 'approve')} data-testid={`vda-request-approve-${r.id}`}>
              {ar ? 'اعتماد' : 'Approve'}
            </Button>
            {r.kind === 'makeup' && (
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => onDecide(r, 'reschedule')} data-testid={`vda-request-reschedule-${r.id}`}>
                {ar ? 'تعديل الموعد ثم الاعتماد' : 'Reschedule & approve'}
              </Button>
            )}
            <Button type="button" variant="outline" className="rounded-xl text-destructive" onClick={() => onDecide(r, 'reject')} data-testid={`vda-request-reject-${r.id}`}>
              {ar ? 'رفض' : 'Reject'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Requests({ ar, onPendingCount }) {
  const { api } = useAuth();
  const [status, setStatus] = useState('pending');
  const [data, setData] = useState(null);
  const [decision, setDecision] = useState(null);

  const load = async () => {
    try {
      const res = await api.get('/vda/staff-sessions/requests', { params: { status } });
      setData(res.data);
      onPendingCount?.(res.data?.pending ?? 0);
    } catch (err) {
      toast.error(staffSessionErrorMessage(err, ar, VDA_MESSAGES));
    }
  };

  useEffect(() => { load(); }, [api, status]);

  const today = localIso();
  const termRange = {
    min: [today, data?.term?.starts_on].filter(Boolean).sort().pop(),
    max: data?.term?.ends_on,
  };
  const requests = data?.requests || [];

  return (
    <div className="space-y-4" data-testid="vda-requests">
      <div className="flex gap-2">
        {[
          { key: 'pending', ar: `المعلّقة${data ? ` (${data.pending})` : ''}`, en: `Pending${data ? ` (${data.pending})` : ''}` },
          { key: 'decided', ar: 'المقرّرة', en: 'Decided' },
          { key: 'all', ar: 'الكل', en: 'All' },
        ].map((t) => (
          <Button key={t.key} type="button" size="sm" variant={status === t.key ? 'default' : 'outline'} className="rounded-xl" onClick={() => setStatus(t.key)} data-testid={`vda-requests-filter-${t.key}`}>
            {ar ? t.ar : t.en}
          </Button>
        ))}
      </div>
      {data && requests.length === 0 && (
        <p className="text-sm text-muted-foreground" data-testid="vda-requests-empty">
          {status === 'pending' ? (ar ? 'لا طلبات معلّقة.' : 'No pending requests.') : (ar ? 'لا طلبات.' : 'No requests.')}
        </p>
      )}
      <div className="space-y-3">
        {requests.map((r) => <RequestCard key={r.id} r={r} ar={ar} onDecide={(req, mode) => setDecision({ request: req, mode })} />)}
      </div>
      <DecisionDialog state={decision} ar={ar} termRange={termRange} onClose={() => setDecision(null)} onDone={load} />
    </div>
  );
}

const REPORT_COLUMNS = [
  { key: 'due', ar: 'جلسات حان موعدها', en: 'Due' },
  { key: 'held', ar: 'بدأها في الوقت', en: 'On time' },
  { key: 'late', ar: 'متأخرة', en: 'Late' },
  { key: 'late_minutes', ar: 'دقائق التأخير', en: 'Late min' },
  { key: 'absent_notified', ar: 'غياب مبلّغ', en: 'Notified absence' },
  { key: 'absent_unnotified', ar: 'غياب غير مبلّغ', en: 'Unnotified absence', danger: true },
  { key: 'makeup_requested', ar: 'تعويض مطلوب', en: 'Makeup requested' },
  { key: 'makeup_done', ar: 'تعويض منجز', en: 'Makeup done' },
  { key: 'makeup_pending', ar: 'تعويض قيد الانتظار', en: 'Makeup pending' },
  { key: 'makeup_not_requested', ar: 'لم يُطلب تعويضها بعد', en: 'Not requested yet' },
  { key: 'makeup_missed', ar: 'تعويض فائت', en: 'Makeup missed', danger: true },
  { key: 'student_reports', ar: 'بلاغات الطلاب', en: 'Student reports', danger: true },
];

function csvCell(value) {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function Report({ ar }) {
  const { api } = useAuth();
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get('/vda/staff-sessions/report')
      .then((res) => setData(res.data))
      .catch((err) => toast.error(staffSessionErrorMessage(err, ar, VDA_MESSAGES)));
  }, [api]);

  const rows = data?.staff || [];
  const exportCsv = () => {
    const header = [ar ? 'الاسم' : 'Name', ar ? 'الرقم' : 'ID', ar ? 'المواد' : 'Courses', ...REPORT_COLUMNS.map((c) => (ar ? c.ar : c.en))];
    const lines = rows.map((r) => [r.staff?.name, r.staff?.person_code, r.courses.join(' '), ...REPORT_COLUMNS.map((c) => r[c.key])]);
    const csv = `\uFEFF${[header, ...lines].map((line) => line.map(csvCell).join(',')).join('\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `staff-attendance-${localIso()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="rounded-2xl" data-testid="vda-report">
      <CardHeader className="flex flex-row flex-wrap items-center gap-2 space-y-0">
        <div>
          <CardTitle className="text-base">{ar ? 'تقرير التزام الكادر' : 'Staff commitment report'}</CardTitle>
          <CardDescription>{data?.term ? `${data.term.name} · ${data.term.starts_on} → ${data.term.ends_on}` : ''}</CardDescription>
        </div>
        <Button type="button" variant="outline" className="rounded-xl ms-auto" disabled={!rows.length} onClick={exportCsv} data-testid="vda-report-export">
          <Download className="w-4 h-4 me-1" />
          {ar ? 'تصدير CSV' : 'Export CSV'}
        </Button>
      </CardHeader>
      <CardContent>
        {data && rows.length === 0 && <p className="text-sm text-muted-foreground">{ar ? 'لا بيانات بعد.' : 'No data yet.'}</p>}
        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="vda-report-table">
              <thead className="text-muted-foreground text-xs">
                <tr className="border-b">
                  <th className="text-start py-2 px-2">{ar ? 'المدرّس / المعيد' : 'Staff'}</th>
                  {REPORT_COLUMNS.map((c) => <th key={c.key} className="text-center py-2 px-2 whitespace-nowrap">{ar ? c.ar : c.en}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.staff_user_id} className="border-b last:border-0" data-testid={`vda-report-row-${r.staff_user_id}`}>
                    <td className="py-2 px-2 min-w-[11rem]">
                      <div className="font-medium whitespace-nowrap">{r.staff?.name}</div>
                      <div className="text-xs text-muted-foreground">{r.staff?.person_code} · {r.courses.join('، ')}</div>
                    </td>
                    {REPORT_COLUMNS.map((c) => (
                      <td key={c.key} className={cn('text-center py-2 px-2', c.danger && r[c.key] > 0 && 'text-destructive font-semibold')} data-testid={`vda-report-${r.staff_user_id}-${c.key}`}>
                        {r[c.key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function VdaStaffAttendance() {
  const { api } = useAuth();
  const { language } = useLanguage();
  const ar = language === 'ar';
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = PAGE_TABS.includes(searchParams.get('tab')) ? searchParams.get('tab') : 'board';
  const [pending, setPending] = useState(null);

  useEffect(() => {
    api.get('/vda/staff-sessions/requests', { params: { status: 'pending' } })
      .then((res) => setPending(res.data?.pending ?? 0))
      .catch(() => {});
  }, [api]);

  const pendingBadge = useMemo(() => (pending > 0 ? (
    <Badge className="rounded-full ms-1 h-5 px-1.5 text-[10px]" data-testid="vda-tab-requests-count">{pending}</Badge>
  ) : null), [pending]);

  return (
    <div className="p-4 sm:p-6 space-y-6" data-testid="vda-staff-attendance">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <UserCheck className="w-6 h-6" />
          {ar ? 'حضور الكادر والتعويض' : 'Staff attendance & makeup'}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {ar
            ? 'تابع بدء الجلسات مباشرة، واعتمد إبلاغات الغياب وطلبات التعويض، وعدّل حالة حضور الكادر عند الحاجة.'
            : 'Follow sessions live, decide absence notices and makeup requests, and correct staff attendance.'}
        </p>
      </div>
      <Tabs value={tab} onValueChange={(v) => setSearchParams(v === 'board' ? {} : { tab: v }, { replace: true })} className="space-y-6">
        <TabsList className="bg-muted/50 p-1 rounded-2xl flex-wrap h-auto">
          <TabsTrigger value="board" className="rounded-xl" data-testid="vda-tab-board">
            <CalendarDays className="w-4 h-4 me-1" />{ar ? 'جلسات اليوم' : 'Today'}
          </TabsTrigger>
          <TabsTrigger value="requests" className="rounded-xl" data-testid="vda-tab-requests">
            {ar ? 'الطلبات' : 'Requests'}{pendingBadge}
          </TabsTrigger>
          <TabsTrigger value="report" className="rounded-xl" data-testid="vda-tab-report">{ar ? 'تقرير الكادر' : 'Staff report'}</TabsTrigger>
          <TabsTrigger value="settings" className="rounded-xl" data-testid="vda-tab-settings">{ar ? 'الإعدادات' : 'Settings'}</TabsTrigger>
        </TabsList>
        <TabsContent value="board"><Board ar={ar} onPendingCount={setPending} /></TabsContent>
        <TabsContent value="requests"><Requests ar={ar} onPendingCount={setPending} /></TabsContent>
        <TabsContent value="report"><Report ar={ar} /></TabsContent>
        <TabsContent value="settings"><StaffSessionsCard api={api} ar={ar} /></TabsContent>
      </Tabs>
    </div>
  );
}
