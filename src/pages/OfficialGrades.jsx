import { useEffect, useState } from 'react';
import { Award } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
import WithdrawnStudentBadge, { WITHDRAWN_ROW_CLASS } from '@/components/academic/WithdrawnStudentBadge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

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

function GradeCurve({ curve, ar }) {
  const items = curve || [];
  const max = Math.max(1, ...items.map((b) => Number(b.count) || 0));
  if (items.every((b) => !b.count)) {
    return <p className="text-sm text-muted-foreground">{ar ? 'لا علامات معتمدة بعد لرسم المنحنى.' : 'No approved marks yet for a curve.'}</p>;
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3" data-testid="official-grade-curve">
      {items.map((b) => (
        <div key={b.key} className="rounded-xl border p-3">
          <div className="text-xs text-muted-foreground">{ar ? b.ar : b.en}</div>
          <div className="text-lg font-semibold">{b.count || 0}</div>
          <div className="mt-2 h-1.5 rounded-full bg-muted">
            <div className="h-1.5 rounded-full bg-primary" style={{ width: `${Math.round(((Number(b.count) || 0) / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function OfficialGrades() {
  const { api, canEnterGrades } = useAuth();
  const { language } = useLanguage();
  const ar = language === 'ar';
  const [list, setList] = useState({ term: null, offerings: [] });
  const [roster, setRoster] = useState(null);

  const loadOfferings = async () => {
    try {
      const res = await api.get('/academic/grades/offerings');
      setList(res.data || { term: null, offerings: [] });
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'تعذر تحميل الشعب' : 'Failed to load offerings'));
    }
  };

  useEffect(() => { if (canEnterGrades) loadOfferings(); }, [canEnterGrades]);

  const openOffering = async (id) => {
    try {
      const res = await api.get(`/academic/grades/offerings/${id}`);
      setRoster(res.data);
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'تعذر تحميل الكشف' : 'Failed to load roster'));
    }
  };

  if (!canEnterGrades) {
    return (
      <div className="p-6 text-muted-foreground">
        {ar ? 'إدخال العلامات الرسمية من صلاحية دائرة الامتحانات تحت الشؤون الأكاديمية.' : 'Official grades are entered by the Exams Office under Academic Affairs.'}
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Award className="w-6 h-6" />
          {ar ? 'العلامات الرسمية' : 'Official grades'}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {ar
            ? 'الكشف للقراءة فقط: العلامات تُعتمد من بطاقة المادة ثم تظهر هنا. لا حفظ ولا نشر يدوي من هذه الصفحة.'
            : 'This sheet is read-only. Marks appear here after the vice dean publishes the course-work sheet. Manual save/publish is locked.'}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3" data-testid="official-grade-stats">
        <Stat label={ar ? 'علامات معتمدة' : 'Approved marks'} value={list.published ?? 0} testId="official-stat-published" />
        <Stat label={ar ? 'راسبون' : 'Failed'} value={list.failed ?? 0} testId="official-stat-failed" />
        <Stat
          label={ar ? 'نسبة الرسوب' : 'Fail rate'}
          value={list.fail_rate == null ? '—' : `${list.fail_rate}%`}
          testId="official-stat-fail-rate"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{ar ? 'منحنى العلامات المعتمدة' : 'Approved grade curve'}</CardTitle>
          <CardDescription>
            {list.term ? (ar ? `الفصل: ${list.term.name}` : `Term: ${list.term.name}`) : (ar ? 'لا يوجد فصل حالي.' : 'No current term.')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GradeCurve curve={list.curve} ar={ar} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{ar ? 'شعب الفصل الحالي' : 'Current-term offerings'}</CardTitle>
          <CardDescription>
            {ar ? 'منشور = طالب نُشرت علامته المعتمدة في سجل المادة.' : 'Published = a student whose approved course-work mark is on the academic record.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {(list.offerings || []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{ar ? 'لا توجد شعب مطروحة.' : 'No offerings this term.'}</p>
          ) : (
            <Table data-testid="official-offerings-stats">
              <TableHeader>
                <TableRow>
                  <TableHead>{ar ? 'الرمز' : 'Code'}</TableHead>
                  <TableHead>{ar ? 'المادة' : 'Course'}</TableHead>
                  <TableHead>{ar ? 'مسجّلون' : 'Enrolled'}</TableHead>
                  <TableHead>{ar ? 'منشور' : 'Published'}</TableHead>
                  <TableHead>{ar ? 'إنجاز' : 'Done'}</TableHead>
                  <TableHead>{ar ? 'رسوب' : 'Fail'}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(list.offerings || []).map((o) => (
                  <TableRow key={o.id} data-testid={`official-offering-${o.course_code || o.id}`}>
                    <TableCell className="font-mono">{o.course_code}</TableCell>
                    <TableCell>{o.course_name}</TableCell>
                    <TableCell>{o.enrolled ?? o.enrolled_count ?? 0}</TableCell>
                    <TableCell>{o.published_students ?? 0}</TableCell>
                    <TableCell>{o.published_pct ?? 0}%</TableCell>
                    <TableCell>{o.fail_rate == null ? '—' : `${o.fail_rate}%`}</TableCell>
                    <TableCell className="text-end">
                      <Button size="sm" variant={roster?.offering?.id === o.id ? 'default' : 'outline'} onClick={() => openOffering(o.id)}>
                        {ar ? 'كشف العلامات' : 'Grade sheet'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {roster && (
        <Card data-testid="official-read-only-sheet">
          <CardHeader>
            <CardTitle>{roster.offering.course_code} — {roster.offering.course_name}</CardTitle>
            <CardDescription>
              {ar
                ? `معتمد ${roster.stats?.published ?? 0} / ${roster.stats?.enrolled ?? roster.students?.length ?? 0} · رسوب ${roster.stats?.fail_rate == null ? '—' : `${roster.stats.fail_rate}%`}`
                : `Approved ${roster.stats?.published ?? 0} / ${roster.stats?.enrolled ?? roster.students?.length ?? 0} · fail ${roster.stats?.fail_rate == null ? '—' : `${roster.stats.fail_rate}%`}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto space-y-4">
            <GradeCurve curve={roster.stats?.curve} ar={ar} />
            {(roster.students || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">{ar ? 'لا طلاب مسجّلين في هذه الشعبة.' : 'No enrolled students.'}</p>
            ) : (
              <Table data-testid="official-course-work-sheet">
                <TableHeader>
                  <TableRow>
                    <TableHead>{ar ? 'الطالب' : 'Student'}</TableHead>
                    {(roster.display_components || []).map((c) => (
                      <TableHead key={c.key}>{ar ? c.ar : c.en}</TableHead>
                    ))}
                    <TableHead>{ar ? 'النسبة المئوية' : 'Percent'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(roster.students || []).map((s) => (
                    <TableRow
                      key={s.enrollment_id}
                      className={cn(s.withdrawn && WITHDRAWN_ROW_CLASS)}
                      data-testid={`official-row-${s.person_code || s.enrollment_id}`}
                      data-withdrawn={s.withdrawn ? 'true' : 'false'}
                    >
                      <TableCell>
                        <div className={cn('font-medium', s.withdrawn && 'line-through')}>{s.full_name}</div>
                        <div className="text-xs text-muted-foreground font-mono">{s.person_code || '—'}</div>
                        {s.withdrawn ? (
                          <WithdrawnStudentBadge ar={ar} testId={`official-withdrawn-${s.person_code || s.enrollment_id}`} />
                        ) : null}
                      </TableCell>
                      {(roster.display_components || []).map((c) => {
                        const cell = s.course_work?.[c.key];
                        return (
                          <TableCell key={c.key} data-testid={`official-cell-${c.key}`}>
                            {cell?.score == null ? '—' : `${cell.score} / ${cell.max_score || 100}`}
                          </TableCell>
                        );
                      })}
                      <TableCell data-testid="official-percent">
                        {s.withdrawn ? (
                          <span className="font-bold">W</span>
                        ) : s.percent != null ? (
                          <Badge>{Number(s.percent).toFixed(1)}%</Badge>
                        ) : s.published_final != null ? (
                          <Badge>{Number(s.published_final).toFixed(1)}%</Badge>
                        ) : s.current_grade != null ? (
                          <Badge>{Number(s.current_grade).toFixed(1)}%</Badge>
                        ) : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
