import { useEffect, useMemo, useState } from 'react';
import { Handshake } from 'lucide-react';
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
import StudentRegistrationForm from '@/components/users/StudentRegistrationForm';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

function labelOf(list, key, ar) {
  const row = (list || []).find((x) => x.key === key);
  if (!row) return key || '—';
  return ar ? row.ar : row.en;
}

function when(iso) {
  if (!iso) return '—';
  return String(iso).slice(0, 16).replace('T', ' ');
}

export default function StudentAffairs() {
  const { api, user, canManageStudentAffairs, canRegisterStudents } = useAuth();
  const { language } = useLanguage();
  const ar = language === 'ar';
  const isStudent = user?.role === 'student';
  const [mine, setMine] = useState({ complaints: [], activities: [], cases: [], complaint_statuses: [], case_types: [], case_statuses: [] });
  const [board, setBoard] = useState(null);
  const [complaint, setComplaint] = useState({ title: '', body: '', complaint_type: 'other' });
  const [complaintFilter, setComplaintFilter] = useState({ q: '', role: '', status: '', type: '' });
  const [openComplaint, setOpenComplaint] = useState(null);
  const [activity, setActivity] = useState({ title: '', location: '', starts_at: '', ends_at: '', capacity: '40', description: '' });
  const [caseForm, setCaseForm] = useState({ student_user_id: '', case_type: 'disciplinary', title: '', body: '' });

  const load = async () => {
    try {
      const mineRes = await api.get('/affairs/mine');
      setMine(mineRes.data || { complaints: [], activities: [], cases: [] });
      if (canManageStudentAffairs) {
        const boardRes = await api.get('/affairs/board');
        setBoard(boardRes.data);
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'تعذر تحميل شؤون الطلاب' : 'Failed to load student affairs'));
    }
  };

  useEffect(() => { load(); }, [canManageStudentAffairs]);

  const fileComplaint = async (e) => {
    e.preventDefault();
    try {
      await api.post('/affairs/complaints', complaint);
      toast.success(ar ? 'أُرسلت الشكوى' : 'Complaint filed');
      setComplaint({ title: '', body: '', complaint_type: 'other' });
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'فشل إرسال الشكوى' : 'Failed to file complaint'));
    }
  };

  const updateComplaint = async (id, status) => {
    try {
      await api.patch(`/affairs/complaints/${id}`, { status });
      toast.success(ar ? 'تحدّثت الشكوى' : 'Complaint updated');
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'فشل التحديث' : 'Update failed'));
    }
  };

  const addActivity = async (e) => {
    e.preventDefault();
    try {
      await api.post('/affairs/activities', {
        ...activity,
        capacity: Number(activity.capacity) || 40,
      });
      toast.success(ar ? 'نُشر النشاط' : 'Activity published');
      setActivity({ title: '', location: '', starts_at: '', ends_at: '', capacity: '40', description: '' });
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'فشل نشر النشاط' : 'Failed to publish activity'));
    }
  };

  const removeActivity = async (id) => {
    if (!confirm(ar ? 'حذف هذا النشاط؟' : 'Delete this activity?')) return;
    try {
      await api.delete(`/affairs/activities/${id}`);
      toast.success(ar ? 'حُذف النشاط' : 'Activity deleted');
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'فشل الحذف' : 'Failed'));
    }
  };

  const toggleSignup = async (item) => {
    try {
      const res = item.signed
        ? await api.delete(`/affairs/activities/${item.id}/signup`)
        : await api.post(`/affairs/activities/${item.id}/signup`);
      setMine(res.data);
      toast.success(item.signed ? (ar ? 'أُلغي التسجيل' : 'Left activity') : (ar ? 'تم التسجيل بالنشاط' : 'Signed up'));
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'فشل التسجيل' : 'Signup failed'));
    }
  };

  const openCase = async (e) => {
    e.preventDefault();
    try {
      await api.post('/affairs/cases', {
        student_user_id: Number(caseForm.student_user_id),
        case_type: caseForm.case_type,
        title: caseForm.title,
        body: caseForm.body,
      });
      toast.success(ar ? 'فُتحت القضية' : 'Case opened');
      setCaseForm({ ...caseForm, title: '', body: '' });
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'فشل فتح القضية' : 'Failed to open case'));
    }
  };

  const updateCase = async (id, status) => {
    try {
      await api.patch(`/affairs/cases/${id}`, { status });
      toast.success(ar ? 'تحدّثت القضية' : 'Case updated');
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'فشل التحديث' : 'Update failed'));
    }
  };

  const statuses = board?.complaint_statuses || mine.complaint_statuses || [];
  const complaintTypes = board?.complaint_types || mine.complaint_types || [];
  const filerRoles = board?.filer_roles || [];
  const caseTypes = board?.case_types || mine.case_types || [];
  const caseStatuses = board?.case_statuses || mine.case_statuses || [];
  const filteredComplaints = useMemo(() => {
    const q = complaintFilter.q.trim().toLowerCase();
    return (board?.complaints || []).filter((c) => {
      if (complaintFilter.role && c.filer_role !== complaintFilter.role) return false;
      if (complaintFilter.status && c.status !== complaintFilter.status) return false;
      if (complaintFilter.type && (c.complaint_type || 'other') !== complaintFilter.type) return false;
      if (!q) return true;
      return [c.title, c.body, c.filer_name, c.student_name, c.filer_code, c.student_code]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [board, complaintFilter]);

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Handshake className="w-6 h-6" />
          {ar ? 'شؤون الطلاب' : 'Student affairs'}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {ar
            ? 'قسم شؤون الطلاب وحده يسجّل الطلاب. الشكاوى والأنشطة والقضايا تُتابع من المكتب.'
            : 'Only Student Affairs registers students. The office also handles complaints, activities, and cases.'}
        </p>
      </div>

      {canRegisterStudents && <StudentRegistrationForm api={api} ar={ar} />}

      {isStudent && (
        <Card>
          <CardHeader>
            <CardTitle>{ar ? 'تقديم شكوى' : 'File a complaint'}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={fileComplaint} className="space-y-3">
              <div className="space-y-1">
                <Label>{ar ? 'نوع الشكوى' : 'Complaint type'}</Label>
                <select className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm" value={complaint.complaint_type} onChange={(e) => setComplaint({ ...complaint, complaint_type: e.target.value })}>
                  {complaintTypes.map((t) => (
                    <option key={t.key} value={t.key}>{ar ? t.ar : t.en}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label>{ar ? 'العنوان' : 'Title'}</Label>
                <Input required value={complaint.title} onChange={(e) => setComplaint({ ...complaint, title: e.target.value })} className="rounded-xl" />
              </div>
              <div className="space-y-1">
                <Label>{ar ? 'التفاصيل' : 'Details'}</Label>
                <textarea required className="flex min-h-[90px] w-full rounded-xl border border-input bg-background px-3 py-2 text-sm" value={complaint.body} onChange={(e) => setComplaint({ ...complaint, body: e.target.value })} />
              </div>
              <Button type="submit" className="rounded-xl">{ar ? 'إرسال' : 'Submit'}</Button>
            </form>
          </CardContent>
        </Card>
      )}

      {isStudent && (
      <Card>
        <CardHeader>
          <CardTitle>{ar ? 'شكاواي' : 'My complaints'}</CardTitle>
          <CardDescription>{ar ? 'حالة الشكوى تظهر بعد متابعة المكتب.' : 'Status updates after the office reviews it.'}</CardDescription>
        </CardHeader>
        <CardContent>
          {(mine.complaints || []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{ar ? 'لا شكاوى.' : 'No complaints.'}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{ar ? 'العنوان' : 'Title'}</TableHead>
                  <TableHead>{ar ? 'الحالة' : 'Status'}</TableHead>
                  <TableHead>{ar ? 'ملاحظة المكتب' : 'Office note'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mine.complaints.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{c.title}</TableCell>
                    <TableCell><Badge variant="secondary">{labelOf(statuses, c.status, ar)}</Badge></TableCell>
                    <TableCell>{c.staff_note || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{ar ? 'الأنشطة' : 'Activities'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(mine.activities || []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{ar ? 'لا أنشطة معلنة.' : 'No published activities.'}</p>
          ) : mine.activities.map((a) => (
            <div key={a.id} className="border rounded-xl p-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-medium">{a.title}</div>
                <div className="text-sm text-muted-foreground">
                  {when(a.starts_at)}{a.location ? ` · ${a.location}` : ''} · {a.signed_count || 0}/{a.capacity}
                </div>
              </div>
              {isStudent && (
                <Button size="sm" variant={a.signed ? 'secondary' : 'default'} className="rounded-xl" onClick={() => toggleSignup(a)}>
                  {a.signed ? (ar ? 'إلغاء' : 'Leave') : (ar ? 'تسجيل' : 'Sign up')}
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {isStudent && (
      <Card>
        <CardHeader>
          <CardTitle>{ar ? 'قضاياي' : 'My cases'}</CardTitle>
          <CardDescription>{ar ? 'القضايا يفتحها المكتب. الطالب يشوفها فقط.' : 'Cases are opened by the office. Students can only view them.'}</CardDescription>
        </CardHeader>
        <CardContent>
          {(mine.cases || []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{ar ? 'لا قضايا.' : 'No cases.'}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{ar ? 'النوع' : 'Type'}</TableHead>
                  <TableHead>{ar ? 'العنوان' : 'Title'}</TableHead>
                  <TableHead>{ar ? 'الحالة' : 'Status'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mine.cases.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{labelOf(caseTypes, c.case_type, ar)}</TableCell>
                    <TableCell>{c.title}</TableCell>
                    <TableCell><Badge variant="secondary">{labelOf(caseStatuses, c.status, ar)}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      )}

      {canManageStudentAffairs && board && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{ar ? 'متابعة الشكاوى' : 'Handle complaints'}</CardTitle>
              <CardDescription>
                {ar ? 'فرز حسب المصدر والحالة والنوع. اضغط الكرت لفتح التفاصيل.' : 'Filter by source, status, and type. Click a card for details.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-4 gap-3">
                <div className="space-y-1 sm:col-span-4">
                  <Label>{ar ? 'بحث' : 'Search'}</Label>
                  <Input
                    value={complaintFilter.q}
                    onChange={(e) => setComplaintFilter({ ...complaintFilter, q: e.target.value })}
                    placeholder={ar ? 'اسم أو عنوان أو رقم جامعي' : 'Name, title, or university ID'}
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-1">
                  <Label>{ar ? 'المصدر' : 'Source'}</Label>
                  <select className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm" value={complaintFilter.role} onChange={(e) => setComplaintFilter({ ...complaintFilter, role: e.target.value })}>
                    <option value="">{ar ? 'الكل' : 'All'}</option>
                    {filerRoles.map((r) => (
                      <option key={r.key} value={r.key}>{ar ? r.ar : r.en}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>{ar ? 'الحالة' : 'Status'}</Label>
                  <select className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm" value={complaintFilter.status} onChange={(e) => setComplaintFilter({ ...complaintFilter, status: e.target.value })}>
                    <option value="">{ar ? 'الكل' : 'All'}</option>
                    {statuses.map((s) => (
                      <option key={s.key} value={s.key}>{ar ? s.ar : s.en}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>{ar ? 'نوع الشكوى' : 'Type'}</Label>
                  <select className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm" value={complaintFilter.type} onChange={(e) => setComplaintFilter({ ...complaintFilter, type: e.target.value })}>
                    <option value="">{ar ? 'الكل' : 'All'}</option>
                    {complaintTypes.map((t) => (
                      <option key={t.key} value={t.key}>{ar ? t.ar : t.en}</option>
                    ))}
                  </select>
                </div>
              </div>
              {filteredComplaints.length === 0 ? (
                <p className="text-sm text-muted-foreground">{ar ? 'لا شكاوى مطابقة.' : 'No matching complaints.'}</p>
              ) : (
                <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {filteredComplaints.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="text-start rounded-2xl border p-4 space-y-2 hover:border-primary/40 hover:bg-accent/30 transition-colors"
                      onClick={() => setOpenComplaint(c)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium">{c.title}</p>
                        <Badge variant="secondary">{labelOf(statuses, c.status, ar)}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {labelOf(filerRoles, c.filer_role, ar)} · {c.filer_name || c.student_name}
                        {c.filer_code || c.student_code ? ` (${c.filer_code || c.student_code})` : ''}
                      </p>
                      <p className="text-xs text-muted-foreground">{labelOf(complaintTypes, c.complaint_type || 'other', ar)}</p>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Dialog open={!!openComplaint} onOpenChange={(open) => { if (!open) setOpenComplaint(null); }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{openComplaint?.title || (ar ? 'تفاصيل الشكوى' : 'Complaint details')}</DialogTitle>
                <DialogDescription>
                  {openComplaint
                    ? `${labelOf(filerRoles, openComplaint.filer_role, ar)} · ${openComplaint.filer_name || openComplaint.student_name || ''}`
                    : ''}
                </DialogDescription>
              </DialogHeader>
              {openComplaint && (
                <div className="space-y-3 text-sm">
                  <p><span className="text-muted-foreground">{ar ? 'النوع: ' : 'Type: '}</span>{labelOf(complaintTypes, openComplaint.complaint_type || 'other', ar)}</p>
                  <p><span className="text-muted-foreground">{ar ? 'الحالة: ' : 'Status: '}</span>{labelOf(statuses, openComplaint.status, ar)}</p>
                  <p><span className="text-muted-foreground">{ar ? 'الرقم: ' : 'ID: '}</span>{openComplaint.filer_code || openComplaint.student_code || '—'}</p>
                  <p className="whitespace-pre-wrap">{openComplaint.body}</p>
                  {openComplaint.staff_note && (
                    <p className="text-muted-foreground">{ar ? 'ملاحظة المكتب: ' : 'Office note: '}{openComplaint.staff_note}</p>
                  )}
                  <div className="space-y-1">
                    <Label>{ar ? 'تحديث الحالة' : 'Update status'}</Label>
                    <select
                      className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
                      value={openComplaint.status}
                      onChange={(e) => {
                        const status = e.target.value;
                        setOpenComplaint({ ...openComplaint, status });
                        updateComplaint(openComplaint.id, status);
                      }}
                    >
                      {statuses.map((s) => (
                        <option key={s.key} value={s.key}>{ar ? s.ar : s.en}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>

          <Card>
            <CardHeader>
              <CardTitle>{ar ? 'نشر نشاط' : 'Publish an activity'}</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={addActivity} className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1 sm:col-span-2">
                  <Label>{ar ? 'العنوان' : 'Title'}</Label>
                  <Input required value={activity.title} onChange={(e) => setActivity({ ...activity, title: e.target.value })} className="rounded-xl" />
                </div>
                <div className="space-y-1">
                  <Label>{ar ? 'المكان' : 'Location'}</Label>
                  <Input value={activity.location} onChange={(e) => setActivity({ ...activity, location: e.target.value })} className="rounded-xl" />
                </div>
                <div className="space-y-1">
                  <Label>{ar ? 'السعة' : 'Capacity'}</Label>
                  <Input type="number" min="1" value={activity.capacity} onChange={(e) => setActivity({ ...activity, capacity: e.target.value })} className="rounded-xl" />
                </div>
                <div className="space-y-1">
                  <Label>{ar ? 'البداية' : 'Starts'}</Label>
                  <Input required type="datetime-local" value={activity.starts_at} onChange={(e) => setActivity({ ...activity, starts_at: e.target.value })} className="rounded-xl" />
                </div>
                <div className="space-y-1">
                  <Label>{ar ? 'النهاية' : 'Ends'}</Label>
                  <Input type="datetime-local" value={activity.ends_at} onChange={(e) => setActivity({ ...activity, ends_at: e.target.value })} className="rounded-xl" />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label>{ar ? 'الوصف' : 'Description'}</Label>
                  <Input value={activity.description} onChange={(e) => setActivity({ ...activity, description: e.target.value })} className="rounded-xl" />
                </div>
                <Button type="submit" className="rounded-xl sm:col-span-2">{ar ? 'نشر' : 'Publish'}</Button>
              </form>
              <div className="mt-4 space-y-2">
                {(board.activities || []).map((a) => (
                  <div key={a.id} className="flex items-center justify-between border rounded-xl p-3">
                    <span>{a.title} · {a.signed_count || 0}/{a.capacity}</span>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeActivity(a.id)}>{ar ? 'حذف' : 'Delete'}</Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{ar ? 'فتح قضية طلابية' : 'Open a student case'}</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={openCase} className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{ar ? 'الطالب' : 'Student'}</Label>
                  <select required className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm" value={caseForm.student_user_id} onChange={(e) => setCaseForm({ ...caseForm, student_user_id: e.target.value })}>
                    <option value="">{ar ? 'اختر' : 'Select'}</option>
                    {(board.students || []).map((s) => (
                      <option key={s.id} value={s.id}>{s.full_name} {s.person_code ? `(${s.person_code})` : ''}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>{ar ? 'النوع' : 'Type'}</Label>
                  <select className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm" value={caseForm.case_type} onChange={(e) => setCaseForm({ ...caseForm, case_type: e.target.value })}>
                    {caseTypes.map((t) => (
                      <option key={t.key} value={t.key}>{ar ? t.ar : t.en}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label>{ar ? 'العنوان' : 'Title'}</Label>
                  <Input required value={caseForm.title} onChange={(e) => setCaseForm({ ...caseForm, title: e.target.value })} className="rounded-xl" />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label>{ar ? 'التفاصيل' : 'Details'}</Label>
                  <Input value={caseForm.body} onChange={(e) => setCaseForm({ ...caseForm, body: e.target.value })} className="rounded-xl" />
                </div>
                <Button type="submit" className="rounded-xl sm:col-span-2">{ar ? 'فتح القضية' : 'Open case'}</Button>
              </form>
              <Table className="mt-4">
                <TableHeader>
                  <TableRow>
                    <TableHead>{ar ? 'الطالب' : 'Student'}</TableHead>
                    <TableHead>{ar ? 'القضية' : 'Case'}</TableHead>
                    <TableHead>{ar ? 'الحالة' : 'Status'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(board.cases || []).length === 0 ? (
                    <TableRow><TableCell colSpan={3} className="text-muted-foreground">{ar ? 'لا قضايا بعد.' : 'No cases yet.'}</TableCell></TableRow>
                  ) : board.cases.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>{c.student_name}</TableCell>
                      <TableCell>{labelOf(caseTypes, c.case_type, ar)} — {c.title}</TableCell>
                      <TableCell>
                        <select className="h-9 rounded-xl border border-input bg-background px-2 text-sm" value={c.status} onChange={(e) => updateCase(c.id, e.target.value)}>
                          {caseStatuses.map((s) => (
                            <option key={s.key} value={s.key}>{ar ? s.ar : s.en}</option>
                          ))}
                        </select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
