import { useEffect, useState } from 'react';
import { FileText, Lock, Clock, Users } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/AuthContext';
import { useLanguage } from '@/lib/LanguageContext';
import { mediaUrl } from '@/lib/mediaUrl';
import { RequestWindowBanner } from '@/components/academic/RequestWindowCard';
import { toast } from 'sonner';

const KINDS = ['term', 'graduation_1', 'graduation_2'];

function emptyMember() {
  return { full_name: '', university_id: '', gpa: '', completed_hours: '' };
}

function emptyDraft() {
  return { title: '', notes: '', team_size: 1, members: [emptyMember()], pdf_name: '', pdf_base64: '' };
}

function memberFromSubmitter(submitter) {
  if (!submitter) return emptyMember();
  return {
    full_name: submitter.full_name || '',
    university_id: submitter.university_id || '',
    gpa: submitter.gpa ?? '',
    completed_hours: submitter.completed_hours ?? '',
  };
}

function resizeMembers(members, size, submitter) {
  const next = (members || []).slice(0, size);
  while (next.length < size) {
    next.push(next.length === 0 ? memberFromSubmitter(submitter) : emptyMember());
  }
  return next;
}

function statusLabel(status, ar) {
  if (status === 'approved') return ar ? 'معتمد' : 'Approved';
  if (status === 'rejected') return ar ? 'مرفوض' : 'Rejected';
  if (status === 'returned') return ar ? 'معاد بملاحظات' : 'Returned';
  if (status === 'pending') return ar ? 'بانتظار المراجعة' : 'Pending review';
  return status || '—';
}

function lockCopy(track, ar) {
  if (track.lock_reason === 'chain') {
    if (track.unlocks_after === 'term') {
      return ar ? 'لا يُفتح قبل النجاح في المشروع الفصلي' : 'Locked until you pass the term project';
    }
    if (track.unlocks_after === 'graduation_1') {
      return ar ? 'لا يُفتح قبل النجاح في مشروع التخرج 1' : 'Locked until you pass graduation project 1';
    }
    return ar ? 'مغلق حتى نجاح المشروع السابق' : 'Locked until the previous project is passed';
  }
  if (track.lock_reason === 'hours') {
    return ar
      ? `تحتاج ${track.request_min_hours} ساعة مكتملة لطلب هذه المادة`
      : `Complete ${track.request_min_hours} credit hours to request this course`;
  }
  if (track.lock_reason === 'pending') {
    return ar ? 'طلبك قيد المراجعة' : 'Your request is awaiting review';
  }
  if (track.lock_reason === 'approved') {
    return ar ? 'اعتُمد الطلب. انتظر تسجيل المادة ونجاحها.' : 'Approved. Wait until the course is recorded and passed.';
  }
  if (track.lock_reason === 'passed') {
    return ar ? 'نجحت في هذه المادة' : 'You have passed this course';
  }
  if (track.lock_reason === 'window') {
    return ar ? 'التقديم مغلق الآن. انتظر فترة يفتحها نائب العميد.' : 'Submission is closed. Wait for the vice dean window.';
  }
  return '';
}

export default function StudentProjects() {
  const { api } = useAuth();
  const { language } = useLanguage();
  const ar = language === 'ar';
  const [data, setData] = useState(null);
  const [drafts, setDrafts] = useState({
    term: emptyDraft(),
    graduation_1: emptyDraft(),
    graduation_2: emptyDraft(),
  });
  const [busy, setBusy] = useState(null);

  const load = async () => {
    try {
      const res = await api.get('/student/projects');
      setData(res.data);
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'تعذر تحميل المشاريع' : 'Failed to load projects'));
    }
  };

  useEffect(() => { load(); }, [api, ar]);

  useEffect(() => {
    if (!data?.submitter) return;
    setDrafts((prev) => {
      const next = { ...prev };
      for (const kind of KINDS) {
        const members = next[kind]?.members || [emptyMember()];
        const first = members[0] || emptyMember();
        if (!first.full_name && !first.university_id) {
          next[kind] = { ...next[kind], members: [memberFromSubmitter(data.submitter), ...members.slice(1)] };
        }
      }
      return next;
    });
  }, [data]);

  const updateDraft = (kind, patch) => {
    setDrafts((prev) => ({ ...prev, [kind]: { ...prev[kind], ...patch } }));
  };

  const changeTeamSize = (kind, raw) => {
    const size = Math.max(1, Math.min(8, Number(raw) || 1));
    const current = drafts[kind] || emptyDraft();
    updateDraft(kind, { team_size: size, members: resizeMembers(current.members, size, data?.submitter) });
  };

  const changeMember = (kind, index, patch) => {
    const current = drafts[kind] || emptyDraft();
    const members = (current.members || []).map((row, i) => (i === index ? { ...row, ...patch } : row));
    updateDraft(kind, { members });
  };

  const readPdf = (kind, file) => {
    if (!file) {
      updateDraft(kind, { pdf_name: '', pdf_base64: '' });
      return;
    }
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      toast.error(ar ? 'الملف يجب أن يكون PDF' : 'The file must be a PDF');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => updateDraft(kind, { pdf_name: file.name, pdf_base64: reader.result });
    reader.readAsDataURL(file);
  };

  const submit = async (e, kind) => {
    e.preventDefault();
    const draft = drafts[kind] || emptyDraft();
    if (!draft.pdf_base64) {
      toast.error(ar ? 'ارفع ملف PDF للطلب' : 'Upload a PDF with the request');
      return;
    }
    setBusy(kind);
    try {
      const res = await api.post('/student/projects', {
        kind,
        title: draft.title,
        notes: draft.notes,
        team_size: draft.team_size,
        members: (draft.members || []).map((row) => ({
          full_name: row.full_name,
          university_id: row.university_id,
          gpa: row.gpa,
          completed_hours: row.completed_hours,
        })),
        pdf_base64: draft.pdf_base64,
        pdf_filename: draft.pdf_name,
      });
      setData(res.data);
      setDrafts((prev) => ({ ...prev, [kind]: emptyDraft() }));
      toast.success(ar ? 'أُرسل الطلب إلى نائب العميد' : 'Request sent to the academic vice dean');
    } catch (err) {
      toast.error(err.response?.data?.detail || (ar ? 'تعذر إرسال الطلب' : 'Failed to send request'));
    } finally {
      setBusy(null);
    }
  };

  const tracks = data?.tracks || [];

  return (
    <div className="p-4 sm:p-6 space-y-6" data-testid="student-projects">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileText className="w-6 h-6" />
          {ar ? 'المشاريع' : 'Projects'}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {ar
            ? 'المشروع الفصلي ثم مشروع التخرج 1 ثم مشروع التخرج 2. كل مادة تظهر بساعات طلبها. لا يُفتح التالي قبل النجاح في السابق.'
            : 'Term project, then graduation 1, then graduation 2. Each course card shows its request hours. The next one stays locked until you pass the previous course.'}
        </p>
        <p className="text-sm mt-2">
          {ar ? `ساعاتك المكتملة: ${data?.completed_hours ?? '—'} ساعة` : `Completed hours: ${data?.completed_hours ?? '—'}`}
        </p>
        <div className="mt-3">
          <RequestWindowBanner window={data?.request_window} ar={ar} />
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        {tracks.map((track) => {
          const title = ar ? track.ar : track.en;
          const locked = !track.can_request;
          return (
            <Card
              key={track.kind}
              className="rounded-2xl"
              data-testid={`student-project-${track.kind}`}
            >
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2 text-base">
                  <span className="flex items-center gap-2">
                    {locked ? <Lock className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                    {title}
                  </span>
                  {track.passed ? (
                    <Badge>{ar ? 'ناجح' : 'Passed'}</Badge>
                  ) : track.request ? (
                    <Badge variant={track.request.status === 'rejected' ? 'destructive' : track.request.status === 'approved' ? 'default' : 'outline'}>
                      {statusLabel(track.request.status, ar)}
                    </Badge>
                  ) : locked ? (
                    <Badge variant="outline">{ar ? 'مغلق' : 'Locked'}</Badge>
                  ) : null}
                </CardTitle>
                <CardDescription>
                  {track.course
                    ? `${track.course.course_code} · ${ar ? 'ساعات المادة' : 'Course hours'}: ${track.course.credit_hours}`
                    : title}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm font-medium">
                  {ar ? `ساعات الطلب المطلوبة: ${track.request_min_hours} ساعة` : `Hours required to request: ${track.request_min_hours}`}
                </p>
                {lockCopy(track, ar) ? (
                  <p className="text-xs text-muted-foreground">{lockCopy(track, ar)}</p>
                ) : null}
                {track.request?.title ? (
                  <p className="text-sm">{ar ? 'آخر طلب:' : 'Latest request:'} {track.request.title}</p>
                ) : null}
                {track.request?.members?.length ? (
                  <p className="text-xs text-muted-foreground">
                    {ar ? `الفريق: ${track.request.members.length} طلاب` : `Team: ${track.request.members.length} students`}
                  </p>
                ) : null}
                {track.request?.pdf_url ? (
                  <a href={mediaUrl(track.request.pdf_url)} target="_blank" rel="noreferrer" className="text-xs underline">
                    {ar ? `ملف PDF: ${track.request.pdf_name || 'تحميل'}` : `PDF: ${track.request.pdf_name || 'Download'}`}
                  </a>
                ) : null}
                {track.request?.vda_note ? (
                  <p className="text-xs text-muted-foreground">{ar ? 'ملاحظة النائب:' : 'Vice dean note:'} {track.request.vda_note}</p>
                ) : null}
                {track.can_request ? (
                  <form onSubmit={(e) => submit(e, track.kind)} className="space-y-3">
                    <div className="space-y-1">
                      <Label>{ar ? 'عنوان المشروع' : 'Project title'}</Label>
                      <Input
                        required
                        value={drafts[track.kind]?.title || ''}
                        onChange={(e) => updateDraft(track.kind, { title: e.target.value })}
                        className="rounded-xl"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5" />
                        {ar ? 'عدد طلاب الفريق' : 'Team size'}
                      </Label>
                      <Input
                        type="number"
                        min={1}
                        max={8}
                        required
                        value={drafts[track.kind]?.team_size ?? 1}
                        onChange={(e) => changeTeamSize(track.kind, e.target.value)}
                        className="rounded-xl"
                      />
                    </div>
                    {(drafts[track.kind]?.members || []).map((member, index) => (
                      <div key={`${track.kind}-member-${index}`} className="rounded-xl border p-3 space-y-2">
                        <p className="text-xs font-medium">{ar ? `طالب ${index + 1}` : `Student ${index + 1}`}</p>
                        <div className="space-y-1">
                          <Label>{ar ? 'الاسم' : 'Name'}</Label>
                          <Input
                            required
                            value={member.full_name}
                            onChange={(e) => changeMember(track.kind, index, { full_name: e.target.value })}
                            className="rounded-xl"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>{ar ? 'الرقم الجامعي' : 'University ID'}</Label>
                          <Input
                            required
                            inputMode="numeric"
                            maxLength={10}
                            value={member.university_id}
                            onChange={(e) => changeMember(track.kind, index, { university_id: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                            className="rounded-xl"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label>{ar ? 'المعدل (من 100)' : 'GPA (out of 100)'}</Label>
                            <Input
                              required
                              type="number"
                              min={0}
                              max={100}
                              step="0.01"
                              value={member.gpa}
                              onChange={(e) => changeMember(track.kind, index, { gpa: e.target.value })}
                              className="rounded-xl"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label>{ar ? 'الساعات المكتملة' : 'Completed hours'}</Label>
                            <Input
                              required
                              type="number"
                              min={0}
                              step="0.01"
                              value={member.completed_hours}
                              onChange={(e) => changeMember(track.kind, index, { completed_hours: e.target.value })}
                              className="rounded-xl"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                    <div className="space-y-1">
                      <Label>{ar ? 'ملف PDF' : 'PDF file'}</Label>
                      <Input
                        type="file"
                        accept="application/pdf,.pdf"
                        required
                        onChange={(e) => readPdf(track.kind, e.target.files?.[0] || null)}
                        className="rounded-xl"
                      />
                      {drafts[track.kind]?.pdf_name ? (
                        <p className="text-xs text-muted-foreground">{drafts[track.kind].pdf_name}</p>
                      ) : null}
                    </div>
                    <div className="space-y-1">
                      <Label>{ar ? 'ملاحظات' : 'Notes'}</Label>
                      <textarea
                        rows={3}
                        value={drafts[track.kind]?.notes || ''}
                        onChange={(e) => updateDraft(track.kind, { notes: e.target.value })}
                        className="flex min-h-[72px] w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                      />
                    </div>
                    <Button type="submit" className="rounded-xl w-full" disabled={busy === track.kind}>
                      {ar ? 'إرسال الطلب' : 'Submit request'}
                    </Button>
                  </form>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
