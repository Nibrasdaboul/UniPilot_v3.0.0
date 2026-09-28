import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/lib/AuthContext';
import { toast } from 'sonner';

const LABELS = {
  midterm_theory: { ar: 'ميدتيرم النظري', en: 'Theory midterm' },
  sai_theory: { ar: 'سعي النظري', en: 'Theory coursework' },
  final_theory: { ar: 'الامتحان النهائي النظري', en: 'Theory final exam' },
  practical: { ar: 'العملي', en: 'Practical' },
};

export default function CourseWorkAppeals({ courseId, appeals, ar, onSubmitted }) {
  const { api } = useAuth();
  const [open, setOpen] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const items = Array.isArray(appeals) ? appeals : [];

  const submit = async (component) => {
    setBusy(true);
    try {
      const res = await api.post(`/student/courses/${courseId}/appeals`, { component, reason });
      toast.success(ar ? 'أُرسل الاعتراض' : 'Appeal submitted');
      setOpen(null);
      setReason('');
      onSubmitted?.(res.data?.appeals || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'تعذر إرسال الاعتراض' : 'Failed to submit the appeal'));
    } finally {
      setBusy(false);
    }
  };

  if (!items.length) return null;

  return (
    <div className="space-y-3" data-testid="course-work-appeals">
      <p className="text-sm font-medium">{ar ? 'الاعتراض على قسم من العلامة' : 'Appeal one mark component'}</p>
      <p className="text-xs text-muted-foreground">
        {ar ? 'مرة واحدة لكل قسم. الاعتراض يصل إلى النائب والكادر ودائرة الامتحانات.' : 'Once per component. The appeal goes to the vice dean, teaching staff, and Exams Office.'}
      </p>
      {items.map((item) => {
        const label = LABELS[item.component] || { ar: item.component, en: item.component };
        const danger = item.tone === 'danger';
        return (
          <div key={item.component} className="rounded-xl border p-3 space-y-2" data-testid={`appeal-${item.component}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm">{ar ? label.ar : label.en}</span>
              <Button
                type="button"
                size="sm"
                variant={danger ? 'destructive' : 'outline'}
                className="rounded-full"
                disabled={!item.can_appeal || busy}
                data-testid={`appeal-btn-${item.component}`}
                onClick={() => setOpen(open === item.component ? null : item.component)}
              >
                {ar ? (item.label_ar || 'اعتراض') : (item.label_en || 'Appeal')}
              </Button>
            </div>
            {item.decision_note && item.status === 'rejected' ? (
              <p className="text-xs text-destructive">{item.decision_note}</p>
            ) : null}
            {item.can_appeal && open === item.component ? (
              <div className="space-y-2">
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={ar ? 'اكتب سبب الاعتراض (٥ أحرف على الأقل)' : 'Write why you are appealing (at least 5 characters)'}
                  className="rounded-xl"
                  data-testid={`appeal-reason-${item.component}`}
                />
                <Button type="button" className="rounded-xl" disabled={busy} onClick={() => submit(item.component)}>
                  {ar ? 'إرسال الاعتراض' : 'Submit appeal'}
                </Button>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
