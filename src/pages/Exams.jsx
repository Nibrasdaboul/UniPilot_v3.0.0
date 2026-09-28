import { useEffect, useState } from 'react';
import { Landmark } from 'lucide-react';
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

function typeLabel(types, key, ar) {
  const row = (types || []).find((t) => t.key === key);
  if (!row) return key || '—';
  return ar ? row.ar : row.en;
}

function when(iso) {
  if (!iso) return '—';
  return String(iso).slice(0, 16).replace('T', ' ');
}

function overlap(a, b) {
  if (!a?.starts_at || !a?.ends_at || !b?.starts_at || !b?.ends_at) return false;
  return new Date(a.starts_at) < new Date(b.ends_at) && new Date(b.starts_at) < new Date(a.ends_at);
}

function deanOverview(board) {
  const sessions = board?.sessions || [];
  const offerings = board?.offerings || [];
  const halls = board?.halls || [];
  const published = sessions.filter((s) => Number(s.is_published) === 1);
  const drafts = sessions.filter((s) => Number(s.is_published) !== 1);
  const scheduledIds = new Set(sessions.map((s) => Number(s.offering_id)));
  const unscheduled = offerings.filter((o) => !scheduledIds.has(Number(o.id)));
  const noHall = sessions.filter((s) => !s.hall_id);
  const usedHalls = new Set(sessions.filter((s) => s.hall_id).map((s) => Number(s.hall_id)));
  const unusedHalls = halls.filter((h) => !usedHalls.has(Number(h.id)));
  const clashes = [];
  for (let i = 0; i < sessions.length; i += 1) {
    for (let j = i + 1; j < sessions.length; j += 1) {
      const a = sessions[i];
      const b = sessions[j];
      if (a.hall_id && b.hall_id && Number(a.hall_id) === Number(b.hall_id) && overlap(a, b)) {
        clashes.push({ key: `${a.id}-${b.id}`, hall: a.hall_name, a, b });
      }
    }
  }
  return { published, drafts, unscheduled, noHall, unusedHalls, clashes };
}

export default function Exams() {
  const { api, canEnterGrades, isDean } = useAuth();
  const { language } = useLanguage();
  const ar = language === 'ar';
  const [mine, setMine] = useState({ term: null, exams: [], exam_types: [] });
  const [board, setBoard] = useState(null);
  const [hallForm, setHallForm] = useState({ name: '', capacity: '80', building: '' });
  const [sessionForm, setSessionForm] = useState({
    offering_id: '',
    exam_type: 'midterm',
    hall_id: '',
    starts_at: '',
    ends_at: '',
  });
  const [seating, setSeating] = useState(null);

  const loadMine = async () => {
    if (isDean) return;
    try {
      const res = await api.get('/academic/exams/mine');
      setMine(res.data || { term: null, exams: [], exam_types: [] });
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'تعذر تحميل جدول الامتحانات' : 'Failed to load exams'));
    }
  };

  const loadBoard = async () => {
    if (!canEnterGrades) return;
    try {
      const res = await api.get('/academic/exams/board');
      setBoard(res.data);
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'تعذر تحميل لوحة الامتحانات' : 'Failed to load exam board'));
    }
  };

  useEffect(() => {
    loadMine();
    loadBoard();
  }, [canEnterGrades, isDean]);

  const addHall = async (e) => {
    e.preventDefault();
    try {
      await api.post('/academic/exams/halls', {
        name: hallForm.name,
        capacity: Number(hallForm.capacity),
        building: hallForm.building,
      });
      toast.success(ar ? 'أُضيفت القاعة' : 'Hall added');
      setHallForm({ name: '', capacity: '80', building: '' });
      loadBoard();
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'فشل إضافة القاعة' : 'Failed to add hall'));
    }
  };

  const removeHall = async (id) => {
    if (!confirm(ar ? 'حذف هذه القاعة؟' : 'Delete this hall?')) return;
    try {
      await api.delete(`/academic/exams/halls/${id}`);
      toast.success(ar ? 'حُذفت القاعة' : 'Hall deleted');
      loadBoard();
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'فشل الحذف' : 'Failed'));
    }
  };

  const addSession = async (e) => {
    e.preventDefault();
    try {
      await api.post('/academic/exams/sessions', {
        offering_id: Number(sessionForm.offering_id),
        exam_type: sessionForm.exam_type,
        hall_id: sessionForm.hall_id ? Number(sessionForm.hall_id) : null,
        starts_at: sessionForm.starts_at ? new Date(sessionForm.starts_at).toISOString() : null,
        ends_at: sessionForm.ends_at ? new Date(sessionForm.ends_at).toISOString() : null,
      });
      toast.success(ar ? 'أُنشئت جلسة الامتحان' : 'Exam session created');
      loadBoard();
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'فشل إنشاء الجلسة' : 'Failed to create session'));
    }
  };

  const publish = async (id) => {
    if (!confirm(ar ? 'نشر هذا الامتحان للطلاب وتوزيع المقاعد؟' : 'Publish this exam and assign seats?')) return;
    try {
      const res = await api.post(`/academic/exams/sessions/${id}/publish`);
      setSeating(res.data);
      toast.success(ar ? 'نُشر الامتحان ووُزعت المقاعد' : 'Exam published and seats assigned');
      loadBoard();
      loadMine();
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'فشل النشر' : 'Publish failed'));
    }
  };

  const removeSession = async (id) => {
    if (!confirm(ar ? 'حذف جلسة الامتحان؟' : 'Delete this exam session?')) return;
    try {
      await api.delete(`/academic/exams/sessions/${id}`);
      toast.success(ar ? 'حُذفت الجلسة' : 'Session deleted');
      if (seating?.id === id) setSeating(null);
      loadBoard();
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'فشل الحذف' : 'Failed'));
    }
  };

  const types = board?.exam_types || mine.exam_types || [];
  const overview = isDean ? deanOverview(board) : null;

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Landmark className="w-6 h-6" />
          {ar ? 'الامتحانات والقاعات' : 'Exams and halls'}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isDean
            ? (ar
              ? 'نظرة على جدول الكلية والقاعات. دائرة الامتحانات تحدد الوقت والقاعة، والطالب يرى جدوله بعد النشر فقط.'
              : 'College timetable and halls. The Exams Office sets times and rooms; students see their timetable only after publish.')
            : (ar
              ? 'دائرة الامتحانات تحدد القاعة والوقت. الطالب يرى الجدول بعد النشر فقط.'
              : 'The Exams Office assigns halls and times. Students see the timetable only after it is published.')}
        </p>
      </div>

      {isDean && (
        <Card data-testid="dean-exam-overview">
          <CardHeader>
            <CardTitle>{ar ? 'جدول الكلية' : 'College timetable'}</CardTitle>
            <CardDescription>
              {board?.term
                ? (ar ? `الفصل: ${board.term.name}` : `Term: ${board.term.name}`)
                : (ar ? 'لا يوجد فصل حالي.' : 'No current term.')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              {overview
                ? (ar
                  ? `منشور ${overview.published.length} · مسودة ${overview.drafts.length} · مواد بلا جلسة ${overview.unscheduled.length} · بلا قاعة ${overview.noHall.length}`
                  : `Published ${overview.published.length} · drafts ${overview.drafts.length} · unscheduled ${overview.unscheduled.length} · no hall ${overview.noHall.length}`)
                : '—'}
            </p>
            {overview?.clashes?.length > 0 && (
              <p className="text-sm text-destructive">
                {ar
                  ? `تعارض قاعة: ${overview.clashes.map((c) => `${c.hall} (${c.a.course_code} / ${c.b.course_code})`).join('، ')}`
                  : `Hall clash: ${overview.clashes.map((c) => `${c.hall} (${c.a.course_code} / ${c.b.course_code})`).join(', ')}`}
              </p>
            )}
            {(overview?.published || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">{ar ? 'لا امتحانات منشورة للكلية بعد.' : 'No published college exams yet.'}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{ar ? 'المادة' : 'Course'}</TableHead>
                    <TableHead>{ar ? 'النوع' : 'Type'}</TableHead>
                    <TableHead>{ar ? 'القاعة' : 'Hall'}</TableHead>
                    <TableHead>{ar ? 'من' : 'From'}</TableHead>
                    <TableHead>{ar ? 'إلى' : 'To'}</TableHead>
                    <TableHead>{ar ? 'المسجّلون' : 'Enrolled'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overview.published.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>{s.course_code} — {s.course_name}</TableCell>
                      <TableCell>{typeLabel(types, s.exam_type, ar)}</TableCell>
                      <TableCell>{s.hall_name || s.room_name || '—'}{s.building ? ` (${s.building})` : ''}</TableCell>
                      <TableCell>{when(s.starts_at)}</TableCell>
                      <TableCell>{when(s.ends_at)}</TableCell>
                      <TableCell>{s.enrolled_count ?? 0}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {(overview?.unscheduled || []).length > 0 && (
              <p className="text-xs text-muted-foreground">
                {ar
                  ? `مواد بلا جلسة: ${overview.unscheduled.map((o) => o.course_code).join('، ')}`
                  : `Unscheduled: ${overview.unscheduled.map((o) => o.course_code).join(', ')}`}
              </p>
            )}
            {(overview?.unusedHalls || []).length > 0 && (
              <p className="text-xs text-muted-foreground">
                {ar
                  ? `قاعات غير مستخدمة هذا الفصل: ${overview.unusedHalls.map((h) => h.name).join('، ')}`
                  : `Unused halls this term: ${overview.unusedHalls.map((h) => h.name).join(', ')}`}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {!isDean && (
        <Card>
          <CardHeader>
            <CardTitle>{ar ? 'جدولي' : 'My timetable'}</CardTitle>
            <CardDescription>
              {mine.term ? (ar ? `الفصل: ${mine.term.name}` : `Term: ${mine.term.name}`) : (ar ? 'لا يوجد فصل حالي.' : 'No current term.')}
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {(mine.exams || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">{ar ? 'لا امتحانات منشورة لموادك بعد.' : 'No published exams for your courses yet.'}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{ar ? 'المادة' : 'Course'}</TableHead>
                    <TableHead>{ar ? 'النوع' : 'Type'}</TableHead>
                    <TableHead>{ar ? 'من' : 'From'}</TableHead>
                    <TableHead>{ar ? 'إلى' : 'To'}</TableHead>
                    <TableHead>{ar ? 'القاعة' : 'Hall'}</TableHead>
                    <TableHead>{ar ? 'المقعد' : 'Seat'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(mine.exams || []).map((ex) => (
                    <TableRow key={ex.id}>
                      <TableCell>{ex.course_code} — {ex.course_name}</TableCell>
                      <TableCell>{typeLabel(types, ex.exam_type, ar)}</TableCell>
                      <TableCell>{when(ex.starts_at)}</TableCell>
                      <TableCell>{when(ex.ends_at)}</TableCell>
                      <TableCell>{ex.hall_name || ex.room_name || '—'}{ex.building ? ` (${ex.building})` : ''}</TableCell>
                      <TableCell className="font-mono">{ex.seat_label || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {canEnterGrades && board && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{ar ? 'القاعات' : 'Halls'}</CardTitle>
              <CardDescription>{ar ? 'السعة لازم تكفي عدد المسجّلين قبل جدولة الامتحان.' : 'Capacity must cover enrolled students before a session is scheduled.'}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={addHall} className="grid sm:grid-cols-4 gap-3 items-end">
                <div className="space-y-1">
                  <Label>{ar ? 'الاسم' : 'Name'}</Label>
                  <Input required value={hallForm.name} onChange={(e) => setHallForm({ ...hallForm, name: e.target.value })} className="rounded-xl" />
                </div>
                <div className="space-y-1">
                  <Label>{ar ? 'السعة' : 'Capacity'}</Label>
                  <Input type="number" min="1" value={hallForm.capacity} onChange={(e) => setHallForm({ ...hallForm, capacity: e.target.value })} className="rounded-xl" />
                </div>
                <div className="space-y-1">
                  <Label>{ar ? 'المبنى' : 'Building'}</Label>
                  <Input value={hallForm.building} onChange={(e) => setHallForm({ ...hallForm, building: e.target.value })} className="rounded-xl" />
                </div>
                <Button type="submit" className="rounded-xl">{ar ? 'إضافة قاعة' : 'Add hall'}</Button>
              </form>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{ar ? 'الاسم' : 'Name'}</TableHead>
                    <TableHead>{ar ? 'السعة' : 'Capacity'}</TableHead>
                    <TableHead>{ar ? 'المبنى' : 'Building'}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(board.halls || []).map((h) => (
                    <TableRow key={h.id}>
                      <TableCell>{h.name}</TableCell>
                      <TableCell>{h.capacity}</TableCell>
                      <TableCell>{h.building || '—'}</TableCell>
                      <TableCell className="text-end">
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeHall(h.id)}>{ar ? 'حذف' : 'Delete'}</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{ar ? 'جدولة امتحان' : 'Schedule an exam'}</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={addSession} className="grid sm:grid-cols-5 gap-3 items-end">
                <div className="space-y-1 sm:col-span-2">
                  <Label>{ar ? 'الشعبة' : 'Offering'}</Label>
                  <select required className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm" value={sessionForm.offering_id} onChange={(e) => setSessionForm({ ...sessionForm, offering_id: e.target.value })}>
                    <option value="">{ar ? 'اختر' : 'Select'}</option>
                    {(board.offerings || []).map((o) => (
                      <option key={o.id} value={o.id}>{o.course_code} — {o.course_name} ({o.enrolled_count || 0})</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>{ar ? 'النوع' : 'Type'}</Label>
                  <select className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm" value={sessionForm.exam_type} onChange={(e) => setSessionForm({ ...sessionForm, exam_type: e.target.value })}>
                    {(board.exam_types || []).map((t) => (
                      <option key={t.key} value={t.key}>{ar ? t.ar : t.en}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>{ar ? 'القاعة' : 'Hall'}</Label>
                  <select className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm" value={sessionForm.hall_id} onChange={(e) => setSessionForm({ ...sessionForm, hall_id: e.target.value })}>
                    <option value="">{ar ? 'لاحقاً' : 'Later'}</option>
                    {(board.halls || []).map((h) => (
                      <option key={h.id} value={h.id}>{h.name} ({h.capacity})</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>{ar ? 'يبدأ' : 'Starts'}</Label>
                  <Input type="datetime-local" required value={sessionForm.starts_at} onChange={(e) => setSessionForm({ ...sessionForm, starts_at: e.target.value })} className="rounded-xl" />
                </div>
                <div className="space-y-1">
                  <Label>{ar ? 'ينتهي' : 'Ends'}</Label>
                  <Input type="datetime-local" required value={sessionForm.ends_at} onChange={(e) => setSessionForm({ ...sessionForm, ends_at: e.target.value })} className="rounded-xl" />
                </div>
                <Button type="submit" className="rounded-xl sm:col-span-5">{ar ? 'إنشاء الجلسة' : 'Create session'}</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{ar ? 'جلسات الفصل الحالي' : 'Current-term sessions'}</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {(board.sessions || []).length === 0 ? (
                <p className="text-sm text-muted-foreground">{ar ? 'لا جلسات بعد.' : 'No sessions yet.'}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{ar ? 'المادة' : 'Course'}</TableHead>
                      <TableHead>{ar ? 'النوع' : 'Type'}</TableHead>
                      <TableHead>{ar ? 'القاعة' : 'Hall'}</TableHead>
                      <TableHead>{ar ? 'الوقت' : 'Time'}</TableHead>
                      <TableHead>{ar ? 'الحالة' : 'Status'}</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(board.sessions || []).map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>{s.course_code}</TableCell>
                        <TableCell>{typeLabel(types, s.exam_type, ar)}</TableCell>
                        <TableCell>{s.hall_name || '—'}</TableCell>
                        <TableCell>{when(s.starts_at)} → {when(s.ends_at)}</TableCell>
                        <TableCell>
                          {Number(s.is_published) === 1
                            ? <Badge>{ar ? 'منشور' : 'Published'}</Badge>
                            : <Badge variant="outline">{ar ? 'مسودة' : 'Draft'}</Badge>}
                        </TableCell>
                        <TableCell className="text-end space-x-2 space-s-2">
                          {Number(s.is_published) !== 1 && (
                            <Button size="sm" onClick={() => publish(s.id)}>{ar ? 'نشر' : 'Publish'}</Button>
                          )}
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeSession(s.id)}>{ar ? 'حذف' : 'Delete'}</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {seating?.seating && (
            <Card>
              <CardHeader>
                <CardTitle>{ar ? 'توزيع المقاعد' : 'Seating'} — {seating.course_code}</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{ar ? 'المقعد' : 'Seat'}</TableHead>
                      <TableHead>{ar ? 'الطالب' : 'Student'}</TableHead>
                      <TableHead>{ar ? 'المعرّف' : 'ID'}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {seating.seating.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-mono">{row.seat_label}</TableCell>
                        <TableCell>{row.full_name}</TableCell>
                        <TableCell className="font-mono">{row.person_code || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
