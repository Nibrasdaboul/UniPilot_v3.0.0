import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { SharedProfileFields, emptySharedProfile } from './SharedProfileFields';
import { RoleSpecificFields, emptyRoleProfile } from './RoleSpecificFields';

function ymd(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

export function UserDetailDialog({ open, onOpenChange, api, userId, endpoint = 'users', options, departments, roleLabel, ar, onSaved }) {
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !userId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get(`/${endpoint}/${userId}`);
        if (cancelled) return;
        const user = res.data?.user || {};
        const profile = res.data?.profile || {};
        setForm({
          ...emptySharedProfile,
          ...emptyRoleProfile,
          ...user,
          ...profile,
          birth_date: ymd(user.birth_date),
          start_date: ymd(profile.start_date),
          hire_date: ymd(profile.hire_date),
          department_id: user.department_id || profile.department_id || '',
          enrollment_year: user.enrollment_year || '',
          access_permissions: profile.access_permissions || [],
          postgraduate_studying: !!profile.postgraduate_studying,
          avatar_preview: user.avatar_url || '',
          avatar_base64: '',
          password: '',
        });
      } catch (e) {
        toast.error(e.response?.data?.detail || (ar ? 'تعذر فتح الملف' : 'Failed to open file'));
        onOpenChange(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, userId, endpoint]);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.patch(`/${endpoint}/${userId}`, {
        ...form,
        department_id: form.department_id ? Number(form.department_id) : null,
        enrollment_year: form.enrollment_year ? Number(form.enrollment_year) : undefined,
        supervisor_user_id: form.supervisor_user_id ? Number(form.supervisor_user_id) : null,
        postgraduate_studying: !!form.postgraduate_studying,
        password: form.password || undefined,
      });
      toast.success(ar ? 'تم حفظ التعديلات' : 'Changes saved');
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || (ar ? 'فشل الحفظ' : 'Save failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl max-w-2xl">
        <DialogHeader>
          <DialogTitle>{ar ? 'تفاصيل المستخدم' : 'Person details'}</DialogTitle>
        </DialogHeader>
        {!form ? (
          <p className="text-sm text-muted-foreground">{ar ? 'جاري التحميل…' : 'Loading…'}</p>
        ) : (
          <form onSubmit={save} className="space-y-4">
            <div className="rounded-xl border px-3 py-2 text-sm bg-muted/40">
              {(ar ? 'الدور: ' : 'Role: ')}{roleLabel(form.role)} · {form.person_code || form.university_id}
            </div>
            <SharedProfileFields value={form} onChange={(next) => setForm((f) => ({ ...f, ...next }))} options={options} ar={ar} />
            <RoleSpecificFields role={form.role} value={form} onChange={(next) => setForm((f) => ({ ...f, ...next }))} options={options} ar={ar} />
            {departments?.length > 0 && (
              <div className="space-y-1">
                <Label>{ar ? 'القسم' : 'Department'}</Label>
                <select className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm" value={form.department_id || ''} onChange={(e) => setForm((f) => ({ ...f, department_id: e.target.value }))}>
                  <option value="">{ar ? 'بدون' : 'None'}</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{ar ? (d.name_ar || d.name) : (d.name_en || d.name)}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="space-y-1">
              <Label>{ar ? 'كلمة مرور جديدة (اختياري)' : 'New password (optional)'}</Label>
              <Input type="password" minLength={8} value={form.password || ''} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} className="rounded-xl" />
            </div>
            <Button type="submit" disabled={busy} className="w-full rounded-xl">
              {busy ? '...' : (ar ? 'حفظ التعديلات' : 'Save changes')}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
