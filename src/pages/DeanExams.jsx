import { useEffect, useState } from 'react';
import { Landmark, CalendarDays, AlertTriangle, Building2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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

function SessionTable({ rows, types, ar, empty }) {
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
                : <Badge variant="outline">{ar ? 'مسودة' : 'Draft'}</Badge>}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function DeanExams() {
  const { api } = useAuth();
  const { language } = useLanguage();
  const ar = language === 'ar';
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/dean/exams');
        if (!cancelled) setData(res.data);
      } catch (e) {
        toast.error(e.response?.data?.detail || (ar ? 'تعذر تحميل نظرة الامتحانات' : 'Failed to load exam overview'));
      }
    })();
    return () => { cancelled = true; };
  }, [api, ar]);

  const types = data?.exam_types || [];

  return (
    <div className="p-4 sm:p-6 space-y-6" data-testid="dean-exams">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Landmark className="w-6 h-6" />
          {ar ? 'الامتحانات والقاعات' : 'Exams and halls'}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {ar
            ? 'نظرة كلية على الجدول والقاعات. دائرة الامتحانات هي من تجدول وتنشر للطلاب.'
            : 'College-wide timetable and halls. The Exams Office schedules and publishes for students.'}
        </p>
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <Stat label={ar ? 'القاعات' : 'Halls'} value={data?.counts?.halls} />
        <Stat label={ar ? 'منشور للطلاب' : 'Published'} value={data?.counts?.published} />
        <Stat label={ar ? 'مسودات الدائرة' : 'Office drafts'} value={data?.counts?.drafts} />
        <Stat label={ar ? 'تنبيهات' : 'Issues'} value={data?.counts?.issues} />
      </div>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            {ar ? 'ما يحتاج متابعة' : 'Needs attention'}
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

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4" />
            {ar ? 'الجدول المنشور للكلية' : 'Published college timetable'}
          </CardTitle>
          <CardDescription>
            {data?.term
              ? (ar ? `الفصل: ${data.term.name}` : `Term: ${data.term.name}`)
              : (ar ? 'لا يوجد فصل حالي.' : 'No current term.')}
          </CardDescription>
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

      {(data?.drafts || []).length > 0 && (
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>{ar ? 'مسودات دائرة الامتحانات' : 'Exams Office drafts'}</CardTitle>
            <CardDescription>{ar ? 'لم تُنشر للطلاب بعد.' : 'Not yet published to students.'}</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <SessionTable
              rows={data.drafts}
              types={types}
              ar={ar}
              empty={ar ? 'لا مسودات.' : 'No drafts.'}
            />
          </CardContent>
        </Card>
      )}

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
