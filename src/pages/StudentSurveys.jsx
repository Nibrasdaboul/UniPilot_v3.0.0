import { useEffect, useState } from 'react';
import { ClipboardList } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/AuthContext';
import { useLanguage } from '@/lib/LanguageContext';
import { toast } from 'sonner';

export default function StudentSurveys() {
  const { api } = useAuth();
  const { language } = useLanguage();
  const ar = language === 'ar';
  const [data, setData] = useState(null);
  const [answers, setAnswers] = useState({});
  const [busy, setBusy] = useState(null);

  const load = async () => {
    try {
      const res = await api.get('/student/surveys');
      setData(res.data);
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'تعذر تحميل الاستبيانات' : 'Failed to load surveys'));
    }
  };

  useEffect(() => { load(); }, [api, ar]);

  const pick = (surveyId, questionId, optionId) => {
    setAnswers((prev) => ({
      ...prev,
      [surveyId]: { ...(prev[surveyId] || {}), [questionId]: optionId },
    }));
  };

  const submit = async (survey) => {
    setBusy(survey.id);
    try {
      const payload = (survey.questions || []).map((q) => ({
        question_id: q.id,
        option_id: answers[survey.id]?.[q.id],
      }));
      const res = await api.post(`/student/surveys/${survey.id}/respond`, { answers: payload });
      setData(res.data);
      toast.success(ar ? 'أُرسلت إجاباتك' : 'Your answers were submitted');
    } catch (err) {
      toast.error(err.response?.data?.detail || (ar ? 'تعذر إرسال الإجابات' : 'Failed to submit answers'));
    } finally {
      setBusy(null);
    }
  };

  const surveys = data?.surveys || [];

  return (
    <div className="p-4 sm:p-6 space-y-6" data-testid="student-surveys">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ClipboardList className="w-6 h-6" />
          {ar ? 'الاستبيانات' : 'Surveys'}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {ar
            ? 'الاستبيانات التي ينشرها نائب العميد للشؤون الأكاديمية. أجب باختيار واحد لكل سؤال.'
            : 'Surveys published by the academic vice dean. Choose one answer for each question.'}
        </p>
        <p className="text-sm mt-2">
          {ar
            ? `بانتظارك: ${data?.counts?.pending ?? '—'} · أتممتها: ${data?.counts?.submitted ?? '—'}`
            : `Waiting: ${data?.counts?.pending ?? '—'} · Done: ${data?.counts?.submitted ?? '—'}`}
        </p>
      </div>

      {surveys.length === 0 ? (
        <p className="text-sm text-muted-foreground">{ar ? 'لا استبيانات منشورة الآن.' : 'No published surveys yet.'}</p>
      ) : surveys.map((survey) => {
        const picked = answers[survey.id] || Object.fromEntries((survey.answers || []).map((a) => [a.question_id, a.option_id]));
        return (
          <Card key={survey.id} className="rounded-2xl" data-testid={`student-survey-${survey.id}`}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2 text-base">
                <span>{survey.title}</span>
                <Badge variant={survey.submitted ? 'default' : 'outline'}>
                  {survey.submitted ? (ar ? 'أُجيب' : 'Submitted') : (ar ? 'جديد' : 'Open')}
                </Badge>
              </CardTitle>
              <CardDescription>{survey.description || ''}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {(survey.questions || []).map((question, index) => (
                <div key={question.id} className="space-y-2">
                  <Label>{index + 1}. {question.prompt}</Label>
                  <div className="space-y-1">
                    {(question.options || []).map((opt) => (
                      <label key={opt.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name={`s${survey.id}-q${question.id}`}
                          disabled={survey.submitted}
                          checked={Number(picked[question.id]) === Number(opt.id)}
                          onChange={() => pick(survey.id, question.id, opt.id)}
                        />
                        <span>{opt.option_text}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              {survey.submitted ? (
                <p className="text-xs text-muted-foreground">{ar ? 'تم إرسال إجاباتك. لا يمكن التعديل.' : 'Your answers were sent. They cannot be changed.'}</p>
              ) : (
                <Button className="rounded-xl" disabled={busy === survey.id} onClick={() => submit(survey)}>
                  {ar ? 'إرسال الإجابات' : 'Submit answers'}
                </Button>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
