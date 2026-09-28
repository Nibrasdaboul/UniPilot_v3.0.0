import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, GraduationCap, MapPin, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/lib/AuthContext';
import { useLanguage } from '@/lib/LanguageContext';
import { toast } from 'sonner';
import { buildWeeklyProgramGrid, coursePickerColor, PICKER_DAYS, halfHourSlots } from '@/lib/sectionPicker';
import { cn } from '@/lib/utils';
import StudentClassSessions from '@/components/academic/StudentClassSessions';

const WITHDRAWN_BLOCK_COLOR = '#d4d4d8';

function courseColor(course) {
  return course.withdrawn ? WITHDRAWN_BLOCK_COLOR : coursePickerColor(course.id);
}

function formatTime(value) {
  if (value == null) return '';
  const text = String(value);
  return text.length >= 5 ? text.slice(0, 5) : text;
}

function kindLabel(kind, ar) {
  return kind === 'practical' ? (ar ? 'عملي' : 'Practical') : (ar ? 'نظري' : 'Theory');
}

function staffForSection(course, section) {
  if (section?.staff_name) return section.staff_name;
  const want = section?.kind === 'practical' ? 'teaching_assistant' : 'instructor';
  return (course.staff || []).find((person) => person.staff_role === want)?.full_name || null;
}

export default function WeeklyProgram() {
  const { api } = useAuth();
  const { language } = useLanguage();
  const ar = language === 'ar';
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get('/academic/registration')
      .then((res) => setData(res.data || null))
      .catch((e) => {
        toast.error(e.response?.data?.detail || (ar ? 'تعذر تحميل البرنامج' : 'Failed to load weekly program'));
      });
  }, []);

  const enrolled = useMemo(
    () => (data?.courses || []).filter((course) => course.enrolled || course.withdrawn),
    [data],
  );

  const placements = useMemo(() => {
    const list = [];
    for (const course of enrolled) {
      const color = courseColor(course);
      const picked = (course.sections || []).filter((section) => section.picked);
      for (const section of picked) {
        for (const meeting of section.meetings || []) {
          list.push({
            ...meeting,
            kind: section.kind,
            color,
            course_code: course.course_code,
            course_name: course.course_name,
            section_id: section.id,
            section_code: section.code,
            staff_name: staffForSection(course, section),
            room_number: meeting.room_number,
            withdrawn: Boolean(course.withdrawn),
          });
        }
      }
    }
    return list;
  }, [enrolled]);

  const grid = useMemo(
    () => buildWeeklyProgramGrid({ placements, days: PICKER_DAYS, slots: halfHourSlots() }),
    [placements],
  );

  return (
    <div className="p-4 sm:p-6 space-y-6" data-testid="weekly-program-page">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-display tracking-tight flex items-center gap-2">
            <CalendarDays className="w-6 h-6 text-primary" />
            {ar ? 'برنامجي الأسبوعي' : 'Weekly program'}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data?.term
              ? (ar ? `الفصل الحالي: ${data.term.name}` : `Current term: ${data.term.name}`)
              : (ar ? 'جدولك بعد تأكيد الشعب.' : 'Your timetable after confirming sections.')}
          </p>
        </div>
        <Button variant="outline" className="rounded-xl shrink-0" asChild>
          <Link to="/registration">{ar ? 'تسجيل المواد' : 'Registration'}</Link>
        </Button>
      </div>

      <Card className="rounded-[2rem] border shadow-sm overflow-hidden bg-card/50 backdrop-blur-sm">
        <CardHeader className="p-6 pb-3">
          <CardTitle className="text-lg font-display">{ar ? 'الجدول الأسبوعي' : 'Weekly timetable'}</CardTitle>
          <CardDescription>
            {ar
              ? 'سبت إلى جمعة · الحصص المدمجة تعرض المادة والشعبة والمدرّس/المعيد والقاعة.'
              : 'Saturday to Friday · merged blocks show course, section, instructor/TA, and hall.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {placements.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground" data-testid="weekly-program-empty">
              {enrolled.length
                ? (ar ? 'سجّلت مواداً لكن لم تُختر شعب بعد. ارجع إلى تسجيل الشعب.' : 'You are enrolled but have no section picks yet. Go back and register sections.')
                : (ar ? 'لا مواد مسجّلة في هذا الفصل بعد. ارجع إلى تسجيل المواد واختر الشعب ثم أكّد.' : 'No courses registered this term yet. Go to registration, pick sections, then confirm.')}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border/60" data-testid="weekly-program-grid">
              <table className="w-full min-w-[860px] text-xs border-collapse">
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
                        if (!cell || cell.type === 'skip') return null;
                        if (cell.type === 'empty') {
                          return <td key={`${day.key}-${slot.label}`} className="border-b border-border/40 p-0.5 h-8" />;
                        }
                        return (
                          <td
                            key={`${day.key}-${slot.label}`}
                            rowSpan={cell.span}
                            className="border-b border-border/40 p-1 align-top"
                          >
                            <div
                              className={cn(
                                'h-full min-h-16 rounded-xl p-2 shadow-sm space-y-0.5',
                                cell.withdrawn ? 'text-zinc-500 opacity-80' : 'text-slate-900',
                              )}
                              style={{ background: cell.color }}
                              data-testid={`weekly-block-${cell.course_code}-${cell.section_code}`}
                              data-withdrawn={cell.withdrawn ? 'true' : 'false'}
                            >
                              <p className="font-bold font-mono flex items-center gap-1.5">
                                <span className={cn(cell.withdrawn && 'line-through')}>{cell.course_code}</span>
                                {cell.withdrawn ? (
                                  <span className="rounded-full bg-zinc-600 text-white px-1.5 text-[10px] font-sans">
                                    {ar ? 'مسحوبة (W)' : 'Withdrawn (W)'}
                                  </span>
                                ) : null}
                              </p>
                              <p className="font-semibold leading-tight">{cell.course_name}</p>
                              <p>
                                {cell.section_code} · {kindLabel(cell.kind, ar)}
                              </p>
                              <p className="flex items-center gap-1">
                                <Users className="w-3 h-3" />
                                {cell.staff_name || (ar ? 'لم يُعيَّن' : 'Unassigned')}
                              </p>
                              <p className="flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                {cell.room_number || (ar ? 'بدون قاعة' : 'No hall')}
                              </p>
                              <p className="font-mono opacity-80">
                                {formatTime(cell.start_time)}–{formatTime(cell.end_time)}
                              </p>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
        <CardFooter className="px-6 pb-6 pt-0 flex flex-wrap gap-2">
          {enrolled.map((course) => (
            <span
              key={course.id}
              className={cn(
                'inline-flex items-center gap-2 rounded-full border border-border/60 px-2.5 py-1 text-xs',
                course.withdrawn && 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800',
              )}
              data-testid={`weekly-program-card-${course.course_code}`}
              data-withdrawn={course.withdrawn ? 'true' : 'false'}
            >
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: courseColor(course) }} />
              <span className="font-mono font-bold">{course.course_code}</span>
              {course.withdrawn ? (
                <span className="font-bold">W</span>
              ) : (
                <span className="text-muted-foreground">{course.credit_hours ?? 0} {ar ? 'س' : 'cr'}</span>
              )}
            </span>
          ))}
        </CardFooter>
      </Card>

      {enrolled.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="weekly-program-courses">
          {enrolled.map((course) => {
            const picked = (course.sections || []).filter((section) => section.picked);
            return (
              <Card
                key={course.id}
                className={cn(
                  'rounded-[2rem] border shadow-sm backdrop-blur-sm',
                  course.withdrawn ? 'bg-zinc-100 text-zinc-500 grayscale dark:bg-zinc-900' : 'bg-card/50',
                )}
                data-testid={`weekly-course-${course.course_code}`}
                data-withdrawn={course.withdrawn ? 'true' : 'false'}
              >
                <CardHeader className="p-6 pb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center text-slate-900"
                      style={{ background: courseColor(course) }}
                    >
                      <GraduationCap className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="secondary" className="rounded-full text-[10px] font-bold tracking-widest uppercase py-0.5 px-2">
                          {course.course_code}
                        </Badge>
                        {course.withdrawn ? (
                          <Badge className="rounded-full text-[10px] py-0.5 px-2 bg-zinc-600 text-white hover:bg-zinc-600">
                            {ar ? 'مسحوبة (W)' : 'Withdrawn (W)'}
                          </Badge>
                        ) : null}
                      </div>
                      <CardTitle className="text-lg font-display">{course.course_name}</CardTitle>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="px-6 pb-6 space-y-2 text-sm">
                  {picked.length === 0 ? (
                    <p className="text-muted-foreground">{ar ? 'لا شعبة مختارة بعد' : 'No section picked yet'}</p>
                  ) : picked.map((section) => (
                    <p key={section.id}>
                      {section.code} · {kindLabel(section.kind, ar)}
                      {section.staff_name ? ` · ${section.staff_name}` : ''}
                    </p>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : null}

      <StudentClassSessions />
    </div>
  );
}
