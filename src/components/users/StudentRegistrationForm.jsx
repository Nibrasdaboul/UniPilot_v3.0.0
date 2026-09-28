import { useEffect, useState } from 'react';
import { Copy } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { SharedProfileFields, emptySharedProfile } from './SharedProfileFields';
import { UserCard } from './UserCard';
import { PeopleSearch, matchesPerson } from './PeopleSearch';
import { UserDetailDialog } from './UserDetailDialog';

const emptyStudent = {
  ...emptySharedProfile,
  role: 'student',
  password: '',
  enrollment_year: String(new Date().getFullYear()),
  department_id: '',
  major: '',
  study_year: '1',
  admission_type: 'general',
  academic_status: 'new',
  high_school_score: '',
  high_school_track: '',
  high_school_year: '',
  emergency_name: '',
  emergency_relation: '',
  emergency_phone: '',
};

export default function StudentRegistrationForm({ api, ar }) {
  const [options, setOptions] = useState(null);
  const [students, setStudents] = useState([]);
  const [form, setForm] = useState(emptyStudent);
  const [createdId, setCreatedId] = useState('');
  const [busy, setBusy] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [nameQuery, setNameQuery] = useState('');
  const [roleQuery, setRoleQuery] = useState('');

  const load = async () => {
    try {
      const [optRes, listRes] = await Promise.all([
        api.get('/affairs/registration-options'),
        api.get('/affairs/students'),
      ]);
      setOptions(optRes.data);
      setStudents(listRes.data || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'تعذر تحميل خيارات التسجيل' : 'Failed to load registration options'));
    }
  };

  useEffect(() => { load(); }, []);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.post('/affairs/students', {
        ...form,
        role: 'student',
        department_id: form.department_id ? Number(form.department_id) : null,
        study_year: form.study_year ? Number(form.study_year) : null,
        enrollment_year: form.enrollment_year ? Number(form.enrollment_year) : undefined,
        high_school_score: form.high_school_score === '' ? null : Number(form.high_school_score),
        high_school_year: form.high_school_year === '' ? null : Number(form.high_school_year),
      });
      const uid = res.data?.university_id;
      setCreatedId(uid);
      toast.success(ar ? `تم تسجيل الطالب: ${uid}` : `Student registered: ${uid}`);
      setForm({ ...emptyStudent, enrollment_year: String(new Date().getFullYear()) });
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'فشل تسجيل الطالب' : 'Failed to register student'));
    } finally {
      setBusy(false);
    }
  };

  const copyId = async (id) => {
    try {
      await navigator.clipboard.writeText(id);
      toast.success(ar ? 'تم نسخ المعرّف' : 'ID copied');
    } catch {
      toast.error(id);
    }
  };

  const labelOf = (list, key) => {
    const row = (list || []).find((x) => x.key === key);
    if (!row) return key || '—';
    return ar ? row.ar : row.en;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{ar ? 'تسجيل طالب جديد' : 'Register a student'}</CardTitle>
        <CardDescription>
          {ar
            ? 'هذا النموذج يظهر لقسم شؤون الطلاب فقط. الدور ثابت: طالب. المعدل والساعات تُحسب لاحقاً من السجل الرسمي.'
            : 'Only Student Affairs can use this form. Role is fixed to student. GPA and credits come later from official records.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <form onSubmit={submit} className="space-y-5">
          <div className="rounded-xl border border-border px-3 py-2 text-sm bg-muted/40">
            {ar ? 'الدور: طالب — لا يمكن تغييره من هنا.' : 'Role: Student — cannot be changed here.'}
          </div>

          <SharedProfileFields
            value={form}
            onChange={(next) => setForm((f) => ({ ...f, ...next }))}
            options={options}
            ar={ar}
          />

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>{ar ? 'الكلية' : 'College'}</Label>
              <Input readOnly value={options?.college?.name || (ar ? 'كلية النظام الحالية' : 'Current college')} className="rounded-xl bg-muted/40" />
            </div>
            <div className="space-y-1">
              <Label>{ar ? 'القسم' : 'Department'}</Label>
              <select className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm" value={form.department_id} onChange={(e) => set({ department_id: e.target.value })}>
                <option value="">{ar ? 'اختر' : 'Select'}</option>
                {(options?.departments || []).map((d) => (
                  <option key={d.id} value={d.id}>{ar ? d.name_ar : d.name_en}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>{ar ? 'التخصص' : 'Major'}</Label>
              <Input value={form.major} onChange={(e) => set({ major: e.target.value })} className="rounded-xl" />
            </div>
            <div className="space-y-1">
              <Label>{ar ? 'السنة الدراسية' : 'Study year'}</Label>
              <Input type="number" min="1" max="8" value={form.study_year} onChange={(e) => set({ study_year: e.target.value })} className="rounded-xl" />
            </div>
            <div className="space-y-1">
              <Label>{ar ? 'نوع القبول' : 'Admission type'}</Label>
              <select className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm" value={form.admission_type} onChange={(e) => set({ admission_type: e.target.value })}>
                {(options?.admission_types || []).map((t) => (
                  <option key={t.key} value={t.key}>{ar ? t.ar : t.en}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>{ar ? 'الحالة الأكاديمية' : 'Academic status'}</Label>
              <select className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm" value={form.academic_status} onChange={(e) => set({ academic_status: e.target.value })}>
                {(options?.academic_statuses || []).map((t) => (
                  <option key={t.key} value={t.key}>{ar ? t.ar : t.en}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>{ar ? 'سنة التسجيل (بادئة المعرّف)' : 'Enrollment year (ID prefix)'}</Label>
              <Input type="number" min="2000" max="2099" required value={form.enrollment_year} onChange={(e) => set({ enrollment_year: e.target.value })} className="rounded-xl" />
            </div>
            <div className="space-y-1">
              <Label>{ar ? 'كلمة المرور الأولية' : 'Initial password'}</Label>
              <Input type="password" required minLength={8} value={form.password} onChange={(e) => set({ password: e.target.value })} className="rounded-xl" />
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>{ar ? 'مجموع الثانوية' : 'High-school score'}</Label>
              <Input type="number" min="0" max="300" step="0.01" value={form.high_school_score} onChange={(e) => set({ high_school_score: e.target.value })} className="rounded-xl" />
            </div>
            <div className="space-y-1">
              <Label>{ar ? 'فرع الثانوية' : 'High-school track'}</Label>
              <select className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm" value={form.high_school_track} onChange={(e) => set({ high_school_track: e.target.value })}>
                <option value="">{ar ? '—' : '—'}</option>
                {(options?.high_school_tracks || []).map((t) => (
                  <option key={t.key} value={t.key}>{ar ? t.ar : t.en}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>{ar ? 'سنة الثانوية' : 'High-school year'}</Label>
              <Input type="number" min="1990" max="2099" value={form.high_school_year} onChange={(e) => set({ high_school_year: e.target.value })} className="rounded-xl" />
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>{ar ? 'جهة اتصال للطوارئ' : 'Emergency contact'}</Label>
              <Input value={form.emergency_name} onChange={(e) => set({ emergency_name: e.target.value })} className="rounded-xl" />
            </div>
            <div className="space-y-1">
              <Label>{ar ? 'صلة القرابة' : 'Relation'}</Label>
              <Input value={form.emergency_relation} onChange={(e) => set({ emergency_relation: e.target.value })} className="rounded-xl" />
            </div>
            <div className="space-y-1">
              <Label>{ar ? 'هاتف الطوارئ' : 'Emergency phone'}</Label>
              <Input value={form.emergency_phone} onChange={(e) => set({ emergency_phone: e.target.value })} className="rounded-xl" />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            {ar ? 'المعدل التراكمي والساعات المنجزة لا تُدخل هنا.' : 'GPA and completed credits are not entered here.'}
          </p>

          <Button type="submit" disabled={busy} className="rounded-xl">
            {busy ? '...' : (ar ? 'تسجيل الطالب وتوليد المعرّف' : 'Register student and generate ID')}
          </Button>
        </form>

        {createdId && (
          <div className="flex items-center gap-2 rounded-xl border border-primary/40 p-3">
            <code className="text-lg font-bold tracking-wider">{createdId}</code>
            <Button type="button" variant="ghost" size="icon" onClick={() => copyId(createdId)}>
              <Copy className="w-4 h-4" />
            </Button>
          </div>
        )}

        <div className="space-y-3">
          <h3 className="text-sm font-semibold">{ar ? 'سجلات الطلاب' : 'Student records'}</h3>
          <PeopleSearch
            name={nameQuery}
            role={roleQuery}
            roles={['student']}
            roleLabel={() => (ar ? 'طالب' : 'Student')}
            onName={setNameQuery}
            onRole={setRoleQuery}
            ar={ar}
          />
          {students.filter((s) => matchesPerson({ ...s, role: s.role || 'student' }, nameQuery, roleQuery)).length === 0 ? (
            <p className="text-sm text-muted-foreground">{ar ? 'لا نتائج.' : 'No matches.'}</p>
          ) : (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {students.filter((s) => matchesPerson({ ...s, role: s.role || 'student' }, nameQuery, roleQuery)).map((s) => (
                <UserCard
                  key={s.id}
                  person={s}
                  roleLabel={ar ? 'طالب' : 'Student'}
                  subtitle={[labelOf(options?.admission_types, s.admission_type), labelOf(options?.academic_statuses, s.academic_status), s.major].filter(Boolean).join(' · ')}
                  onClick={() => setDetailId(s.id)}
                  ar={ar}
                />
              ))}
            </div>
          )}
        </div>

        <UserDetailDialog
          open={!!detailId}
          onOpenChange={(v) => { if (!v) setDetailId(null); }}
          api={api}
          userId={detailId}
          endpoint="affairs/students"
          options={options}
          departments={options?.departments || []}
          roleLabel={() => (ar ? 'طالب' : 'Student')}
          ar={ar}
          onSaved={load}
        />
      </CardContent>
    </Card>
  );
}
