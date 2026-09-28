import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function toLocalInput(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatRequestWindow(iso, ar) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(ar ? 'ar-SY' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

export function requestWindowCopy(window, ar) {
  if (!window?.configured) {
    return ar
      ? 'لا توجد فترة تقديم الآن. لا يمكن إرسال طلب مشروع أو تخصص حتى يفتحها نائب العميد.'
      : 'No submission window is open. Project and specialization requests stay closed until the vice dean sets dates.';
  }
  const from = formatRequestWindow(window.start, ar);
  const to = formatRequestWindow(window.end, ar);
  if (window.open) {
    return ar ? `فترة التقديم مفتوحة من ${from} إلى ${to}.` : `Submission window is open from ${from} to ${to}.`;
  }
  return ar ? `فترة التقديم مغلقة. كانت من ${from} إلى ${to}.` : `Submission window is closed. It ran from ${from} to ${to}.`;
}

export function RequestWindowBanner({ window, ar }) {
  return (
    <p className="text-sm rounded-xl border px-3 py-2" data-testid="request-window-banner">
      {requestWindowCopy(window, ar)}
    </p>
  );
}

export default function RequestWindowCard({ window, onSave, busy, ar }) {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');

  useEffect(() => {
    setStart(toLocalInput(window?.start));
    setEnd(toLocalInput(window?.end));
  }, [window?.start, window?.end]);

  const save = (e) => {
    e.preventDefault();
    onSave({ start: start ? new Date(start).toISOString() : '', end: end ? new Date(end).toISOString() : '' });
  };

  return (
    <Card className="rounded-2xl" data-testid="vda-request-window">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="w-4 h-4" />
          {ar ? 'فترة تقديم الطلبات' : 'Submission window'}
        </CardTitle>
        <CardDescription>
          {ar
            ? 'فترة واحدة لطلبات المشاريع وطلبات التخصص. خارج هذه التواريخ لا يستطيع الطالب الإرسال.'
            : 'One window for project requests and specialization requests. Students cannot submit outside these dates.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">{requestWindowCopy(window, ar)}</p>
        <form onSubmit={save} className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>{ar ? 'بداية الفترة' : 'Window start'}</Label>
            <Input
              type="datetime-local"
              required
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="rounded-xl"
            />
          </div>
          <div className="space-y-1">
            <Label>{ar ? 'نهاية الفترة' : 'Window end'}</Label>
            <Input
              type="datetime-local"
              required
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="rounded-xl"
            />
          </div>
          <div className="sm:col-span-2 flex flex-wrap gap-2">
            <Button type="submit" className="rounded-xl" disabled={busy}>
              {ar ? 'حفظ الفترة' : 'Save window'}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              disabled={busy}
              onClick={() => onSave({ clear: true })}
            >
              {ar ? 'إغلاق الفترة' : 'Close window'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
