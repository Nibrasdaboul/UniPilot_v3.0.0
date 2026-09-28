export const WITHDRAWN_ROW_CLASS = 'bg-zinc-100 text-zinc-500 dark:bg-zinc-900/60 dark:text-zinc-400';

export default function WithdrawnStudentBadge({ ar, testId }) {
  return (
    <span
      className="inline-flex items-center rounded-full bg-zinc-600 px-2 py-0.5 text-[10px] font-semibold text-white"
      data-testid={testId}
    >
      {ar ? 'مسحوب من المقرر' : 'Withdrawn from course'}
    </span>
  );
}
