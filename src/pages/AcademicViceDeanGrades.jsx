import { useEffect, useState } from 'react';
import { Award, BarChart3, AlertTriangle, ClipboardCheck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useAuth } from '@/lib/AuthContext';
import { useLanguage } from '@/lib/LanguageContext';
import { toast } from 'sonner';

function Stat({ label, value }) {
  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{value ?? '—'}</CardTitle>
      </CardHeader>
    </Card>
  );
}

export default function AcademicViceDeanGrades() {
  const { api } = useAuth();
  const { language } = useLanguage();
  const ar = language === 'ar';
  const [data, setData] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = async () => {
    try {
      const res = await api.get('/vda/grades');
      setData(res.data);
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'تعذر تحميل النتائج' : 'Failed to load grades'));
    }
  };

  useEffect(() => { load(); }, [api, ar]);

  const decide = async (approvalId, decision) => {
    if (!approvalId) return;
    setBusyId(approvalId);
    try {
      await api.post(`/vda/approvals/${approvalId}/decide`, { decision });
      toast.success(decision === 'approved' ? (ar ? 'اعتُمدت النتائج ونُشرت الجاهزة' : 'Results approved; ready marks published') : (ar ? 'رُفض الاعتماد' : 'Approval rejected'));
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'تعذر تنفيذ القرار' : 'Decision failed'));
    } finally {
      setBusyId(null);
    }
  };

  const curve = (data?.curve || []).map((b) => ({
    ...b,
    label: ar ? b.ar : b.en,
  }));

  return (
    <div className="p-4 sm:p-6 space-y-6" data-testid="vda-grades">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Award className="w-6 h-6" />
          {ar ? 'اعتماد النتائج والمنحنى' : 'Grade approval and curve'}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {ar
            ? 'المنحنى ونسبة الرسوب والإنجاز من العلامات المعتمدة بعد نشر بطاقة المادة، وليست من مسودات دائرة الامتحانات.'
            : 'The curve, fail rate, and completion come from approved course-work marks after you publish a course sheet — not from exams-office drafts.'}
        </p>
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <Stat label={ar ? 'شعب مغلقة' : 'Closed offerings'} value={data ? `${data.counts?.closed ?? 0} / ${data.counts?.offerings ?? 0}` : '—'} />
        <Stat label={ar ? 'بانتظار الاعتماد' : 'Awaiting approval'} value={data?.counts?.pending} />
        <Stat label={ar ? `رسوب أعلى من ${data?.fail_limit ?? 40}%` : `Fail above ${data?.fail_limit ?? 40}%`} value={data?.counts?.fail_alerts} />
        <Stat label={ar ? 'الفصل' : 'Term'} value={data?.term?.name || '—'} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              {ar ? 'منحنى الدرجات المعتمدة' : 'Published grade curve'}
            </CardTitle>
            <CardDescription>
              {ar ? 'توزيع النتائج المنشورة في الكلية. لا إدخال يدوي هنا.' : 'Distribution of published college results. No manual entry here.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            {curve.every((b) => !b.count) ? (
              <p className="text-sm text-muted-foreground">{ar ? 'لا نتائج معتمدة بعد لرسم المنحنى.' : 'No published results yet for a curve.'}</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={curve}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              {ar ? 'مواد مرتفعة الرسوب' : 'High-fail courses'}
            </CardTitle>
            <CardDescription>
              {ar ? `تنبيه إذا تجاوز الرسوب ${data?.fail_limit ?? 40}%.` : `Alert if fail rate exceeds ${data?.fail_limit ?? 40}%.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {(data?.fail_by_course || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">{ar ? 'لا نتائج معتمدة لحساب الرسوب بعد.' : 'No published results to compute fail rates yet.'}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{ar ? 'المادة' : 'Course'}</TableHead>
                    <TableHead>{ar ? 'مُقيَّمون' : 'Graded'}</TableHead>
                    <TableHead>{ar ? 'راسبون' : 'Failed'}</TableHead>
                    <TableHead>{ar ? 'النسبة' : 'Rate'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.fail_by_course.map((row) => (
                    <TableRow key={row.course_code} className={row.alert ? 'text-destructive' : ''}>
                      <TableCell>{row.course_code}{row.course_name ? ` — ${row.course_name}` : ''}</TableCell>
                      <TableCell>{row.graded}</TableCell>
                      <TableCell>{row.failed}</TableCell>
                      <TableCell>{row.fail_rate}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl" data-testid="vda-grade-offerings">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4" />
            {ar ? 'إنجاز الرفع والاعتماد' : 'Submission and approval progress'}
          </CardTitle>
          <CardDescription>
            {ar ? 'اعتماد الشعبة ينشر العلامات الجاهزة. النواقص تبقى عند دائرة الامتحانات.' : 'Approving an offering publishes ready marks. Incomplete drafts stay with the Exams Office.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {(data?.offerings || []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{ar ? 'لا شعب مطروحة هذا الفصل.' : 'No offerings this term.'}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{ar ? 'المادة' : 'Course'}</TableHead>
                  <TableHead>{ar ? 'القسم' : 'Department'}</TableHead>
                  <TableHead>{ar ? 'منشور / مسجّل' : 'Published / enrolled'}</TableHead>
                  <TableHead>{ar ? 'مسودة' : 'Draft'}</TableHead>
                  <TableHead>{ar ? 'الرسوب' : 'Fail'}</TableHead>
                  <TableHead>{ar ? 'الحالة' : 'Status'}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.offerings.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>{o.course_code} — {o.course_name}</TableCell>
                    <TableCell>{o.department_name || '—'}</TableCell>
                    <TableCell>{o.published_students} / {o.enrolled} ({o.published_pct}%)</TableCell>
                    <TableCell>{o.draft_students}</TableCell>
                    <TableCell className={o.fail_alert ? 'text-destructive' : ''}>
                      {o.fail_rate == null ? '—' : `${o.fail_rate}%`}
                    </TableCell>
                    <TableCell>
                      {o.closed
                        ? <Badge>{ar ? 'مغلقة' : 'Closed'}</Badge>
                        : o.approval
                          ? <Badge variant="outline">{ar ? 'بانتظارك' : 'Awaiting you'}</Badge>
                          : <Badge variant="secondary">{ar ? 'قيد الرفع' : 'In progress'}</Badge>}
                    </TableCell>
                    <TableCell className="text-end">
                      {o.approval ? (
                        <div className="flex justify-end gap-2">
                          <Button size="sm" className="rounded-xl" disabled={busyId === o.approval.id} onClick={() => decide(o.approval.id, 'approved')}>
                            {ar ? 'اعتماد' : 'Approve'}
                          </Button>
                          <Button size="sm" variant="outline" className="rounded-xl" disabled={busyId === o.approval.id} onClick={() => decide(o.approval.id, 'rejected')}>
                            {ar ? 'إعادة نظر' : 'Return'}
                          </Button>
                        </div>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
