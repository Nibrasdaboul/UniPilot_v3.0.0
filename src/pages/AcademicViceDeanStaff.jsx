import { useEffect, useMemo, useState } from 'react';
import { UserCog, Scale, Search, CalendarDays } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

function roleLabel(roles, key, ar) {
  const row = (roles || []).find((r) => r.key === key);
  if (!row) return key || '—';
  return ar ? row.ar : row.en;
}

function kindLabel(kinds, key, ar) {
  const row = (kinds || []).find((k) => k.key === key);
  return row ? (ar ? row.ar : row.en) : key || '—';
}

function meetingLabel(m, kinds, ar) {
  const kind = kindLabel(kinds, m.kind, ar);
  const staff = m.staff_name ? ` · ${m.staff_name}` : '';
  return `${m.course_code || ''} ${kind} ${m.code || ''}${staff}`.replace(/\s+/g, ' ').trim();
}

function flattenSearchRows(board) {
  const rows = [];
  for (const o of board?.offerings || []) {
    if ((o.sections || []).length === 0) {
      rows.push({
        key: `off-${o.id}`,
        course_code: o.course_code,
        course_name: o.course_name,
        kind: '',
        code: '',
        staff_name: (o.staff || []).map((s) => s.full_name).join(' · '),
        staff_role: (o.staff || []).map((s) => s.staff_role).join(','),
      });
    }
    for (const sec of o.sections || []) {
      rows.push({
        key: `sec-${sec.id}`,
        course_code: o.course_code,
        course_name: o.course_name,
        kind: sec.kind,
        code: sec.code,
        staff_name: sec.staff_name || (o.staff || []).map((s) => s.full_name).join(' · '),
        staff_role: sec.kind === 'practical' ? 'teaching_assistant' : 'instructor',
      });
    }
  }
  return rows;
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

function statusBadge(status, ar) {
  const map = {
    ok: { ar: 'ضمن النصاب', en: 'Within load', variant: 'default' },
    overload: { ar: 'تجاوز النصاب', en: 'Overload', variant: 'destructive' },
    underload: { ar: 'نقص النصاب', en: 'Underload', variant: 'outline' },
    unassigned: { ar: 'بلا تكليف', en: 'Unassigned', variant: 'secondary' },
    unspecified: { ar: 'نصاب غير محدد', en: 'Load unspecified', variant: 'outline' },
  };
  const row = map[status] || map.unspecified;
  return <Badge variant={row.variant}>{ar ? row.ar : row.en}</Badge>;
}

export default function AcademicViceDeanStaff() {
  const { api } = useAuth();
  const { language } = useLanguage();
  const ar = language === 'ar';
  const [data, setData] = useState(null);
  const [search, setSearch] = useState({ q: '', kind: '', staff_role: '' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/vda/staff');
        if (!cancelled) setData(res.data);
      } catch (e) {
        toast.error(e.response?.data?.detail || (ar ? 'تعذر تحميل الكادر والنصاب' : 'Failed to load staff loads'));
      }
    })();
    return () => { cancelled = true; };
  }, [api, ar]);

  const roles = data?.staff_roles || [];
  const kinds = data?.section_kinds || [];
  const weekdays = data?.weekdays || [];
  const slots = data?.time_slots || [];
  const halls = data?.halls || [];
  const meetings = data?.meetings || [];

  const searchRows = useMemo(() => {
    const q = search.q.trim().toLowerCase();
    return flattenSearchRows(data).filter((row) => {
      if (search.kind && row.kind !== search.kind) return false;
      if (search.staff_role && !String(row.staff_role || '').includes(search.staff_role)) return false;
      if (!q) return true;
      return [row.course_code, row.course_name, row.staff_name, row.code]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [data, search]);

  const cellFor = (weekday, hallId, slot) =>
    meetings.find((m) => m.weekday === weekday && String(m.hall_id || m.hall_name) === String(hallId) && m.slot === slot);

  return (
    <div className="p-4 sm:p-6 space-y-6" data-testid="vda-staff">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <UserCog className="w-6 h-6" />
          {ar ? 'نصاب الكادر وجدول الكلية' : 'Teaching load and college timetable'}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {ar
            ? 'مراجعة الأحمال على مستوى الكلية. التعيين وفتح الشعب يبقى لرؤساء الأقسام، وليس من هذه الصفحة.'
            : 'College-wide load review. Assignment and opening sections stay with department heads, not this page.'}
        </p>
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <Stat label={ar ? 'الكادر التدريسي' : 'Teaching staff'} value={data?.counts?.staff} />
        <Stat label={ar ? 'تجاوز النصاب' : 'Overload'} value={data?.counts?.overload} />
        <Stat label={ar ? 'نقص أو بلا تكليف' : 'Under / unassigned'} value={data?.counts?.underload} />
        <Stat label={ar ? 'مواد بلا كادر' : 'Unstaffed courses'} value={data?.counts?.unstaffed} />
      </div>

      <Card className="rounded-2xl" data-testid="vda-loads">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scale className="w-4 h-4" />
            {ar ? 'توزيع النصاب' : 'Teaching load distribution'}
          </CardTitle>
          <CardDescription>
            {data?.term
              ? (ar ? `ساعات معتمدة مكلَّفة مقابل النصاب القانوني · ${data.term.name}` : `Assigned credit hours vs legal load · ${data.term.name}`)
              : (ar ? 'لا يوجد فصل حالي.' : 'No current term.')}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {(data?.loads || []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{ar ? 'لا كادر تدريسي مسجّل في الكلية.' : 'No teaching staff in this college.'}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{ar ? 'الاسم' : 'Name'}</TableHead>
                  <TableHead>{ar ? 'الدور' : 'Role'}</TableHead>
                  <TableHead>{ar ? 'المكلَّف' : 'Assigned'}</TableHead>
                  <TableHead>{ar ? 'النصاب' : 'Legal'}</TableHead>
                  <TableHead>{ar ? 'الحالة' : 'Status'}</TableHead>
                  <TableHead>{ar ? 'المواد' : 'Courses'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.loads.map((row) => (
                  <TableRow key={row.user_id} className={row.status === 'overload' ? 'text-destructive' : ''}>
                    <TableCell>
                      <div className="font-medium">{row.full_name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{row.person_code || '—'}</div>
                    </TableCell>
                    <TableCell>{roleLabel(roles, row.role, ar)}</TableCell>
                    <TableCell>{row.assigned_hours}</TableCell>
                    <TableCell>
                      {row.legal_hours}
                      {row.legal_is_default ? <span className="text-xs text-muted-foreground"> {ar ? '(افتراضي)' : '(default)'}</span> : null}
                    </TableCell>
                    <TableCell>{statusBadge(row.status, ar)}</TableCell>
                    <TableCell className="text-xs">{row.courses.map((c) => c.course_code).join(' · ') || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {(data?.unstaffed || []).length > 0 && (
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>{ar ? 'مواد بلا كادر هذا الفصل' : 'Unstaffed offerings this term'}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            {data.unstaffed.map((o) => (
              <p key={o.id}>{o.course_code} — {o.course_name} ({o.enrolled_count})</p>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="rounded-2xl" data-testid="vda-staff-search">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="w-4 h-4" />
            {ar ? 'بحث عن مادة أو كادر' : 'Search course or staff'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>{ar ? 'مادة أو اسم الكادر' : 'Course or staff name'}</Label>
              <Input value={search.q} onChange={(e) => setSearch({ ...search, q: e.target.value })} className="rounded-xl" />
            </div>
            <div className="space-y-1">
              <Label>{ar ? 'نوع المادة' : 'Section type'}</Label>
              <select className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm" value={search.kind} onChange={(e) => setSearch({ ...search, kind: e.target.value })}>
                <option value="">{ar ? 'الكل' : 'All'}</option>
                {kinds.map((k) => (
                  <option key={k.key} value={k.key}>{ar ? k.ar : k.en}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>{ar ? 'الكادر' : 'Staff role'}</Label>
              <select className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm" value={search.staff_role} onChange={(e) => setSearch({ ...search, staff_role: e.target.value })}>
                <option value="">{ar ? 'الكل' : 'All'}</option>
                {roles.map((r) => (
                  <option key={r.key} value={r.key}>{ar ? r.ar : r.en}</option>
                ))}
              </select>
            </div>
          </div>
          {searchRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{ar ? 'لا نتائج.' : 'No matches.'}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{ar ? 'المادة' : 'Course'}</TableHead>
                  <TableHead>{ar ? 'النوع' : 'Type'}</TableHead>
                  <TableHead>{ar ? 'الشعبة' : 'Section'}</TableHead>
                  <TableHead>{ar ? 'الكادر' : 'Staff'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {searchRows.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell>{row.course_code} — {row.course_name}</TableCell>
                    <TableCell>{row.kind ? kindLabel(kinds, row.kind, ar) : '—'}</TableCell>
                    <TableCell>{row.code || '—'}</TableCell>
                    <TableCell>{row.staff_name || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl" data-testid="vda-weekly-timetable">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4" />
            {ar ? 'الجدول الأسبوعي للكلية' : 'College weekly timetable'}
          </CardTitle>
          <CardDescription>
            {ar ? 'من الجمعة إلى الخميس · للعرض فقط. وضع الحصص من رؤساء الأقسام.' : 'Friday to Thursday · read-only. Placement stays with department heads.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {halls.length === 0 ? (
            <p className="text-sm text-muted-foreground">{ar ? 'لا قاعات أو حصص على الجدول بعد.' : 'No halls or meetings on the timetable yet.'}</p>
          ) : weekdays.map((day) => (
            <div key={day.key} className="space-y-2">
              <p className="font-medium">{ar ? day.ar : day.en}</p>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap">{ar ? 'القاعة / الوقت' : 'Hall / time'}</TableHead>
                      {slots.map((s) => (
                        <TableHead key={s.key} className="min-w-[10rem]">{ar ? s.ar : s.en}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {halls.map((h) => (
                      <TableRow key={`${day.key}-${h.id}`}>
                        <TableCell className="font-medium whitespace-nowrap">{h.name}</TableCell>
                        {slots.map((s) => {
                          const cell = cellFor(day.key, h.id, s.key);
                          return (
                            <TableCell key={s.key} className="align-top text-xs">
                              {cell ? meetingLabel(cell, kinds, ar) : null}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
