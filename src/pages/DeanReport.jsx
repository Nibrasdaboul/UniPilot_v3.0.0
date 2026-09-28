import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/AuthContext';
import { useLanguage } from '@/lib/LanguageContext';
import { toast } from 'sonner';

const TITLES = {
  department: { ar: 'تقرير القسم', en: 'Department report' },
  departments: { ar: 'الأقسام الأكاديمية', en: 'Academic departments' },
  students: { ar: 'تقرير الطلاب', en: 'Students report' },
  academic: { ar: 'الكادر الأكاديمي', en: 'Academic staff' },
  admin: { ar: 'الكادر الإداري', en: 'Admin staff' },
  success: { ar: 'تقرير نسب النجاح', en: 'Pass-rate report' },
  approvals: { ar: 'الطلبات المعلقة', en: 'Pending approvals' },
  operations: { ar: 'المالية والتشغيل', en: 'Finance and operations' },
  course: { ar: 'تقرير المادة', en: 'Course report' },
};

function SimpleTable({ columns, rows, onRowClick }) {
  if (!rows?.length) return null;
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            {columns.map((col) => (
              <th key={col.key} className="text-start font-medium px-3 py-2 whitespace-nowrap">{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row.id ?? row.person_code ?? row.course_code ?? row.key ?? i}
              className={onRowClick ? 'cursor-pointer hover:bg-accent/40' : ''}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((col) => (
                <td key={col.key} className="px-3 py-2 border-t align-top">
                  {col.render ? col.render(row) : (row[col.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function DeanReport() {
  const { scope, id } = useParams();
  const navigate = useNavigate();
  const { api, isDean } = useAuth();
  const { language } = useLanguage();
  const ar = language === 'ar';
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!isDean) {
      navigate('/dashboard', { replace: true });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const path = id ? `/dean/reports/${scope}/${encodeURIComponent(id)}` : `/dean/reports/${scope}`;
        const res = await api.get(path);
        if (!cancelled) setData(res.data);
      } catch (e) {
        toast.error(e.response?.data?.detail || (ar ? 'تعذر فتح التقرير' : 'Failed to open report'));
        if (!cancelled) navigate('/dashboard', { replace: true });
      }
    })();
    return () => { cancelled = true; };
  }, [api, scope, id, isDean, ar, navigate]);

  const title = TITLES[scope] || { ar: 'تقرير', en: 'Report' };

  return (
    <div className="p-4 sm:p-6 space-y-6" data-testid="dean-report">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{ar ? title.ar : title.en}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data?.department?.name
              || data?.course_code
              || data?.term?.name
              || (ar ? 'تفاصيل من لوحة العميد' : 'Detail from the dean dashboard')}
          </p>
        </div>
        <Button asChild variant="outline" className="rounded-xl">
          <Link to="/dashboard">
            <ArrowRight className="w-4 h-4 ms-1 rotate-180 rtl:rotate-0" />
            {ar ? 'عودة للوحة' : 'Back to dashboard'}
          </Link>
        </Button>
      </div>

      {!data ? (
        <p className="text-sm text-muted-foreground">{ar ? 'جارٍ التحميل…' : 'Loading…'}</p>
      ) : (
        <ReportBody data={data} ar={ar} navigate={navigate} />
      )}
    </div>
  );
}

function ReportBody({ data, ar, navigate }) {
  if (data.scope === 'department') {
    return (
      <div className="space-y-4">
        <div className="grid sm:grid-cols-3 gap-3">
          <Stat label={ar ? 'الطلاب' : 'Students'} value={data.counts.students} />
          <Stat label={ar ? 'الكادر' : 'Staff'} value={data.counts.staff} />
          <Stat label={ar ? 'مواد الفصل' : 'Term courses'} value={data.counts.courses} />
        </div>
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>{ar ? 'مواد القسم' : 'Department courses'}</CardTitle>
            <CardDescription>{data.term?.name || (ar ? 'الفصل الحالي' : 'Current term')}</CardDescription>
          </CardHeader>
          <CardContent>
            {(data.courses || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">{ar ? 'لا عروض لهذا القسم في الفصل.' : 'No offerings for this department in the term.'}</p>
            ) : (
              <SimpleTable
                columns={[
                  { key: 'course_code', label: ar ? 'الرمز' : 'Code' },
                  { key: 'course_name', label: ar ? 'المادة' : 'Course' },
                  { key: 'progress', label: ar ? 'التقدم %' : 'Progress %' },
                  { key: 'staffed', label: ar ? 'مدرّس' : 'Staffed', render: (r) => (r.staffed ? (ar ? 'نعم' : 'Yes') : (ar ? 'لا' : 'No')) },
                ]}
                rows={data.courses}
                onRowClick={(r) => navigate(`/dashboard/report/course/${encodeURIComponent(r.course_code)}`)}
              />
            )}
          </CardContent>
        </Card>
        {(data.attendance || []).length > 0 && (
          <Card className="rounded-2xl">
            <CardHeader><CardTitle>{ar ? 'الحضور' : 'Attendance'}</CardTitle></CardHeader>
            <CardContent>
              <SimpleTable
                columns={[
                  { key: 'course_code', label: ar ? 'المادة' : 'Course' },
                  { key: 'absence_rate', label: ar ? 'غياب %' : 'Absence %' },
                  { key: 'marked', label: ar ? 'سجلات' : 'Marked' },
                ]}
                rows={data.attendance}
              />
            </CardContent>
          </Card>
        )}
        {(data.fail_by_course || []).length > 0 && (
          <Card className="rounded-2xl">
            <CardHeader><CardTitle>{ar ? 'الرسوب حسب المادة' : 'Fail by course'}</CardTitle></CardHeader>
            <CardContent>
              <SimpleTable
                columns={[
                  { key: 'course_code', label: ar ? 'المادة' : 'Course' },
                  { key: 'fail_rate', label: ar ? 'رسوب %' : 'Fail %' },
                  { key: 'failed', label: ar ? 'راسب' : 'Failed' },
                  { key: 'graded', label: ar ? 'مقيَّم' : 'Graded' },
                ]}
                rows={data.fail_by_course}
              />
            </CardContent>
          </Card>
        )}
        <Card className="rounded-2xl">
          <CardHeader><CardTitle>{ar ? 'طلاب القسم' : 'Department students'}</CardTitle></CardHeader>
          <CardContent>
            {(data.students || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">{ar ? 'لا طلاب مرتبطين بهذا القسم.' : 'No students attached to this department.'}</p>
            ) : (
              <SimpleTable
                columns={[
                  { key: 'person_code', label: ar ? 'الرقم الجامعي' : 'ID' },
                  { key: 'full_name', label: ar ? 'الاسم' : 'Name' },
                  { key: 'study_year', label: ar ? 'السنة' : 'Year' },
                  { key: 'academic_status', label: ar ? 'الحالة' : 'Status' },
                ]}
                rows={data.students}
              />
            )}
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardHeader><CardTitle>{ar ? 'كادر القسم' : 'Department staff'}</CardTitle></CardHeader>
          <CardContent>
            {(data.staff || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">{ar ? 'لا كادر مرتبط بهذا القسم.' : 'No staff attached to this department.'}</p>
            ) : (
              <SimpleTable
                columns={[
                  { key: 'person_code', label: ar ? 'الرقم' : 'ID' },
                  { key: 'full_name', label: ar ? 'الاسم' : 'Name' },
                  { key: 'role', label: ar ? 'الدور' : 'Role', render: (r) => (ar ? r.role_ar : r.role_en) },
                ]}
                rows={data.staff}
              />
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (data.scope === 'departments') {
    return (
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>{ar ? `${data.total} أقسام` : `${data.total} departments`}</CardTitle>
          <CardDescription>{ar ? 'اضغط قسماً لفتح تقريره.' : 'Click a department to open its report.'}</CardDescription>
        </CardHeader>
        <CardContent>
          <SimpleTable
            columns={[
              { key: 'name', label: ar ? 'القسم' : 'Department' },
              { key: 'student_count', label: ar ? 'طلاب' : 'Students' },
              { key: 'courses', label: ar ? 'مواد' : 'Courses' },
              { key: 'syllabus_progress', label: ar ? 'تقدم الخطة %' : 'Syllabus %', render: (r) => (r.syllabus_progress == null ? '—' : r.syllabus_progress) },
            ]}
            rows={data.items}
            onRowClick={(r) => navigate(`/dashboard/report/department/${r.id}`)}
          />
        </CardContent>
      </Card>
    );
  }

  if (data.scope === 'students') {
    return (
      <div className="space-y-4">
        <div className="grid sm:grid-cols-3 gap-3">
          <Stat label={ar ? 'الإجمالي' : 'Total'} value={data.summary?.total} />
          <Stat label={ar ? 'شكاوى مفتوحة' : 'Open complaints'} value={data.summary?.complainants} />
        </div>
        <Card className="rounded-2xl">
          <CardHeader><CardTitle>{ar ? 'حسب القسم' : 'By department'}</CardTitle></CardHeader>
          <CardContent>
            <SimpleTable
              columns={[
                { key: 'name', label: ar ? 'القسم' : 'Department' },
                { key: 'student_count', label: ar ? 'الطلاب' : 'Students' },
              ]}
              rows={data.departments}
              onRowClick={(r) => navigate(`/dashboard/report/department/${r.id}`)}
            />
          </CardContent>
        </Card>
        <Breakdown title={ar ? 'الحالة الأكاديمية' : 'Academic status'} items={data.summary?.by_status} ar={ar} />
        <Breakdown title={ar ? 'الجنس' : 'Gender'} items={data.summary?.by_gender} ar={ar} />
        <Card className="rounded-2xl">
          <CardHeader><CardTitle>{ar ? 'أحدث الطلاب' : 'Latest students'}</CardTitle></CardHeader>
          <CardContent>
            <SimpleTable
              columns={[
                { key: 'person_code', label: ar ? 'الرقم' : 'ID' },
                { key: 'full_name', label: ar ? 'الاسم' : 'Name' },
                { key: 'department', label: ar ? 'القسم' : 'Department' },
                { key: 'study_year', label: ar ? 'السنة' : 'Year' },
                { key: 'academic_status', label: ar ? 'الحالة' : 'Status' },
              ]}
              rows={data.sample}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (data.scope === 'academic' || data.scope === 'admin') {
    return (
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>{ar ? `${(data.items || []).length} سجل` : `${(data.items || []).length} records`}</CardTitle>
        </CardHeader>
        <CardContent>
          <SimpleTable
            columns={[
              { key: 'person_code', label: ar ? 'الرقم' : 'ID' },
              { key: 'full_name', label: ar ? 'الاسم' : 'Name' },
              { key: 'role', label: ar ? 'الدور' : 'Role', render: (r) => (ar ? r.role_ar : r.role_en) },
              ...(data.scope === 'academic' ? [
                { key: 'department', label: ar ? 'القسم' : 'Department' },
                { key: 'academic_rank', label: ar ? 'الرتبة' : 'Rank' },
              ] : []),
            ]}
            rows={data.items}
          />
        </CardContent>
      </Card>
    );
  }

  if (data.scope === 'success') {
    return (
      <div className="space-y-4">
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>{ar ? 'منحنى الدرجات' : 'Grade curve'}</CardTitle>
            <CardDescription>{data.term?.name || ''}</CardDescription>
          </CardHeader>
          <CardContent>
            <SimpleTable
              columns={[
                { key: 'label', label: ar ? 'الفئة' : 'Band', render: (r) => (ar ? r.ar : r.en) },
                { key: 'count', label: ar ? 'العدد' : 'Count' },
              ]}
              rows={data.grades?.curve}
            />
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardHeader><CardTitle>{ar ? 'الرسوب حسب المادة' : 'Fail by course'}</CardTitle></CardHeader>
          <CardContent>
            {(data.grades?.fail_by_course || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">{ar ? 'لا نتائج معتمدة بعد.' : 'No finalized results yet.'}</p>
            ) : (
              <SimpleTable
                columns={[
                  { key: 'course_code', label: ar ? 'المادة' : 'Course' },
                  { key: 'course_name', label: ar ? 'الاسم' : 'Name' },
                  { key: 'fail_rate', label: ar ? 'رسوب %' : 'Fail %' },
                  { key: 'failed', label: ar ? 'راسب' : 'Failed' },
                  { key: 'graded', label: ar ? 'مقيَّم' : 'Graded' },
                ]}
                rows={data.grades.fail_by_course}
                onRowClick={(r) => r.course_code && navigate(`/dashboard/report/course/${encodeURIComponent(r.course_code)}`)}
              />
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (data.scope === 'approvals') {
    return (
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>{ar ? `${(data.items || []).length} طلب معلّق` : `${(data.items || []).length} pending`}</CardTitle>
          <CardDescription>{ar ? 'القرارات تُتخذ من اللوحة الرئيسية.' : 'Decisions are taken from the main dashboard.'}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {(data.items || []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{ar ? 'لا طلبات معلّقة.' : 'No pending items.'}</p>
          ) : (
            data.items.map((item) => (
              <div key={item.id} className="rounded-xl border px-3 py-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium">{item.title}</p>
                  <Badge variant="secondary">{item.kind}</Badge>
                </div>
                {item.body && <p className="text-xs text-muted-foreground mt-1">{item.body}</p>}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    );
  }

  if (data.scope === 'operations') {
    return (
      <div className="space-y-4">
        <Card className="rounded-2xl">
          <CardHeader><CardTitle>{ar ? 'تحصيل الرسوم' : 'Fee collection'}</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-2">
            <p>
              {ar
                ? `محصّل ${data.tuition?.collected} / مستحق ${data.tuition?.due} · متبقّي ${data.tuition?.remaining} ${data.tuition?.currency}`
                : `Collected ${data.tuition?.collected} / due ${data.tuition?.due} · remaining ${data.tuition?.remaining} ${data.tuition?.currency}`}
            </p>
            <SimpleTable
              columns={[
                { key: 'label', label: ar ? 'نوع القبول' : 'Admission', render: (r) => (ar ? r.ar : r.en) },
                { key: 'students', label: ar ? 'طلاب' : 'Students' },
                { key: 'due', label: ar ? 'مستحق' : 'Due' },
                { key: 'collected', label: ar ? 'محصّل' : 'Collected' },
              ]}
              rows={data.tuition?.by_admission}
            />
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardHeader><CardTitle>{ar ? 'القاعات والمختبرات' : 'Halls and labs'}</CardTitle></CardHeader>
          <CardContent>
            <SimpleTable
              columns={[
                { key: 'name', label: ar ? 'القاعة' : 'Room' },
                { key: 'kind', label: ar ? 'النوع' : 'Type' },
                { key: 'building', label: ar ? 'المبنى' : 'Building' },
                { key: 'capacity', label: ar ? 'السعة' : 'Seats' },
                { key: 'busy', label: ar ? 'مشغولة' : 'Busy', render: (r) => (r.busy ? (ar ? 'نعم' : 'Yes') : (ar ? 'لا' : 'No')) },
              ]}
              rows={data.facilities?.items}
            />
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardHeader><CardTitle>{ar ? 'أعطال مفتوحة' : 'Open tickets'}</CardTitle></CardHeader>
          <CardContent>
            {(data.tickets?.items || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">{ar ? 'لا أعطال مفتوحة.' : 'No open tickets.'}</p>
            ) : (
              <SimpleTable
                columns={[
                  { key: 'title', label: ar ? 'العطل' : 'Ticket' },
                  { key: 'location', label: ar ? 'الموقع' : 'Location' },
                  { key: 'priority', label: ar ? 'الأولوية' : 'Priority' },
                  { key: 'status', label: ar ? 'الحالة' : 'Status' },
                ]}
                rows={data.tickets.items}
              />
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (data.scope === 'course') {
    return (
      <div className="space-y-4">
        <div className="grid sm:grid-cols-3 gap-3">
          <Stat label={ar ? 'تقدم الخطة %' : 'Syllabus %'} value={data.offering?.progress ?? '—'} />
          <Stat label={ar ? 'غياب %' : 'Absence %'} value={data.attendance?.absence_rate ?? '—'} />
          <Stat label={ar ? 'رسوب %' : 'Fail %'} value={data.fail?.fail_rate ?? '—'} />
        </div>
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>{data.offering?.course_name || data.course_code}</CardTitle>
            <CardDescription>
              {[data.offering?.department, data.term?.name].filter(Boolean).join(' · ')}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <p>{ar ? `جلسات: ${data.offering?.sessions ?? 0} · مواد: ${data.offering?.materials ?? 0}` : `Sessions: ${data.offering?.sessions ?? 0} · materials: ${data.offering?.materials ?? 0}`}</p>
            <p>{ar ? `مدرّس معيّن: ${data.offering?.staffed ? 'نعم' : 'لا'}` : `Staffed: ${data.offering?.staffed ? 'yes' : 'no'}`}</p>
            {data.offering?.department_id && (
              <Button variant="outline" className="rounded-xl mt-2" onClick={() => navigate(`/dashboard/report/department/${data.offering.department_id}`)}>
                {ar ? 'تقرير القسم' : 'Department report'}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return <p className="text-sm text-muted-foreground">{ar ? 'لا تفاصيل لهذا التقرير.' : 'No details for this report.'}</p>;
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

function Breakdown({ title, items, ar }) {
  if (!items?.length) return null;
  return (
    <Card className="rounded-2xl">
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>
        <SimpleTable
          columns={[
            { key: 'label', label: ar ? 'التصنيف' : 'Category', render: (r) => (ar ? r.ar : r.en) },
            { key: 'count', label: ar ? 'العدد' : 'Count' },
          ]}
          rows={items}
        />
      </CardContent>
    </Card>
  );
}
