import { useEffect, useState } from 'react';
import { Landmark, CalendarDays, AlertTriangle, Building2, ClipboardCheck } from 'lucide-react';
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
import { useAuth } from '@/lib/AuthContext';
import { useLanguage } from '@/lib/LanguageContext';
import { toast } from 'sonner';

function typeLabel(types, key, ar) {
  const row = (types || []).find((t) => t.key === key);
  if (!row) return key || '—';
  return ar ? row.ar : row.en;
}

function when(iso) {
  if (!iso) return '—';
  return String(iso).slice(0, 16).replace('T', ' ');
}

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

function SessionTable({ rows, types, ar, empty, extra }) {
  if (!rows?.length) {
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{ar ? 'المادة' : 'Course'}</TableHead>
          <TableHead>{ar ? 'النوع' : 'Type'}</TableHead>
          <TableHead>{ar ? 'القاعة' : 'Hall'}</TableHead>
          <TableHead>{ar ? 'الوقت' : 'Time'}</TableHead>
          <TableHead>{ar ? 'المسجّلون' : 'Enrolled'}</TableHead>
          <TableHead>{ar ? 'الحالة' : 'Status'}</TableHead>
          {extra ? <TableHead /> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((s) => (
          <TableRow key={s.id}>
            <TableCell>{s.course_code}{s.course_name ? ` — ${s.course_name}` : ''}</TableCell>
            <TableCell>{typeLabel(types, s.exam_type, ar)}</TableCell>
            <TableCell>{s.hall_name || '—'}{s.building ? ` (${s.building})` : ''}</TableCell>
            <TableCell>{when(s.starts_at)} → {when(s.ends_at)}</TableCell>
            <TableCell>{s.enrolled_count ?? 0}{s.hall_capacity != null ? ` / ${s.hall_capacity}` : ''}</TableCell>
            <TableCell>
              {Number(s.is_published) === 1
                ? <Badge>{ar ? 'منشور' : 'Published'}</Badge>
                : <Badge variant="outline">{ar ? 'بانتظار الاعتماد' : 'Awaiting approval'}</Badge>}
            </TableCell>
            {extra ? <TableCell className="text-end">{extra(s)}</TableCell> : null}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function AcademicViceDeanExams() {
  const { api } = useAuth();
  const { language } = useLanguage();
  const ar = language === 'ar';
  const [data, setData] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = async () => {
    try {
      const res = await api.get('/vda/exams');
      setData(res.data);
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'تعذر تحميل جدول الامتحانات' : 'Failed to load exam timetable'));
    }
  };

  useEffect(() => { load(); }, [api, ar]);

  const decide = async (approvalId, decision) => {
    if (!approvalId) return;
    setBusyId(approvalId);
    try {
      await api.post(`/vda/approvals/${approvalId}/decide`, { decision });
      toast.success(decision === 'approved' ? (ar ? 'اعتُمد الجدول ونُشر' : 'Timetable approved and published') : (ar ? 'رُفض الجدول' : 'Timetable rejected'));
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'تعذر تنفيذ القرار' : 'Decision failed'));
    } finally {
      setBusyId(null);
    }
  };

  const types = data?.exam_types || [];

  return (
    <div className="p-4 sm:p-6 space-y-6" data-testid="vda-exams">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Landmark className="w-6 h-6" />
          {ar ? 'اعتماد جدول الامتحانات' : 'Exam timetable approval'}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {ar
            ? 'دائرة الامتحانات تجدول القاعات. أنت تعتمد الجدول أو ترجعه، ولا تضيف قاعة ولا تنشر مباشرة.'
            : 'The Exams Office schedules halls. You approve or return the timetable; you do not add halls or publish directly.'}
        </p>
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <Stat label={ar ? 'منشور للطلاب' : 'Published'} value={data?.counts?.published} />
        <Stat label={ar ? 'مسودات بانتظارك' : 'Drafts awaiting you'} value={data?.counts?.pending} />
        <Stat label={ar ? 'تنبيهات' : 'Issues'} value={data?.counts?.issues} />
        <Stat label={ar ? 'القاعات' : 'Halls'} value={data?.counts?.halls} />
      </div>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            {ar ? 'ما يحتاج مراجعة قبل الاعتماد' : 'Review before approval'}
          </CardTitle>
          <CardDescription>
            {ar ? 'تعارض قاعات، سعة ناقصة، أو مواد بلا جلسة.' : 'Hall clashes, short capacity, or courses with no session.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {(data?.issues || []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{ar ? 'لا تنبيهات الآن.' : 'No issues right now.'}</p>
          ) : (
            data.issues.map((al) => (
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

      <Card className="rounded-2xl" data-testid="vda-exam-pending">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4" />
            {ar ? 'مسودات بانتظار الاعتماد' : 'Drafts awaiting approval'}
          </CardTitle>
          <CardDescription>
            {data?.term
              ? (ar ? `الفصل: ${data.term.name}` : `Term: ${data.term.name}`)
              : (ar ? 'لا يوجد فصل حالي.' : 'No current term.')}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <SessionTable
            rows={data?.drafts}
            types={types}
            ar={ar}
            empty={ar ? 'لا مسودات بانتظارك.' : 'No drafts awaiting you.'}
            extra={(s) => s.approval ? (
              <div className="flex justify-end gap-2">
                <Button size="sm" className="rounded-xl" disabled={busyId === s.approval.id} onClick={() => decide(s.approval.id, 'approved')}>
                  {ar ? 'اعتماد' : 'Approve'}
                </Button>
                <Button size="sm" variant="outline" className="rounded-xl" disabled={busyId === s.approval.id} onClick={() => decide(s.approval.id, 'rejected')}>
                  {ar ? 'إرجاع' : 'Return'}
                </Button>
              </div>
            ) : null}
          />
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4" />
            {ar ? 'الجدول المنشور للكلية' : 'Published college timetable'}
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <SessionTable
            rows={data?.published}
            types={types}
            ar={ar}
            empty={ar ? 'لا امتحانات منشورة للكلية بعد.' : 'No published college exams yet.'}
          />
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="w-4 h-4" />
            {ar ? 'قاعات الكلية' : 'College halls'}
          </CardTitle>
          <CardDescription>{ar ? 'للمتابعة فقط. إضافة القاعات من دائرة الامتحانات.' : 'Read-only. Halls are added by the Exams Office.'}</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {(data?.halls || []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{ar ? 'لا قاعات مسجّلة بعد.' : 'No halls registered yet.'}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{ar ? 'الاسم' : 'Name'}</TableHead>
                  <TableHead>{ar ? 'السعة' : 'Capacity'}</TableHead>
                  <TableHead>{ar ? 'المبنى' : 'Building'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.halls.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell>{h.name}</TableCell>
                    <TableCell>{h.capacity}</TableCell>
                    <TableCell>{h.building || '—'}</TableCell>
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
