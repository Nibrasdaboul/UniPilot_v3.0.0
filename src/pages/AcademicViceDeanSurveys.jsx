import { useEffect, useState } from 'react';
import { ClipboardList, Plus, Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/AuthContext';
import { useLanguage } from '@/lib/LanguageContext';
import { toast } from 'sonner';

const emptyQuestion = () => ({ prompt: '', options: ['', ''] });
const emptyForm = () => ({ title: '', description: '', questions: [emptyQuestion()] });

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

export default function AcademicViceDeanSurveys() {
  const { api, isViceDeanAcademic } = useAuth();
  const { language } = useLanguage();
  const ar = language === 'ar';
  const [data, setData] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [busy, setBusy] = useState(null);

  const load = async () => {
    try {
      const res = await api.get('/vda/surveys');
      setData(res.data);
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'تعذر تحميل الاستبيانات' : 'Failed to load surveys'));
    }
  };

  useEffect(() => { if (isViceDeanAcademic) load(); }, [api, ar, isViceDeanAcademic]);

  const setQuestion = (index, patch) => {
    setForm((prev) => {
      const questions = prev.questions.map((q, i) => (i === index ? { ...q, ...patch } : q));
      return { ...prev, questions };
    });
  };

  const setOption = (qIndex, oIndex, value) => {
    setForm((prev) => {
      const questions = prev.questions.map((q, i) => {
        if (i !== qIndex) return q;
        const options = q.options.map((opt, j) => (j === oIndex ? value : opt));
        return { ...q, options };
      });
      return { ...prev, questions };
    });
  };

  const saveDraft = async (e) => {
    e.preventDefault();
    setBusy('save');
    try {
      await api.post('/vda/surveys', form);
      setForm(emptyForm());
      toast.success(ar ? 'حُفظ الاستبيان كمسودة' : 'Survey saved as draft');
      await load();
    } catch (err) {
      toast.error(err.response?.data?.detail || (ar ? 'فشل الحفظ' : 'Failed to save survey'));
    } finally {
      setBusy(null);
    }
  };

  const publish = async (id) => {
    setBusy(`pub-${id}`);
    try {
      await api.post(`/vda/surveys/${id}/publish`);
      toast.success(ar ? 'نُشر الاستبيان للطلاب' : 'Survey published to students');
      await load();
    } catch (err) {
      toast.error(err.response?.data?.detail || (ar ? 'فشل النشر' : 'Failed to publish'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6" data-testid="vda-surveys">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ClipboardList className="w-6 h-6" />
          {ar ? 'الاستبيانات' : 'Surveys'}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {ar
            ? 'أنشئ استبياناً بأسئلة اختيار من متعدد ثم انشره. بعد إجابة الطلاب تظهر النتائج هنا.'
            : 'Create a multiple-choice survey and publish it. Student answers appear here as results.'}
        </p>
      </div>

      <div className="grid sm:grid-cols-4 gap-3">
        <Stat label={ar ? 'الكل' : 'All'} value={data?.counts?.total} />
        <Stat label={ar ? 'مسودات' : 'Drafts'} value={data?.counts?.draft} />
        <Stat label={ar ? 'منشورة' : 'Published'} value={data?.counts?.published} />
        <Stat label={ar ? 'إجابات الطلاب' : 'Student answers'} value={data?.counts?.responses} />
      </div>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>{ar ? 'استبيان جديد' : 'New survey'}</CardTitle>
          <CardDescription>
            {ar ? 'كل سؤال يحتاج خيارين على الأقل. يُحفظ أولاً كمسودة.' : 'Each question needs at least two choices. It is saved as a draft first.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveDraft} className="space-y-4">
            <div className="space-y-1">
              <Label>{ar ? 'العنوان' : 'Title'}</Label>
              <Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="rounded-xl" />
            </div>
            <div className="space-y-1">
              <Label>{ar ? 'الوصف' : 'Description'}</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="rounded-xl" />
            </div>
            {form.questions.map((question, qIndex) => (
              <div key={qIndex} className="rounded-xl border p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <Label>{ar ? `السؤال ${qIndex + 1}` : `Question ${qIndex + 1}`}</Label>
                  {form.questions.length > 1 ? (
                    <Button type="button" size="sm" variant="ghost" onClick={() => setForm({ ...form, questions: form.questions.filter((_, i) => i !== qIndex) })}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  ) : null}
                </div>
                <Input
                  required
                  placeholder={ar ? 'نص السؤال' : 'Question prompt'}
                  value={question.prompt}
                  onChange={(e) => setQuestion(qIndex, { prompt: e.target.value })}
                  className="rounded-xl"
                />
                {question.options.map((opt, oIndex) => (
                  <div key={oIndex} className="flex gap-2">
                    <Input
                      required
                      placeholder={ar ? `الخيار ${oIndex + 1}` : `Choice ${oIndex + 1}`}
                      value={opt}
                      onChange={(e) => setOption(qIndex, oIndex, e.target.value)}
                      className="rounded-xl"
                    />
                    {question.options.length > 2 ? (
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className="rounded-xl"
                        onClick={() => setQuestion(qIndex, { options: question.options.filter((_, i) => i !== oIndex) })}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    ) : null}
                  </div>
                ))}
                {question.options.length < 8 ? (
                  <Button type="button" size="sm" variant="outline" className="rounded-xl" onClick={() => setQuestion(qIndex, { options: [...question.options, ''] })}>
                    <Plus className="w-4 h-4" />
                    {ar ? 'خيار' : 'Choice'}
                  </Button>
                ) : null}
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setForm({ ...form, questions: [...form.questions, emptyQuestion()] })}>
                <Plus className="w-4 h-4" />
                {ar ? 'سؤال' : 'Question'}
              </Button>
              <Button type="submit" className="rounded-xl" disabled={busy === 'save'}>
                {ar ? 'حفظ مسودة' : 'Save draft'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-3" data-testid="vda-survey-list">
        {(data?.surveys || []).length === 0 ? (
          <p className="text-sm text-muted-foreground">{ar ? 'لا استبيانات بعد.' : 'No surveys yet.'}</p>
        ) : (data.surveys.map((survey) => (
          <Card key={survey.id} className="rounded-2xl" data-testid={`vda-survey-${survey.id}`}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2 text-base">
                <span>{survey.title}</span>
                <Badge variant={survey.status === 'published' ? 'default' : 'outline'}>
                  {survey.status === 'published' ? (ar ? 'منشور' : 'Published') : (ar ? 'مسودة' : 'Draft')}
                </Badge>
              </CardTitle>
              <CardDescription>
                {survey.description ? `${survey.description} · ` : ''}
                {survey.status === 'published'
                  ? (ar ? `${survey.response_count ?? 0} إجابة` : `${survey.response_count ?? 0} responses`)
                  : (ar ? `${survey.questions?.length || 0} أسئلة` : `${survey.questions?.length || 0} questions`)}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(survey.questions || []).map((q, i) => (
                <div key={q.id || i} className="text-sm space-y-2">
                  <p className="font-medium">{i + 1}. {q.prompt}</p>
                  {survey.status === 'published' ? (
                    <div className="space-y-1">
                      {(q.options || []).map((opt) => {
                        const text = typeof opt === 'string' ? opt : opt.option_text;
                        const count = typeof opt === 'string' ? 0 : (opt.count ?? 0);
                        const percent = typeof opt === 'string' ? 0 : (opt.percent ?? 0);
                        return (
                          <div key={opt.id || text} className="space-y-1">
                            <div className="flex justify-between gap-2 text-xs text-muted-foreground">
                              <span>{text}</span>
                              <span>{count} · {percent}%</span>
                            </div>
                            <div className="h-2 rounded-full bg-muted overflow-hidden">
                              <div className="h-full bg-primary rounded-full" style={{ width: `${percent}%` }} />
                            </div>
                          </div>
                        );
                      })}
                      {(survey.response_count ?? 0) === 0 ? (
                        <p className="text-xs text-muted-foreground">{ar ? 'لا إجابات بعد.' : 'No answers yet.'}</p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {(q.options || []).map((opt) => (typeof opt === 'string' ? opt : opt.option_text)).join(' · ')}
                    </p>
                  )}
                </div>
              ))}
              {survey.status === 'draft' ? (
                <Button className="rounded-xl" disabled={busy === `pub-${survey.id}`} onClick={() => publish(survey.id)}>
                  {ar ? 'نشر للطلاب' : 'Publish to students'}
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {ar ? 'منشور. النتائج تتحدث بعد كل إجابة طالب.' : 'Published. Results update after each student answer.'}
                </p>
              )}
            </CardContent>
          </Card>
        )))}
      </div>
    </div>
  );
}
