import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { useLanguage } from '@/lib/LanguageContext';
import { cn } from '@/lib/utils';
import { historyViewFromPath, progressRowsFromTerms, termsForHistoryView } from '@/lib/academicHistoryViews';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

function fmtNum(value, digits = 2) {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(digits);
}

function fmtMark(cell) {
  if (!cell || cell.score == null || cell.score === '') return '—';
  const score = Number(cell.score);
  if (!Number.isFinite(score)) return '—';
  const max = Number(cell.max_score);
  return Number.isFinite(max) && max > 0 ? `${score}/${max}` : String(score);
}

function markParts(cells) {
  const parts = [];
  for (const cell of cells || []) {
    if (!cell || cell.score == null || cell.score === '') return null;
    const score = Number(cell.score);
    if (!Number.isFinite(score)) return null;
    const max = Number(cell.max_score);
    parts.push({ score, max: Number.isFinite(max) && max > 0 ? max : null });
  }
  return parts.length ? parts : null;
}

function fmtMarkSum(cells) {
  const parts = markParts(cells);
  if (!parts) return '—';
  const score = parts.reduce((sum, part) => sum + part.score, 0);
  const maxes = parts.map((part) => part.max);
  if (maxes.every((max) => max != null)) {
    return `${score}/${maxes.reduce((sum, max) => sum + max, 0)}`;
  }
  return String(score);
}

function rankLabel(rank, arabic) {
  if (!rank) return '—';
  return arabic ? (rank.ar || '—') : (rank.en || '—');
}

function StandingRow({ label, gpa, percent, letter, rank, arabic, testid }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm" data-testid={testid}>
      <div>
        <p className="text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold">{fmtNum(gpa)}</p>
      </div>
      <div>
        <p className="text-muted-foreground">{arabic ? 'النسبة المئوية' : 'Percent'}</p>
        <p className="text-lg font-semibold">{percent == null ? '—' : `${fmtNum(percent, 1)}%`}</p>
      </div>
      <div>
        <p className="text-muted-foreground">{arabic ? 'الحرف' : 'Letter'}</p>
        <p className="text-lg font-semibold">{letter || '—'}</p>
      </div>
      <div>
        <p className="text-muted-foreground">{arabic ? 'التقدير' : 'Standing'}</p>
        <p className="text-lg font-semibold">{rankLabel(rank, arabic)}</p>
      </div>
    </div>
  );
}

const HISTORY_TABS = [
  { view: 'current', to: '/academic-history', key: 'currentTermTab', testid: 'history-tab-current' },
  { view: 'all', to: '/academic-history/all', key: 'allTermsTab', testid: 'history-tab-all' },
  { view: 'progress', to: '/academic-history/progress', key: 'progressTab', testid: 'history-tab-progress' },
];

export default function AcademicHistory() {
  const { api } = useAuth();
  const { t, language } = useLanguage();
  const location = useLocation();
  const view = historyViewFromPath(location.pathname);
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [suggestions, setSuggestions] = useState([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [targetHours, setTargetHours] = useState(14);
  const [suggestionsTotalHours, setSuggestionsTotalHours] = useState(null);
  const [suggestionsExactMatch, setSuggestionsExactMatch] = useState(true);

  const isArabic = language === 'ar';

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const res = await api.get('/academic/my-history');
      setHistory(res.data || null);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to load academic history');
      setHistory(null);
    } finally {
      setLoading(false);
    }
  };

  const loadSuggestions = async () => {
    try {
      setLoadingSuggestions(true);
      const res = await api.get('/ai/next-semester-suggestions', {
        params: { target_hours: targetHours || 14, lang: isArabic ? 'ar' : 'en' },
      });
      setSuggestions(Array.isArray(res.data?.suggestions) ? res.data.suggestions : []);
      setSuggestionsTotalHours(res.data?.total_hours ?? null);
      setSuggestionsExactMatch(res.data?.exact_match !== false);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to load suggestions');
      setSuggestions([]);
      setSuggestionsTotalHours(null);
      setSuggestionsExactMatch(true);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const terms = view === 'progress'
    ? []
    : termsForHistoryView(history?.terms || [], view);
  const progressRows = view === 'progress'
    ? progressRowsFromTerms(history?.terms || [])
    : [];
  const titleKey = view === 'current'
    ? 'academicHistory.currentTermTab'
    : view === 'all'
      ? 'academicHistory.allTermsTab'
      : 'academicHistory.progressTab';
  const hintKey = view === 'current'
    ? 'academicHistory.currentTermHint'
    : view === 'all'
      ? 'academicHistory.allTermsHint'
      : 'academicHistory.progressHint';

  return (
    <div className="space-y-6" data-testid="academic-history-page" data-history-view={view}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold font-display">
            {t(titleKey)}
            {view === 'all' && !loading && terms.length > 0 ? ` (${terms.length})` : ''}
            {view === 'progress' && !loading && progressRows.length > 0 ? ` (${progressRows.length})` : ''}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">{t(hintKey)}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2" data-testid="history-view-tabs">
        {HISTORY_TABS.map((tab) => (
          <NavLink
            key={tab.view}
            to={tab.to}
            end={tab.view === 'current'}
            data-testid={tab.testid}
            className={({ isActive }) => cn(
              'inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium border transition-colors',
              isActive
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-foreground border-border hover:bg-muted',
            )}
          >
            {t(`academicHistory.${tab.key}`)}
          </NavLink>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : view === 'progress' ? (
        progressRows.length === 0 ? (
          <Card data-testid="history-progress-empty">
            <CardContent className="pt-6">
              <p className="text-muted-foreground text-center py-8">
                {t('academicHistory.noProgressRows')}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card data-testid="history-progress-table">
            <CardContent className="pt-6 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow data-testid="history-progress-headers">
                    <TableHead className="whitespace-nowrap">{t('academicHistory.progressTermName')}</TableHead>
                    <TableHead className="whitespace-nowrap">{t('academicHistory.progressSemesterGpa')}</TableHead>
                    <TableHead className="whitespace-nowrap">{t('academicHistory.progressSemesterPercent')}</TableHead>
                    <TableHead className="whitespace-nowrap">{t('academicHistory.progressCgpa')}</TableHead>
                    <TableHead className="whitespace-nowrap">{t('academicHistory.progressCgpaPercent')}</TableHead>
                    <TableHead className="whitespace-nowrap">{t('academicHistory.progressWarnings')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {progressRows.map((row) => (
                    <TableRow
                      key={row.key}
                      data-testid={`history-progress-row-${row.key}`}
                      data-at-risk={row.at_risk ? 'true' : 'false'}
                      className={row.at_risk ? 'bg-rose-500/10' : undefined}
                    >
                      <TableCell className="font-medium whitespace-nowrap" data-testid={`progress-name-${row.key}`}>
                        {row.name}
                      </TableCell>
                      <TableCell data-testid={`progress-semester-gpa-${row.key}`}>
                        {fmtNum(row.semester_gpa)}
                      </TableCell>
                      <TableCell data-testid={`progress-semester-percent-${row.key}`}>
                        {row.semester_percent == null ? '—' : `${fmtNum(row.semester_percent, 1)}%`}
                      </TableCell>
                      <TableCell
                        data-testid={`progress-cgpa-${row.key}`}
                        className={row.at_risk ? 'font-semibold text-rose-700 dark:text-rose-300' : undefined}
                      >
                        {fmtNum(row.cgpa)}
                      </TableCell>
                      <TableCell
                        data-testid={`progress-cgpa-percent-${row.key}`}
                        className={row.at_risk ? 'font-semibold text-rose-700 dark:text-rose-300' : undefined}
                      >
                        {row.cumulative_percent == null ? '—' : `${fmtNum(row.cumulative_percent, 1)}%`}
                      </TableCell>
                      <TableCell
                        data-testid={`progress-warning-${row.key}`}
                        className={row.at_risk ? 'text-rose-700 dark:text-rose-300 text-sm font-medium max-w-xs' : undefined}
                      >
                        {row.at_risk ? t('academicHistory.progressWarningUnderTwo') : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )
      ) : terms.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground text-center py-8">
              {view === 'current'
                ? t('academicHistory.noCurrentTerm')
                : (isArabic ? 'لا يوجد سجل فصلي بعد.' : 'No semester record yet.')}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div
          className="space-y-6"
          data-testid={view === 'all' ? 'history-all-tables' : 'history-current-table'}
        >
        {terms.map((term) => {
          const currentOpen = Number(term.is_current) === 1 && Number(term.is_closed) !== 1;
          return (
          <Card
            key={term.key}
            data-testid={currentOpen ? 'history-term-current' : `history-term-${term.key}`}
            data-term-key={term.key}
          >
            <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-lg">{term.name}</CardTitle>
              <div className="flex items-center gap-2">
                {Number(term.is_current) === 1 && Number(term.is_closed) !== 1 ? (
                  <Badge variant="secondary" className="text-xs">{isArabic ? 'حالي' : 'Current'}</Badge>
                ) : null}
                {Number(term.is_closed) === 1 ? (
                  <Badge variant="outline" className="text-xs">{isArabic ? 'مغلق' : 'Closed'}</Badge>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="overflow-x-auto -mx-1">
                <Table>
                  <TableHeader>
                    <TableRow data-testid="history-mark-headers">
                      <TableHead className="whitespace-nowrap">{t('academicHistory.courseAndMark')}</TableHead>
                      <TableHead className="whitespace-nowrap" data-testid="history-col-midterm">{t('academicHistory.midtermTheory')}</TableHead>
                      <TableHead className="whitespace-nowrap" data-testid="history-col-sai">{t('academicHistory.saiTheory')}</TableHead>
                      <TableHead className="whitespace-nowrap" data-testid="history-col-practical">{t('academicHistory.practicalMark')}</TableHead>
                      <TableHead className="whitespace-nowrap" data-testid="history-col-subtotal">{t('academicHistory.courseWorkTotal')}</TableHead>
                      <TableHead className="whitespace-nowrap" data-testid="history-col-final">{t('academicHistory.finalTheory')}</TableHead>
                      <TableHead className="whitespace-nowrap" data-testid="history-col-grand">{t('academicHistory.grandTotal')}</TableHead>
                      <TableHead className="whitespace-nowrap" data-testid="history-col-percent">{t('academicHistory.percent')}</TableHead>
                      <TableHead className="whitespace-nowrap" data-testid="history-col-gpa">{t('academicHistory.gpaPoints')}</TableHead>
                      <TableHead className="whitespace-nowrap" data-testid="history-col-letter">{t('academicHistory.letter')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {term.courses?.length ? term.courses.map((c) => c.withdrawn_w ? (
                      <TableRow
                        key={c.id}
                        className="bg-muted/70 text-muted-foreground hover:bg-muted/70"
                        data-testid={c.in_current_term ? `history-current-${c.course_code}` : `history-course-${c.id}`}
                        data-withdrawn="true"
                      >
                        <TableCell className="font-medium">
                          <span className="flex flex-wrap items-center gap-2">
                            {c.course_name} ({c.course_code})
                            <Badge variant="outline" className="text-[10px] border-muted-foreground/40 text-muted-foreground" data-testid={`history-withdrawn-badge-${c.course_code}`}>
                              {isArabic ? 'مسحوبة (W)' : 'Withdrawn (W)'}
                            </Badge>
                          </span>
                          <span className="block text-xs mt-1">
                            {isArabic
                              ? 'علامات المادة مخفية ولا تدخل في المعدل الفصلي ولا التراكمي.'
                              : 'Marks are hidden and excluded from semester and cumulative GPA.'}
                          </span>
                        </TableCell>
                        {['midterm', 'sai', 'practical', 'subtotal', 'final', 'grand', 'percent', 'gpa'].map((col) => (
                          <TableCell key={col} data-testid={`history-${col}-${c.course_code}`}>—</TableCell>
                        ))}
                        <TableCell className="font-bold" data-testid={`history-letter-${c.course_code}`}>W</TableCell>
                      </TableRow>
                    ) : (
                      <TableRow
                        key={c.id}
                        className={c.deprived ? 'bg-rose-500/20 hover:bg-rose-500/25' : undefined}
                        data-testid={c.in_current_term ? `history-current-${c.course_code}` : (c.deprived ? `history-deprived-${c.id}` : `history-course-${c.id}`)}
                      >
                        <TableCell className={c.deprived ? 'font-medium text-rose-900 dark:text-rose-100' : 'font-medium'}>
                          <span className="flex flex-wrap items-center gap-2">
                            {c.course_name} ({c.course_code})
                            {c.deprived ? (
                              <Badge variant="destructive" className="text-[10px]">{isArabic ? 'حرمان' : 'Deprived'}</Badge>
                            ) : c.in_current_term ? (
                              <Badge variant="secondary" className="text-[10px]">
                                {c.registered
                                  ? (isArabic ? 'مسجّلة' : 'Registered')
                                  : (isArabic ? 'هذا الفصل' : 'This term')}
                              </Badge>
                            ) : null}
                          </span>
                          {c.deprived ? (
                            <span className="block text-xs font-medium mt-1" data-testid={`history-deprived-msg-${c.course_code}`}>
                              {isArabic
                                ? 'تم حرمانك من المادة لتجاوزك الحد المسموح للغياب — قدّم طلب لإلغاء الحرمان'
                                : 'You were deprived of this course because you exceeded the allowed absence limit. Submit a request to cancel the deprivation.'}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell data-testid={`history-midterm-${c.course_code}`}>{fmtMark(c.mark_details?.midterm_theory)}</TableCell>
                        <TableCell data-testid={`history-sai-${c.course_code}`}>{fmtMark(c.mark_details?.sai_theory)}</TableCell>
                        <TableCell data-testid={`history-practical-${c.course_code}`}>{fmtMark(c.mark_details?.practical)}</TableCell>
                        <TableCell data-testid={`history-subtotal-${c.course_code}`}>
                          {fmtMarkSum([
                            c.mark_details?.midterm_theory,
                            c.mark_details?.sai_theory,
                            c.mark_details?.practical,
                          ])}
                        </TableCell>
                        <TableCell data-testid={`history-final-${c.course_code}`}>{fmtMark(c.mark_details?.final_theory)}</TableCell>
                        <TableCell data-testid={`history-grand-${c.course_code}`}>
                          {c.deprived
                            ? '0'
                            : fmtMarkSum([
                              c.mark_details?.midterm_theory,
                              c.mark_details?.sai_theory,
                              c.mark_details?.practical,
                              c.mark_details?.final_theory,
                            ])}
                        </TableCell>
                        <TableCell data-testid={`history-percent-${c.course_code}`}>
                          {(c.percent ?? c.current_grade) != null ? `${fmtNum(c.percent ?? c.current_grade, 1)}%` : '—'}
                        </TableCell>
                        <TableCell data-testid={`history-gpa-${c.course_code}`}>
                          {c.gpa_points != null ? fmtNum(c.gpa_points) : '—'}
                        </TableCell>
                        <TableCell data-testid={`history-letter-${c.course_code}`}>
                          {c.letter_grade ?? '—'}
                        </TableCell>
                      </TableRow>
                    )) : (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center text-muted-foreground">
                          {isArabic ? 'لا مواد في هذا الفصل' : 'No courses in this semester'}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              <div className="space-y-3 pt-4 border-t">
                <StandingRow
                  label={t('academicHistory.semesterGpa')}
                  gpa={term.semester_gpa}
                  percent={term.semester_percent}
                  letter={term.semester_letter}
                  rank={term.semester_rank}
                  arabic={isArabic}
                  testid="semester-standing"
                />
                <StandingRow
                  label={t('academicHistory.cumulativeGpa')}
                  gpa={term.cgpa}
                  percent={term.cumulative_percent}
                  letter={term.cumulative_letter}
                  rank={term.cumulative_rank}
                  arabic={isArabic}
                  testid="cumulative-standing"
                />
              </div>
            </CardContent>
          </Card>
          );
        })}
        </div>
      )}

      {view !== 'progress' && !loading ? (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            {t('academicHistory.nextSuggestions')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Label htmlFor="target-hours" className="shrink-0">
              {isArabic ? 'عدد الساعات المطلوبة للفصل القادم:' : 'Target hours for next semester:'}
            </Label>
            <Input
              id="target-hours"
              type="number"
              min={1}
              max={24}
              value={targetHours}
              onChange={(e) => setTargetHours(Math.max(1, Math.min(24, parseInt(e.target.value, 10) || 0)))}
              className="w-20"
            />
            <span className="text-sm text-muted-foreground">{isArabic ? 'ساعة' : 'hours'}</span>
            <Button variant="outline" onClick={loadSuggestions} disabled={loadingSuggestions}>
              {loadingSuggestions ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
              {t('academicHistory.loadSuggestions')}
            </Button>
          </div>
          {suggestions.length > 0 && (
            <>
              {suggestionsTotalHours != null && (
                <p className="text-sm font-medium text-muted-foreground">
                  {isArabic ? `المجموع: ${suggestionsTotalHours} ساعة` : `Total: ${suggestionsTotalHours} hours`}
                  {targetHours != null && !suggestionsExactMatch && (
                    <span className="text-amber-600 dark:text-amber-400">
                      {' '}({isArabic ? 'المطلوب' : 'requested'} {targetHours})
                    </span>
                  )}
                </p>
              )}
              <ul className="space-y-2 list-disc list-inside">
                {suggestions.map((s, i) => (
                  <li key={s.id || i}>
                    <strong>{s.course_name}</strong> ({s.course_code})
                    {s.carried && (
                      <Badge variant="secondary" className="ms-1 text-xs">{isArabic ? 'محمولة' : 'Carried'}</Badge>
                    )}
                    {s.credit_hours != null && (
                      <span className="text-muted-foreground"> — {s.credit_hours} {isArabic ? 'ساعة' : 'h'}</span>
                    )}
                    {s.reason ? ` — ${s.reason}` : (isArabic ? ' — مناسب حسب المتطلبات والعلامات' : ' — Suggested by prerequisites and grades')}
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>
      ) : null}
    </div>
  );
}
