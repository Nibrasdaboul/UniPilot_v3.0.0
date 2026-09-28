import { useEffect, useState } from 'react';
import { FileText, GraduationCap, ClipboardCheck, Clock, Inbox } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { mediaUrl } from '@/lib/mediaUrl';
import RequestWindowCard from '@/components/academic/RequestWindowCard';
import { toast } from 'sonner';

const emptyPub = { title: '', authors: '', venue: '', published_on: '' };
const emptyProject = {
  title: '',
  student_name: '',
  supervisor_name: '',
  kind: 'term',
  chair: '',
  member: '',
  external: '',
};

const emptyHours = { term: '90', graduation_1: '90', graduation_2: '90' };

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

function statusLabel(status, ar) {
  if (status === 'approved') return ar ? 'معتمد' : 'Approved';
  if (status === 'rejected') return ar ? 'مرفوض' : 'Rejected';
  if (status === 'returned') return ar ? 'معاد بملاحظات' : 'Returned';
  return ar ? 'بانتظار الاعتماد' : 'Pending';
}

export default function AcademicViceDeanResearch() {
  const { api, isViceDeanAcademic } = useAuth();
  const { language } = useLanguage();
  const ar = language === 'ar';
  const [data, setData] = useState(null);
  const [pub, setPub] = useState(emptyPub);
  const [project, setProject] = useState(emptyProject);
  const [hoursByKind, setHoursByKind] = useState(emptyHours);
  const [requestNotes, setRequestNotes] = useState({});
  const [busy, setBusy] = useState(null);

  const load = async () => {
    try {
      const res = await api.get('/vda/research');
      setData(res.data);
      const next = { ...emptyHours };
      for (const track of res.data?.settings?.tracks || []) {
        if (track?.kind && track.request_min_hours != null) {
          next[track.kind] = String(track.request_min_hours);
        }
      }
      setHoursByKind(next);
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'تعذر تحميل سجل البحث' : 'Failed to load research registry'));
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

  const saveMinHours = async (e, kind) => {
    e.preventDefault();
    setBusy(`hours-${kind}`);
    try {
      const res = await api.patch('/vda/research/settings', {
        kind,
        project_request_min_hours: Number(hoursByKind[kind]),
      });
      const saved = res.data?.track?.request_min_hours ?? res.data?.project_request_min_hours;
      if (saved != null) {
        setHoursByKind((prev) => ({ ...prev, [kind]: String(saved) }));
      }
      toast.success(ar ? 'حُفظ حد الساعات لهذه المادة' : 'Hour threshold saved for this course');
      await load();
    } catch (err) {
      toast.error(err.response?.data?.detail || (ar ? 'فشل حفظ الحد' : 'Failed to save threshold'));
    } finally {
      setBusy(null);
    }
  };

  const addPublication = async (e) => {
    e.preventDefault();
    setBusy('pub');
    try {
      await api.post('/vda/research/publications', pub);
      setPub(emptyPub);
      toast.success(ar ? 'سُجّلت الورقة' : 'Publication registered');
      await load();
    } catch (err) {
      toast.error(err.response?.data?.detail || (ar ? 'فشل التسجيل' : 'Register failed'));
    } finally {
      setBusy(null);
    }
  };

  const addProject = async (e) => {
    e.preventDefault();
    setBusy('project');
    const committee = [
      project.chair && { full_name: project.chair, committee_role: 'chair' },
      project.member && { full_name: project.member, committee_role: 'member' },
      project.external && { full_name: project.external, committee_role: 'external' },
    ].filter(Boolean);
    try {
      await api.post('/vda/research/projects', {
        title: project.title,
        student_name: project.student_name,
        supervisor_name: project.supervisor_name,
        kind: project.kind,
        committee,
      });
      setProject(emptyProject);
      toast.success(ar ? 'أُدرج الموضوع بانتظار قرارك' : 'Topic recorded as pending');
      await load();
    } catch (err) {
      toast.error(err.response?.data?.detail || (ar ? 'فشل الإدراج' : 'Submit failed'));
    } finally {
      setBusy(null);
    }
  };

  const decideRequest = async (id, decision) => {
    setBusy(`req-${id}`);
    try {
      await api.post(`/vda/research/student-requests/${id}/decide`, {
        decision,
        note: requestNotes[id] || '',
      });
      toast.success(
        decision === 'approved'
          ? (ar ? 'اعتُمد طلب الطالب' : 'Student request approved')
          : decision === 'rejected'
            ? (ar ? 'رُفض طلب الطالب' : 'Student request rejected')
            : (ar ? 'أُعيد الطلب بملاحظات' : 'Request returned with notes')
      );
      await load();
    } catch (err) {
      toast.error(err.response?.data?.detail || (ar ? 'تعذر تنفيذ القرار' : 'Decision failed'));
    } finally {
      setBusy(null);
    }
  };

  const decide = async (id, decision) => {
    setBusy(`dec-${id}`);
    try {
      await api.post(`/vda/research/projects/${id}/decide`, { decision });
      toast.success(decision === 'approved' ? (ar ? 'اعتُمد الموضوع واللجنة' : 'Topic and committee approved') : (ar ? 'رُفض الموضوع' : 'Topic rejected'));
      await load();
    } catch (err) {
      toast.error(err.response?.data?.detail || (ar ? 'تعذر تنفيذ القرار' : 'Decision failed'));
    } finally {
      setBusy(null);
    }
  };

  const kinds = data?.kinds || [];
  const tracks = data?.settings?.tracks || kinds.map((k) => ({ kind: k.key, ar: k.ar, en: k.en }));

  return (
    <div className="p-4 sm:p-6 space-y-6" data-testid="vda-research">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileText className="w-6 h-6" />
          {ar ? 'البحث العلمي ومشاريع التخرج' : 'Research and graduation projects'}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {ar
            ? 'سجل حقيقي للكلية. لا أوراق وهمية. تسجّل النشر هنا، وتعتمد مواضيع التخرج واللجان.'
            : 'A real college registry. No invented papers. Register publications here and approve graduation topics and committees.'}
        </p>
      </div>

      <RequestWindowCard
        window={data?.request_window}
        onSave={saveWindow}
        busy={busy === 'window'}
        ar={ar}
      />

      <div className="grid sm:grid-cols-4 gap-3">
        <Stat label={ar ? 'أوراق مسجّلة' : 'Registered papers'} value={data?.counts?.total} />
        <Stat label={ar ? 'طلبات طلاب بانتظارك' : 'Student requests waiting'} value={data?.counts?.student_requests_pending} />
        <Stat label={ar ? 'مواضيع بانتظارك' : 'Topics awaiting you'} value={data?.counts?.projects_pending} />
        <Stat label={ar ? 'مواضيع معتمدة' : 'Approved topics'} value={data?.counts?.projects_approved} />
      </div>

      <div className="grid md:grid-cols-3 gap-3" data-testid="vda-project-hours">
        {tracks.map((track) => {
          const kind = track.kind;
          const title = ar ? (track.ar || kind) : (track.en || kind);
          const courseHours = track.course?.credit_hours ?? '—';
          const savedHours = track.request_min_hours ?? '—';
          const unlockHint = track.unlocks_after === 'term'
            ? (ar ? 'يُفتح بعد نجاح المشروع الفصلي' : 'Opens after passing the term project')
            : track.unlocks_after === 'graduation_1'
              ? (ar ? 'يُفتح بعد نجاح مشروع التخرج 1' : 'Opens after passing graduation project 1')
              : (ar ? 'المادة الأولى في سلسلة المشاريع' : 'First course in the project chain');
          return (
            <Card key={kind} className="rounded-2xl" data-testid={`vda-project-hours-${kind}`}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Clock className="w-4 h-4" />
                  {title}
                </CardTitle>
                <CardDescription>
                  {track.course
                    ? `${track.course.course_code} · ${ar ? 'ساعات المادة' : 'Course hours'}: ${courseHours}`
                    : unlockHint}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">{unlockHint}</p>
                <form onSubmit={(e) => saveMinHours(e, kind)} className="space-y-3">
                  <div className="space-y-1">
                    <Label>{ar ? 'ساعات الطلب المطلوبة' : 'Hours required to request'}</Label>
                    <Input
                      type="number"
                      min="0"
                      max="250"
                      step="1"
                      value={hoursByKind[kind] ?? ''}
                      onChange={(e) => setHoursByKind((prev) => ({ ...prev, [kind]: e.target.value }))}
                      className="rounded-xl w-full"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm text-muted-foreground">
                      {ar ? `الحد الحالي: ${savedHours} ساعة` : `Current: ${savedHours} hours`}
                    </p>
                    <Button type="submit" className="rounded-xl" disabled={busy === `hours-${kind}`}>
                      {ar ? 'حفظ' : 'Save'}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div data-testid="vda-student-requests">
        <h2 className="text-lg font-semibold flex items-center gap-2 mb-3">
          <Inbox className="w-5 h-5" />
          {ar ? 'طلبات مشاريع الطلاب' : 'Student project requests'}
        </h2>
        <div className="grid md:grid-cols-3 gap-3">
          {(data?.student_requests || tracks.map((t) => ({ ...t, items: [] }))).map((group) => (
            <Card key={group.kind} className="rounded-2xl" data-testid={`vda-student-requests-${group.kind}`}>
              <CardHeader>
                <CardTitle className="text-base">{ar ? group.ar : group.en}</CardTitle>
                <CardDescription>
                  {ar
                    ? `${(group.items || []).filter((i) => i.status === 'pending').length} بانتظار القرار`
                    : `${(group.items || []).filter((i) => i.status === 'pending').length} awaiting a decision`}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(group.items || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">{ar ? 'لا طلبات في هذا النوع.' : 'No requests in this group.'}</p>
                ) : (group.items || []).map((row) => (
                  <div key={row.id} className="rounded-xl border p-3 space-y-2" data-testid={`vda-student-request-${row.id}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-sm">{row.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {row.student_name || '—'}{row.university_id ? ` · ${row.university_id}` : ''}
                        </p>
                      </div>
                      <Badge variant={row.status === 'approved' ? 'default' : row.status === 'rejected' ? 'destructive' : 'outline'}>
                        {statusLabel(row.status, ar)}
                      </Badge>
                    </div>
                    {row.notes ? <p className="text-xs">{ar ? 'ملاحظة الطالب:' : 'Student note:'} {row.notes}</p> : null}
                    <p className="text-xs">
                      {ar ? `عدد الفريق: ${row.team_size || (row.members || []).length || '—'}` : `Team size: ${row.team_size || (row.members || []).length || '—'}`}
                    </p>
                    {(row.members || []).length ? (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>{ar ? 'الاسم' : 'Name'}</TableHead>
                              <TableHead>{ar ? 'الرقم الجامعي' : 'University ID'}</TableHead>
                              <TableHead>{ar ? 'المعدل' : 'GPA'}</TableHead>
                              <TableHead>{ar ? 'الساعات' : 'Hours'}</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(row.members || []).map((member, index) => (
                              <TableRow key={`${row.id}-member-${index}`}>
                                <TableCell>{member.full_name}</TableCell>
                                <TableCell>{member.university_id}</TableCell>
                                <TableCell>{member.gpa ?? '—'}</TableCell>
                                <TableCell>{member.completed_hours ?? '—'}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ) : null}
                    {row.pdf_url ? (
                      <a
                        href={mediaUrl(row.pdf_url)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs underline"
                        data-testid={`vda-student-request-pdf-${row.id}`}
                      >
                        {ar ? `ملف PDF: ${row.pdf_name || 'تحميل'}` : `PDF: ${row.pdf_name || 'Download'}`}
                      </a>
                    ) : null}
                    {row.vda_note ? <p className="text-xs text-muted-foreground">{ar ? 'ملاحظتك:' : 'Your note:'} {row.vda_note}</p> : null}
                    {row.status === 'pending' || row.status === 'returned' ? (
                      <div className="space-y-2">
                        <textarea
                          rows={2}
                          placeholder={ar ? 'ملاحظات للطالب (إلزامية عند الإعادة)' : 'Note to the student (required when returning)'}
                          value={requestNotes[row.id] || ''}
                          onChange={(e) => setRequestNotes((prev) => ({ ...prev, [row.id]: e.target.value }))}
                          className="flex min-h-[56px] w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" className="rounded-xl" disabled={busy === `req-${row.id}`} onClick={() => decideRequest(row.id, 'approved')}>
                            {ar ? 'موافقة' : 'Approve'}
                          </Button>
                          <Button size="sm" variant="outline" className="rounded-xl" disabled={busy === `req-${row.id}`} onClick={() => decideRequest(row.id, 'rejected')}>
                            {ar ? 'رفض' : 'Reject'}
                          </Button>
                          <Button size="sm" variant="secondary" className="rounded-xl" disabled={busy === `req-${row.id}`} onClick={() => decideRequest(row.id, 'returned')}>
                            {ar ? 'إعادة بملاحظات' : 'Return'}
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            {ar ? 'تسجيل نشر علمي' : 'Register a publication'}
          </CardTitle>
          <CardDescription>
            {ar ? 'يُحتسب في مؤشر اللوحة بعد التسجيل. لا يُنشأ شيء تلقائياً.' : 'It counts on the dashboard after you register it. Nothing is created automatically.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={addPublication} className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1 sm:col-span-2">
              <Label>{ar ? 'العنوان' : 'Title'}</Label>
              <Input required value={pub.title} onChange={(e) => setPub({ ...pub, title: e.target.value })} className="rounded-xl" />
            </div>
            <div className="space-y-1">
              <Label>{ar ? 'المؤلفون' : 'Authors'}</Label>
              <Input value={pub.authors} onChange={(e) => setPub({ ...pub, authors: e.target.value })} className="rounded-xl" />
            </div>
            <div className="space-y-1">
              <Label>{ar ? 'المجلة / المؤتمر' : 'Venue'}</Label>
              <Input value={pub.venue} onChange={(e) => setPub({ ...pub, venue: e.target.value })} className="rounded-xl" />
            </div>
            <div className="space-y-1">
              <Label>{ar ? 'تاريخ النشر' : 'Published on'}</Label>
              <Input type="date" value={pub.published_on} onChange={(e) => setPub({ ...pub, published_on: e.target.value })} className="rounded-xl" />
            </div>
            <div className="flex items-end">
              <Button type="submit" className="rounded-xl" disabled={busy === 'pub'}>{ar ? 'تسجيل' : 'Register'}</Button>
            </div>
          </form>
          {(data?.publications || []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{ar ? 'لا أوراق مسجّلة بعد.' : 'No publications registered yet.'}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{ar ? 'العنوان' : 'Title'}</TableHead>
                  <TableHead>{ar ? 'المؤلفون' : 'Authors'}</TableHead>
                  <TableHead>{ar ? 'الجهة' : 'Venue'}</TableHead>
                  <TableHead>{ar ? 'التاريخ' : 'Date'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.publications.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.title}</TableCell>
                    <TableCell>{row.authors || '—'}</TableCell>
                    <TableCell>{row.venue || '—'}</TableCell>
                    <TableCell>{row.published_on ? String(row.published_on).slice(0, 10) : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="w-4 h-4" />
            {ar ? 'موضوع تخرج ولجنة' : 'Graduation topic and committee'}
          </CardTitle>
          <CardDescription>
            {ar ? 'يُدرج بانتظار اعتمادك. رؤساء الأقسام سيرفعون الطلبات من صفحتهم لاحقاً.' : 'Recorded as pending your approval. Department heads will submit from their page later.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={addProject} className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1 sm:col-span-2">
              <Label>{ar ? 'عنوان الموضوع' : 'Topic title'}</Label>
              <Input required value={project.title} onChange={(e) => setProject({ ...project, title: e.target.value })} className="rounded-xl" />
            </div>
            <div className="space-y-1">
              <Label>{ar ? 'اسم الطالب' : 'Student name'}</Label>
              <Input required value={project.student_name} onChange={(e) => setProject({ ...project, student_name: e.target.value })} className="rounded-xl" />
            </div>
            <div className="space-y-1">
              <Label>{ar ? 'المشرف' : 'Supervisor'}</Label>
              <Input value={project.supervisor_name} onChange={(e) => setProject({ ...project, supervisor_name: e.target.value })} className="rounded-xl" />
            </div>
            <div className="space-y-1">
              <Label>{ar ? 'النوع' : 'Kind'}</Label>
              <select className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm" value={project.kind} onChange={(e) => setProject({ ...project, kind: e.target.value })}>
                {kinds.map((k) => (
                  <option key={k.key} value={k.key}>{ar ? k.ar : k.en}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>{ar ? 'رئيس اللجنة' : 'Committee chair'}</Label>
              <Input value={project.chair} onChange={(e) => setProject({ ...project, chair: e.target.value })} className="rounded-xl" />
            </div>
            <div className="space-y-1">
              <Label>{ar ? 'عضو' : 'Member'}</Label>
              <Input value={project.member} onChange={(e) => setProject({ ...project, member: e.target.value })} className="rounded-xl" />
            </div>
            <div className="space-y-1">
              <Label>{ar ? 'ممتحن خارجي' : 'External examiner'}</Label>
              <Input value={project.external} onChange={(e) => setProject({ ...project, external: e.target.value })} className="rounded-xl" />
            </div>
            <div className="flex items-end">
              <Button type="submit" className="rounded-xl" disabled={busy === 'project'}>{ar ? 'إدراج للمراجعة' : 'Submit for review'}</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="rounded-2xl" data-testid="vda-research-projects">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4" />
            {ar ? 'مواضيع التخرج' : 'Graduation topics'}
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {(data?.projects || []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{ar ? 'لا مواضيع تخرج في السجل بعد.' : 'No graduation topics in the registry yet.'}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{ar ? 'الموضوع' : 'Topic'}</TableHead>
                  <TableHead>{ar ? 'النوع' : 'Kind'}</TableHead>
                  <TableHead>{ar ? 'الطالب' : 'Student'}</TableHead>
                  <TableHead>{ar ? 'المشرف' : 'Supervisor'}</TableHead>
                  <TableHead>{ar ? 'اللجنة' : 'Committee'}</TableHead>
                  <TableHead>{ar ? 'الحالة' : 'Status'}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.projects.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.title}</TableCell>
                    <TableCell>
                      {(() => {
                        const kind = kinds.find((k) => k.key === row.kind);
                        return kind ? (ar ? kind.ar : kind.en) : row.kind;
                      })()}
                    </TableCell>
                    <TableCell>{row.student_name || '—'}</TableCell>
                    <TableCell>{row.supervisor_name || '—'}</TableCell>
                    <TableCell className="text-xs">
                      {(row.committee || []).map((m) => m.full_name).join(' · ') || '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={row.status === 'approved' ? 'default' : row.status === 'rejected' ? 'destructive' : 'outline'}>
                        {statusLabel(row.status, ar)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-end">
                      {row.status === 'pending' ? (
                        <div className="flex justify-end gap-2">
                          <Button size="sm" className="rounded-xl" disabled={busy === `dec-${row.id}`} onClick={() => decide(row.id, 'approved')}>
                            {ar ? 'اعتماد' : 'Approve'}
                          </Button>
                          <Button size="sm" variant="outline" className="rounded-xl" disabled={busy === `dec-${row.id}`} onClick={() => decide(row.id, 'rejected')}>
                            {ar ? 'رفض' : 'Reject'}
                          </Button>
                        </div>
                      ) : null}
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
