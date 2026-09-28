import { Button } from '@/components/ui/button';
import WithdrawnStudentBadge, { WITHDRAWN_ROW_CLASS } from '@/components/academic/WithdrawnStudentBadge';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const STATUSES = [
  { key: 'present', ar: 'حاضر', en: 'Present' },
  { key: 'absent', ar: 'غائب', en: 'Absent' },
  { key: 'late', ar: 'متأخر', en: 'Late' },
  { key: 'excused', ar: 'معتذر', en: 'Excused' },
];

function markFor(marks, sessionId, userId) {
  return (marks || []).find((m) => Number(m.session_id) === Number(sessionId) && Number(m.user_id) === Number(userId));
}

function statusLabel(status, ar) {
  const hit = STATUSES.find((s) => s.key === status);
  return hit ? (ar ? hit.ar : hit.en) : (ar ? '—' : '—');
}

export default function AttendanceGrid({
  attendance,
  ar,
  canEdit = false,
  showEvaluation = false,
  canEditEvaluation = false,
  onAddSession,
  onMark,
  onMarkEval,
  busy = false,
  heading,
  testId = 'attendance-grid',
}) {
  const students = attendance?.students || [];
  const sessions = attendance?.sessions || [];
  const marks = attendance?.marks || [];

  return (
    <div className="space-y-2" data-testid={testId}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{heading || (ar ? 'حضور الطلاب' : 'Student attendance')}</p>
        {canEdit && onAddSession ? (
          <Button type="button" size="sm" className="rounded-xl" onClick={onAddSession} disabled={busy}>
            {ar ? 'إضافة جلسة' : 'Add session'}
          </Button>
        ) : null}
      </div>
      {students.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {ar ? 'لا طلاب مسجّلين في هذه المادة هذا الفصل.' : 'No students enrolled in this course this term.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-start p-2 whitespace-nowrap">{ar ? 'الطالب / الحضور' : 'Student / attendance'}</th>
                {sessions.length === 0 ? (
                  <th className="text-start p-2 text-muted-foreground font-normal">
                    {ar ? 'لا جلسات بعد.' : 'No sessions yet.'}
                  </th>
                ) : sessions.map((session) => (
                  <th key={session.id} className="text-start p-2 whitespace-nowrap">
                    {session.title || `${ar ? 'الجلسة' : 'Session'} ${session.index}`}
                    {session.is_makeup ? (
                      <span className="ms-1 text-[10px] font-normal text-blue-700">{ar ? 'تعويض' : 'makeup'}</span>
                    ) : null}
                    {showEvaluation ? (ar ? ' والتقييم' : ' + eval') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {students.map((student) => {
                const withdrawn = Boolean(student.withdrawn);
                return (
                <tr
                  key={student.user_id}
                  className={cn('border-b last:border-0', withdrawn && WITHDRAWN_ROW_CLASS)}
                  data-testid={`attendance-row-${student.user_id}`}
                  data-withdrawn={withdrawn ? 'true' : 'false'}
                >
                  <td className="p-2 align-top">
                    <p className={cn(withdrawn && 'line-through')}>{student.full_name || '—'}</p>
                    <p className="text-xs text-muted-foreground">{student.person_code}</p>
                    {withdrawn ? (
                      <WithdrawnStudentBadge ar={ar} testId={`attendance-withdrawn-${student.user_id}`} />
                    ) : null}
                  </td>
                  {sessions.length === 0 ? <td className="p-2" /> : sessions.map((session) => {
                    const mark = markFor(marks, session.id, student.user_id);
                    const current = mark?.status || '';
                    const evaluated = Boolean(mark?.evaluated);
                    return (
                      <td key={session.id} className="p-2">
                        <div className="space-y-1 min-w-[7.5rem]">
                          {canEdit ? (
                            <Select
                              value={current || 'unset'}
                              onValueChange={(value) => {
                                if (value && value !== 'unset') onMark?.(session.id, student.user_id, value);
                              }}
                              disabled={busy || withdrawn}
                            >
                              <SelectTrigger className="rounded-xl h-9" data-testid={`attendance-select-${session.id}-${student.user_id}`}>
                                <SelectValue placeholder={ar ? '—' : '—'} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="unset">{ar ? '—' : '—'}</SelectItem>
                                {STATUSES.map((s) => (
                                  <SelectItem key={s.key} value={s.key}>{ar ? s.ar : s.en}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span>{statusLabel(current, ar)}</span>
                          )}
                          {showEvaluation ? (
                            canEditEvaluation ? (
                              <Select
                                value={evaluated ? 'evaluated' : 'not_evaluated'}
                                onValueChange={(value) => onMarkEval?.(session.id, student.user_id, value === 'evaluated')}
                                disabled={busy || withdrawn}
                              >
                                <SelectTrigger className="rounded-xl h-9" data-testid={`eval-${session.id}-${student.user_id}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="evaluated">{ar ? 'تم التقييم' : 'Evaluated'}</SelectItem>
                                  <SelectItem value="not_evaluated">{ar ? 'لم يتم التقييم' : 'Not evaluated'}</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : (
                              <p className="text-xs text-muted-foreground">
                                {evaluated ? (ar ? 'تم التقييم' : 'Evaluated') : (ar ? 'لم يتم التقييم' : 'Not evaluated')}
                              </p>
                            )
                          ) : null}
                        </div>
                      </td>
                    );
                  })}
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
