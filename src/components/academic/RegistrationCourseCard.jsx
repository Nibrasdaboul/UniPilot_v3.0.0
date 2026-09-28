import { GraduationCap, Users, Clock, Lock, BookOpen } from 'lucide-react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

function formatTime(value) {
  if (value == null) return '';
  const text = String(value);
  return text.length >= 5 ? text.slice(0, 5) : text;
}

function lectureLine(item, ar) {
  const day = ar ? item.weekday_ar : item.weekday_en;
  const room = item.room_number ? ` · ${item.room_number}` : '';
  const code = item.section_code ? ` · ${item.section_code}` : '';
  return `${day} ${formatTime(item.start_time)}–${formatTime(item.end_time)}${code}${room}`;
}

export default function RegistrationCourseCard({
  course,
  ar,
  canEnroll,
  busy,
  selected,
  onToggle,
  onDrop,
  canWithdraw = false,
  onWithdraw,
}) {
  const locked = !course.eligible;
  const lockLabel = course.lock_reason === 'hours'
    ? (ar
      ? `مقفل: يلزم ${course.min_hours} ساعة مكتملة`
      : `Locked: need ${course.min_hours} completed hours`)
    : (course.prerequisite
      ? (ar
        ? `مقفل: أكمل المتطلب ${course.prerequisite.course_code}`
        : `Locked: finish ${course.prerequisite.course_code}`)
      : (ar ? 'مقفل' : 'Locked'));

  return (
    <Card
      className={cn(
        'rounded-[2rem] border shadow-sm hover:shadow-xl transition-all duration-300 group overflow-hidden bg-card/50 backdrop-blur-sm',
        locked && 'border-rose-500/70 bg-rose-500/15 hover:shadow-rose-500/20',
      )}
      data-testid={`registration-card-${course.course_code || course.id}`}
      data-locked={locked ? 'true' : 'false'}
      data-selected={selected ? 'true' : 'false'}
    >
      <CardHeader className="p-8 pb-4">
        <div className="flex justify-between items-start mb-4">
          <div className={cn(
            'w-12 h-12 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform',
            locked ? 'bg-rose-500/20 text-rose-700 dark:text-rose-200' : 'bg-primary/10 text-primary',
          )}>
            <GraduationCap className="w-6 h-6" />
          </div>
          {course.enrolled ? (
            <Badge>{ar ? 'مسجّل' : 'Enrolled'}</Badge>
          ) : course.withdrawn ? (
            <Badge variant="outline" className="border-muted-foreground/40 text-muted-foreground" data-testid={`registration-withdrawn-${course.course_code || course.id}`}>
              {ar ? 'مسحوبة (W)' : 'Withdrawn (W)'}
            </Badge>
          ) : course.offered ? (
            <Badge variant="secondary">{ar ? 'مطروحة' : 'Offered'}</Badge>
          ) : (
            <Badge variant="outline">{ar ? 'غير مطروحة' : 'Not offered'}</Badge>
          )}
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={locked ? 'destructive' : 'secondary'} className="rounded-full text-[10px] font-bold tracking-widest uppercase py-0.5 px-2">
              {course.course_code || 'N/A'}
            </Badge>
            <span className="text-xs font-bold text-muted-foreground">
              • {course.credit_hours ?? 0} {ar ? 'ساعات' : 'credits'}
            </span>
          </div>
          <CardTitle className={cn(
            'text-xl font-display transition-colors',
            locked ? 'text-rose-900 dark:text-rose-100' : 'group-hover:text-primary',
          )}>
            {course.course_name}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="px-8 py-4 space-y-4 text-sm">
        {course.description ? (
          <p className="text-muted-foreground line-clamp-3">{course.description}</p>
        ) : null}
        <p>
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {ar ? 'المتطلب السابق' : 'Prerequisite'}
          </span>
          <span className="block">
            {course.prerequisite
              ? `${course.prerequisite.course_code} — ${course.prerequisite.course_name}`
              : (ar ? 'بدون متطلب' : 'None')}
            {course.min_hours ? ` · ${ar ? `حد الساعات ${course.min_hours}` : `${course.min_hours}h required`}` : ''}
          </span>
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-2xl bg-muted/50 border border-border/50">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1">
              <Clock className="w-3 h-3" /> {ar ? 'شعب مفتوحة' : 'Open sections'}
            </p>
            <p className="font-bold">{course.open_sections ?? 0}</p>
          </div>
          <div className="p-3 rounded-2xl bg-muted/50 border border-border/50">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
              {ar ? 'مقاعد شاغرة' : 'Vacant seats'}
            </p>
            <p className="font-bold">{course.vacant_seats ?? 0}</p>
          </div>
        </div>
        <div>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1">
            <Users className="w-3 h-3" /> {ar ? 'الكادر' : 'Staff'}
          </p>
          {(course.staff || []).length === 0 ? (
            <p className="text-muted-foreground">{ar ? 'لم يُعيَّن كادر بعد' : 'No staff assigned yet'}</p>
          ) : (
            <ul className="space-y-0.5">
              {(course.staff || []).map((person, i) => (
                <li key={`${person.user_id || person.full_name}-${i}`}>
                  {person.full_name}
                  <span className="text-muted-foreground">
                    {` · ${person.staff_role === 'teaching_assistant' ? (ar ? 'معيد' : 'TA') : (ar ? 'مدرّس' : 'Instructor')}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1">
            <BookOpen className="w-3 h-3" /> {ar ? 'محاضرات نظرية' : 'Theory lectures'}
          </p>
          {(course.theory_lectures || []).length === 0 ? (
            <p className="text-muted-foreground">{course.theory_syllabus ? String(course.theory_syllabus).slice(0, 80) : (ar ? 'لا يوجد جدول نظري بعد' : 'No theory meetings yet')}</p>
          ) : (
            <ul className="space-y-0.5 text-muted-foreground">
              {course.theory_lectures.map((item, i) => <li key={`t-${i}`}>{lectureLine(item, ar)}</li>)}
            </ul>
          )}
        </div>
        <div>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
            {ar ? 'محاضرات عملية' : 'Practical lectures'}
          </p>
          {(course.practical_lectures || []).length === 0 ? (
            <p className="text-muted-foreground">{course.practical_syllabus ? String(course.practical_syllabus).slice(0, 80) : (ar ? 'لا يوجد جدول عملي بعد' : 'No practical meetings yet')}</p>
          ) : (
            <ul className="space-y-0.5 text-muted-foreground">
              {course.practical_lectures.map((item, i) => <li key={`p-${i}`}>{lectureLine(item, ar)}</li>)}
            </ul>
          )}
        </div>
        {locked ? (
          <p className="text-sm font-medium text-rose-800 dark:text-rose-200 flex items-center gap-2">
            <Lock className="w-4 h-4" /> {lockLabel}
          </p>
        ) : null}
      </CardContent>
      <CardFooter className="px-8 pb-8 pt-0 flex flex-col gap-2">
        <Button
          className={cn(
            'w-full rounded-xl font-bold',
            selected && '!bg-emerald-500 !text-white hover:!bg-emerald-600 hover:!text-white',
          )}
          disabled={locked || course.withdrawn || !canEnroll || !course.offered || !course.offering_id || busy != null}
          onClick={() => onToggle?.(course)}
          data-testid={`registration-select-${course.course_code || course.id}`}
        >
          {ar ? 'اختيار المادة' : 'Select course'}
        </Button>
        {course.enrolled && canEnroll ? (
          <Button
            variant="outline"
            className="w-full rounded-xl font-bold"
            disabled={busy != null}
            onClick={() => onDrop?.(course.offering_id)}
            data-testid={`registration-cancel-${course.course_code || course.id}`}
          >
            {ar ? 'إلغاء التسجيل' : 'Cancel registration'}
          </Button>
        ) : null}
        {course.enrolled ? (
          <>
            <Button
              variant="outline"
              className="w-full rounded-xl font-bold border-destructive/60 text-destructive hover:bg-destructive hover:text-destructive-foreground"
              disabled={!canWithdraw || busy != null}
              onClick={() => onWithdraw?.(course)}
              data-testid={`registration-withdraw-${course.course_code || course.id}`}
            >
              {ar ? 'سحب المادة' : 'Withdraw course'}
            </Button>
            {!canWithdraw ? (
              <p className="text-xs text-muted-foreground text-center">
                {ar ? 'يتفعّل السحب عند فتح نافذة السحب من العمادة.' : 'Withdrawal unlocks when the dean opens the withdrawal window.'}
              </p>
            ) : null}
          </>
        ) : null}
        {course.withdrawn ? (
          <p className="text-xs text-muted-foreground text-center">
            {ar ? 'سحبت هذه المادة هذا الفصل. يمكنك تنزيلها مجدداً في فصل جديد.' : 'You withdrew from this course this term. Register it again in a new term.'}
          </p>
        ) : null}
      </CardFooter>
    </Card>
  );
}
