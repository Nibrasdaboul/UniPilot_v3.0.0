import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CalendarDays, GraduationCap, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/AuthContext';
import { useLanguage } from '@/lib/LanguageContext';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { clearRegistrationCart, readRegistrationCart, removeFromRegistrationCart } from '@/lib/registrationCart';
import { buildPickerGrid, coursePickerColor, PICKER_DAYS, halfHourSlots, findPickerClashes, formatClashMessage } from '@/lib/sectionPicker';

function sectionLabel(section, ar) {
  const seats = `${section.picked_count || 0}/${section.capacity || 0}`;
  return `${section.code || (ar ? 'شعبة' : 'Section')} (${seats})`;
}

const selectClass = 'mt-1 flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm';

export default function RegistrationSections() {
  const { api } = useAuth();
  const { language } = useLanguage();
  const ar = language === 'ar';
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [cart, setCart] = useState(() => readRegistrationCart());
  const [picks, setPicks] = useState({});
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const res = await api.get('/academic/registration');
      setData(res.data || null);
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'تعذر تحميل الشعب' : 'Failed to load sections'));
    }
  };

  useEffect(() => { load(); }, []);

  const courses = useMemo(() => {
    const all = data?.courses || [];
    const ids = new Set(cart);
    return all.filter((course) => ids.has(Number(course.id)) && course.offered);
  }, [data, cart]);

  useEffect(() => {
    if (!courses.length) return;
    setPicks((prev) => {
      const next = { ...prev };
      for (const course of courses) {
        const current = next[course.id] || {};
        const theory = (course.sections || []).filter((s) => s.kind === 'theory');
        const practical = (course.sections || []).filter((s) => s.kind === 'practical');
        next[course.id] = {
          theory: current.theory || (theory[0] ? String(theory[0].id) : ''),
          practical: current.practical || (practical[0] ? String(practical[0].id) : ''),
        };
      }
      return next;
    });
  }, [courses]);

  const placements = useMemo(() => {
    const list = [];
    for (const course of courses) {
      const color = coursePickerColor(course.id);
      const choice = picks[course.id] || {};
      const selected = (course.sections || []).filter((s) => (
        String(s.id) === String(choice.theory) || String(s.id) === String(choice.practical)
      ));
      for (const section of selected) {
        for (const meeting of section.meetings || []) {
          list.push({
            ...meeting,
            kind: section.kind,
            color,
            course_code: course.course_code,
            section_id: section.id,
            section_code: section.code,
          });
        }
      }
    }
    return list;
  }, [courses, picks]);

  const clashes = useMemo(() => findPickerClashes(placements), [placements]);
  const clashMessage = useMemo(() => formatClashMessage(clashes, ar), [clashes, ar]);
  const grid = useMemo(
    () => buildPickerGrid({ placements, days: PICKER_DAYS, slots: halfHourSlots() }),
    [placements],
  );

  const removeCourse = (id) => {
    setCart(removeFromRegistrationCart(id));
  };

  const confirm = async () => {
    if (!data?.can_enroll) {
      toast.error(ar ? 'نافذة التسجيل مغلقة' : 'Registration window is closed');
      return;
    }
    if (clashes.length) {
      toast.error(clashMessage);
      return;
    }
    setBusy(true);
    try {
      const items = courses.map((course) => ({
        offering_id: course.offering_id,
        theory_section_id: picks[course.id]?.theory || null,
        practical_section_id: picks[course.id]?.practical || null,
      }));
      await api.post('/academic/registration/sections', { items });
      clearRegistrationCart();
      toast.success(ar ? 'تم اختيار الشعب' : 'Sections saved');
      navigate('/weekly-program');
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'فشل تأكيد التسجيل' : 'Could not confirm registration'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6" data-testid="registration-sections-page">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-display tracking-tight flex items-center gap-2">
            <CalendarDays className="w-6 h-6 text-primary" />
            {ar ? 'اختيار الشعب' : 'Choose sections'}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {ar
              ? 'اختر الشعبة النظرية والعملية. الجدول يتحدث حسب جدول العميد ونائب الأكاديمي.'
              : 'Pick theory and practical sections. The weekly grid follows the dean / academic vice dean timetable.'}
          </p>
        </div>
        <Button variant="outline" className="rounded-xl shrink-0" asChild>
          <Link to="/registration">
            <ArrowRight className="w-4 h-4 rtl-flip" />
            {ar ? 'رجوع' : 'Back'}
          </Link>
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-4 lg:order-1 order-2" data-testid="section-picker-courses">
          {courses.length === 0 ? (
            <Card className="rounded-[2rem] border shadow-sm bg-card/50 backdrop-blur-sm">
              <CardContent className="p-8 text-sm text-muted-foreground">
                {ar
                  ? 'لا مواد مختارة. ارجع واضغط اختيار المادة ثم تسجيل الشعب أسفل الصفحة.'
                  : 'No courses selected. Go back, tap Select course, then Register sections at the bottom.'}
              </CardContent>
            </Card>
          ) : courses.map((course) => {
            const color = coursePickerColor(course.id);
            const theory = (course.sections || []).filter((s) => s.kind === 'theory');
            const practical = (course.sections || []).filter((s) => s.kind === 'practical');
            return (
              <Card
                key={course.id}
                className="rounded-[2rem] border shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden bg-card/50 backdrop-blur-sm"
              >
                <CardHeader className="p-6 pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-12 h-12 rounded-2xl flex items-center justify-center text-slate-900 shrink-0"
                        style={{ background: color }}
                      >
                        <GraduationCap className="w-6 h-6" />
                      </div>
                      <div className="space-y-1">
                        <Badge variant="secondary" className="rounded-full text-[10px] font-bold tracking-widest uppercase py-0.5 px-2">
                          {course.course_code}
                        </Badge>
                        <CardTitle className="text-lg font-display">{course.course_name}</CardTitle>
                      </div>
                    </div>
                    <Button size="icon" variant="ghost" className="rounded-full text-rose-500" onClick={() => removeCourse(course.id)}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="px-6 pb-6 space-y-3">
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {ar ? 'الفئة النظرية' : 'Theory section'}
                    </Label>
                    <select
                      className={selectClass}
                      data-testid={`section-theory-${course.course_code}`}
                      value={picks[course.id]?.theory || ''}
                      onChange={(e) => setPicks((prev) => ({ ...prev, [course.id]: { ...prev[course.id], theory: e.target.value } }))}
                    >
                      <option value="">{ar ? 'بدون' : 'None'}</option>
                      {theory.map((s) => (
                        <option key={s.id} value={s.id}>{sectionLabel(s, ar)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {ar ? 'الفئة العملية' : 'Practical section'}
                    </Label>
                    <select
                      className={selectClass}
                      data-testid={`section-practical-${course.course_code}`}
                      value={picks[course.id]?.practical || ''}
                      onChange={(e) => setPicks((prev) => ({ ...prev, [course.id]: { ...prev[course.id], practical: e.target.value } }))}
                    >
                      <option value="">{ar ? 'بدون' : 'None'}</option>
                      {practical.map((s) => (
                        <option key={s.id} value={s.id}>{sectionLabel(s, ar)}</option>
                      ))}
                    </select>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {clashMessage ? (
            <div
              className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 space-y-1"
              data-testid="section-clash-alert"
            >
              <p className="font-semibold flex items-center gap-2 text-destructive">
                <AlertTriangle className="w-4 h-4" />
                {ar ? 'تعارض في الشعب' : 'Section clash'}
              </p>
              <p className="text-sm text-muted-foreground">{clashMessage}</p>
            </div>
          ) : null}
          <Button
            className="w-full rounded-2xl h-12 font-bold text-base shadow-lg"
            disabled={busy || !courses.length || !data?.can_enroll || clashes.length > 0}
            onClick={confirm}
            data-testid="section-confirm"
          >
            {ar ? 'تأكيد التسجيل' : 'Confirm registration'}
          </Button>
        </div>

        <Card className="rounded-[2rem] border shadow-sm overflow-hidden bg-card/50 backdrop-blur-sm lg:order-2 order-1">
          <CardHeader className="p-6 pb-3">
            <CardTitle className="text-lg font-display">{ar ? 'الجدول الأسبوعي' : 'Weekly grid'}</CardTitle>
            <CardDescription>
              {ar ? 'سبت إلى جمعة · كل 30 دقيقة · ن نظري / ع عملي' : 'Saturday to Friday · every 30 minutes · ن theory / ع practical'}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="overflow-x-auto rounded-2xl border border-border/60" data-testid="section-picker-grid">
              <table className="w-full min-w-[720px] text-xs border-collapse">
                <thead>
                  <tr className="bg-muted/40">
                    <th className="sticky start-0 z-10 bg-muted/80 backdrop-blur-sm border-b border-e border-border/60 p-2.5 text-start font-semibold">
                      {ar ? 'الوقت / اليوم' : 'Time / day'}
                    </th>
                    {grid.days.map((day) => (
                      <th key={day.key} className="border-b border-border/60 p-2.5 font-semibold text-muted-foreground">
                        {ar ? day.ar : day.en}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {grid.slots.map((slot, slotIndex) => (
                    <tr key={slot.label} className="odd:bg-muted/10">
                      <td className="sticky start-0 z-10 bg-card/95 backdrop-blur-sm border-e border-b border-border/40 p-2 whitespace-nowrap font-mono text-muted-foreground">
                        {slot.label}
                      </td>
                      {grid.days.map((day) => {
                        const cell = grid.cells[day.key][slotIndex];
                        return (
                          <td key={`${day.key}-${slot.label}`} className="border-b border-border/40 p-0.5 h-8 text-center">
                            {cell ? (
                              <div
                                className="h-full min-h-7 rounded-md flex items-center justify-center font-bold text-slate-900 shadow-sm"
                                style={{ background: cell.color }}
                              >
                                {cell.letter}
                              </div>
                            ) : null}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
          <CardFooter className="px-6 pb-6 pt-0 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span className={cn('inline-flex items-center gap-1.5')}>
              <span className="w-5 h-5 rounded-md bg-primary/80 text-primary-foreground flex items-center justify-center font-bold">ن</span>
              {ar ? 'نظري' : 'Theory'}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-md bg-cyan-400 text-slate-900 flex items-center justify-center font-bold">ع</span>
              {ar ? 'عملي' : 'Practical'}
            </span>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
