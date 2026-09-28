import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, ClipboardCheck, FileText, Bell } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/AuthContext';
import { useLanguage } from '@/lib/LanguageContext';
import { toast } from 'sonner';

function KpiCard({ icon: Icon, title, value, detail, testId }) {
  return (
    <Card data-testid={testId} className="rounded-2xl">
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

export default function AcademicViceDeanDashboard() {
  const { user, api } = useAuth();
  const { language } = useLanguage();
  const ar = language === 'ar';
  const name = user?.full_name_ar || user?.full_name || '';
  const [kpis, setKpis] = useState(null);
  const [approvals, setApprovals] = useState([]);
  const [kinds, setKinds] = useState([]);
  const [kindFilter, setKindFilter] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [briefing, setBriefing] = useState({ alerts: [] });

  const load = async () => {
    try {
      const [kpiRes, listRes, briefRes] = await Promise.all([
        api.get('/vda/dashboard'),
        api.get('/vda/approvals', { params: kindFilter ? { kind: kindFilter } : {} }),
        api.get('/vda/briefing'),
      ]);
      setKpis(kpiRes.data);
      setApprovals(listRes.data?.items || []);
      setKinds(listRes.data?.kinds || []);
      setBriefing(briefRes.data || { alerts: [] });
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'تعذر تحميل لوحة النائب الأكاديمي' : 'Failed to load academic dashboard'));
    }
  };

  useEffect(() => {
    load();
  }, [api, kindFilter]);

  const decide = async (id, decision) => {
    setBusyId(id);
    try {
      await api.post(`/vda/approvals/${id}/decide`, { decision });
      toast.success(decision === 'approved' ? (ar ? 'تم الاعتماد' : 'Approved') : (ar ? 'تم الرفض' : 'Rejected'));
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'تعذر تنفيذ القرار' : 'Decision failed'));
    } finally {
      setBusyId(null);
    }
  };

  const termName = kpis?.term?.name;
  const coverage = kpis?.syllabus?.coverage_pct;
  const expected = kpis?.syllabus?.expected_pct;
  const closed = kpis?.grades?.closed;
  const total = kpis?.grades?.total;
  const gradeRate = kpis?.grades?.rate;

  return (
    <div className="p-4 sm:p-6 space-y-6" data-testid="vda-dashboard">
      <div>
        <h1 className="text-2xl font-bold">
          {ar ? 'لوحة نائب العميد للشؤون الأكاديمية' : 'Academic Vice Dean dashboard'}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {ar
            ? `مرحباً ${name}. مؤشرات الكلية للفصل الحالي${termName ? ` · ${termName}` : ''}.`
            : `Welcome ${name}. College academic KPIs${termName ? ` · ${termName}` : ''}.`}
        </p>
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
        <KpiCard
          icon={BookOpen}
          testId="vda-kpi-syllabus"
          title={ar ? 'التزام المدرسين بالخطة' : 'Syllabus coverage'}
          value={kpis ? `${coverage ?? 0}%` : '—'}
          detail={kpis
            ? (ar
              ? `${kpis.syllabus.offerings} مادة · المتوقع حسب التقويم ${expected}%`
              : `${kpis.syllabus.offerings} offerings · expected by calendar ${expected}%`)
            : ''}
        />
        <KpiCard
          icon={ClipboardCheck}
          testId="vda-kpi-grades"
          title={ar ? 'درجات مغلقة ومعتمدة' : 'Closed and approved grades'}
          value={kpis ? `${closed ?? 0} / ${total ?? 0}` : '—'}
          detail={kpis
            ? (ar
              ? `${gradeRate}% من عروض الفصل أُغلقت درجاتها ونُشرت`
              : `${gradeRate}% of term offerings have published grades`)
            : ''}
        />
        <Link to="/research" className="block rounded-2xl">
        <KpiCard
          icon={FileText}
          testId="vda-kpi-research"
          title={ar ? 'أوراق بحثية مسجّلة' : 'Registered research papers'}
          value={kpis ? String(kpis.research.total ?? 0) : '—'}
          detail={kpis
            ? (ar
              ? `${kpis.research.projects_pending ?? 0} موضوع تخرج بانتظار الاعتماد`
              : `${kpis.research.projects_pending ?? 0} graduation topics awaiting approval`)
            : ''}
        />
        </Link>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
      <Card className="rounded-2xl" data-testid="vda-pending">
        <CardHeader>
          <CardTitle>{ar ? 'طلبات معلّقة بانتظار قرارك' : 'Pending action center'}</CardTitle>
          <CardDescription>
            {ar
              ? 'جداول الامتحانات، النتائج المرفوعة، وطلبات الخطة. اعتماد الجدول ينشره، واعتماد النتائج ينشر الدرجات الجاهزة.'
              : 'Exam timetables, submitted results, and curriculum requests. Approving a timetable publishes it; approving results publishes ready grades.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={kindFilter === '' ? 'default' : 'outline'} className="rounded-xl" onClick={() => setKindFilter('')}>
              {ar ? 'الكل' : 'All'}
            </Button>
            {kinds.map((row) => (
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
            <p className="text-sm text-muted-foreground">
              {ar ? 'لا طلبات معلّقة في هذا التصنيف.' : 'No pending items in this filter.'}
            </p>
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
                        ? (kinds.find((k) => k.key === item.kind)?.ar || item.kind)
                        : (kinds.find((k) => k.key === item.kind)?.en || item.kind)}
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
        </div>

        <Card className="rounded-2xl" data-testid="vda-alerts">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="w-4 h-4" />
              {ar ? 'تنبيهات أكاديمية' : 'Academic alerts'}
              {(briefing.alerts || []).length > 0 && (
                <Badge variant="destructive">{briefing.alerts.length}</Badge>
              )}
            </CardTitle>
            <CardDescription>
              {ar
                ? `رسوب أعلى من ${briefing.fail_limit ?? 40}%، ومدرّسون متأخرون عن أعمال السنة بعد ${briefing.coursework_late_after ?? 40}% من الفصل.`
                : `Fail rate above ${briefing.fail_limit ?? 40}%, and instructors late on coursework after ${briefing.coursework_late_after ?? 40}% of the term.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {(briefing.alerts || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {ar ? 'لا تنبيهات ضمن الحدود الحالية.' : 'No alerts within the current limits.'}
              </p>
            ) : (
              briefing.alerts.map((al) => (
                <div
                  key={al.key}
                  className={`rounded-xl border px-3 py-2 text-sm ${al.severity === 'critical' ? 'border-destructive/50 text-destructive' : ''}`}
                >
                  {ar ? al.ar : al.en}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
