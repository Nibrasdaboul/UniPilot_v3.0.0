import { useEffect, useState } from 'react';
import { CalendarRange } from 'lucide-react';
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
import { withdrawalWindowStatus, formatWindowTime } from '@/lib/withdrawalWindowStatus';
import { toast } from 'sonner';

function WithdrawalStatusBadge({ window, ar }) {
  const status = withdrawalWindowStatus(window);
  if (status === 'open') {
    return <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white">{ar ? 'مفتوحة الآن' : 'Open now'}</Badge>;
  }
  if (status === 'scheduled') {
    return <Badge variant="secondary">{ar ? 'مجدولة' : 'Scheduled'}</Badge>;
  }
  return <Badge variant="outline">{ar ? 'مغلقة' : 'Closed'}</Badge>;
}

export default function AcademicCalendar() {
  const { api, canManageAcademic } = useAuth();
  const { language } = useLanguage();
  const ar = language === 'ar';
  const [terms, setTerms] = useState([]);
  const [windows, setWindows] = useState([]);
  const [form, setForm] = useState({
    name: '',
    starts_on: '',
    ends_on: '',
  });
  const [windowForm, setWindowForm] = useState({
    name: '',
    term_id: '',
    opens_at: '',
    closes_at: '',
    max_credits: '18',
    min_completed_credits: '0',
    min_semester_gpa: '0',
  });
  const [withdrawalWindows, setWithdrawalWindows] = useState([]);
  const [withdrawForm, setWithdrawForm] = useState({
    name: '',
    term_id: '',
    opens_at: '',
    closes_at: '',
  });
  const openTerms = terms.filter((t) => Number(t.is_closed) !== 1);

  const load = async () => {
    try {
      const [tRes, wRes, wdRes] = await Promise.all([
        api.get('/academic/terms'),
        api.get('/academic/windows').catch(() => ({ data: [] })),
        api.get('/academic/withdrawal-windows').catch(() => ({ data: [] })),
      ]);
      const list = Array.isArray(tRes.data) ? tRes.data : [];
      setTerms(list);
      setWindows(Array.isArray(wRes.data) ? wRes.data : []);
      setWithdrawalWindows(Array.isArray(wdRes.data) ? wdRes.data : []);
      const current = list.find((t) => Number(t.is_current) === 1 && Number(t.is_closed) !== 1);
      setWindowForm((f) => ({ ...f, term_id: f.term_id || (current ? String(current.id) : (list[0] ? String(list[0].id) : '')) }));
      setWithdrawForm((f) => ({ ...f, term_id: f.term_id || (current ? String(current.id) : '') }));
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'تعذر تحميل التقويم' : 'Failed to load calendar'));
    }
  };

  useEffect(() => { load(); }, []);

  const openTerm = async (e) => {
    e.preventDefault();
    try {
      await api.post('/academic/terms', { ...form, set_current: true });
      toast.success(ar ? 'تم فتح الفصل' : 'Term opened');
      setForm({ name: '', starts_on: '', ends_on: '' });
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'فشل فتح الفصل' : 'Failed to open term'));
    }
  };

  const closeTerm = async (id) => {
    if (!confirm(ar ? 'إغلاق هذا الفصل الدراسي؟' : 'Close this academic term?')) return;
    try {
      await api.patch(`/academic/terms/${id}/close`);
      toast.success(ar ? 'تم إغلاق الفصل' : 'Term closed');
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'فشل الإغلاق' : 'Failed to close'));
    }
  };

  const saveWindow = async (e) => {
    e.preventDefault();
    try {
      await api.post('/academic/windows', {
        name: windowForm.name,
        term_id: Number(windowForm.term_id),
        opens_at: windowForm.opens_at ? new Date(windowForm.opens_at).toISOString() : null,
        closes_at: windowForm.closes_at ? new Date(windowForm.closes_at).toISOString() : null,
        max_credits: windowForm.max_credits === '' ? null : Number(windowForm.max_credits),
        min_completed_credits: Number(windowForm.min_completed_credits || 0),
        min_semester_gpa: Number(windowForm.min_semester_gpa || 0),
      });
      toast.success(ar ? 'تم فتح نافذة التسجيل' : 'Registration window opened');
      setWindowForm((f) => ({ ...f, name: '' }));
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'فشل فتح النافذة' : 'Failed to open window'));
    }
  };

  const closeWindowNow = async (w) => {
    try {
      await api.patch(`/academic/windows/${w.id}`, { closes_at: new Date().toISOString() });
      toast.success(ar ? 'أُغلقت نافذة التسجيل' : 'Window closed');
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'فشل الإغلاق' : 'Failed'));
    }
  };

  const removeWindow = async (id) => {
    if (!confirm(ar ? 'حذف نافذة التسجيل؟' : 'Delete this registration window?')) return;
    try {
      await api.delete(`/academic/windows/${id}`);
      toast.success(ar ? 'تم الحذف' : 'Deleted');
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'فشل الحذف' : 'Failed'));
    }
  };

  const saveWithdrawalWindow = async (e) => {
    e.preventDefault();
    if (!withdrawForm.opens_at || !withdrawForm.closes_at) {
      toast.error(ar ? 'حدّد تاريخ الفتح والإغلاق' : 'Pick open and close dates');
      return;
    }
    try {
      await api.post('/academic/withdrawal-windows', {
        name: withdrawForm.name,
        term_id: Number(withdrawForm.term_id),
        opens_at: new Date(withdrawForm.opens_at).toISOString(),
        closes_at: new Date(withdrawForm.closes_at).toISOString(),
      });
      toast.success(ar ? 'تم فتح نافذة السحب' : 'Withdrawal window opened');
      setWithdrawForm((f) => ({ ...f, name: '', opens_at: '', closes_at: '' }));
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'فشل فتح نافذة السحب' : 'Failed to open withdrawal window'));
    }
  };

  const closeWithdrawalNow = async (w) => {
    if (!confirm(ar ? 'إغلاق نافذة السحب الآن؟ لن يستطيع الطلاب سحب المواد أو تجميد الفصل بعدها.' : 'Close this withdrawal window now? Students will no longer be able to withdraw or freeze.')) return;
    try {
      await api.patch(`/academic/withdrawal-windows/${w.id}`, { closes_at: new Date().toISOString() });
      toast.success(ar ? 'أُغلقت نافذة السحب' : 'Withdrawal window closed');
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'فشل الإغلاق' : 'Failed'));
    }
  };

  const removeWithdrawalWindow = async (id) => {
    if (!confirm(ar ? 'حذف نافذة السحب؟' : 'Delete this withdrawal window?')) return;
    try {
      await api.delete(`/academic/withdrawal-windows/${id}`);
      toast.success(ar ? 'تم الحذف' : 'Deleted');
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'فشل الحذف' : 'Failed'));
    }
  };

  const reopen = async (id) => {
    try {
      await api.patch(`/academic/terms/${id}/open`);
      toast.success(ar ? 'تم اعتماد الفصل الحالي' : 'Term set as current');
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'فشل الفتح' : 'Failed'));
    }
  };

  if (!canManageAcademic) {
    return (
      <div className="p-6 text-muted-foreground">
        {ar ? 'فتح وإغلاق الفصول من صلاحية الشؤون الأكاديمية.' : 'Only academic administration can manage terms.'}
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <CalendarRange className="w-6 h-6" />
          {ar ? 'التقويم الأكاديمي' : 'Academic calendar'}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {ar
            ? 'فتح وإغلاق الفصل قرار إداري. الطالب لا يفتح فصلاً ولا ينهيه.'
            : 'Opening and closing terms is an administrative decision. Students cannot do this.'}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{ar ? 'فتح فصل جديد' : 'Open a new term'}</CardTitle>
          <CardDescription>{ar ? 'يصبح الفصل الحالي للكلية.' : 'Becomes the current college term.'}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={openTerm} className="grid sm:grid-cols-4 gap-3 items-end">
            <div className="space-y-1 sm:col-span-2">
              <Label>{ar ? 'اسم الفصل' : 'Term name'}</Label>
              <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={ar ? 'مثال: خريف 2026' : 'e.g. Fall 2026'} className="rounded-xl" />
            </div>
            <div className="space-y-1">
              <Label>{ar ? 'البداية' : 'Starts'}</Label>
              <Input type="date" value={form.starts_on} onChange={(e) => setForm({ ...form, starts_on: e.target.value })} className="rounded-xl" />
            </div>
            <div className="space-y-1">
              <Label>{ar ? 'النهاية' : 'Ends'}</Label>
              <Input type="date" value={form.ends_on} onChange={(e) => setForm({ ...form, ends_on: e.target.value })} className="rounded-xl" />
            </div>
            <Button type="submit" className="rounded-xl sm:col-span-4">{ar ? 'فتح الفصل' : 'Open term'}</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{ar ? 'فصول الكلية' : 'College terms'}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{ar ? 'الاسم' : 'Name'}</TableHead>
                <TableHead>{ar ? 'من' : 'From'}</TableHead>
                <TableHead>{ar ? 'إلى' : 'To'}</TableHead>
                <TableHead>{ar ? 'الحالة' : 'Status'}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {terms.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell>{t.starts_on ? String(t.starts_on).slice(0, 10) : '—'}</TableCell>
                  <TableCell>{t.ends_on ? String(t.ends_on).slice(0, 10) : '—'}</TableCell>
                  <TableCell className="space-x-1 space-s-1">
                    {Number(t.is_current) === 1 && Number(t.is_closed) !== 1 && <Badge>{ar ? 'حالي' : 'Current'}</Badge>}
                    {Number(t.is_closed) === 1 && <Badge variant="outline">{ar ? 'مغلق' : 'Closed'}</Badge>}
                    {Number(t.is_current) !== 1 && Number(t.is_closed) !== 1 && <Badge variant="secondary">{ar ? 'غير نشط' : 'Inactive'}</Badge>}
                  </TableCell>
                  <TableCell className="text-end space-x-2 space-s-2">
                    {Number(t.is_closed) !== 1 && Number(t.is_current) === 1 && (
                      <Button size="sm" variant="outline" onClick={() => closeTerm(t.id)}>{ar ? 'إغلاق' : 'Close'}</Button>
                    )}
                    {(Number(t.is_current) !== 1 || Number(t.is_closed) === 1) && (
                      <Button size="sm" variant="secondary" onClick={() => reopen(t.id)}>{ar ? 'تعيين كحالي' : 'Set current'}</Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{ar ? 'نافذة تسجيل جديدة' : 'New registration window'}</CardTitle>
          <CardDescription>
            {ar
              ? 'الطالب يسجّل المواد فقط بين تاريخ الفتح والإغلاق.'
              : 'Students may register courses only between these dates.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveWindow} className="grid sm:grid-cols-4 gap-3 items-end">
            <div className="space-y-1 sm:col-span-2">
              <Label>{ar ? 'الاسم' : 'Name'}</Label>
              <Input required value={windowForm.name} onChange={(e) => setWindowForm({ ...windowForm, name: e.target.value })} placeholder={ar ? 'تسجيل خريف 2026' : 'Fall 2026 registration'} className="rounded-xl" />
            </div>
            <div className="space-y-1">
              <Label>{ar ? 'الفصل' : 'Term'}</Label>
              <select
                required
                className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
                value={windowForm.term_id}
                onChange={(e) => setWindowForm({ ...windowForm, term_id: e.target.value })}
              >
                <option value="">{ar ? 'اختر' : 'Select'}</option>
                {terms.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>{ar ? 'الحد الأقصى للساعات' : 'Max credits'}</Label>
              <Input type="number" min="0" value={windowForm.max_credits} onChange={(e) => setWindowForm({ ...windowForm, max_credits: e.target.value })} className="rounded-xl" />
            </div>
            <div className="space-y-1">
              <Label>{ar ? 'يفتح' : 'Opens'}</Label>
              <Input type="datetime-local" required value={windowForm.opens_at} onChange={(e) => setWindowForm({ ...windowForm, opens_at: e.target.value })} className="rounded-xl" />
            </div>
            <div className="space-y-1">
              <Label>{ar ? 'يغلق' : 'Closes'}</Label>
              <Input type="datetime-local" required value={windowForm.closes_at} onChange={(e) => setWindowForm({ ...windowForm, closes_at: e.target.value })} className="rounded-xl" />
            </div>
            <div className="space-y-1">
              <Label>{ar ? 'حد الساعات المنجزة' : 'Min completed credits'}</Label>
              <Input type="number" min="0" value={windowForm.min_completed_credits} onChange={(e) => setWindowForm({ ...windowForm, min_completed_credits: e.target.value })} className="rounded-xl" />
            </div>
            <div className="space-y-1">
              <Label>{ar ? 'حد المعدل' : 'Min GPA'}</Label>
              <Input type="number" min="0" step="0.1" value={windowForm.min_semester_gpa} onChange={(e) => setWindowForm({ ...windowForm, min_semester_gpa: e.target.value })} className="rounded-xl" />
            </div>
            <Button type="submit" className="rounded-xl sm:col-span-4">{ar ? 'فتح نافذة التسجيل' : 'Open registration window'}</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{ar ? 'نوافذ التسجيل' : 'Registration windows'}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {windows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{ar ? 'لا توجد نوافذ بعد.' : 'No windows yet.'}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{ar ? 'الاسم' : 'Name'}</TableHead>
                  <TableHead>{ar ? 'يفتح' : 'Opens'}</TableHead>
                  <TableHead>{ar ? 'يغلق' : 'Closes'}</TableHead>
                  <TableHead>{ar ? 'ساعات' : 'Credits'}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {windows.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell>{w.name}</TableCell>
                    <TableCell>{w.opens_at ? String(w.opens_at).slice(0, 16).replace('T', ' ') : '—'}</TableCell>
                    <TableCell>{w.closes_at ? String(w.closes_at).slice(0, 16).replace('T', ' ') : '—'}</TableCell>
                    <TableCell>{w.max_credits ?? '—'}</TableCell>
                    <TableCell className="text-end space-x-2 space-s-2">
                      <Button size="sm" variant="outline" onClick={() => closeWindowNow(w)}>{ar ? 'إغلاق الآن' : 'Close now'}</Button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeWindow(w.id)}>{ar ? 'حذف' : 'Delete'}</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="border-rose-500/30" data-testid="withdrawal-window-form-card">
        <CardHeader>
          <CardTitle>{ar ? 'نافذة سحب المقررات' : 'Course withdrawal window'}</CardTitle>
          <CardDescription>
            {ar
              ? 'خلال هذه الفترة فقط يستطيع الطالب سحب مادة (W) أو تجميد فصله كاملاً من صفحة «تسجيل المواد».'
              : 'Only during this period can students withdraw a course (W) or freeze their whole term from the registration page.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveWithdrawalWindow} className="grid sm:grid-cols-4 gap-3 items-end">
            <div className="space-y-1 sm:col-span-2">
              <Label>{ar ? 'الاسم' : 'Name'}</Label>
              <Input
                required
                value={withdrawForm.name}
                onChange={(e) => setWithdrawForm({ ...withdrawForm, name: e.target.value })}
                placeholder={ar ? 'سحب مقررات شتاء 2027' : 'Winter 2027 withdrawal'}
                className="rounded-xl"
                data-testid="withdrawal-window-name"
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>{ar ? 'الفصل' : 'Term'}</Label>
              <select
                required
                className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
                value={withdrawForm.term_id}
                onChange={(e) => setWithdrawForm({ ...withdrawForm, term_id: e.target.value })}
                data-testid="withdrawal-window-term"
              >
                <option value="">{ar ? 'اختر' : 'Select'}</option>
                {openTerms.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}{Number(t.is_current) === 1 ? (ar ? ' (الحالي)' : ' (current)') : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1 sm:col-span-2" data-testid="withdrawal-window-opens">
              <Label>{ar ? 'يفتح' : 'Opens'}</Label>
              <Input type="datetime-local" required value={withdrawForm.opens_at} onChange={(e) => setWithdrawForm({ ...withdrawForm, opens_at: e.target.value })} className="rounded-xl" />
            </div>
            <div className="space-y-1 sm:col-span-2" data-testid="withdrawal-window-closes">
              <Label>{ar ? 'يغلق' : 'Closes'}</Label>
              <Input type="datetime-local" required value={withdrawForm.closes_at} onChange={(e) => setWithdrawForm({ ...withdrawForm, closes_at: e.target.value })} className="rounded-xl" />
            </div>
            <Button type="submit" variant="destructive" className="rounded-xl sm:col-span-4" data-testid="withdrawal-window-submit">
              {ar ? 'فتح نافذة السحب' : 'Open withdrawal window'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card data-testid="withdrawal-windows-card">
        <CardHeader>
          <CardTitle>{ar ? 'نوافذ السحب' : 'Withdrawal windows'}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {withdrawalWindows.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="withdrawal-windows-empty">
              {ar ? 'لا توجد نوافذ سحب بعد.' : 'No withdrawal windows yet.'}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{ar ? 'الاسم' : 'Name'}</TableHead>
                  <TableHead>{ar ? 'الفصل' : 'Term'}</TableHead>
                  <TableHead>{ar ? 'يفتح' : 'Opens'}</TableHead>
                  <TableHead>{ar ? 'يغلق' : 'Closes'}</TableHead>
                  <TableHead>{ar ? 'الحالة' : 'Status'}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {withdrawalWindows.map((w) => (
                  <TableRow key={w.id} data-testid={`withdrawal-window-row-${w.id}`} data-status={withdrawalWindowStatus(w)}>
                    <TableCell className="font-medium">{w.name}</TableCell>
                    <TableCell>{w.term_name || '—'}</TableCell>
                    <TableCell>{formatWindowTime(w.opens_at)}</TableCell>
                    <TableCell>{formatWindowTime(w.closes_at)}</TableCell>
                    <TableCell><WithdrawalStatusBadge window={w} ar={ar} /></TableCell>
                    <TableCell className="text-end space-x-2 space-s-2">
                      {withdrawalWindowStatus(w) === 'open' && (
                        <Button size="sm" variant="outline" onClick={() => closeWithdrawalNow(w)} data-testid={`withdrawal-window-close-${w.id}`}>
                          {ar ? 'إغلاق الآن' : 'Close now'}
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeWithdrawalWindow(w.id)} data-testid={`withdrawal-window-delete-${w.id}`}>
                        {ar ? 'حذف' : 'Delete'}
                      </Button>
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
