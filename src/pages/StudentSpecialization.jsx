import { useEffect, useState } from 'react';
import { Award, Lock } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/AuthContext';
import { useLanguage } from '@/lib/LanguageContext';
import { RequestWindowBanner } from '@/components/academic/RequestWindowCard';
import { toast } from 'sonner';

function statusLabel(status, ar) {
  if (status === 'approved') return ar ? 'معتمد' : 'Approved';
  if (status === 'rejected') return ar ? 'مرفوض' : 'Rejected';
  if (status === 'pending') return ar ? 'بانتظار المراجعة' : 'Pending review';
  return status || '—';
}

function lockCopy(data, ar) {
  if (data?.lock_reason === 'hours') {
    return ar
      ? `تحتاج ${data.required_hours} ساعة مكتملة لطلب التخصص. أنجزت ${data.completed_hours} ساعة.`
      : `Complete ${data.required_hours} credit hours before requesting a specialization. You have ${data.completed_hours}.`;
  }
  if (data?.lock_reason === 'pending') {
    return ar ? 'طلبك قيد مراجعة نائب العميد الأكاديمي.' : 'Your request is awaiting the academic vice dean.';
  }
  if (data?.lock_reason === 'assigned') {
    return ar ? 'تخصصك معتمد ولا حاجة لطلب جديد.' : 'Your specialization is already assigned.';
  }
  if (data?.lock_reason === 'window') {
    return ar ? 'التقديم مغلق الآن. انتظر فترة يفتحها نائب العميد.' : 'Submission is closed. Wait for the vice dean window.';
  }
  return '';
}

export default function StudentSpecialization() {
  const { api } = useAuth();
  const { language } = useLanguage();
  const ar = language === 'ar';
  const [data, setData] = useState(null);
  const [chosen, setChosen] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const res = await api.get('/student/specialization');
      setData(res.data);
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'تعذر تحميل طلب التخصص' : 'Failed to load specialization'));
    }
  };

  useEffect(() => { load(); }, [api, ar]);

  const submit = async (e) => {
    e.preventDefault();
    if (!chosen) {
      toast.error(ar ? 'اختر قسماً' : 'Choose a department');
      return;
    }
    setBusy(true);
    try {
      const res = await api.post('/student/specialization', { department_id: chosen });
      setData(res.data);
      toast.success(ar ? 'أُرسل طلب التخصص' : 'Specialization request sent');
    } catch (err) {
      toast.error(err.response?.data?.detail || (ar ? 'تعذر إرسال الطلب' : 'Failed to send request'));
    } finally {
      setBusy(false);
    }
  };

  const options = data?.options || [];

  return (
    <div className="p-4 sm:p-6 space-y-6" data-testid="student-specialization">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Award className="w-6 h-6" />
          {ar ? 'طلب التخصص' : 'Specialization request'}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {ar
            ? `بعد ${data?.required_hours ?? 110} ساعة يمكنك طلب أحد الأقسام الثلاثة. نائب العميد الأكاديمي يوافق أو يرفض لاحقاً.`
            : `After ${data?.required_hours ?? 110} credit hours you can request one of the three majors. The academic vice dean will approve or reject later.`}
        </p>
        <p className="text-sm mt-2">
          {ar
            ? `ساعاتك: ${data?.completed_hours ?? '—'} / ${data?.required_hours ?? 110}`
            : `Hours: ${data?.completed_hours ?? '—'} / ${data?.required_hours ?? 110}`}
        </p>
        <div className="mt-3">
          <RequestWindowBanner window={data?.request_window} ar={ar} />
        </div>
      </div>

      {data?.current_department ? (
        <p className="text-sm">
          {ar ? 'قسمك الحالي:' : 'Current department:'} {ar ? data.current_department.name_ar : data.current_department.name_en}
        </p>
      ) : null}

      {data?.request ? (
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span>{ar ? data.request.department?.name_ar : data.request.department?.name_en}</span>
              <Badge variant={data.request.status === 'approved' ? 'default' : data.request.status === 'rejected' ? 'destructive' : 'outline'}>
                {statusLabel(data.request.status, ar)}
              </Badge>
            </CardTitle>
            {data.request.vda_note ? (
              <CardDescription>{ar ? 'ملاحظة النائب:' : 'Vice dean note:'} {data.request.vda_note}</CardDescription>
            ) : null}
          </CardHeader>
        </Card>
      ) : null}

      {lockCopy(data, ar) ? (
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          {!data?.can_request ? <Lock className="w-4 h-4" /> : null}
          {lockCopy(data, ar)}
        </p>
      ) : null}

      <form onSubmit={submit} className="space-y-4">
        <div className="grid md:grid-cols-3 gap-3">
          {options.map((dept) => (
            <button
              key={dept.id}
              type="button"
              disabled={!data?.can_request}
              onClick={() => setChosen(dept.id)}
              className={`text-start rounded-2xl border p-4 ${Number(chosen) === Number(dept.id) ? 'border-primary bg-primary/5' : ''} ${!data?.can_request ? 'opacity-60' : ''}`}
              data-testid={`specialization-option-${dept.code}`}
            >
              <p className="font-medium">{ar ? dept.name_ar : dept.name_en}</p>
              <p className="text-xs text-muted-foreground">{dept.code}</p>
            </button>
          ))}
        </div>
        {data?.can_request ? (
          <Button type="submit" className="rounded-xl" disabled={busy}>
            {ar ? 'إرسال طلب التخصص' : 'Submit specialization request'}
          </Button>
        ) : null}
      </form>
    </div>
  );
}
