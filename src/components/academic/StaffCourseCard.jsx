import { GraduationCap, MoreVertical, Users, BookOpen, Clock, ArrowUpRight, FileWarning, Bell, CalendarCheck } from 'lucide-react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

const WEEKDAYS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

function weekdayOf(iso) {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

function pendingRequestsAr(n) {
  if (n === 1) return 'طلب معلّق';
  if (n === 2) return 'طلبان معلّقان';
  if (n >= 3 && n <= 10) return `${n} طلبات معلّقة`;
  return `${n} طلباً معلّقاً`;
}

export default function StaffCourseCard({
  item,
  ar,
  selected = false,
  onOpen,
  testId,
  showVdaInbox = false,
  sessionHint = null,
  onOpenSessions,
}) {
  const enrolled = Number(item.enrolled_count) || 0;
  const capacity = Number(item.capacity) || 0;
  const fill = capacity > 0
    ? Math.min(100, Math.round((enrolled / capacity) * 100))
    : (enrolled > 0 ? 100 : 0);
  const theory = Number(item.theory_staff_count) || 0;
  const practical = Number(item.practical_staff_count) || 0;
  const department = ar ? (item.department?.name_ar || item.department?.name) : (item.department?.name_en || item.department?.name);
  const pendingFiles = Number(item.pending_file_count) || 0;
  const unreadChat = Number(item.unread_chat_count) || 0;
  const open = () => onOpen?.(item.catalog_course_id);

  return (
    <Card
      className={cn(
        'rounded-[2rem] border shadow-sm hover:shadow-xl transition-all duration-300 group overflow-hidden bg-card/50 backdrop-blur-sm',
        selected && 'border-primary',
      )}
      data-testid={testId}
    >
      <CardHeader className="p-8 pb-4">
        <div className="flex justify-between items-start mb-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
            <GraduationCap className="w-6 h-6" />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={open}>
                {ar ? 'فتح المادة' : 'Open course'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary" className="rounded-full text-[10px] font-bold tracking-widest uppercase py-0.5 px-2">
              {item.course_code || 'N/A'}
            </Badge>
            <span className="text-xs font-bold text-muted-foreground">
              • {item.credit_hours ?? 0} {ar ? 'ساعات' : 'credits'}
            </span>
            {item.offered
              ? <Badge className="rounded-full text-[10px]">{ar ? 'مطروحة' : 'Offered'}</Badge>
              : <Badge variant="outline" className="rounded-full text-[10px]">{ar ? 'غير مطروحة' : 'Not offered'}</Badge>}
            {item.pending_appeal_count > 0 ? (
              <Badge variant="outline" className="rounded-full text-[10px] border-rose-500/50 text-rose-700 dark:text-rose-400" data-testid="pending-appeals-badge">
                {ar ? `${item.pending_appeal_count} اعتراض` : `${item.pending_appeal_count} appeal${item.pending_appeal_count === 1 ? '' : 's'}`}
              </Badge>
            ) : null}
            {(() => {
              const status = item.sheet_status || item.grade_sheet?.status;
              const labels = {
                at_exams: ar ? 'عند دائرة الامتحانات' : 'At Exams Office',
                staff_review: ar ? 'قيد تدقيق الكادر' : 'Staff review',
                awaiting_vda: ar ? 'بانتظار النائب' : 'Awaiting vice dean',
                published: ar ? 'أُرسلت للطلاب' : 'Sent to students',
              };
              if (!labels[status]) return null;
              return (
                <Badge variant="outline" className="rounded-full text-[10px] border-amber-500/50 text-amber-700 dark:text-amber-400" data-testid={`sheet-status-${status}`}>
                  {labels[status]}
                </Badge>
              );
            })()}
            {(() => {
              const status = item.attendance_sheet_status || item.attendance_sheet?.status;
              const labels = {
                at_exams: ar ? 'حضور: عند الامتحانات' : 'Attendance: at Exams',
                staff_review: ar ? 'حضور: تأكيد الكادر' : 'Attendance: staff review',
                awaiting_vda: ar ? 'حضور: بانتظار النائب' : 'Attendance: awaiting vice dean',
                published: ar ? 'حضور: أُرسلت التنبيهات' : 'Attendance: warnings sent',
              };
              if (!labels[status]) return null;
              return (
                <Badge variant="outline" className="rounded-full text-[10px] border-sky-500/50 text-sky-700 dark:text-sky-400" data-testid={`attendance-sheet-${status}`}>
                  {labels[status]}
                </Badge>
              );
            })()}
          </div>
          <CardTitle className="text-xl font-display group-hover:text-primary transition-colors">
            {item.course_name}
          </CardTitle>
          {sessionHint && (sessionHint.now || sessionHint.next || sessionHint.pending > 0) ? (
            <button
              type="button"
              onClick={() => onOpenSessions?.(item.catalog_course_id)}
              className="flex flex-wrap items-center gap-1.5 pt-1 text-start"
              data-testid={`course-session-hint-${item.catalog_course_id}`}
            >
              {sessionHint.now ? (
                <Badge className="rounded-full text-[10px] gap-1 animate-pulse" data-testid="course-session-now">
                  <CalendarCheck className="w-3 h-3" />
                  {ar ? `جلسة الآن ${sessionHint.now.start_time}` : `Session now ${sessionHint.now.start_time}`}
                </Badge>
              ) : sessionHint.next ? (
                <Badge variant="outline" className="rounded-full text-[10px] gap-1" data-testid="course-session-next">
                  <CalendarCheck className="w-3 h-3" />
                  {ar
                    ? `الجلسة القادمة: ${WEEKDAYS_AR[weekdayOf(sessionHint.next.session_date)]} ${sessionHint.next.session_date} · ${sessionHint.next.start_time}`
                    : `Next session: ${sessionHint.next.session_date} · ${sessionHint.next.start_time}`}
                </Badge>
              ) : null}
              {sessionHint.pending > 0 ? (
                <Badge variant="outline" className="rounded-full text-[10px] border-amber-500/50 text-amber-700 dark:text-amber-400" data-testid="course-session-pending">
                  {ar ? pendingRequestsAr(sessionHint.pending) : `${sessionHint.pending} pending request${sessionHint.pending === 1 ? '' : 's'}`}
                </Badge>
              ) : null}
            </button>
          ) : null}
          {department ? (
            <p className="text-sm text-muted-foreground font-medium flex items-center gap-1">
              <Users className="w-3.5 h-3.5" /> {department}
            </p>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="px-8 py-4 space-y-6">
        <div className="space-y-2">
          <div className="flex justify-between items-end">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {ar ? 'الطلاب المسجّلون' : 'Enrolled students'}
            </span>
            <div className="flex flex-col items-end gap-1">
              <span className="text-2xl font-bold font-display text-primary">
                {capacity > 0 ? `${enrolled}/${capacity}` : enrolled}
              </span>
              <Badge variant="outline" className="rounded-full text-[10px]">
                {capacity > 0 ? `${fill}%` : (item.offered ? (ar ? 'مفتوحة' : 'Open') : (ar ? 'غير مطروحة' : 'Closed'))}
              </Badge>
            </div>
          </div>
          <Progress value={fill} className="h-2" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 rounded-2xl bg-muted/50 border border-border/50">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
              {ar ? 'الساعات' : 'Credits'}
            </p>
            <div className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-primary" />
              <span className="text-sm font-bold">{item.credit_hours ?? 0}</span>
            </div>
          </div>
          <div className="p-3 rounded-2xl bg-muted/50 border border-border/50">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
              {ar ? 'الكادر' : 'Staff'}
            </p>
            <div className="flex items-center gap-1">
              <BookOpen className="w-3.5 h-3.5 text-secondary" />
              <span className="text-sm font-bold">
                {ar ? `${theory} نظري · ${practical} عملي` : `${theory} th · ${practical} pr`}
              </span>
            </div>
          </div>
        </div>

        {showVdaInbox ? (
          <div className="grid grid-cols-2 gap-4">
            <div
              className={cn(
                'p-3 rounded-2xl border border-border/50',
                pendingFiles > 0 ? 'bg-amber-500/10 border-amber-500/40' : 'bg-muted/50',
              )}
              data-testid="vda-pending-files"
            >
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
                {ar ? 'ملفات تحتاج موافقة' : 'Files awaiting approval'}
              </p>
              <div className="flex items-center gap-1">
                <FileWarning className={cn('w-3.5 h-3.5', pendingFiles > 0 ? 'text-amber-600' : 'text-muted-foreground')} />
                <span className="text-sm font-bold">{pendingFiles}</span>
              </div>
            </div>
            <div
              className={cn(
                'p-3 rounded-2xl border border-border/50',
                unreadChat > 0 ? 'bg-primary/10 border-primary/40' : 'bg-muted/50',
              )}
              data-testid="vda-chat-notifications"
            >
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
                {ar ? 'إشعارات المحادثة' : 'Chat notifications'}
              </p>
              <div className="flex items-center gap-1">
                <Bell className={cn('w-3.5 h-3.5', unreadChat > 0 ? 'text-primary' : 'text-muted-foreground')} />
                <span className="text-sm font-bold">{unreadChat}</span>
              </div>
            </div>
          </div>
        ) : null}
      </CardContent>
      <CardFooter className="px-8 pb-8 pt-0">
        <Button
          variant="outline"
          className="w-full rounded-xl gap-2 font-bold hover:bg-primary/5 hover:border-primary/30 transition-all"
          onClick={open}
        >
          {ar ? 'لوحة المادة' : 'Course dashboard'} <ArrowUpRight className="w-4 h-4 rtl-flip" />
        </Button>
      </CardFooter>
    </Card>
  );
}
