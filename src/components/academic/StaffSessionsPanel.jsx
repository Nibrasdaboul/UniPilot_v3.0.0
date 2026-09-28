import { useEffect, useMemo, useState } from 'react';
import { Clock, MapPin, PlayCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { staffSessionErrorMessage } from '@/lib/staffSessionErrors';
import { toast } from 'sonner';

const DAYS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const DAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const SESSION_STATUS = {
  scheduled: { ar: 'مجدولة', en: 'Scheduled', variant: 'outline' },
  held: { ar: 'تمّت', en: 'Held', variant: 'default' },
  late: { ar: 'تأخّر', en: 'Late', variant: 'secondary' },
  absent: { ar: 'غياب', en: 'Absent', variant: 'destructive' },
  cancelled: { ar: 'ملغاة', en: 'Cancelled', variant: 'secondary' },
};

const REQUEST_KIND = {
  absence_notice: { ar: 'إبلاغ غياب', en: 'Absence notice' },
  makeup: { ar: 'طلب تعويض', en: 'Makeup request' },
};

const REQUEST_STATUS = {
  pending: { ar: 'بانتظار نائب العميد', en: 'Awaiting the vice dean', variant: 'outline' },
  approved: { ar: 'مقبول', en: 'Approved', variant: 'default' },
  rejected: { ar: 'مرفوض', en: 'Rejected', variant: 'destructive' },
  cancelled: { ar: 'ملغى', en: 'Cancelled', variant: 'secondary' },
};

function dayName(iso, ar) {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  if (!y) return '';
  return (ar ? DAYS_AR : DAYS_EN)[new Date(y, m - 1, d).getDay()];
}

function clock(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function minutesAr(n) {
  const v = Number(n);
  return `${v} ${v >= 3 && v <= 10 ? 'دقائق' : 'دقيقة'}`;
}

function stampLabel(stamp) {
  return String(stamp || '').replace('T', ' ');
}

function sectionLabel(s, ar) {
  const kind = s.section_kind === 'practical' ? (ar ? 'عملي' : 'Practical') : (ar ? 'نظري' : 'Theory');
  return `${s.section_code || ''} · ${kind}`;
}

function attendanceText(att, ar) {
  if (!att) return null;
  if (att.source === 'auto') return ar ? 'لم تبدأ الجلسة، فسُجّل غياب تلقائياً' : 'No check-in, marked absent automatically';
  const at = clock(att.checked_in_at);
  if (att.status === 'present') return ar ? `بدأت الجلسة ${at}` : `Checked in ${at}`;
  if (att.status === 'late') return ar ? `بدأت الجلسة ${at} — تأخير ${minutesAr(att.late_minutes)}` : `Checked in ${at} — ${att.late_minutes} min late`;
  if (att.status === 'absent') return ar ? `بدأت الجلسة ${at} — تأخير ${minutesAr(att.late_minutes)} يُحسب غياباً` : `Checked in ${at} — ${att.late_minutes} min late counts as absent`;
  if (att.status === 'excused') return ar ? 'غياب بعذر' : 'Excused';
  return null;
}

function Stat({ label, value, testId }) {
  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl" data-testid={testId}>{value ?? '—'}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function AbsenceDialog({ session, ar, onClose, onSubmit }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setReason(''); setBusy(false); }, [session]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const ok = await onSubmit({ reason });
    if (!ok) setBusy(false);
  };

  return (
    <Dialog open={Boolean(session)} onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent className="rounded-3xl sm:max-w-md" data-testid="absence-dialog">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{ar ? 'إبلاغ مسبق عن غياب' : 'Report an absence in advance'}</DialogTitle>
            <DialogDescription className="text-start">
              {session && `${session.course_code} · ${dayName(session.session_date, ar)} ${session.session_date} · ${session.start_time}–${session.end_time}`}
              <br />
              {ar
                ? 'يصل البلاغ إلى نائب العميد للشؤون الأكاديمية ليقرّر. يمكنك طلب جلسة تعويضية بعد الإبلاغ.'
                : 'The Academic Vice Dean reviews the notice. You can request a makeup session after reporting.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor="absence-reason">{ar ? 'سبب الغياب' : 'Reason'}</Label>
            <Textarea
              id="absence-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="rounded-xl"
              rows={3}
              data-testid="absence-reason"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" className="rounded-xl" disabled={busy} onClick={onClose}>
              {ar ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button type="submit" className="rounded-xl" disabled={busy} data-testid="absence-submit">
              {ar ? 'إرسال البلاغ' : 'Send notice'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MakeupDialog({ session, ar, minDate, maxDate, onClose, onSubmit }) {
  const [form, setForm] = useState({ proposed_date: '', proposed_start: '', proposed_end: '', proposed_room: '', reason: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setBusy(false);
    setForm({
      proposed_date: '',
      proposed_start: session?.start_time || '',
      proposed_end: session?.end_time || '',
      proposed_room: session?.room || '',
      reason: '',
    });
  }, [session]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const ok = await onSubmit(form);
    if (!ok) setBusy(false);
  };

  return (
    <Dialog open={Boolean(session)} onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent className="rounded-3xl sm:max-w-md" data-testid="makeup-dialog">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{ar ? 'طلب جلسة تعويضية' : 'Request a makeup session'}</DialogTitle>
            <DialogDescription className="text-start">
              {session && `${ar ? 'عن جلسة' : 'For'} ${session.course_code} · ${dayName(session.session_date, ar)} ${session.session_date} · ${session.start_time}–${session.end_time}`}
              <br />
              {ar
                ? `يراجع نائب العميد الطلب. آخر موعد للطلب: ${stampLabel(session?.makeup_deadline)}`
                : `The vice dean reviews the request. Deadline: ${stampLabel(session?.makeup_deadline)}`}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1 col-span-2">
              <Label htmlFor="makeup-date">{ar ? 'التاريخ المقترح' : 'Proposed date'}</Label>
              <Input id="makeup-date" type="date" min={minDate} max={maxDate} value={form.proposed_date} onChange={set('proposed_date')} className="rounded-xl" data-testid="makeup-date" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="makeup-start">{ar ? 'من' : 'From'}</Label>
              <Input id="makeup-start" type="time" value={form.proposed_start} onChange={set('proposed_start')} className="rounded-xl" data-testid="makeup-start" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="makeup-end">{ar ? 'إلى' : 'To'}</Label>
              <Input id="makeup-end" type="time" value={form.proposed_end} onChange={set('proposed_end')} className="rounded-xl" data-testid="makeup-end" />
            </div>
            <div className="space-y-1 col-span-2">
              <Label htmlFor="makeup-room">{ar ? 'القاعة' : 'Room'}</Label>
              <Input id="makeup-room" value={form.proposed_room} onChange={set('proposed_room')} className="rounded-xl" data-testid="makeup-room" />
            </div>
            <div className="space-y-1 col-span-2">
              <Label htmlFor="makeup-reason">{ar ? 'ملاحظة (اختياري)' : 'Note (optional)'}</Label>
              <Textarea id="makeup-reason" value={form.reason} onChange={set('reason')} className="rounded-xl" rows={2} data-testid="makeup-reason" />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" className="rounded-xl" disabled={busy} onClick={onClose}>
              {ar ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button type="submit" className="rounded-xl" disabled={busy} data-testid="makeup-submit">
              {ar ? 'إرسال الطلب' : 'Send request'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SessionRow({ s, ar, busyId, onCheckIn, onAbsence, onMakeup, onCancelRequest }) {
  const status = SESSION_STATUS[s.status] || SESSION_STATUS.scheduled;
  const att = attendanceText(s.attendance, ar);
  return (
    <div className="rounded-2xl border p-4 space-y-2" data-testid={`my-session-${s.id}`} data-status={s.status}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{dayName(s.session_date, ar)} {s.session_date}</span>
        <span className="text-sm text-muted-foreground flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{s.start_time}–{s.end_time}</span>
        {s.room && <span className="text-sm text-muted-foreground flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{s.room}</span>}
        <Badge variant={status.variant} className="ms-auto" data-testid={`my-session-status-${s.id}`}>{ar ? status.ar : status.en}</Badge>
      </div>
      <div className="text-sm">
        <span className="font-medium">{s.course_code}</span> — {s.course_name}
        <span className="text-muted-foreground"> · {sectionLabel(s, ar)}</span>
        {s.kind === 'makeup' && (
          <Badge variant="secondary" className="ms-2">
            {ar ? `تعويضية${s.makeup_for_date ? ` عن ${s.makeup_for_date}` : ''}` : `Makeup${s.makeup_for_date ? ` for ${s.makeup_for_date}` : ''}`}
          </Badge>
        )}
      </div>
      {att && <p className="text-sm text-muted-foreground" data-testid={`my-session-attendance-${s.id}`}>{att}</p>}

      {s.requests.length > 0 && (
        <div className="space-y-1">
          {s.requests.map((r) => {
            const rs = REQUEST_STATUS[r.status] || REQUEST_STATUS.pending;
            return (
              <div key={r.id} className="flex flex-wrap items-center gap-2 text-sm" data-testid={`my-request-${r.id}`} data-status={r.status}>
                <span className="font-medium">{ar ? REQUEST_KIND[r.kind]?.ar : REQUEST_KIND[r.kind]?.en}</span>
                {r.kind === 'makeup' && (
                  <span className="text-muted-foreground">{dayName(r.proposed_date, ar)} {r.proposed_date} · {r.proposed_start}–{r.proposed_end}{r.proposed_room ? ` · ${r.proposed_room}` : ''}</span>
                )}
                {r.kind === 'absence_notice' && r.reason && <span className="text-muted-foreground">«{r.reason}»</span>}
                <Badge variant={rs.variant}>{ar ? rs.ar : rs.en}</Badge>
                {r.decision_note && <span className="text-muted-foreground">— {r.decision_note}</span>}
                {r.status === 'pending' && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="rounded-xl h-7"
                    disabled={busyId === `r${r.id}`}
                    onClick={() => onCancelRequest(r)}
                    data-testid={`my-request-cancel-${r.id}`}
                  >
                    {ar ? 'إلغاء الطلب' : 'Cancel request'}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {(s.actions.can_check_in || s.actions.can_notify_absence || s.actions.can_request_makeup) && (
        <div className="flex flex-wrap gap-2 pt-1">
          {s.actions.can_check_in && (
            <Button type="button" className="rounded-xl" disabled={busyId === s.id} onClick={() => onCheckIn(s)} data-testid={`my-session-checkin-${s.id}`}>
              <PlayCircle className="w-4 h-4 me-1" />
              {ar ? 'بدء الجلسة' : 'Start session'}
            </Button>
          )}
          {s.actions.can_notify_absence && (
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => onAbsence(s)} data-testid={`my-session-absence-${s.id}`}>
              {ar ? 'إبلاغ عن غياب' : 'Report absence'}
            </Button>
          )}
          {s.actions.can_request_makeup && (
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => onMakeup(s)} data-testid={`my-session-makeup-${s.id}`}>
              {ar ? 'طلب تعويض' : 'Request makeup'}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

const TABS = [
  { key: 'upcoming', ar: 'القادمة', en: 'Upcoming' },
  { key: 'past', ar: 'السابقة', en: 'Past' },
  { key: 'all', ar: 'الكل', en: 'All' },
];

export default function StaffSessionsPanel({ catalogId = null }) {
  const { api, isTeachingStaff } = useAuth();
  const { language } = useLanguage();
  const ar = language === 'ar';
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('upcoming');
  const [busyId, setBusyId] = useState(null);
  const [absenceFor, setAbsenceFor] = useState(null);
  const [makeupFor, setMakeupFor] = useState(null);

  const load = async () => {
    try {
      const res = await api.get('/academic/staff/sessions', {
        params: catalogId ? { catalog_course_id: catalogId } : undefined,
      });
      setData(res.data);
    } catch (e) {
      toast.error(staffSessionErrorMessage(e, ar));
    }
  };

  useEffect(() => {
    if (!isTeachingStaff) return undefined;
    load();
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, [api, isTeachingStaff, catalogId]);

  const today = (data?.now || '').slice(0, 10);
  const sessions = data?.sessions || [];
  const isUpcoming = (s) => s.status === 'scheduled' && s.session_date >= today;

  const visible = useMemo(() => {
    if (tab === 'upcoming') return sessions.filter(isUpcoming);
    if (tab === 'past') return sessions.filter((s) => !isUpcoming(s)).reverse();
    return sessions;
  }, [sessions, tab, today]);

  const focus = sessions.find((s) => s.actions.can_check_in) || sessions.find(isUpcoming) || null;

  const checkIn = async (s) => {
    setBusyId(s.id);
    try {
      const res = await api.post(`/academic/staff/sessions/${s.id}/check-in`);
      const r = res.data;
      if (r.status === 'present') toast.success(ar ? 'بدأت الجلسة وسُجّل حضورك' : 'Session started, you are present');
      else if (r.status === 'late') toast.warning(ar ? `بدأت الجلسة — سُجّل تأخير ${minutesAr(r.late_minutes)}` : `Session started — ${r.late_minutes} min late`);
      else toast.error(ar ? `بدأت الجلسة — تأخير ${minutesAr(r.late_minutes)} يُحسب غياباً` : `Session started — ${r.late_minutes} min late counts as absent`);
      await load();
    } catch (e) {
      toast.error(staffSessionErrorMessage(e, ar));
    } finally {
      setBusyId(null);
    }
  };

  const sendAbsence = async (body) => {
    try {
      await api.post(`/academic/staff/sessions/${absenceFor.id}/absence-notice`, body);
      toast.success(ar ? 'أُرسل بلاغ الغياب إلى نائب العميد' : 'Absence notice sent');
      setAbsenceFor(null);
      await load();
      return true;
    } catch (e) {
      toast.error(staffSessionErrorMessage(e, ar));
      return false;
    }
  };

  const sendMakeup = async (body) => {
    try {
      await api.post(`/academic/staff/sessions/${makeupFor.id}/makeup`, body);
      toast.success(ar ? 'أُرسل طلب التعويض إلى نائب العميد' : 'Makeup request sent');
      setMakeupFor(null);
      await load();
      return true;
    } catch (e) {
      toast.error(staffSessionErrorMessage(e, ar));
      return false;
    }
  };

  const cancelRequest = async (r) => {
    setBusyId(`r${r.id}`);
    try {
      await api.post(`/academic/staff/session-requests/${r.id}/cancel`);
      toast.success(ar ? 'أُلغي الطلب' : 'Request cancelled');
      await load();
    } catch (e) {
      toast.error(staffSessionErrorMessage(e, ar));
    } finally {
      setBusyId(null);
    }
  };

  const counts = data?.counts || {};
  const rowProps = { ar, busyId, onCheckIn: checkIn, onAbsence: setAbsenceFor, onMakeup: setMakeupFor, onCancelRequest: cancelRequest };

  return (
    <div className="space-y-6" data-testid="staff-sessions-panel">
      <p className="text-sm text-muted-foreground">
        {ar
          ? `اضغط «بدء الجلسة» عند وصولك. يُفتح الزر قبل الموعد بـ ${minutesAr(data?.settings?.staff_check_in_before_minutes ?? 15)}، ويُحسب تأخيراً بعد ${minutesAr(data?.settings?.staff_grace_minutes ?? 10)}، وغياباً بعد ${minutesAr(data?.settings?.staff_late_absent_minutes ?? 30)}.`
          : `Press "Start session" when you arrive. It opens ${data?.settings?.staff_check_in_before_minutes ?? 15} min early; late after ${data?.settings?.staff_grace_minutes ?? 10} min, absent after ${data?.settings?.staff_late_absent_minutes ?? 30} min.`}
      </p>

      {data && !data.term && (
        <p className="text-sm text-muted-foreground">{ar ? 'لا يوجد فصل حالي مفتوح.' : 'No open current term.'}</p>
      )}

      {data?.term && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <Stat label={ar ? 'القادمة' : 'Upcoming'} value={counts.upcoming} testId="my-sessions-count-upcoming" />
            <Stat label={ar ? 'تمّت' : 'Held'} value={counts.held} testId="my-sessions-count-held" />
            <Stat label={ar ? 'تأخّر' : 'Late'} value={counts.late} testId="my-sessions-count-late" />
            <Stat label={ar ? 'غياب' : 'Absent'} value={counts.absent} testId="my-sessions-count-absent" />
            <Stat label={ar ? 'طلبات معلّقة' : 'Pending requests'} value={counts.pending_requests} testId="my-sessions-count-pending" />
          </div>

          {focus && (
            <Card className="rounded-2xl border-primary/40" data-testid="my-sessions-focus">
              <CardHeader className="pb-2">
                <CardDescription>
                  {focus.actions.can_check_in ? (ar ? 'جلستك الآن' : 'Your session now') : (ar ? 'جلستك القادمة' : 'Your next session')}
                </CardDescription>
                <CardTitle className="text-lg">
                  {focus.course_code} — {focus.course_name}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-3">
                <span className="text-sm">{dayName(focus.session_date, ar)} {focus.session_date} · {focus.start_time}–{focus.end_time}{focus.room ? ` · ${focus.room}` : ''}</span>
                {focus.actions.can_check_in ? (
                  <Button type="button" size="lg" className="rounded-xl ms-auto" disabled={busyId === focus.id} onClick={() => checkIn(focus)} data-testid="my-sessions-focus-checkin">
                    <PlayCircle className="w-5 h-5 me-1" />
                    {ar ? 'بدء الجلسة' : 'Start session'}
                  </Button>
                ) : (
                  <span className="text-sm text-muted-foreground ms-auto">
                    {ar ? `يُفتح زر «بدء الجلسة» ${stampLabel(focus.check_in_opens_at)}` : `"Start session" opens ${stampLabel(focus.check_in_opens_at)}`}
                  </span>
                )}
              </CardContent>
            </Card>
          )}

          <div className="flex gap-2">
            {TABS.map((t) => (
              <Button
                key={t.key}
                type="button"
                variant={tab === t.key ? 'default' : 'outline'}
                size="sm"
                className="rounded-xl"
                onClick={() => setTab(t.key)}
                data-testid={`my-sessions-tab-${t.key}`}
              >
                {ar ? t.ar : t.en}
              </Button>
            ))}
          </div>

          <div className="space-y-3" data-testid="my-sessions-list">
            {visible.length === 0 ? (
              <p className="text-sm text-muted-foreground">{ar ? 'لا جلسات هنا.' : 'No sessions here.'}</p>
            ) : visible.map((s) => <SessionRow key={s.id} s={s} {...rowProps} />)}
          </div>
        </>
      )}

      <AbsenceDialog session={absenceFor} ar={ar} onClose={() => setAbsenceFor(null)} onSubmit={sendAbsence} />
      <MakeupDialog
        session={makeupFor}
        ar={ar}
        minDate={[today, data?.term?.starts_on].filter(Boolean).sort().pop()}
        maxDate={data?.term?.ends_on}
        onClose={() => setMakeupFor(null)}
        onSubmit={sendMakeup}
      />
    </div>
  );
}
