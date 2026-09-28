import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import WithdrawnStudentBadge, { WITHDRAWN_ROW_CLASS } from '@/components/academic/WithdrawnStudentBadge';
import { cn } from '@/lib/utils';

const LABELS = {
  midterm_theory: { ar: 'ميدتيرم النظري', en: 'Theory midterm' },
  sai_theory: { ar: 'سعي النظري', en: 'Theory coursework' },
  final_theory: { ar: 'الامتحان النهائي النظري', en: 'Theory final exam' },
  practical: { ar: 'العملي', en: 'Practical' },
};

export default function CourseWorkAppealsInbox({
  appeals,
  ar,
  canDecide,
  catalogId,
  api,
  apiBase,
  onChanged,
  withdrawnUserIds = null,
}) {
  const [notes, setNotes] = useState({});
  const [busy, setBusy] = useState(null);
  const items = Array.isArray(appeals) ? appeals : [];

  const decide = async (appeal, decision) => {
    setBusy(`${appeal.id}-${decision}`);
    try {
      const res = await api.post(`${apiBase}/${catalogId}/appeals/${appeal.id}`, {
        decision,
        note: notes[appeal.id] || '',
      });
      toast.success(decision === 'accepted'
        ? (ar ? 'قُبل الاعتراض. عدّل العلامة ثم اعتمد الكشف.' : 'Appeal accepted. Edit the mark then adopt the sheet.')
        : (ar ? 'سُجّلت العلامة صحيحة' : 'Marked as correct'));
      onChanged?.(res.data);
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'تعذر حفظ القرار' : 'Failed to save the decision'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3" data-testid="appeals-inbox">
      <p className="text-sm font-medium">{ar ? 'اعتراضات الطلاب' : 'Student appeals'}</p>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{ar ? 'لا اعتراضات على هذه المادة.' : 'No appeals on this course.'}</p>
      ) : items.map((item) => {
        const label = LABELS[item.component] || { ar: item.component, en: item.component };
        const withdrawn = Boolean(withdrawnUserIds?.has(Number(item.user_id)));
        return (
          <div
            key={item.id}
            className={cn('rounded-xl border p-3 space-y-2', withdrawn && WITHDRAWN_ROW_CLASS)}
            data-testid={`inbox-appeal-${item.id}`}
            data-withdrawn={withdrawn ? 'true' : 'false'}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium flex flex-wrap items-center gap-1">
                <span>{item.full_name || '—'} · {item.person_code}</span>
                {withdrawn ? <WithdrawnStudentBadge ar={ar} testId={`appeal-withdrawn-${item.id}`} /> : null}
              </p>
              <Badge variant={item.status === 'rejected' ? 'destructive' : 'outline'} className="rounded-full text-[10px]">
                {item.status === 'pending' ? (ar ? 'معلّق' : 'Pending') : item.label_ar}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">{ar ? label.ar : label.en}</p>
            <p className="text-sm">{item.reason}</p>
            {item.decision_note ? <p className="text-xs">{item.decision_note}</p> : null}
            {canDecide && item.status === 'pending' ? (
              <div className="space-y-2">
                <Textarea
                  value={notes[item.id] || ''}
                  onChange={(e) => setNotes((prev) => ({ ...prev, [item.id]: e.target.value }))}
                  placeholder={ar ? 'ملاحظة القرار (اختياري)' : 'Decision note (optional)'}
                  className="rounded-xl"
                  disabled={withdrawn}
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="rounded-xl"
                    disabled={Boolean(busy) || withdrawn}
                    data-testid={`accept-appeal-${item.id}`}
                    onClick={() => decide(item, 'accept')}
                  >
                    {ar ? 'يوجد خطأ — تعديل الدائرة' : 'Error — Exams will edit'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    className="rounded-xl"
                    disabled={Boolean(busy) || withdrawn}
                    data-testid={`reject-appeal-${item.id}`}
                    onClick={() => decide(item, 'reject')}
                  >
                    {ar ? 'العلامة صحيحة' : 'The mark is correct'}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
