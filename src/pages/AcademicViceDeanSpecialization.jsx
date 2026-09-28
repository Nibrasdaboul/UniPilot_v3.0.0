import { useEffect, useState } from 'react';
import { Award, Clock } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/AuthContext';
import { useLanguage } from '@/lib/LanguageContext';
import RequestWindowCard from '@/components/academic/RequestWindowCard';
import { toast } from 'sonner';

function statusLabel(status, ar) {
  if (status === 'approved') return ar ? 'معتمد' : 'Approved';
  if (status === 'rejected') return ar ? 'مرفوض' : 'Rejected';
  return ar ? 'بانتظار القرار' : 'Pending';
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

export default function AcademicViceDeanSpecialization() {
  const { api, isViceDeanAcademic } = useAuth();
  const { language } = useLanguage();
  const ar = language === 'ar';
  const [data, setData] = useState(null);
  const [hoursDraft, setHoursDraft] = useState('110');
  const [notes, setNotes] = useState({});
  const [busy, setBusy] = useState(null);

  const load = async () => {
    try {
      const res = await api.get('/vda/specialization');
      setData(res.data);
      if (res.data?.specialization_min_hours != null) {
        setHoursDraft(String(res.data.specialization_min_hours));
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'تعذر تحميل طلبات التخصص' : 'Failed to load specialization requests'));
    }
  };

  useEffect(() => { if (isViceDeanAcademic) load(); }, [api, ar, isViceDeanAcademic]);

  const saveWindow = async (payload) => {
    setBusy('window');
    try {
      const res = await api.patch('/vda/request-window', payload);
      setData((prev) => ({ ...(prev || {}), request_window: res.data }));
      toast.success(payload?.clear ? (ar ? 'أُغلقت فترة التقديم' : 'Submission window closed') : (ar ? 'حُفظت فترة التقديم' : 'Submission window saved'));
    } catch (err) {
      toast.error(err.response?.data?.detail || (ar ? 'تعذر حفظ الفترة' : 'Failed to save window'));
    } finally {
      setBusy(null);
    }
  };

  const saveHours = async (e) => {
    e.preventDefault();
    setBusy('hours');
    try {
      const res = await api.patch('/vda/specialization/settings', {
        specialization_min_hours: Number(hoursDraft),
      });
      const saved = res.data?.specialization_min_hours;
      setData((prev) => ({ ...(prev || {}), specialization_min_hours: saved }));
      if (saved != null) setHoursDraft(String(saved));
      toast.success(ar ? 'حُفظ حد ساعات التخصص' : 'Specialization hour threshold saved');
    } catch (err) {
      toast.error(err.response?.data?.detail || (ar ? 'فشل حفظ الحد' : 'Failed to save threshold'));
    } finally {
      setBusy(null);
    }
  };

  const decide = async (id, decision) => {
    setBusy(`${decision}-${id}`);
    try {
      await api.post(`/vda/specialization/${id}/decide`, { decision, note: notes[id] || '' });
      toast.success(decision === 'approved' ? (ar ? 'اعتُمد التخصص' : 'Specialization approved') : (ar ? 'رُفض الطلب' : 'Request rejected'));
      await load();
    } catch (err) {
      toast.error(err.response?.data?.detail || (ar ? 'تعذر تنفيذ القرار' : 'Decision failed'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6" data-testid="vda-specialization">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Award className="w-6 h-6" />
          {ar ? 'طلبات التخصص' : 'Specialization requests'}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {ar
            ? `الطلاب الذين أنجزوا ${data?.specialization_min_hours ?? 110} ساعة يطلبون أحد الأقسام الثلاثة. الموافقة تنقل الطالب إلى ذلك القسم.`
            : `Students who completed ${data?.specialization_min_hours ?? 110} hours request one of the three majors. Approval assigns that department.`}
        </p>
      </div>

      <RequestWindowCard
        window={data?.request_window}
        onSave={saveWindow}
        busy={busy === 'window'}
        ar={ar}
      />

      <Card className="rounded-2xl" data-testid="vda-specialization-hours">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="w-4 h-4" />
            {ar ? 'حد ساعات طلب التخصص' : 'Hours required to request a specialization'}
          </CardTitle>
          <CardDescription>
            {ar
              ? 'يمكنك تغيير العدد في أي وقت. القيمة الافتراضية 110 ساعة.'
              : 'You can change this anytime. The default is 110 hours.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveHours} className="space-y-3">
            <div className="space-y-1">
              <Label>{ar ? 'الساعات المكتملة المطلوبة' : 'Required completed hours'}</Label>
              <Input
                type="number"
                min="0"
                max="250"
                step="1"
                required
                value={hoursDraft}
                onChange={(e) => setHoursDraft(e.target.value)}
                className="rounded-xl"
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                {ar
                  ? `الحد الحالي: ${data?.specialization_min_hours ?? 110} ساعة`
                  : `Current: ${data?.specialization_min_hours ?? 110} hours`}
              </p>
              <Button type="submit" className="rounded-xl" disabled={busy === 'hours'}>
                {ar ? 'حفظ' : 'Save'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="grid sm:grid-cols-3 gap-3">
        <Stat label={ar ? 'بانتظارك' : 'Pending'} value={data?.counts?.pending} />
        <Stat label={ar ? 'معتمد' : 'Approved'} value={data?.counts?.approved} />
        <Stat label={ar ? 'مرفوض' : 'Rejected'} value={data?.counts?.rejected} />
      </div>

      <div className="space-y-3" data-testid="vda-specialization-list">
        {(data?.items || []).length === 0 ? (
          <p className="text-sm text-muted-foreground">{ar ? 'لا طلبات تخصص بعد.' : 'No specialization requests yet.'}</p>
        ) : data.items.map((row) => (
          <Card key={row.id} className="rounded-2xl" data-testid={`vda-specialization-${row.id}`}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2 text-base">
                <span>{ar ? row.department?.name_ar : row.department?.name_en}</span>
                <Badge variant={row.status === 'approved' ? 'default' : row.status === 'rejected' ? 'destructive' : 'outline'}>
                  {statusLabel(row.status, ar)}
                </Badge>
              </CardTitle>
              <CardDescription>
                {row.student_name || '—'}{row.university_id ? ` · ${row.university_id}` : ''} · {row.completed_hours} {ar ? 'ساعة' : 'hours'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {row.vda_note ? (
                <p className="text-xs text-muted-foreground">{ar ? 'ملاحظتك:' : 'Your note:'} {row.vda_note}</p>
              ) : null}
              {row.status === 'pending' ? (
                <div className="space-y-2">
                  <textarea
                    rows={2}
                    placeholder={ar ? 'ملاحظة للطالب (اختياري)' : 'Note to the student (optional)'}
                    value={notes[row.id] || ''}
                    onChange={(e) => setNotes((prev) => ({ ...prev, [row.id]: e.target.value }))}
                    className="flex min-h-[56px] w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" className="rounded-xl" disabled={busy === `approved-${row.id}`} onClick={() => decide(row.id, 'approved')}>
                      {ar ? 'موافقة' : 'Approve'}
                    </Button>
                    <Button size="sm" variant="outline" className="rounded-xl" disabled={busy === `rejected-${row.id}`} onClick={() => decide(row.id, 'rejected')}>
                      {ar ? 'رفض' : 'Reject'}
                    </Button>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
