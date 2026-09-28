import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

const DAYS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const DAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const FIELDS = [
  { key: 'staff_grace_minutes', min: 0, max: 60, ar: 'دقائق السماح قبل اعتباره متأخراً', en: 'Grace minutes before "late"' },
  { key: 'staff_late_absent_minutes', min: 5, max: 180, ar: 'بعد كم دقيقة تأخير يُعتبر غائباً', en: 'Late minutes that count as absent' },
  { key: 'staff_check_in_before_minutes', min: 0, max: 60, ar: 'يُسمح بـ«بدء الجلسة» قبل الموعد بـ (دقيقة)', en: 'Check-in opens before start (min)' },
  { key: 'makeup_request_days', min: 1, max: 60, ar: 'مهلة طلب التعويض بعد الغياب (يوم)', en: 'Makeup request deadline (days)' },
  { key: 'student_report_after_minutes', min: 5, max: 120, ar: 'زر «المدرّس لم يحضر» يظهر للطالب بعد (دقيقة)', en: 'Student "no-show" report after (min)' },
];

const SETTINGS_ENDPOINT = '/vda/staff-sessions/settings';
const OVERVIEW_ENDPOINT = '/vda/staff-sessions/overview';

export default function StaffSessionsCard({ api, ar }) {
  const [settings, setSettings] = useState(null);
  const [overview, setOverview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const days = ar ? DAYS_AR : DAYS_EN;

  const load = async () => {
    try {
      const res = await api.get(OVERVIEW_ENDPOINT);
      setOverview(res.data);
      setSettings(res.data?.settings || null);
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'تعذر تحميل جلسات الكادر' : 'Failed to load staff sessions'));
    }
  };

  useEffect(() => { load(); }, [api]);

  const save = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(FIELDS.map((f) => [f.key, Number(settings?.[f.key])]));
    if (body.staff_late_absent_minutes <= body.staff_grace_minutes) {
      toast.error(ar
        ? 'دقائق اعتباره غائباً يجب أن تكون أكبر من دقائق السماح'
        : 'Absent minutes must be greater than grace minutes');
      return;
    }
    setBusy(true);
    try {
      const res = await api.patch(SETTINGS_ENDPOINT, body);
      setSettings(res.data);
      toast.success(ar ? 'حُفظت إعدادات حضور الكادر' : 'Staff attendance settings saved');
    } catch (err) {
      toast.error(err.response?.data?.detail || (ar ? 'تعذر حفظ الإعدادات' : 'Failed to save settings'));
    } finally {
      setBusy(false);
    }
  };

  const term = overview?.term;
  const totals = overview?.totals;
  const rows = overview?.sections || [];

  return (
    <Card className="rounded-2xl" data-testid="staff-sessions-card">
      <CardHeader>
        <CardTitle className="text-base">{ar ? 'حضور الكادر والجلسات التعويضية — الإعدادات' : 'Staff attendance & makeup — settings'}</CardTitle>
        <CardDescription>
          {ar
            ? 'تُولَّد جلسات الفصل تلقائياً من البرنامج الأسبوعي للشعب. الجلسة الملغاة أو التي غاب عنها المدرّس لا تُحسب على الطلاب، والجلسة التعويضية تُحسب.'
            : 'Term sessions are generated from the weekly section schedule. Cancelled or staff-absent sessions do not count against students; makeup sessions do.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {settings && (
          <form onSubmit={save} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="staff-sessions-settings">
            {FIELDS.map((f) => (
              <div key={f.key} className="space-y-1">
                <Label className="text-xs">{ar ? f.ar : f.en}</Label>
                <Input
                  type="number"
                  min={f.min}
                  max={f.max}
                  value={settings[f.key] ?? ''}
                  onChange={(e) => setSettings((s) => ({ ...s, [f.key]: e.target.value }))}
                  className="rounded-xl w-28"
                  data-testid={`staff-setting-${f.key}`}
                />
              </div>
            ))}
            <div className="flex items-end">
              <Button type="submit" className="rounded-xl" disabled={busy} data-testid="staff-sessions-save">
                {ar ? 'حفظ للكلية' : 'Save for the college'}
              </Button>
            </div>
          </form>
        )}

        {overview && !term && (
          <p className="text-sm text-muted-foreground">{ar ? 'لا يوجد فصل حالي مفتوح.' : 'No open current term.'}</p>
        )}

        {term && (
          <div className="rounded-xl border p-3 space-y-3" data-testid="staff-sessions-overview">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{term.name}</span>
              <span className="text-muted-foreground">{term.starts_on || '—'} → {term.ends_on || '—'}</span>
              <Badge variant="secondary" data-testid="staff-sessions-total">
                {ar ? `${totals?.sessions ?? 0} جلسة` : `${totals?.sessions ?? 0} sessions`}
              </Badge>
              <Badge variant="outline">{ar ? `${totals?.sections ?? 0} شعبة` : `${totals?.sections ?? 0} sections`}</Badge>
              {totals?.unassigned > 0 && (
                <Badge variant="destructive">{ar ? `${totals.unassigned} شعبة بلا مدرّس محدد` : `${totals.unassigned} sections without staff`}</Badge>
              )}
              {totals?.without_meetings > 0 && (
                <Badge variant="outline">{ar ? `${totals.without_meetings} شعبة بلا موعد أسبوعي` : `${totals.without_meetings} sections without a weekly slot`}</Badge>
              )}
              <Button type="button" variant="ghost" size="sm" className="rounded-xl ms-auto" onClick={() => setShowTable((v) => !v)} data-testid="staff-sessions-toggle">
                {showTable ? (ar ? 'إخفاء التفاصيل' : 'Hide details') : (ar ? 'عرض الجلسات لكل شعبة' : 'Show sessions per section')}
              </Button>
            </div>
            {(!term.starts_on || !term.ends_on) && (
              <p className="text-sm text-amber-600">{ar ? 'حدّد تاريخ بداية ونهاية الفصل لتوليد الجلسات.' : 'Set the term start and end dates to generate sessions.'}</p>
            )}
            {showTable && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="staff-sessions-table">
                  <thead className="text-muted-foreground">
                    <tr className="border-b">
                      <th className="text-start py-2 px-2">{ar ? 'المادة' : 'Course'}</th>
                      <th className="text-start py-2 px-2">{ar ? 'الشعبة' : 'Section'}</th>
                      <th className="text-start py-2 px-2">{ar ? 'الموعد' : 'Slot'}</th>
                      <th className="text-start py-2 px-2">{ar ? 'المدرّس / المعيد' : 'Staff'}</th>
                      <th className="text-start py-2 px-2">{ar ? 'الجلسات' : 'Sessions'}</th>
                      <th className="text-start py-2 px-2">{ar ? 'الجلسة القادمة' : 'Next'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.section_id} className="border-b last:border-0" data-testid={`staff-sessions-row-${r.section_id}`}>
                        <td className="py-2 px-2">
                          <div className="font-medium">{r.course_code}</div>
                          <div className="text-xs text-muted-foreground">{r.course_name}</div>
                        </td>
                        <td className="py-2 px-2">
                          {r.section_code} · {r.section_kind === 'practical' ? (ar ? 'عملي' : 'Practical') : (ar ? 'نظري' : 'Theory')}
                        </td>
                        <td className="py-2 px-2">
                          {r.meetings.length
                            ? r.meetings.map((m) => (
                              <div key={m.id}>{days[m.day_of_week]} {m.start_time}–{m.end_time}{m.room ? ` · ${m.room}` : ''}</div>
                            ))
                            : <span className="text-muted-foreground">{ar ? 'بلا موعد' : 'No slot'}</span>}
                        </td>
                        <td className="py-2 px-2">
                          {r.staff_name || <span className="text-destructive">{ar ? 'غير محدد' : 'Unassigned'}</span>}
                        </td>
                        <td className="py-2 px-2" data-testid={`staff-sessions-count-${r.section_id}`}>{r.total}</td>
                        <td className="py-2 px-2">{r.next_date || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
