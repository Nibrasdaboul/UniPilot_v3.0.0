import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import WithdrawnStudentBadge, { WITHDRAWN_ROW_CLASS } from '@/components/academic/WithdrawnStudentBadge';
import { cn } from '@/lib/utils';

const COLUMNS = [
  { key: 'midterm_theory', ar: 'ميدتيرم النظري', en: 'Theory midterm' },
  { key: 'sai_theory', ar: 'سعي النظري', en: 'Theory coursework' },
  { key: 'final_theory', ar: 'الامتحان النهائي النظري', en: 'Theory final exam' },
  { key: 'practical', ar: 'العملي (امتحان / مشروع / تقييم)', en: 'Practical (exam / project / eval)' },
];

const KINDS = [
  { key: 'exam', ar: 'امتحان', en: 'Exam' },
  { key: 'project', ar: 'مشروع', en: 'Project' },
  { key: 'eval', ar: 'تقييم', en: 'Evaluation' },
];

function kindLabel(kind, ar) {
  const hit = KINDS.find((k) => k.key === kind);
  return hit ? (ar ? hit.ar : hit.en) : '';
}

function formatMark(cell, ar) {
  if (cell?.score == null || cell.score === '') return '—';
  const max = cell.max_score || 100;
  const kind = cell.practical_kind ? ` · ${kindLabel(cell.practical_kind, ar)}` : '';
  return `${cell.score} / ${max}${kind}`;
}

function EditMark({ cell, component, onSave, busy, showKind, ar }) {
  const [score, setScore] = useState(cell?.score ?? '');
  const [max, setMax] = useState(cell?.max_score ?? 100);
  const [kind, setKind] = useState(cell?.practical_kind || 'exam');

  useEffect(() => {
    setScore(cell?.score ?? '');
    setMax(cell?.max_score ?? 100);
    setKind(cell?.practical_kind || 'exam');
  }, [cell?.score, cell?.max_score, cell?.practical_kind]);

  const commit = (next = {}) => {
    onSave({
      component,
      score: next.score !== undefined ? next.score : score,
      max_score: next.max_score !== undefined ? next.max_score : max,
      practical_kind: showKind ? (next.practical_kind || kind) : undefined,
    });
  };

  return (
    <div className="space-y-1 min-w-[8rem]">
      <div className="flex items-center gap-1">
        <Input
          type="number"
          value={score}
          onChange={(e) => setScore(e.target.value)}
          onBlur={() => commit()}
          disabled={busy}
          className="rounded-xl h-9 w-16"
          min={0}
          data-testid={`grade-input-${component}`}
        />
        <span className="text-muted-foreground">/</span>
        <Input
          type="number"
          value={max}
          onChange={(e) => setMax(e.target.value)}
          onBlur={() => commit()}
          disabled={busy}
          className="rounded-xl h-9 w-16"
          min={1}
        />
      </div>
      {showKind ? (
        <Select
          value={kind}
          onValueChange={(value) => {
            setKind(value);
            commit({ practical_kind: value });
          }}
          disabled={busy}
        >
          <SelectTrigger className="rounded-xl h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {KINDS.map((k) => (
              <SelectItem key={k.key} value={k.key}>{ar ? k.ar : k.en}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
    </div>
  );
}

export default function CourseGradesTable({
  grades,
  ar,
  canEdit = false,
  editableComponents = null,
  onSave,
  busy = false,
  showScale = false,
}) {
  const students = grades?.students || [];
  const rows = grades?.rows || [];
  const rowFor = (userId) => rows.find((r) => Number(r.user_id) === Number(userId));
  const canEditColumn = (key) => {
    if (Array.isArray(editableComponents)) return editableComponents.includes(key);
    return canEdit;
  };

  return (
    <div className="space-y-2" data-testid="course-grades-table">
      <p className="text-sm font-medium">{ar ? 'علامات الطلاب' : 'Student marks'}</p>
      {students.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {ar ? 'لا طلاب مسجّلون لعرض العلامات.' : 'No enrolled students to show marks for.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-start p-2 whitespace-nowrap">{ar ? 'الطالب / العلامة' : 'Student / mark'}</th>
                {COLUMNS.map((col) => (
                  <th key={col.key} className="text-start p-2 whitespace-nowrap">{ar ? col.ar : col.en}</th>
                ))}
                {showScale ? (
                  <>
                    <th className="text-start p-2 whitespace-nowrap">{ar ? 'النسبة المئوية' : 'Percent'}</th>
                    <th className="text-start p-2 whitespace-nowrap">{ar ? 'المعدل النقطي' : 'Point GPA'}</th>
                    <th className="text-start p-2 whitespace-nowrap">{ar ? 'الحرف' : 'Letter'}</th>
                  </>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {students.map((student) => {
                const row = rowFor(student.user_id) || {};
                const withdrawn = Boolean(student.withdrawn || row.withdrawn);
                return (
                  <tr
                    key={student.user_id}
                    className={cn('border-b last:border-0', withdrawn && WITHDRAWN_ROW_CLASS)}
                    data-testid={`grade-row-${student.user_id}`}
                    data-withdrawn={withdrawn ? 'true' : 'false'}
                  >
                    <td className="p-2 align-top">
                      <p className={cn(withdrawn && 'line-through')}>{student.full_name || '—'}</p>
                      <p className="text-xs text-muted-foreground">{student.person_code}</p>
                      {withdrawn ? (
                        <WithdrawnStudentBadge ar={ar} testId={`grade-withdrawn-${student.user_id}`} />
                      ) : null}
                    </td>
                    {COLUMNS.map((col) => (
                      <td key={col.key} className="p-2 align-top">
                        {canEditColumn(col.key) ? (
                          <EditMark
                            cell={row[col.key]}
                            component={col.key}
                            showKind={col.key === 'practical'}
                            busy={busy || withdrawn}
                            ar={ar}
                            onSave={(payload) => onSave?.(student.user_id, payload)}
                          />
                        ) : (
                          <span>{formatMark(row[col.key], ar)}</span>
                        )}
                      </td>
                    ))}
                    {showScale ? (
                      <>
                        <td className="p-2 align-top" data-testid="grade-percent">
                          {row.percent != null ? `${Number(row.percent).toFixed(1)}%` : '—'}
                        </td>
                        <td className="p-2 align-top" data-testid="grade-gpa-points">
                          {row.gpa_points != null ? Number(row.gpa_points).toFixed(2) : '—'}
                        </td>
                        <td className="p-2 align-top" data-testid="grade-letter">
                          {row.letter || row.letter_grade || '—'}
                        </td>
                      </>
                    ) : null}
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
