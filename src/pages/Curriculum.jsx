import { useEffect, useState } from 'react';
import { FolderTree, Plus } from 'lucide-react';
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
import { toast } from 'sonner';

const emptyForm = {
  course_code: '',
  course_name: '',
  department_id: '',
  credit_hours: 3,
  order: 1,
  prerequisite_id: 'none',
};

export default function Curriculum() {
  const { api, canManageCurriculum } = useAuth();
  const { language } = useLanguage();
  const ar = language === 'ar';
  const [courses, setCourses] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [term, setTerm] = useState(null);
  const [offerings, setOfferings] = useState([]);
  const [uniCourses, setUniCourses] = useState([]);
  const [offerCourseId, setOfferCourseId] = useState('');
  const [offerCapacity, setOfferCapacity] = useState('80');
  const [departments, setDepartments] = useState([]);

  const load = async () => {
    try {
      const [res, termRes, offRes, uniRes, deptRes] = await Promise.all([
        api.get('/catalog/courses'),
        api.get('/academic/terms/current').catch(() => ({ data: null })),
        api.get('/academic/offerings').catch(() => ({ data: [] })),
        api.get('/academic/uni-courses').catch(() => ({ data: [] })),
        api.get('/users/departments').catch(() => ({ data: [] })),
      ]);
      setCourses(Array.isArray(res.data) ? res.data : []);
      setTerm(termRes.data || null);
      setOfferings(Array.isArray(offRes.data) ? offRes.data : []);
      setUniCourses(Array.isArray(uniRes.data) ? uniRes.data : []);
      setDepartments(Array.isArray(deptRes.data) ? deptRes.data : []);
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'تعذر تحميل الخطة' : 'Failed to load curriculum'));
    }
  };

  useEffect(() => { load(); }, []);

  const prereqName = (id) => {
    if (!id) return '—';
    const c = courses.find((x) => Number(x.id) === Number(id));
    return c ? `${c.course_code}` : `#${id}`;
  };

  const submit = async (e) => {
    e.preventDefault();
    const payload = {
      course_code: form.course_code,
      course_name: form.course_name,
      department_id: Number(form.department_id),
      credit_hours: Number(form.credit_hours) || 3,
      order: Number(form.order) || 1,
      prerequisite_id: form.prerequisite_id === 'none' ? null : Number(form.prerequisite_id),
    };
    try {
      if (editing) {
        await api.patch(`/catalog/courses/${editing.id}`, payload);
        toast.success(ar ? 'تم تحديث المادة في الخطة' : 'Curriculum course updated');
      } else {
        await api.post('/catalog/courses', payload);
        toast.success(ar ? 'تمت إضافة المادة للخطة' : 'Course added to curriculum');
      }
      setOpen(false);
      setEditing(null);
      setForm(emptyForm);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'فشل الحفظ' : 'Save failed'));
    }
  };

  const remove = async (id) => {
    if (!confirm(ar ? 'حذف هذه المادة من الخطة؟' : 'Remove this course from the curriculum?')) return;
    try {
      await api.delete(`/catalog/courses/${id}`);
      toast.success(ar ? 'تم الحذف' : 'Deleted');
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'فشل الحذف' : 'Delete failed'));
    }
  };

  const addOffering = async (e) => {
    e.preventDefault();
    if (!term?.id || !offerCourseId) return;
    try {
      await api.post('/academic/offerings', {
        uni_course_id: Number(offerCourseId),
        term_id: term.id,
        capacity: Number(offerCapacity) || 80,
      });
      toast.success(ar ? 'أُضيفت الشعبة للفصل الحالي' : 'Offering added to the current term');
      setOfferCourseId('');
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'فشل إضافة الشعبة' : 'Failed to add offering'));
    }
  };

  const removeOffering = async (id) => {
    if (!confirm(ar ? 'إلغاء هذه الشعبة؟' : 'Remove this offering?')) return;
    try {
      await api.delete(`/academic/offerings/${id}`);
      toast.success(ar ? 'أُلغيت الشعبة' : 'Offering removed');
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'فشل الإلغاء' : 'Failed'));
    }
  };

  const offeredIds = new Set(offerings.map((o) => Number(o.uni_course_id)));
  const availableUni = uniCourses.filter((c) => !offeredIds.has(Number(c.id)));

  if (!canManageCurriculum) {
    return (
      <div className="p-6 text-muted-foreground">
        {ar ? 'شجرة المواد والخطة الدراسية من صلاحية الإدارة العليا / الشؤون الأكاديمية.' : 'The curriculum tree is owned by academic administration.'}
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FolderTree className="w-6 h-6" />
            {ar ? 'الخطة وشجرة المواد' : 'Curriculum tree'}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {ar ? 'المتطلبات والمسارات ملك الإدارة. الطالب يشاهد فقط.' : 'Prerequisites belong to administration. Students only view the tree.'}
          </p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditing(null); setForm(emptyForm); } }}>
          <DialogTrigger asChild>
            <Button className="rounded-xl gap-2"><Plus className="w-4 h-4" />{ar ? 'مادة في الخطة' : 'Add course'}</Button>
          </DialogTrigger>
          <DialogContent className="rounded-2xl max-w-md">
            <DialogHeader>
              <DialogTitle>{editing ? (ar ? 'تعديل مادة' : 'Edit course') : (ar ? 'إضافة مادة' : 'Add course')}</DialogTitle>
            </DialogHeader>
            <form onSubmit={submit} className="space-y-3">
              <div className="space-y-1">
                <Label>{ar ? 'رمز المادة' : 'Code'}</Label>
                <Input required value={form.course_code} onChange={(e) => setForm({ ...form, course_code: e.target.value })} className="rounded-xl" />
              </div>
              <div className="space-y-1">
                <Label>{ar ? 'اسم المادة' : 'Name'}</Label>
                <Input required value={form.course_name} onChange={(e) => setForm({ ...form, course_name: e.target.value })} className="rounded-xl" />
              </div>
              <div className="space-y-1">
                <Label>{ar ? 'القسم' : 'Department'}</Label>
                <Select value={form.department_id} onValueChange={(v) => setForm({ ...form, department_id: v })}>
                  <SelectTrigger className="rounded-xl"><SelectValue placeholder={ar ? 'اختر القسم' : 'Choose department'} /></SelectTrigger>
                  <SelectContent>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={String(d.id)}>{ar ? (d.name_ar || d.name) : (d.name_en || d.name)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{ar ? 'ساعات' : 'Credits'}</Label>
                  <Input type="number" min="1" value={form.credit_hours} onChange={(e) => setForm({ ...form, credit_hours: e.target.value })} className="rounded-xl" />
                </div>
                <div className="space-y-1">
                  <Label>{ar ? 'الترتيب' : 'Order'}</Label>
                  <Input type="number" min="1" value={form.order} onChange={(e) => setForm({ ...form, order: e.target.value })} className="rounded-xl" />
                </div>
              </div>
              <div className="space-y-1">
                <Label>{ar ? 'المتطلب السابق' : 'Prerequisite'}</Label>
                <Select value={form.prerequisite_id} onValueChange={(v) => setForm({ ...form, prerequisite_id: v })}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{ar ? 'بدون' : 'None'}</SelectItem>
                    {courses.filter((c) => !editing || c.id !== editing.id).map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.course_code} — {c.course_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full rounded-xl">{ar ? 'حفظ' : 'Save'}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{ar ? 'طرح الشعب للفصل الحالي' : 'Offer courses this term'}</CardTitle>
          <CardDescription>
            {term
              ? (ar ? `الفصل: ${term.name}` : `Term: ${term.name}`)
              : (ar ? 'افتح فصلاً من التقويم الأكاديمي أولاً.' : 'Open a term from the academic calendar first.')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {term && (
            <form onSubmit={addOffering} className="grid sm:grid-cols-4 gap-3 items-end">
              <div className="space-y-1 sm:col-span-2">
                <Label>{ar ? 'المادة' : 'Course'}</Label>
                <select
                  required
                  className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
                  value={offerCourseId}
                  onChange={(e) => setOfferCourseId(e.target.value)}
                >
                  <option value="">{ar ? 'اختر مادة' : 'Select a course'}</option>
                  {availableUni.map((c) => (
                    <option key={c.id} value={c.id}>{c.course_code} — {c.course_name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label>{ar ? 'السعة' : 'Capacity'}</Label>
                <Input type="number" min="1" value={offerCapacity} onChange={(e) => setOfferCapacity(e.target.value)} className="rounded-xl" />
              </div>
              <Button type="submit" className="rounded-xl gap-2" disabled={!offerCourseId}>
                <Plus className="w-4 h-4" />
                {ar ? 'طرح' : 'Offer'}
              </Button>
            </form>
          )}
          {(offerings || []).length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{ar ? 'الرمز' : 'Code'}</TableHead>
                  <TableHead>{ar ? 'المادة' : 'Course'}</TableHead>
                  <TableHead>{ar ? 'المقاعد' : 'Seats'}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {offerings.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono">{o.course_code}</TableCell>
                    <TableCell>{o.course_name}</TableCell>
                    <TableCell>{o.enrolled_count ?? 0} / {o.capacity}</TableCell>
                    <TableCell className="text-end">
                      {!o.enrolled_count && (
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeOffering(o.id)}>
                          {ar ? 'إلغاء الطرح' : 'Un-offer'}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{ar ? 'مواد الخطة' : 'Plan courses'}</CardTitle>
          <CardDescription>{ar ? 'هذا ما يظهر للطالب في شجرة المواد.' : 'This is what students see on the subject tree.'}</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{ar ? 'الرمز' : 'Code'}</TableHead>
                <TableHead>{ar ? 'الاسم' : 'Name'}</TableHead>
                <TableHead>{ar ? 'القسم' : 'Dept'}</TableHead>
                <TableHead>{ar ? 'المتطلب' : 'Prereq'}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {courses.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono">{c.course_code}</TableCell>
                  <TableCell>{c.course_name}</TableCell>
                  <TableCell>{c.department}</TableCell>
                  <TableCell>{prereqName(c.prerequisite_id)}</TableCell>
                  <TableCell className="text-end space-x-2 space-s-2">
                    <Button size="sm" variant="outline" onClick={() => {
                      setEditing(c);
                      setForm({
                        course_code: c.course_code,
                        course_name: c.course_name,
                        department_id: c.department_id != null ? String(c.department_id) : '',
                        credit_hours: c.credit_hours,
                        order: c.order,
                        prerequisite_id: c.prerequisite_id ? String(c.prerequisite_id) : 'none',
                      });
                      setOpen(true);
                    }}>{ar ? 'تعديل' : 'Edit'}</Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(c.id)}>{ar ? 'حذف' : 'Delete'}</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
