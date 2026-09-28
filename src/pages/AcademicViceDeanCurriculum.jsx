import { useEffect, useState } from 'react';
import { FolderTree, ClipboardCheck, BookOpen } from 'lucide-react';
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

export default function AcademicViceDeanCurriculum() {
  const { api } = useAuth();
  const { language } = useLanguage();
  const ar = language === 'ar';
  const [data, setData] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = async () => {
    try {
      const res = await api.get('/vda/curriculum');
      setData(res.data);
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'تعذر تحميل الخطة' : 'Failed to load curriculum'));
    }
  };

  useEffect(() => { load(); }, [api, ar]);

  const decide = async (id, decision) => {
    setBusyId(id);
    try {
      await api.post(`/vda/approvals/${id}/decide`, { decision });
      toast.success(decision === 'approved' ? (ar ? 'اعتُمد طلب الخطة' : 'Curriculum request approved') : (ar ? 'رُفض الطلب' : 'Request rejected'));
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'تعذر تنفيذ القرار' : 'Decision failed'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6" data-testid="vda-curriculum">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FolderTree className="w-6 h-6" />
          {ar ? 'مراجعة الخطة واعتماد السيلابس' : 'Curriculum review and syllabus approval'}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {ar
            ? 'رؤساء الأقسام يعدّون الخطة والشعب. أنت تراجع التغطية وتعتمد الطلبات، دون إضافة أو حذف يومي.'
            : 'Department heads prepare the plan and offerings. You review coverage and approve requests, without daily add or delete.'}
        </p>
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <Stat label={ar ? 'مواد الخطة' : 'Plan courses'} value={data?.counts?.courses} />
        <Stat label={ar ? 'مطروحة هذا الفصل' : 'Offered this term'} value={data?.counts?.offerings} />
        <Stat label={ar ? 'غير مطروحة' : 'Not offered'} value={data?.counts?.unoffered} />
        <Stat label={ar ? 'طلبات معلّقة' : 'Pending requests'} value={data?.counts?.pending} />
      </div>

      <Card className="rounded-2xl" data-testid="vda-curriculum-pending">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4" />
            {ar ? 'طلبات الخطة بانتظارك' : 'Curriculum requests awaiting you'}
          </CardTitle>
          <CardDescription>
            {ar ? 'لا نختلق طلبات. تظهر هنا فقط إذا رفعها رئيس قسم.' : 'No invented requests. These appear only when a department head submits them.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(data?.pending || []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{ar ? 'لا طلبات خطة معلّقة.' : 'No pending curriculum requests.'}</p>
          ) : (
            data.pending.map((item) => (
              <div key={item.id} className="rounded-xl border px-3 py-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{item.title}</p>
                  {item.body && <p className="text-sm text-muted-foreground">{item.body}</p>}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="rounded-xl" disabled={busyId === item.id} onClick={() => decide(item.id, 'approved')}>
                    {ar ? 'اعتماد' : 'Approve'}
                  </Button>
                  <Button size="sm" variant="outline" className="rounded-xl" disabled={busyId === item.id} onClick={() => decide(item.id, 'rejected')}>
                    {ar ? 'إرجاع' : 'Return'}
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="w-4 h-4" />
            {ar ? 'تغطية السيلابس حسب القسم' : 'Syllabus coverage by department'}
          </CardTitle>
          <CardDescription>
            {data?.term
              ? (ar ? `${data.term.name} · المتوقع حسب التقويم ${data.expected_pct}%` : `${data.term.name} · expected by calendar ${data.expected_pct}%`)
              : (ar ? 'لا يوجد فصل حالي.' : 'No current term.')}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {(data?.by_department || []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{ar ? 'لا شعب مطروحة لحساب التغطية.' : 'No offerings to compute coverage.'}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{ar ? 'القسم' : 'Department'}</TableHead>
                  <TableHead>{ar ? 'المواد' : 'Courses'}</TableHead>
                  <TableHead>{ar ? 'التقدم' : 'Progress'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.by_department.map((d) => (
                  <TableRow key={d.id || d.department}>
                    <TableCell>{d.department}</TableCell>
                    <TableCell>{d.courses}</TableCell>
                    <TableCell>{d.progress}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>{ar ? 'شعب الفصل' : 'Term offerings'}</CardTitle>
          <CardDescription>{ar ? 'للمتابعة فقط. طرح الشعبة من رئيس القسم أو التقويم.' : 'Review only. Offering a course stays with the department head.'}</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {(data?.offerings || []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{ar ? 'لا شعب مطروحة.' : 'No offerings this term.'}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{ar ? 'المادة' : 'Course'}</TableHead>
                  <TableHead>{ar ? 'القسم' : 'Department'}</TableHead>
                  <TableHead>{ar ? 'المقاعد' : 'Seats'}</TableHead>
                  <TableHead>{ar ? 'الكادر' : 'Staff'}</TableHead>
                  <TableHead>{ar ? 'الخطة' : 'Syllabus'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.offerings.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>{o.course_code} — {o.course_name}</TableCell>
                    <TableCell>{o.department_name || '—'}</TableCell>
                    <TableCell>{o.enrolled_count} / {o.capacity}</TableCell>
                    <TableCell>{o.staffed ? <Badge>{ar ? 'معيَّن' : 'Staffed'}</Badge> : <Badge variant="outline">{ar ? 'بلا كادر' : 'Unstaffed'}</Badge>}</TableCell>
                    <TableCell>{o.progress}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>{ar ? 'مواد الخطة الرسمية' : 'Official plan courses'}</CardTitle>
          <CardDescription>{ar ? 'عرض حسب الأقسام الأربعة. التعديل اليومي ليس من هنا.' : 'Read-only by the four official departments. Daily edits are not here.'}</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {(data?.courses || []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{ar ? 'لا مواد في الخطة الرسمية.' : 'No official plan courses.'}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{ar ? 'الرمز' : 'Code'}</TableHead>
                  <TableHead>{ar ? 'الاسم' : 'Name'}</TableHead>
                  <TableHead>{ar ? 'القسم' : 'Department'}</TableHead>
                  <TableHead>{ar ? 'ساعات' : 'Credits'}</TableHead>
                  <TableHead>{ar ? 'هذا الفصل' : 'This term'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.courses.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono">{c.course_code}</TableCell>
                    <TableCell>{c.course_name}</TableCell>
                    <TableCell>{c.department}</TableCell>
                    <TableCell>{c.credit_hours}</TableCell>
                    <TableCell>
                      {c.offered
                        ? <Badge>{ar ? 'مطروحة' : 'Offered'}</Badge>
                        : <Badge variant="outline">{ar ? 'غير مطروحة' : 'Not offered'}</Badge>}
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
