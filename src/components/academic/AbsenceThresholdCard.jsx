import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export default function AbsenceThresholdCard({ api, endpoint, ar }) {
  const [limit, setLimit] = useState(4);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const res = await api.get(endpoint);
      setLimit(res.data?.absence_limit ?? 4);
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'تعذر تحميل حد الغياب' : 'Failed to load the absence limit'));
    }
  };

  useEffect(() => { load(); }, [api, endpoint]);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.patch(endpoint, { absence_limit: Number(limit) });
      setLimit(res.data?.absence_limit ?? Number(limit));
      toast.success(ar ? 'حُفظ حد الغياب للكلية' : 'College absence limit saved');
    } catch (err) {
      toast.error(err.response?.data?.detail || (ar ? 'تعذر حفظ حد الغياب' : 'Failed to save the absence limit'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="rounded-2xl" data-testid="absence-threshold-card">
      <CardHeader>
        <CardTitle className="text-base">{ar ? 'حد الغياب والحرمان' : 'Absence and deprivation limit'}</CardTitle>
        <CardDescription>
          {ar
            ? `${limit} غيابات = 100٪. عند 25٪ / 50٪ / 75٪ يظهر تنبيه للطالب. البطاقة الحمراء وطلب إلغاء الحرمان في خطوة لاحقة.`
            : `${limit} absences = 100%. Students see warnings at 25% / 50% / 75%. The red deprivation card comes later.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label>{ar ? 'عدد الغيابات الذي يساوي 100٪' : 'Absences that equal 100%'}</Label>
            <Input
              type="number"
              min="1"
              max="20"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              className="rounded-xl w-28"
              data-testid="absence-limit-input"
            />
          </div>
          <Button type="submit" className="rounded-xl" disabled={busy} data-testid="absence-limit-save">
            {ar ? 'حفظ للكلية' : 'Save for the college'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
