import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  GraduationCap,
  Building2,
  ClipboardCheck,
  CalendarDays,
  Bell,
  BarChart3,
  Briefcase,
  Wallet,
  Wrench,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/AuthContext';
import { useLanguage } from '@/lib/LanguageContext';
import { toast } from 'sonner';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

const APPROVAL_TYPES = [
  { key: 'grades', ar: 'اعتماد النتائج والدرجات', en: 'Grade and result approvals' },
  { key: 'status', ar: 'تأجيل / إيقاف / فصل أكاديمي', en: 'Deferral / suspension / dismissal' },
  { key: 'leave', ar: 'إجازات وتعويضات الكادر', en: 'Staff leave and compensation' },
  { key: 'curriculum', ar: 'خطط دراسية ومستحقات', en: 'Curriculum and financial requests' },
  { key: 'council', ar: 'مقترحات مجالس الأقسام', en: 'Department council proposals' },
];

function lineList(items, ar) {
  return (items || [])
    .filter((x) => x.count > 0 || items.length <= 6)
    .map((x) => `${ar ? x.ar : x.en}: ${x.count}`)
    .join(' · ');
}

function KpiCard({ icon: Icon, title, value, detail, onClick, testId }) {
  return (
    <Card
      data-testid={testId}
      className={`rounded-2xl ${onClick ? 'cursor-pointer transition-colors hover:border-primary/40 hover:bg-accent/30' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      } : undefined}
    >
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-2">
          <Icon className="w-4 h-4" />
          {title}
        </CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      {detail && (
        <CardContent>
          <p className="text-xs text-muted-foreground leading-relaxed">{detail}</p>
        </CardContent>
      )}
    </Card>
  );
}

export default function DeanDashboard() {
  const { user, api } = useAuth();
  const { language } = useLanguage();
  const navigate = useNavigate();
  const ar = language === 'ar';
  const openReport = (scope, id) => {
    navigate(id != null ? `/dashboard/report/${scope}/${encodeURIComponent(id)}` : `/dashboard/report/${scope}`);
  };
  const name = user?.full_name_ar || user?.full_name || '';
  const [kpis, setKpis] = useState(null);
  const [approvals, setApprovals] = useState([]);
  const [kindFilter, setKindFilter] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [academic, setAcademic] = useState(null);
  const [briefing, setBriefing] = useState({ alerts: [], calendar: [] });
  const [ops, setOps] = useState(null);

  const load = async () => {
    try {
      const [kpiRes, listRes, academicRes, briefingRes, opsRes] = await Promise.all([
        api.get('/dean/dashboard'),
        api.get('/dean/approvals', { params: kindFilter ? { kind: kindFilter } : {} }),
        api.get('/dean/academic'),
        api.get('/dean/briefing'),
        api.get('/dean/operations'),
      ]);
      setKpis(kpiRes.data);
      setApprovals(listRes.data?.items || []);
      setAcademic(academicRes.data);
      setBriefing(briefingRes.data || { alerts: [], calendar: [] });
      setOps(opsRes.data);
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'تعذر تحميل لوحة العميد' : 'Failed to load dean dashboard'));
    }
  };

  useEffect(() => {
    load();
  }, [api, kindFilter]);

  const decide = async (id, decision) => {
    setBusyId(id);
    try {
      await api.post(`/dean/approvals/${id}/decide`, { decision });
      toast.success(decision === 'approved' ? (ar ? 'تم الاعتماد' : 'Approved') : (ar ? 'تم الرفض' : 'Rejected'));
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'تعذر تنفيذ القرار' : 'Decision failed'));
    } finally {
      setBusyId(null);
    }
  };

  const pendingItems = kpis?.pending?.items || APPROVAL_TYPES.map((row) => ({ ...row, count: 0 }));
  const success = kpis?.success?.current;
  const successLabel = success?.rate == null
    ? '—'
    : `${success.rate}%`;
  const successDetail = success?.graded
    ? (ar
      ? `${success.passed} ناجح من ${success.graded}${success.term_name ? ` · ${success.term_name}` : ''}`
      : `${success.passed} passed of ${success.graded}${success.term_name ? ` · ${success.term_name}` : ''}`)
    : (ar ? 'لا نتائج معتمدة بعد' : 'No finalized results yet');

  return (
    <div className="p-4 sm:p-6 space-y-6" data-testid="dean-dashboard">
      <div>
        <h1 className="text-2xl font-bold">{ar ? 'لوحة تحكم العميد' : 'Dean dashboard'}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {ar
            ? `مرحباً ${name}. اضغط أي بطاقة أو عمود في الرسم لفتح التقرير التفصيلي.`
            : `Welcome ${name}. Click a card or chart bar to open the detailed report.`}
        </p>
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
        <KpiCard
          icon={Users}
          title={ar ? 'إجمالي الطلاب' : 'Students'}
          value={kpis ? kpis.students.total : '—'}
          testId="kpi-students"
          onClick={() => openReport('students')}
          detail={[
            lineList(kpis?.students?.by_status, ar),
            lineList(kpis?.students?.by_gender, ar),
            lineList(kpis?.students?.by_year, ar),
            kpis ? (ar ? `شكاوى مفتوحة: ${kpis.students.complainants}` : `Open complaints: ${kpis.students.complainants}`) : '',
          ].filter(Boolean).join(' · ')}
        />
        <KpiCard
          icon={GraduationCap}
          title={ar ? 'الكادر الأكاديمي' : 'Academic staff'}
          value={kpis ? kpis.academic_staff.total : '—'}
          testId="kpi-academic"
          onClick={() => openReport('academic')}
          detail={[
            lineList(kpis?.academic_staff?.by_rank, ar),
            kpis ? (ar ? `معيدون: ${kpis.academic_staff.teaching_assistants}` : `TAs: ${kpis.academic_staff.teaching_assistants}`) : '',
          ].filter(Boolean).join(' · ')}
        />
        <KpiCard
          icon={Briefcase}
          title={ar ? 'الكادر الإداري' : 'Admin staff'}
          value={kpis ? kpis.admin_staff.total : '—'}
          testId="kpi-admin"
          onClick={() => openReport('admin')}
          detail={lineList(kpis?.admin_staff?.by_office, ar)}
        />
        <KpiCard
          icon={Building2}
          title={ar ? 'الأقسام الأكاديمية' : 'Departments'}
          value={kpis ? kpis.departments.total : '—'}
          testId="kpi-departments"
          onClick={() => openReport('departments')}
          detail={(kpis?.departments?.items || []).map((d) => `${d.name}: ${d.student_count}`).join(' · ')}
        />
        <KpiCard
          icon={BarChart3}
          title={ar ? 'نسبة النجاح' : 'Pass rate'}
          value={successLabel}
          testId="kpi-success"
          onClick={() => openReport('success')}
          detail={successDetail}
        />
        <KpiCard
          icon={ClipboardCheck}
          title={ar ? 'طلبات معلّقة' : 'Pending approvals'}
          value={kpis ? kpis.pending.total : '—'}
          testId="kpi-approvals"
          onClick={() => openReport('approvals')}
          detail={lineList(kpis?.pending?.items, ar)}
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle>{ar ? 'إجراءات تنتظر موافقتك' : 'Waiting for your approval'}</CardTitle>
              <CardDescription>
                {ar
                  ? 'اضغط اعتماد أو رفض. النتائج الجاهزة تُنشر، والقضايا الأكاديمية تُغلق.'
                  : 'Approve or reject. Ready results are published; academic cases are closed.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant={kindFilter === '' ? 'default' : 'outline'} className="rounded-xl" onClick={() => setKindFilter('')}>
                  {ar ? 'الكل' : 'All'}
                </Button>
                {pendingItems.map((row) => (
                  <Button
                    key={row.key}
                    size="sm"
                    variant={kindFilter === row.key ? 'default' : 'outline'}
                    className="rounded-xl"
                    onClick={() => setKindFilter(row.key)}
                  >
                    {ar ? row.ar : row.en}
                    <Badge variant="secondary" className="ms-2">{row.count ?? 0}</Badge>
                  </Button>
                ))}
              </div>
              {approvals.length === 0 ? (
                <p className="text-sm text-muted-foreground">{ar ? 'لا طلبات معلّقة في هذا التصنيف.' : 'No pending items in this filter.'}</p>
              ) : (
                <div className="space-y-2">
                  {approvals.map((item) => (
                    <div key={item.id} className="rounded-xl border px-3 py-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">{item.title}</p>
                          {item.body && <p className="text-xs text-muted-foreground mt-1">{item.body}</p>}
                        </div>
                        <Badge variant="secondary">
                          {ar
                            ? (pendingItems.find((k) => k.key === item.kind)?.ar || item.kind)
                            : (pendingItems.find((k) => k.key === item.kind)?.en || item.kind)}
                        </Badge>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" className="rounded-xl" disabled={busyId === item.id} onClick={() => decide(item.id, 'approved')}>
                          {ar ? 'اعتماد' : 'Approve'}
                        </Button>
                        <Button size="sm" variant="outline" className="rounded-xl" disabled={busyId === item.id} onClick={() => decide(item.id, 'rejected')}>
                          {ar ? 'رفض' : 'Reject'}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle>{ar ? 'سير المناهج والامتحانات' : 'Curriculum and exams'}</CardTitle>
              <CardDescription>
                {academic?.term
                  ? (ar
                    ? `${academic.term.name} · انقضى ${academic.term.elapsed_pct}% من الفصل (${academic.term.weeks_elapsed}/${academic.term.weeks_total} أسبوع)`
                    : `${academic.term.name} · ${academic.term.elapsed_pct}% of the term elapsed (${academic.term.weeks_elapsed}/${academic.term.weeks_total} weeks)`)
                  : (ar ? 'تقدم الخطط، الحضور، ومنحنى الدرجات.' : 'Syllabus, attendance, and grade curve.')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <p className="text-sm font-medium mb-2">{ar ? 'تقدم الخطة مقابل الأسابيع' : 'Syllabus vs elapsed weeks'}</p>
                {(academic?.syllabus?.by_department || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">{ar ? 'لا عروض دراسية لهذا الفصل في الكلية.' : 'No offerings for this term in the college.'}</p>
                ) : (
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={(academic.syllabus.by_department || []).map((d) => ({
                          id: d.id,
                          name: d.department,
                          taught: d.progress,
                          expected: d.expected,
                        }))}
                        style={{ cursor: 'pointer' }}
                        onClick={(state) => {
                          const id = state?.activePayload?.[0]?.payload?.id;
                          if (id) openReport('department', id);
                        }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="taught" name={ar ? 'ما دُرّس %' : 'Taught %'} fill="hsl(var(--primary))" radius={6} />
                        <Bar dataKey="expected" name={ar ? 'المتوقع حسب التقويم %' : 'Expected %'} fill="hsl(var(--muted-foreground))" radius={6} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              <div>
                <p className="text-sm font-medium mb-2">{ar ? 'نسب الغياب' : 'Absence rates'}</p>
                {(academic?.attendance?.courses || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">{ar ? 'لا سجلات حضور بعد.' : 'No attendance records yet.'}</p>
                ) : (
                  <div className="h-44">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={(academic.attendance.courses || []).map((c) => ({
                          name: c.course_code,
                          absence: c.absence_rate,
                        }))}
                        style={{ cursor: 'pointer' }}
                        onClick={(state) => {
                          const code = state?.activePayload?.[0]?.payload?.name;
                          if (code) openReport('course', code);
                        }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="absence" name={ar ? 'غياب %' : 'Absence %'} fill="hsl(var(--destructive))" radius={6} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
                {(academic?.attendance?.alerts || []).length > 0 && (
                  <p className="text-xs text-destructive mt-2">
                    {ar
                      ? `تنبيه: غياب مرتفع في ${academic.attendance.alerts.map((a) => a.course_code).join('، ')}`
                      : `High absence: ${academic.attendance.alerts.map((a) => a.course_code).join(', ')}`}
                  </p>
                )}
              </div>

              <div>
                <p className="text-sm font-medium mb-2">{ar ? 'منحنى الدرجات المعتمدة' : 'Finalized grade curve'}</p>
                {(academic?.grades?.total || 0) === 0 ? (
                  <p className="text-sm text-muted-foreground">{ar ? 'لا نتائج معتمدة بعد.' : 'No finalized results yet.'}</p>
                ) : (
                  <div className="h-44">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={(academic.grades.curve || []).map((b) => ({
                          name: ar ? b.ar : b.en,
                          count: b.count,
                        }))}
                        style={{ cursor: 'pointer' }}
                        onClick={() => openReport('success')}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="count" name={ar ? 'عدد الطلاب' : 'Students'} fill="hsl(var(--primary))" radius={6} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
                {(academic?.grades?.critical || []).length > 0 ? (
                  <p className="text-xs text-destructive mt-2">
                    {ar
                      ? `مواد حرجة (رسوب ≥ 20%): ${academic.grades.critical.map((c) => `${c.course_code} ${c.fail_rate}%`).join('، ')}`
                      : `Critical courses (fail ≥ 20%): ${academic.grades.critical.map((c) => `${c.course_code} ${c.fail_rate}%`).join(', ')}`}
                  </p>
                ) : academic?.grades?.total > 0 ? (
                  <p className="text-xs text-muted-foreground mt-2">
                    {ar ? 'لا مواد حرجة بنسبة رسوب عالية حالياً.' : 'No high-fail courses right now.'}
                  </p>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4" />
                {ar ? 'تقويم الكلية' : 'College calendar'}
              </CardTitle>
              <CardDescription>
                {ar ? 'اجتماعات المجلس، الامتحانات، ومواعيد تسليم الدرجات.' : 'Council meetings, exams, and grade deadlines.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {(briefing.calendar || []).length === 0 ? (
                <p className="text-sm text-muted-foreground">{ar ? 'لا مواعيد قادمة.' : 'No upcoming dates.'}</p>
              ) : (
                briefing.calendar.map((ev) => (
                  <div key={ev.key} className="rounded-xl border px-3 py-2">
                    <p className="text-sm font-medium">{ar ? ev.ar : ev.en}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {ev.at ? new Date(ev.at).toLocaleString(ar ? 'ar' : 'en', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="w-4 h-4" />
                {ar ? 'تنبيهات عاجلة' : 'Critical alerts'}
                {(briefing.alerts || []).length > 0 && (
                  <Badge variant="destructive">{briefing.alerts.length}</Badge>
                )}
              </CardTitle>
              <CardDescription>
                {ar ? 'مادة بلا مدرّس، نتائج متأخرة، غياب مرتفع.' : 'Unstaffed courses, late results, high absence.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {(briefing.alerts || []).length === 0 ? (
                <p className="text-sm text-muted-foreground">{ar ? 'لا تنبيهات حرجة الآن.' : 'No critical alerts right now.'}</p>
              ) : (
                briefing.alerts.map((al) => (
                  <div
                    key={al.key}
                    className={`rounded-xl border px-3 py-2 text-sm ${al.severity === 'critical' ? 'border-destructive/50 text-destructive' : ''} ${al.course_code || al.department_id ? 'cursor-pointer hover:bg-accent/40' : ''}`}
                    onClick={() => {
                      if (al.course_code) openReport('course', al.course_code);
                      else if (al.department_id) openReport('department', al.department_id);
                    }}
                  >
                    {ar ? al.ar : al.en}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card
            data-testid="ops-card"
            className="rounded-2xl cursor-pointer transition-colors hover:border-primary/40 hover:bg-accent/20"
            onClick={() => openReport('operations')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openReport('operations');
              }
            }}
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="w-4 h-4" />
                {ar ? 'المالية والتشغيل' : 'Finance and operations'}
              </CardTitle>
              <CardDescription>
                {ar ? 'سداد الرسوم، إشغال القاعات، وأعطال تعطّل التدريس.' : 'Fees, room occupancy, and disruptions.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="font-medium">
                  {ar ? 'تحصيل الرسوم' : 'Fee collection'}
                  {ops?.tuition?.collection_rate != null ? `: ${ops.tuition.collection_rate}%` : ''}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {ops
                    ? (ar
                      ? `محصّل ${ops.tuition.collected} / مستحق ${ops.tuition.due} · متبقّي ${ops.tuition.remaining} ${ops.tuition.currency}`
                      : `Collected ${ops.tuition.collected} / due ${ops.tuition.due} · remaining ${ops.tuition.remaining} ${ops.tuition.currency}`)
                    : '—'}
                </p>
                {(ops?.tuition?.by_admission || []).length > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {(ops.tuition.by_admission || []).map((t) => `${ar ? t.ar : t.en}: ${t.students}`).join(' · ')}
                  </p>
                )}
              </div>
              <div>
                <p className="font-medium flex items-center gap-2">
                  <Building2 className="w-3.5 h-3.5" />
                  {ar ? 'القاعات والمختبرات' : 'Halls and labs'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {ops
                    ? (ar
                      ? `إشغال ${ops.facilities.occupancy_rate}% · ${ops.facilities.rooms_busy}/${ops.facilities.rooms} قاعات · ${ops.facilities.labs_busy}/${ops.facilities.labs} مختبرات · ${ops.facilities.seats_total} مقعد`
                      : `Occupancy ${ops.facilities.occupancy_rate}% · ${ops.facilities.rooms_busy}/${ops.facilities.rooms} rooms · ${ops.facilities.labs_busy}/${ops.facilities.labs} labs · ${ops.facilities.seats_total} seats`)
                    : '—'}
                </p>
              </div>
              <div>
                <p className="font-medium flex items-center gap-2">
                  <Wrench className="w-3.5 h-3.5" />
                  {ar ? 'أعطال معلّقة' : 'Open tickets'}
                  {ops?.tickets?.disrupting > 0 && <Badge variant="destructive">{ops.tickets.disrupting}</Badge>}
                </p>
                {(ops?.tickets?.items || []).length === 0 ? (
                  <p className="text-xs text-muted-foreground mt-1">{ar ? 'لا أعطال مفتوحة.' : 'No open tickets.'}</p>
                ) : (
                  <ul className="mt-1 space-y-1">
                    {(ops.tickets.items || []).slice(0, 4).map((t) => (
                      <li key={t.id} className={`text-xs ${t.disrupting ? 'text-destructive' : 'text-muted-foreground'}`}>
                        {t.title}{t.location ? ` — ${t.location}` : ''}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
