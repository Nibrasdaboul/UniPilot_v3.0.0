import { useEffect, useState } from 'react';
import { Users as UsersIcon, Plus, Copy } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/lib/AuthContext';
import { useLanguage } from '@/lib/LanguageContext';
import { toast } from 'sonner';
import { SharedProfileFields, emptySharedProfile } from '@/components/users/SharedProfileFields';
import { RoleSpecificFields, emptyRoleProfile } from '@/components/users/RoleSpecificFields';
import { UserCard } from '@/components/users/UserCard';
import { PeopleSearch, matchesPerson } from '@/components/users/PeopleSearch';
import { UserDetailDialog } from '@/components/users/UserDetailDialog';

export default function UsersDirectory() {
  const { api, user, canManageUsers } = useAuth();
  const { language } = useLanguage();
  const ar = language === 'ar';
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [labels, setLabels] = useState({ ar: {}, en: {} });
  const [departments, setDepartments] = useState([]);
  const [profileOptions, setProfileOptions] = useState({ genders: [], account_statuses: [] });
  const [open, setOpen] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [nameQuery, setNameQuery] = useState('');
  const [roleQuery, setRoleQuery] = useState('');
  const [createdId, setCreatedId] = useState('');
  const [form, setForm] = useState({
    ...emptySharedProfile,
    ...emptyRoleProfile,
    role: '',
    password: '',
    department_id: '',
    enrollment_year: String(new Date().getFullYear()),
  });

  const roleLabel = (role) => (ar ? labels.ar?.[role] : labels.en?.[role]) || role;

  const load = async () => {
    try {
      const [listRes, rolesRes, deptRes, optRes] = await Promise.all([
        api.get('/users'),
        api.get('/users/roles'),
        api.get('/users/departments'),
        api.get('/users/profile-options'),
      ]);
      setUsers(listRes.data || []);
      const directoryRoles = (rolesRes.data?.creatable_roles || []).filter((r) => r !== 'student');
      setRoles(directoryRoles);
      setLabels(rolesRes.data?.labels || { ar: {}, en: {} });
      setDepartments(deptRes.data || []);
      setProfileOptions(optRes.data || { genders: [], account_statuses: [], supervisors: [] });
      setForm((f) => ({ ...f, role: directoryRoles.includes(f.role) ? f.role : (directoryRoles[0] || '') }));
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'تعذر تحميل المستخدمين' : 'Failed to load users'));
    }
  };

  useEffect(() => {
    if (canManageUsers) load();
  }, [canManageUsers]);

  const submit = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/users', {
        ...form,
        role: form.role,
        password: form.password,
        department_id: form.department_id ? Number(form.department_id) : null,
        enrollment_year: form.enrollment_year ? Number(form.enrollment_year) : undefined,
        supervisor_user_id: form.supervisor_user_id ? Number(form.supervisor_user_id) : null,
        postgraduate_studying: !!form.postgraduate_studying,
      });
      const uid = res.data?.university_id;
      setCreatedId(uid);
      toast.success(ar ? `تم إنشاء المعرّف: ${uid}` : `Created ID: ${uid}`);
      setForm({
        ...emptySharedProfile,
        ...emptyRoleProfile,
        role: roles[0] || '',
        password: '',
        department_id: '',
        enrollment_year: String(new Date().getFullYear()),
      });
      setOpen(false);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'فشل إنشاء المستخدم' : 'Failed to create user'));
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

  if (!canManageUsers) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">{ar ? 'ليست لديك صلاحية إدارة المستخدمين.' : 'You cannot manage users.'}</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UsersIcon className="w-6 h-6" />
            {ar ? 'المستخدمون' : 'People'}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {ar
              ? 'إنشاء الموظفين والتدريس من هنا. تسجيل الطالب يتم فقط من شؤون الطلاب.'
              : 'Staff and teaching accounts are created here. Students are registered only from Student Affairs.'}
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="rounded-xl gap-2">
              <Plus className="w-4 h-4" />
              {ar ? 'مستخدم جديد' : 'New user'}
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-2xl max-w-2xl">
            <DialogHeader>
              <DialogTitle>{ar ? 'إنشاء مستخدم' : 'Create user'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label>{ar ? 'الدور أولاً' : 'Role first'}</Label>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder={ar ? 'اختر الدور' : 'Choose a role'} />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((r) => (
                      <SelectItem key={r} value={r}>{roleLabel(r)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {form.role && (
                <>
                <SharedProfileFields
                  value={form}
                  onChange={(next) => setForm((f) => ({ ...f, ...next }))}
                  options={profileOptions}
                  ar={ar}
                />
                <RoleSpecificFields
                  role={form.role}
                  value={form}
                  onChange={(next) => setForm((f) => ({ ...f, ...next }))}
                  options={profileOptions}
                  ar={ar}
                />
              <div className="space-y-2">
                <Label>{ar ? 'القسم (اختياري)' : 'Department (optional)'}</Label>
                <Select
                  value={form.department_id || 'none'}
                  onValueChange={(v) => setForm({ ...form, department_id: v === 'none' ? '' : v })}
                >
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{ar ? 'بدون' : 'None'}</SelectItem>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={String(d.id)}>
                        {ar ? d.name_ar : d.name_en}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{ar ? 'سنة التسجيل / التعيين' : 'Enrollment / hire year'}</Label>
                <Input
                  type="number"
                  min="2000"
                  max="2099"
                  required
                  value={form.enrollment_year}
                  onChange={(e) => setForm({ ...form, enrollment_year: e.target.value })}
                  className="rounded-xl"
                />
                <p className="text-xs text-muted-foreground">
                  {ar ? '2022 تصبح بادئة المعرّف 022' : '2022 becomes ID prefix 022'}
                </p>
              </div>
              <div className="space-y-2">
                <Label>{ar ? 'كلمة المرور الأولية' : 'Initial password'}</Label>
                <Input
                  type="password"
                  required
                  minLength={8}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="rounded-xl"
                />
              </div>
              <Button type="submit" className="w-full rounded-xl">
                {ar ? 'إنشاء وتوليد المعرّف' : 'Create and generate ID'}
              </Button>
                </>
              )}
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {createdId && (
        <Card className="border-primary/40">
          <CardHeader>
            <CardTitle className="text-base">{ar ? 'آخر معرّف تم توليده' : 'Last generated ID'}</CardTitle>
            <CardDescription>{ar ? 'سلّم هذا المعرّف للمستخدم مع كلمة المرور الأولية.' : 'Give this ID and the initial password to the user.'}</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            <code className="text-lg font-bold tracking-wider">{createdId}</code>
            <Button variant="ghost" size="icon" onClick={() => copyId(createdId)}>
              <Copy className="w-4 h-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{ar ? 'الدليل' : 'Directory'}</CardTitle>
          <CardDescription>
            {ar ? `تسجيل الدخول كـ ${user?.full_name} — يمكنك إنشاء: ${roles.map(roleLabel).join('، ') || '—'}` : `Signed in as ${user?.full_name} — you can create: ${roles.map(roleLabel).join(', ') || '—'}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <PeopleSearch
            name={nameQuery}
            role={roleQuery}
            roles={[...new Set(users.map((u) => u.role).filter(Boolean))]}
            roleLabel={roleLabel}
            onName={setNameQuery}
            onRole={setRoleQuery}
            ar={ar}
          />
          {users.filter((u) => matchesPerson(u, nameQuery, roleQuery)).length === 0 ? (
            <p className="text-sm text-muted-foreground">{ar ? 'لا نتائج.' : 'No matches.'}</p>
          ) : (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {users.filter((u) => matchesPerson(u, nameQuery, roleQuery)).map((u) => (
                <UserCard
                  key={u.id}
                  person={u}
                  roleLabel={roleLabel(u.role)}
                  subtitle={ar ? (u.department_name_ar || u.department_name) : (u.department_name || u.department_name_ar)}
                  onClick={() => setDetailId(u.id)}
                  ar={ar}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <UserDetailDialog
        open={!!detailId}
        onOpenChange={(v) => { if (!v) setDetailId(null); }}
        api={api}
        userId={detailId}
        endpoint="users"
        options={profileOptions}
        departments={departments}
        roleLabel={roleLabel}
        ar={ar}
        onSaved={load}
      />
    </div>
  );
}
