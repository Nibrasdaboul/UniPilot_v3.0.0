import { useEffect, useMemo, useState } from 'react';
import { UserCog } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

function roleLabel(roles, key, ar) {
  const row = (roles || []).find((r) => r.key === key);
  if (!row) return key || '—';
  return ar ? row.ar : row.en;
}

function kindLabel(kinds, key, ar) {
  const row = (kinds || []).find((k) => k.key === key);
  if (key === 'theory') return ar ? 'نظري' : 'Theory';
  if (key === 'practical') return ar ? 'عملي' : 'Practical';
  return row ? (ar ? row.ar : row.en) : key || '—';
}

function meetingLabel(m, kinds, ar) {
  const kind = kindLabel(kinds, m.kind, ar);
  const staffRole = m.kind === 'practical' ? (ar ? 'المعيد' : 'TA') : (ar ? 'المدرس' : 'Instructor');
  const staff = m.staff_name ? ` ${staffRole} ${m.staff_name}` : '';
  return `${m.course_name || m.course_code} ${ar ? 'الشعبة' : 'section'} ${kind} ${m.code || ''}${staff}`.replace(/\s+/g, ' ').trim();
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
      const assigned = o.staff || [];
      const role = sec.kind === 'practical' ? 'teaching_assistant' : 'instructor';
      rows.push({
        key: `sec-${sec.id}`,
        section_id: sec.id,
        course_code: o.course_code,
        course_name: o.course_name,
        kind: sec.kind,
        code: sec.code,
        staff_name: sec.staff_name || '',
        staff_role: sec.staff_name ? role : (assigned.find((s) => s.staff_role === role)?.staff_role || ''),
      });
    }
  }
  return rows;
}

export default function TeachingStaff() {
  const { api, user, canManageCurriculum, isDean } = useAuth();
  const { language } = useLanguage();
  const ar = language === 'ar';
  const [mine, setMine] = useState({ term: null, offerings: [], staff_roles: [], section_kinds: [] });
  const [teaching, setTeaching] = useState(null);
  const [board, setBoard] = useState(null);
  const [assign, setAssign] = useState({ offering_id: '', user_id: '', staff_role: 'instructor' });
  const [section, setSection] = useState({ offering_id: '', kind: 'theory', code: '', staff_user_id: '', capacity: '40' });
  const [search, setSearch] = useState({ q: '', kind: '', staff_role: '' });
  const [meeting, setMeeting] = useState({ section_id: '', weekday: 'friday', slot: '08-10', hall_id: '' });

  const load = async () => {
    try {
      if (!isDean) {
        const mineRes = await api.get('/academic/staff/mine');
        setMine(mineRes.data || { term: null, offerings: [] });
      }
      if (!isDean) {
        const teachRes = await api.get('/academic/staff/teaching').catch(() => ({ data: null }));
        setTeaching(teachRes.data);
      }
      if (canManageCurriculum) {
        const boardRes = await api.get('/academic/staff/board');
        setBoard(boardRes.data);
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'تعذر تحميل الكادر' : 'Failed to load teaching staff'));
    }
  };

  useEffect(() => { load(); }, [canManageCurriculum, isDean]);

  const addAssignment = async (e) => {
    e.preventDefault();
    try {
      await api.post('/academic/staff/assignments', {
        offering_id: Number(assign.offering_id),
        user_id: Number(assign.user_id),
        staff_role: assign.staff_role,
      });
      toast.success(ar ? 'تم تعيين الكادر على الشعبة' : 'Staff assigned');
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'فشل التعيين' : 'Assign failed'));
    }
  };

  const removeAssignment = async (id) => {
    if (!confirm(ar ? 'إلغاء هذا التعيين؟' : 'Remove this assignment?')) return;
    try {
      await api.delete(`/academic/staff/assignments/${id}`);
      toast.success(ar ? 'أُلغي التعيين' : 'Assignment removed');
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'فشل الإلغاء' : 'Failed'));
    }
  };

  const addSection = async (e) => {
    e.preventDefault();
    try {
      await api.post('/academic/staff/sections', {
        offering_id: Number(section.offering_id),
        kind: section.kind,
        code: section.code,
        staff_user_id: section.staff_user_id ? Number(section.staff_user_id) : null,
        capacity: Number(section.capacity) || 40,
      });
      toast.success(ar ? 'أُنشئت الشعبة' : 'Section created');
      setSection({ ...section, code: '' });
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'فشل إنشاء الشعبة' : 'Failed to create section'));
    }
  };

  const removeSection = async (id) => {
    if (!confirm(ar ? 'حذف هذه الشعبة؟' : 'Delete this section?')) return;
    try {
      await api.delete(`/academic/staff/sections/${id}`);
      toast.success(ar ? 'حُذفت الشعبة' : 'Section deleted');
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'فشل الحذف' : 'Failed'));
    }
  };

  const addMeeting = async (e) => {
    e.preventDefault();
    try {
      await api.post('/academic/staff/meetings', {
        section_id: Number(meeting.section_id),
        weekday: meeting.weekday,
        slot: meeting.slot,
        hall_id: String(meeting.hall_id || '').trim(),
        hall_name: String(meeting.hall_id || '').trim(),
      });
      toast.success(ar ? 'وُضعت الشعبة على الجدول' : 'Section placed on the timetable');
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'فشل وضع الشعبة' : 'Failed to place section'));
    }
  };

  const removeMeeting = async (id) => {
    if (!confirm(ar ? 'إزالة هذه الخانة من الجدول؟' : 'Remove this slot from the timetable?')) return;
    try {
      await api.delete(`/academic/staff/meetings/${id}`);
      toast.success(ar ? 'أُزيلت من الجدول' : 'Removed from timetable');
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'فشل الحذف' : 'Failed'));
    }
  };

  const pick = async (sectionId) => {
    try {
      const res = await api.post('/academic/staff/picks', { section_id: sectionId });
      setMine(res.data);
      toast.success(ar ? 'تم اختيار الشعبة' : 'Section selected');
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'فشل الاختيار' : 'Pick failed'));
    }
  };

  const roles = board?.staff_roles || mine.staff_roles || [];
  const kinds = board?.section_kinds || mine.section_kinds || [];
  const weekdays = board?.weekdays?.length ? board.weekdays : [
    { key: 'friday', ar: 'الجمعة', en: 'Friday' },
    { key: 'saturday', ar: 'السبت', en: 'Saturday' },
    { key: 'sunday', ar: 'الأحد', en: 'Sunday' },
    { key: 'monday', ar: 'الاثنين', en: 'Monday' },
    { key: 'tuesday', ar: 'الثلاثاء', en: 'Tuesday' },
    { key: 'wednesday', ar: 'الأربعاء', en: 'Wednesday' },
    { key: 'thursday', ar: 'الخميس', en: 'Thursday' },
  ];
  const slots = board?.time_slots?.length ? board.time_slots : [
    { key: '08-10', ar: '8 إلى 10', en: '8 to 10' },
    { key: '10-12', ar: '10 إلى 12', en: '10 to 12' },
    { key: '12-14', ar: '12 إلى 2', en: '12 to 2' },
    { key: '14-16', ar: '2 إلى 4', en: '2 to 4' },
  ];
  const halls = board?.halls || [];
  const meetings = board?.meetings || [];
  const peopleForRole = (role) => (board?.people || []).filter((p) => p.staff_role === role);
  const sectionOptions = (board?.offerings || []).flatMap((o) =>
    (o.sections || []).map((sec) => ({
      id: sec.id,
      label: `${o.course_code} — ${kindLabel(kinds, sec.kind, ar)} ${sec.code}`,
    })),
  );
  const searchRows = useMemo(() => {
    const q = search.q.trim().toLowerCase();
    return flattenSearchRows(board).filter((row) => {
      if (search.kind && row.kind !== search.kind) return false;
      if (search.staff_role && !String(row.staff_role || '').includes(search.staff_role)) return false;
      if (!q) return true;
      return [row.course_code, row.course_name, row.staff_name, row.code]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [board, search]);
  const cellFor = (weekday, hallId, slot) =>
    meetings.find((m) => m.weekday === weekday && String(m.hall_id || m.hall_name) === String(hallId) && m.slot === slot);

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <UserCog className="w-6 h-6" />
          {ar ? 'الكادر والشعب التدريسية' : 'Teaching staff and sections'}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isDean
            ? (ar
              ? 'ابحث عن مادة أو كادر، وراجع الجدول الأسبوعي للكلية. التعيين وفتح الشعب يبقى للشؤون الأكاديمية.'
              : 'Search a course or staff member and review the college weekly timetable. Assignment stays with academic administration.')
            : (ar
              ? 'رئيس القسم والشؤون الأكاديمية يعيّنون المدرّس والمعيد ويفتحون شعب النظري/العملي. الطالب يختار شعبته.'
              : 'Department heads assign instructors and TAs and open theory/practical sections. Students pick a section.')}
        </p>
      </div>

      {isDean && board && (
        <>
          <Card data-testid="dean-staff-search">
            <CardHeader>
              <CardTitle>{ar ? 'بحث عن مادة أو كادر' : 'Search course or staff'}</CardTitle>
              <CardDescription>
                {board.term ? (ar ? `الفصل: ${board.term.name}` : `Term: ${board.term.name}`) : (ar ? 'لا يوجد فصل حالي.' : 'No current term.')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label>{ar ? 'مادة أو اسم الكادر' : 'Course or staff name'}</Label>
                  <Input
                    value={search.q}
                    onChange={(e) => setSearch({ ...search, q: e.target.value })}
                    placeholder={ar ? 'مدخل برمجة أو محمد حسان' : 'Programming or staff name'}
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-1">
                  <Label>{ar ? 'نوع المادة' : 'Section type'}</Label>
                  <select className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm" value={search.kind} onChange={(e) => setSearch({ ...search, kind: e.target.value })}>
                    <option value="">{ar ? 'الكل' : 'All'}</option>
                    {(kinds || []).map((k) => (
                      <option key={k.key} value={k.key}>{ar ? k.ar : k.en}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>{ar ? 'الكادر' : 'Staff role'}</Label>
                  <select className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm" value={search.staff_role} onChange={(e) => setSearch({ ...search, staff_role: e.target.value })}>
                    <option value="">{ar ? 'الكل' : 'All'}</option>
                    {(roles || []).map((r) => (
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

          <Card data-testid="dean-weekly-timetable">
            <CardHeader>
              <CardTitle>{ar ? 'الجدول الأسبوعي للفصل' : 'Term weekly timetable'}</CardTitle>
              <CardDescription>
                {ar ? 'من الجمعة إلى الخميس · صف لكل قاعة · أربع فترات في اليوم.' : 'Friday to Thursday · one row per hall · four slots a day.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <form onSubmit={addMeeting} className="grid sm:grid-cols-5 gap-3 items-end">
                <div className="space-y-1 sm:col-span-2">
                  <Label>{ar ? 'الشعبة' : 'Section'}</Label>
                  <select required className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm" value={meeting.section_id} onChange={(e) => setMeeting({ ...meeting, section_id: e.target.value })}>
                    <option value="">{ar ? 'اختر' : 'Select'}</option>
                    {sectionOptions.map((s) => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>{ar ? 'اليوم' : 'Day'}</Label>
                  <select className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm" value={meeting.weekday} onChange={(e) => setMeeting({ ...meeting, weekday: e.target.value })}>
                    {weekdays.map((d) => (
                      <option key={d.key} value={d.key}>{ar ? d.ar : d.en}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>{ar ? 'الوقت' : 'Time'}</Label>
                  <select className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm" value={meeting.slot} onChange={(e) => setMeeting({ ...meeting, slot: e.target.value })}>
                    {slots.map((s) => (
                      <option key={s.key} value={s.key}>{ar ? s.ar : s.en}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>{ar ? 'القاعة' : 'Hall'}</Label>
                  <select required className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm" value={meeting.hall_id} onChange={(e) => setMeeting({ ...meeting, hall_id: e.target.value })}>
                    <option value="">{ar ? 'اختر' : 'Select'}</option>
                    {halls.map((h) => (
                      <option key={h.id} value={h.id}>{h.name}</option>
                    ))}
                  </select>
                </div>
                <Button type="submit" className="rounded-xl sm:col-span-5">{ar ? 'وضع على الجدول' : 'Place on timetable'}</Button>
              </form>
              {halls.length === 0 ? (
                <p className="text-sm text-muted-foreground">{ar ? 'أضف قاعات من صفحة الامتحانات أولاً.' : 'Add halls from the exams page first.'}</p>
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
                                  {cell ? (
                                    <div className="space-y-1">
                                      <p>{meetingLabel(cell, kinds, ar)}</p>
                                      <button type="button" className="text-destructive" onClick={() => removeMeeting(cell.id)}>
                                        {ar ? 'إزالة' : 'Remove'}
                                      </button>
                                    </div>
                                  ) : null}
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
        </>
      )}

      {!isDean && (
      <Card>
        <CardHeader>
          <CardTitle>{ar ? 'موادي والكادر' : 'My courses and staff'}</CardTitle>
          <CardDescription>
            {mine.term ? (ar ? `الفصل: ${mine.term.name}` : `Term: ${mine.term.name}`) : (ar ? 'لا يوجد فصل حالي.' : 'No current term.')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(mine.offerings || []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{ar ? 'لا مواد مسجّلة هذا الفصل.' : 'No enrolled courses this term.'}</p>
          ) : (
            (mine.offerings || []).map((o) => (
              <div key={o.id} className="border rounded-xl p-4 space-y-2">
                <div className="font-medium">{o.course_code} — {o.course_name}</div>
                <div className="flex flex-wrap gap-2">
                  {(o.staff || []).length === 0 && <span className="text-sm text-muted-foreground">{ar ? 'لم يُعيَّن كادر بعد.' : 'No staff assigned yet.'}</span>}
                  {(o.staff || []).map((s) => (
                    <Badge key={s.id} variant="secondary">{roleLabel(roles, s.staff_role, ar)}: {s.full_name}</Badge>
                  ))}
                </div>
                {(o.sections || []).length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {o.sections.map((sec) => (
                      <Button
                        key={sec.id}
                        size="sm"
                        variant={sec.picked ? 'default' : 'outline'}
                        className="rounded-xl"
                        disabled={user?.role !== 'student'}
                        onClick={() => pick(sec.id)}
                      >
                        {sec.kind === 'theory' ? (ar ? 'نظري' : 'Theory') : (ar ? 'عملي' : 'Practical')} {sec.code}
                        {sec.staff_name ? ` · ${sec.staff_name}` : ''}
                        {` · ${sec.picked_count || 0}/${sec.capacity}`}
                        {sec.picked ? (ar ? ' · مختارة' : ' · selected') : ''}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
      )}

      {!isDean && teaching?.offerings?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{ar ? 'شعبي للتدريس' : 'Courses I teach'}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{ar ? 'المادة' : 'Course'}</TableHead>
                  <TableHead>{ar ? 'مسجّلون' : 'Enrolled'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teaching.offerings.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>{o.course_code} — {o.course_name}</TableCell>
                    <TableCell>{o.enrolled_count ?? 0}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {canManageCurriculum && board && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{ar ? 'تعيين كادر على شعبة' : 'Assign staff to an offering'}</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={addAssignment} className="grid sm:grid-cols-4 gap-3 items-end">
                <div className="space-y-1">
                  <Label>{ar ? 'الشعبة' : 'Offering'}</Label>
                  <select required className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm" value={assign.offering_id} onChange={(e) => setAssign({ ...assign, offering_id: e.target.value })}>
                    <option value="">{ar ? 'اختر' : 'Select'}</option>
                    {(board.offerings || []).map((o) => (
                      <option key={o.id} value={o.id}>{o.course_code}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>{ar ? 'الدور' : 'Role'}</Label>
                  <select className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm" value={assign.staff_role} onChange={(e) => setAssign({ ...assign, staff_role: e.target.value, user_id: '' })}>
                    {(board.staff_roles || []).map((r) => (
                      <option key={r.key} value={r.key}>{ar ? r.ar : r.en}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>{ar ? 'الشخص' : 'Person'}</Label>
                  <select required className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm" value={assign.user_id} onChange={(e) => setAssign({ ...assign, user_id: e.target.value })}>
                    <option value="">{ar ? 'اختر' : 'Select'}</option>
                    {peopleForRole(assign.staff_role).map((p) => (
                      <option key={p.id} value={p.id}>{p.full_name} {p.person_code ? `(${p.person_code})` : ''}</option>
                    ))}
                  </select>
                </div>
                <Button type="submit" className="rounded-xl">{ar ? 'تعيين' : 'Assign'}</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{ar ? 'فتح شعبة نظري / عملي' : 'Open a theory / practical section'}</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={addSection} className="grid sm:grid-cols-5 gap-3 items-end">
                <div className="space-y-1">
                  <Label>{ar ? 'المادة' : 'Course'}</Label>
                  <select required className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm" value={section.offering_id} onChange={(e) => setSection({ ...section, offering_id: e.target.value })}>
                    <option value="">{ar ? 'اختر' : 'Select'}</option>
                    {(board.offerings || []).map((o) => (
                      <option key={o.id} value={o.id}>{o.course_code}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>{ar ? 'النوع' : 'Kind'}</Label>
                  <select className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm" value={section.kind} onChange={(e) => setSection({ ...section, kind: e.target.value, staff_user_id: '' })}>
                    {(kinds || []).map((k) => (
                      <option key={k.key} value={k.key}>{ar ? k.ar : k.en}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>{ar ? 'الرمز' : 'Code'}</Label>
                  <Input required value={section.code} onChange={(e) => setSection({ ...section, code: e.target.value })} placeholder="T1" className="rounded-xl" />
                </div>
                <div className="space-y-1">
                  <Label>{ar ? 'المدرّس / المعيد' : 'Staff'}</Label>
                  <select className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm" value={section.staff_user_id} onChange={(e) => setSection({ ...section, staff_user_id: e.target.value })}>
                    <option value="">{ar ? 'لاحقاً' : 'Later'}</option>
                    {peopleForRole(section.kind === 'theory' ? 'instructor' : 'teaching_assistant').map((p) => (
                      <option key={p.id} value={p.id}>{p.full_name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>{ar ? 'السعة' : 'Capacity'}</Label>
                  <Input type="number" min="1" value={section.capacity} onChange={(e) => setSection({ ...section, capacity: e.target.value })} className="rounded-xl" />
                </div>
                <Button type="submit" className="rounded-xl sm:col-span-5">{ar ? 'فتح الشعبة' : 'Create section'}</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{ar ? 'تعيينات الفصل الحالي' : 'Current-term assignments'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {(board.offerings || []).map((o) => (
                <div key={o.id} className="border rounded-xl p-3 space-y-2">
                  <div className="font-medium">{o.course_code} — {o.course_name}</div>
                  <div className="flex flex-wrap gap-2">
                    {(o.staff || []).map((s) => (
                      <Badge key={s.id} variant="secondary" className="gap-2">
                        {roleLabel(roles, s.staff_role, ar)}: {s.full_name}
                        <button type="button" className="text-destructive" onClick={() => removeAssignment(s.id)}>×</button>
                      </Badge>
                    ))}
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{ar ? 'شعبة' : 'Section'}</TableHead>
                        <TableHead>{ar ? 'الكادر' : 'Staff'}</TableHead>
                        <TableHead>{ar ? 'السعة' : 'Seats'}</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(o.sections || []).length === 0 ? (
                        <TableRow><TableCell colSpan={4} className="text-muted-foreground">{ar ? 'لا شعب بعد.' : 'No sections yet.'}</TableCell></TableRow>
                      ) : o.sections.map((sec) => (
                        <TableRow key={sec.id}>
                          <TableCell>{sec.kind} {sec.code}</TableCell>
                          <TableCell>{sec.staff_name || '—'}</TableCell>
                          <TableCell>{sec.picked_count || 0} / {sec.capacity}</TableCell>
                          <TableCell className="text-end">
                            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeSection(sec.id)}>{ar ? 'حذف' : 'Delete'}</Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
