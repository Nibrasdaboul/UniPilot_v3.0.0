import { Button } from '@/components/ui/button';
import WithdrawnStudentBadge, { WITHDRAWN_ROW_CLASS } from '@/components/academic/WithdrawnStudentBadge';
import { cn } from '@/lib/utils';

export default function DeprivationInbox({
  students = [],
  deprivations = [],
  ar,
  busy,
  onSet,
  onDecide,
}) {
  const byUser = new Map((deprivations || []).map((row) => [Number(row.user_id), row]));
  const enrolled = students || [];

  return (
    <div className="space-y-3 rounded-xl border p-3" data-testid="deprivation-inbox">
      <p className="text-sm font-medium">
        {ar ? 'الحرمان وطلبات الإلغاء' : 'Deprivation and cancel requests'}
      </p>
      {enrolled.length === 0 ? (
        <p className="text-sm text-muted-foreground">{ar ? 'لا يوجد طلاب مسجّلون.' : 'No enrolled students.'}</p>
      ) : enrolled.map((student) => {
        const dep = byUser.get(Number(student.user_id));
        const active = dep?.status === 'active';
        const withdrawn = Boolean(student.withdrawn);
        const locked = busy || withdrawn;
        return (
          <div
            key={student.user_id}
            className={cn('rounded-xl border p-3 space-y-2', withdrawn && WITHDRAWN_ROW_CLASS)}
            data-testid={`deprivation-row-${student.user_id}`}
            data-withdrawn={withdrawn ? 'true' : 'false'}
          >
            <p className="text-sm font-medium flex flex-wrap items-center gap-x-1 gap-y-1">
              <span className={cn(withdrawn && 'line-through')}>{student.full_name}</span>
              {student.person_code ? <span>· {student.person_code}</span> : null}
              {withdrawn ? (
                <WithdrawnStudentBadge ar={ar} testId={`deprivation-withdrawn-${student.user_id}`} />
              ) : (
                <span className="text-muted-foreground">
                  {`· ${active ? (ar ? 'محروم' : 'Deprived') : (dep ? (ar ? 'مرفوع' : 'Lifted') : (ar ? 'غير محروم' : 'Not deprived'))}`}
                </span>
              )}
            </p>
            {dep?.note ? <p className="text-xs text-muted-foreground">{dep.note}</p> : null}
            {dep?.pending_reason ? (
              <p className="text-sm" data-testid={`pending-cancel-${student.user_id}`}>
                {ar ? 'طلب إلغاء:' : 'Cancel request:'} {dep.pending_reason}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {!active ? (
                <Button
                  type="button"
                  size="sm"
                  className="rounded-xl"
                  data-testid={`activate-deprivation-${student.user_id}`}
                  disabled={locked}
                  onClick={() => onSet(student.user_id, 'activate')}
                >
                  {ar ? 'تفعيل الحرمان' : 'Activate deprivation'}
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-xl"
                  data-testid={`lift-deprivation-${student.user_id}`}
                  disabled={locked}
                  onClick={() => onSet(student.user_id, 'lift')}
                >
                  {ar ? 'رفع الحرمان' : 'Lift deprivation'}
                </Button>
              )}
              {dep?.pending_request_id ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    className="rounded-xl"
                    data-testid={`approve-cancel-${dep.pending_request_id}`}
                    disabled={locked}
                    onClick={() => onDecide(dep.pending_request_id, 'approve')}
                  >
                    {ar ? 'قبول الطلب' : 'Approve request'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="rounded-xl"
                    data-testid={`reject-cancel-${dep.pending_request_id}`}
                    disabled={locked}
                    onClick={() => onDecide(dep.pending_request_id, 'reject')}
                  >
                    {ar ? 'رفض الطلب' : 'Reject request'}
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
