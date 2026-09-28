import AttendanceGrid from '@/components/academic/AttendanceGrid';

function bannerClass(level) {
  if (level >= 75) return 'border-rose-500/50 bg-rose-500/10 text-rose-800 dark:text-rose-300';
  if (level >= 50) return 'border-amber-500/50 bg-amber-500/10 text-amber-800 dark:text-amber-300';
  return 'border-sky-500/50 bg-sky-500/10 text-sky-800 dark:text-sky-300';
}

export default function StudentAttendancePanel({ attendance, ar }) {
  if (!attendance) return null;
  const message = ar ? attendance.message_ar : attendance.message_en;

  return (
    <div className="space-y-4" data-testid="student-attendance-panel">
      <p className="text-sm text-muted-foreground">
        {ar
          ? `غياباتك: ${attendance.absent_count} من ${attendance.limit} (${attendance.percent}٪). المتأخر والمعتذر لا يُحسبان. الجلسات الملغاة لغياب الكادر لا تُحسب، والتعويضية تُحسب.`
          : `Absences: ${attendance.absent_count} of ${attendance.limit} (${attendance.percent}%). Late and excused do not count. Cancelled staff sessions do not count; makeup sessions do.`}
      </p>
      {!attendance.official ? (
        <p className="text-xs text-muted-foreground" data-testid="attendance-unofficial-note">
          {ar
            ? 'جدول الحضور حيّ. التنبيهات والحرمان يظهران فقط بعد اعتماد نائب العميد لكشف الحضور.'
            : 'The attendance table is live. Official warnings and deprivation appear only after the vice dean publishes the sheet.'}
        </p>
      ) : null}
      {attendance.official && attendance.level >= 25 && message ? (
        <div
          className={`rounded-xl border p-3 text-sm ${bannerClass(attendance.level)}`}
          data-testid={`absence-warning-${attendance.level}`}
        >
          {message}
        </div>
      ) : null}
      <AttendanceGrid
        attendance={attendance.theory}
        ar={ar}
        heading={ar ? 'حضور النظري' : 'Theory attendance'}
        testId="student-attendance-theory"
      />
      <AttendanceGrid
        attendance={attendance.practical}
        ar={ar}
        heading={ar ? 'حضور العملي' : 'Practical attendance'}
        testId="student-attendance-practical"
      />
    </div>
  );
}
