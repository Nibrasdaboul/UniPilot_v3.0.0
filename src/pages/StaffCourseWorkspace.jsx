import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft, FileText, Loader2, Users } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/lib/AuthContext';
import { useLanguage } from '@/lib/LanguageContext';
import { useCourseChatStream } from '@/lib/useCourseChatStream';
import AttendanceGrid from '@/components/academic/AttendanceGrid';
import { splitAttendanceByKind } from '@/lib/attendanceSplit';
import CourseGradesTable from '@/components/academic/CourseGradesTable';
import CourseWorkAppealsInbox from '@/components/academic/CourseWorkAppealsInbox';
import DeprivationInbox from '@/components/academic/DeprivationInbox';
import CourseLectureFiles from '@/components/academic/CourseLectureFiles';
import CourseStaffChat from '@/components/academic/CourseStaffChat';
import StaffSessionsPanel from '@/components/academic/StaffSessionsPanel';
import VdaCourseSessionsPanel from '@/components/academic/VdaStaffSessions';
import { toast } from 'sonner';

function StaffList({ title, items, empty, ar }) {
  return (
    <Card className="rounded-[2rem]">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {(items || []).length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (items || []).map((person) => (
          <p key={person.user_id} className="text-sm py-1">
            {person.full_name || '—'}
            {person.person_code ? ` · ${person.person_code}` : ''}
            <span className="text-muted-foreground">
              {` · ${person.staff_role === 'teaching_assistant' ? (ar ? 'معيد' : 'TA') : (ar ? 'مدرّس' : 'Instructor')}`}
            </span>
          </p>
        ))}
      </CardContent>
    </Card>
  );
}

function applySheet(prev, sheet) {
  if (!prev) return prev;
  return {
    ...prev,
    grade_sheet: sheet,
    sheet_status: sheet?.status || prev.sheet_status,
    grades: prev.grades ? { ...prev.grades, sheet } : prev.grades,
  };
}

function applyAttendanceSheet(prev, sheet) {
  if (!prev) return prev;
  return {
    ...prev,
    attendance_sheet: sheet,
    attendance_sheet_status: sheet?.status || prev.attendance_sheet_status,
  };
}

function prereqLabel(card, ar) {
  if (card?.prerequisite?.course_code) {
    return `${card.prerequisite.course_code} — ${card.prerequisite.course_name}`;
  }
  return ar ? 'بدون' : 'None';
}

export default function StaffCourseWorkspace({ mode }) {
  const { catalogId } = useParams();
  const navigate = useNavigate();
  const { api, user, isViceDeanAcademic, isTeachingStaff, isTeachingAssistant, isExamsOffice } = useAuth();
  const { language } = useLanguage();
  const ar = language === 'ar';
  const isVda = mode === 'vda';
  const isExams = mode === 'exams';
  const showSessions = !isVda && !isExams && isTeachingStaff;
  const [searchParams] = useSearchParams();
  const backTo = isVda ? '/course-info' : (isExams ? '/course-marks' : '/my-courses');
  const apiBase = isVda ? '/vda/course-info' : (isExams ? '/exams/course-marks' : '/academic/staff/my-courses');

  const [card, setCard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [theory, setTheory] = useState('');
  const [practical, setPractical] = useState('');
  const [busy, setBusy] = useState(null);
  const [attendanceBusy, setAttendanceBusy] = useState(false);
  const [gradesBusy, setGradesBusy] = useState(false);
  const [lecturesBusy, setLecturesBusy] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);

  const allowed = isVda ? isViceDeanAcademic : (isExams ? isExamsOffice : isTeachingStaff);

  const loadCard = async () => {
    setLoading(true);
    try {
      const res = await api.get(`${apiBase}/${catalogId}`);
      setCard(res.data);
      setTheory(res.data.theory_syllabus || '');
      setPractical(res.data.practical_syllabus || '');
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'تعذر فتح صفحة المادة' : 'Failed to open the course page'));
      navigate(backTo, { replace: true });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (allowed && catalogId) loadCard();
  }, [api, allowed, catalogId, ar]);

  useCourseChatStream(`${apiBase}/${catalogId}/chat/stream`, allowed && !!catalogId && !isExams, (incoming) => {
    const items = (incoming || []).map((row) => ({
      ...row,
      mine: Number(row.user_id) === Number(user?.id),
    }));
    setCard((prev) => (prev ? { ...prev, chat: { items } } : prev));
  });

  const saveSyllabus = async (e) => {
    e.preventDefault();
    setBusy('save');
    try {
      const res = await api.patch(`${apiBase}/${catalogId}`, {
        theory_syllabus: theory,
        practical_syllabus: practical,
      });
      setCard(res.data);
      toast.success(ar ? 'حُفظ المنهج' : 'Syllabus saved');
    } catch (err) {
      toast.error(err.response?.data?.detail || (ar ? 'تعذر حفظ المنهج' : 'Failed to save syllabus'));
    } finally {
      setBusy(null);
    }
  };

  if (loading || !card) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]" data-testid="staff-course-workspace">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const attendanceSplit = splitAttendanceByKind(card.attendance);
  const addAttendanceSession = async () => {
    setAttendanceBusy(true);
    try {
      const res = await api.post(`${apiBase}/${catalogId}/attendance/sessions`);
      setCard((prev) => (prev ? { ...prev, attendance: res.data } : prev));
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'تعذر إضافة الجلسة' : 'Failed to add a session'));
    } finally {
      setAttendanceBusy(false);
    }
  };
  const markAttendance = async (sessionId, userId, status) => {
    setAttendanceBusy(true);
    try {
      const res = await api.put(`${apiBase}/${catalogId}/attendance`, {
        session_id: sessionId,
        user_id: userId,
        status,
      });
      setCard((prev) => (prev ? { ...prev, attendance: res.data } : prev));
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'تعذر حفظ الحضور' : 'Failed to save attendance'));
    } finally {
      setAttendanceBusy(false);
    }
  };
  const markAttendanceEval = async (sessionId, userId, evaluated) => {
    setAttendanceBusy(true);
    try {
      const res = await api.put(`${apiBase}/${catalogId}/attendance/eval`, {
        session_id: sessionId,
        user_id: userId,
        evaluated,
      });
      setCard((prev) => (prev ? { ...prev, attendance: res.data } : prev));
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'تعذر حفظ التقييم' : 'Failed to save evaluation'));
    } finally {
      setAttendanceBusy(false);
    }
  };
  const attendanceSheet = card.attendance_sheet || {};
  const attStatus = attendanceSheet.status || 'staff_draft';
  const attDraft = attStatus === 'staff_draft';
  const attAtExams = attStatus === 'at_exams';
  const attStaffReview = attStatus === 'staff_review';
  const attAwaitingVda = attStatus === 'awaiting_vda';
  const attPublished = attStatus === 'published';
  const staffAttEdit = !isVda && !isExams && attDraft;
  const examsAttEdit = isExams && (attDraft || attAtExams);
  const gradeSheet = card.grade_sheet || card.grades?.sheet || {};
  const sheetStatus = gradeSheet.status || 'staff_draft';
  const sheetAtExams = sheetStatus === 'at_exams';
  const sheetStaffReview = sheetStatus === 'staff_review';
  const sheetAwaitingVda = sheetStatus === 'awaiting_vda';
  const sheetPublished = sheetStatus === 'published';
  const theoryAutomated = Boolean(gradeSheet.theory_midterm_automated);
  const examsCanEdit = isExams && (sheetStatus === 'staff_draft' || sheetStatus === 'at_exams');
  const gradeComponents = isVda
    ? []
    : examsCanEdit
      ? ['midterm_theory', 'sai_theory', 'final_theory', 'practical']
      : (sheetStatus === 'staff_draft'
        ? (isTeachingAssistant
          ? ['practical']
          : (theoryAutomated ? ['sai_theory'] : ['midterm_theory', 'sai_theory', 'final_theory']))
        : []);
  const withdrawnUserIds = new Set(
    [...(card.grades?.students || []), ...(card.attendance?.students || [])]
      .filter((student) => student.withdrawn)
      .map((student) => Number(student.user_id)),
  );
  const enrolled = Number(card.enrolled_count) || 0;
  const capacity = Number(card.capacity) || 0;
  const staffCount = (card.theory_staff?.length || 0) + (card.practical_staff?.length || 0);
  const department = ar
    ? (card.department?.name_ar || card.department?.name)
    : (card.department?.name_en || card.department?.name);

  return (
    <div className="space-y-8 p-4 sm:p-6 pb-12" data-testid="staff-course-workspace">
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <Link to={backTo}>
          <Button variant="ghost" size="icon" className="rounded-full shrink-0">
            <ChevronLeft className="w-5 h-5 rtl-flip" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <Badge variant="secondary" className="rounded-full text-xs font-bold">
              {card.course_code || 'N/A'}
            </Badge>
              {card.offered
              ? <Badge className="rounded-full text-xs">{ar ? 'مطروحة' : 'Offered'}</Badge>
              : <Badge variant="outline" className="rounded-full text-xs">{ar ? 'غير مطروحة' : 'Not offered'}</Badge>}
            <Badge
              variant="outline"
              className="rounded-full text-xs border-amber-500/50 text-amber-700 dark:text-amber-400"
              data-testid={`workspace-sheet-${sheetStatus}`}
            >
              {sheetPublished
                ? (ar ? 'أُرسلت للطلاب' : 'Sent to students')
                : sheetAwaitingVda
                  ? (ar ? 'بانتظار تأكيد نائب العميد' : 'Awaiting vice dean')
                  : sheetStaffReview
                    ? (ar ? 'قيد تدقيق الكادر التدريسي' : 'Under teaching-staff review')
                    : sheetAtExams
                      ? (ar ? 'عند دائرة الامتحانات' : 'At the Exams Office')
                      : (ar ? 'قيد إدخال الكادر' : 'With teaching staff')}
            </Badge>
          </div>
          <h1 className="text-3xl font-bold font-display">{card.course_name}</h1>
          {department ? (
            <p className="text-muted-foreground mt-1 flex items-center gap-1">
              <Users className="w-4 h-4" /> {department}
            </p>
          ) : null}
        </div>
        <div className="text-end flex flex-col items-end gap-1 flex-shrink-0">
          <p className="text-sm text-muted-foreground">{ar ? 'الطلاب المسجّلون' : 'Enrolled students'}</p>
          <p className="text-4xl font-bold font-display text-primary">
            {capacity > 0 ? `${enrolled}/${capacity}` : enrolled}
          </p>
          <p className="text-sm text-muted-foreground">{prereqLabel(card, ar)}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="rounded-2xl p-4 text-center">
          <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">{ar ? 'الطلاب' : 'Students'}</p>
          <p className="text-2xl font-bold mt-1">{enrolled}</p>
        </Card>
        <Card className="rounded-2xl p-4 text-center">
          <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">{ar ? 'الساعات' : 'Credits'}</p>
          <p className="text-2xl font-bold mt-1">{card.credit_hours ?? 0}</p>
        </Card>
        <Card className="rounded-2xl p-4 text-center">
          <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">{ar ? 'الكادر' : 'Staff'}</p>
          <p className="text-2xl font-bold mt-1">{staffCount}</p>
        </Card>
        <Card className="rounded-2xl p-4 text-center">
          <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">{ar ? 'الحالة' : 'Status'}</p>
          <p className="text-2xl font-bold mt-1">{card.offered ? (ar ? 'مطروحة' : 'Open') : (ar ? 'مغلقة' : 'Closed')}</p>
        </Card>
      </div>

      <Tabs defaultValue={showSessions && searchParams.get('tab') === 'sessions' ? 'sessions' : 'overview'} className="space-y-6">
        <TabsList className="bg-muted/50 p-1 rounded-2xl flex-wrap h-auto">
          <TabsTrigger value="overview" className="rounded-xl">{ar ? 'نظرة عامة' : 'Overview'}</TabsTrigger>
          <TabsTrigger value="attendance" className="rounded-xl">{ar ? 'الحضور' : 'Attendance'}</TabsTrigger>
          <TabsTrigger value="grades" className="rounded-xl">{ar ? 'العلامات' : 'Grades'}</TabsTrigger>
          {!isExams ? <TabsTrigger value="files" className="rounded-xl">{ar ? 'الملفات / المحاضرات' : 'Lectures'}</TabsTrigger> : null}
          {!isExams ? <TabsTrigger value="chat" className="rounded-xl">{ar ? 'المحادثة' : 'Chat'}</TabsTrigger> : null}
          {showSessions ? <TabsTrigger value="sessions" className="rounded-xl" data-testid="workspace-tab-sessions">{ar ? 'جلساتي' : 'My sessions'}</TabsTrigger> : null}
          {isVda && isViceDeanAcademic ? <TabsTrigger value="staff-sessions" className="rounded-xl" data-testid="workspace-tab-staff-sessions">{ar ? 'جلسات الكادر' : 'Staff sessions'}</TabsTrigger> : null}
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <Card className="rounded-[2rem]">
            <CardHeader>
              <CardTitle>{ar ? 'الوصف' : 'Description'}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">{card.description || (ar ? 'لا يوجد وصف' : 'No description available')}</p>
              <p className="text-sm text-muted-foreground mt-3">
                {ar ? 'المتطلب السابق:' : 'Prerequisite:'} {prereqLabel(card, ar)}
              </p>
            </CardContent>
          </Card>

          <div className="grid md:grid-cols-2 gap-6">
            <StaffList
              title={ar ? 'مدرّسو النظري' : 'Theory instructors'}
              items={card.theory_staff}
              empty={ar ? 'لم يُعيَّن مدرّس نظري بعد.' : 'No theory instructor assigned yet.'}
              ar={ar}
            />
            <StaffList
              title={ar ? 'معيدو العملي' : 'Practical teaching assistants'}
              items={card.practical_staff}
              empty={ar ? 'لم يُعيَّن معيد عملي بعد.' : 'No practical TA assigned yet.'}
              ar={ar}
            />
          </div>

          <Card className="rounded-[2rem]">
            <CardHeader>
              <CardTitle>{ar ? 'المنهج' : 'Syllabus'}</CardTitle>
              <CardDescription>
                {isVda
                  ? (ar ? 'يمكنك تعديل المنهج النظري والعملي هنا.' : 'You can edit the theory and practical syllabus here.')
                  : (ar ? 'المنهج للعرض فقط.' : 'Syllabus is view-only.')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={isVda ? saveSyllabus : (e) => e.preventDefault()} className="space-y-3">
                <div className="space-y-1">
                  <Label>{ar ? 'المنهج النظري' : 'Theory syllabus'}</Label>
                  <textarea
                    rows={6}
                    value={isVda ? theory : (card.theory_syllabus || '')}
                    onChange={isVda ? (e) => setTheory(e.target.value) : undefined}
                    readOnly={!isVda}
                    disabled={!isVda}
                    className="flex min-h-[120px] w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label>{ar ? 'المنهج العملي' : 'Practical syllabus'}</Label>
                  <textarea
                    rows={6}
                    value={isVda ? practical : (card.practical_syllabus || '')}
                    onChange={isVda ? (e) => setPractical(e.target.value) : undefined}
                    readOnly={!isVda}
                    disabled={!isVda}
                    className="flex min-h-[120px] w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
                {isVda ? (
                  <Button type="submit" className="rounded-xl" disabled={busy === 'save'}>
                    {ar ? 'حفظ المنهج' : 'Save syllabus'}
                  </Button>
                ) : null}
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="attendance">
          <Card className="rounded-[2rem]">
            <CardHeader>
              <CardTitle>{ar ? 'الحضور' : 'Attendance'}</CardTitle>
              <CardDescription>
                {attPublished
                  ? (ar ? 'أُرسلت تنبيهات الغياب والحرمان للطلاب. التعديل مقفول.' : 'Absence warnings and deprivations were sent. Editing is locked.')
                  : attAwaitingVda
                    ? (ar ? 'أكّد الكادر كشف الحضور. نائب العميد يعتمد أو يلغي الحزمة.' : 'Teaching staff confirmed attendance. The vice dean publishes or cancels the package.')
                    : attStaffReview
                      ? (ar ? 'دائرة الامتحانات اعتمدت الكشف. الكادر يؤكّد دون تعديل.' : 'The Exams Office adopted the sheet. Teaching staff confirm without editing.')
                      : attAtExams
                        ? (isExams
                          ? (ar ? 'يمكنك إلغاء غياب (حاضر/معتذر) ثم اعتماد الكشف.' : 'You can cancel an absence (present/excused), then adopt the sheet.')
                          : (ar ? 'كشف الحضور عند دائرة الامتحانات.' : 'The attendance sheet is with the Exams Office.'))
                        : isVda
                          ? (ar ? 'جدولان منفصلان للعرض. التنبيهات لا تُرسل إلا بعد اعتمادك.' : 'Two view-only tables. Warnings are sent only after you publish.')
                          : isTeachingAssistant
                            ? (ar ? 'تكتب حضور العملي والتقييم فقط ثم ترسل الكشف.' : 'You edit practical attendance and evaluation, then submit the sheet.')
                            : (ar ? 'تكتب حضور النظري فقط ثم ترسل الكشف.' : 'You edit theory attendance, then submit the sheet.')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              <Badge
                variant="outline"
                className="rounded-full text-xs border-sky-500/50 text-sky-700 dark:text-sky-400"
                data-testid={`workspace-attendance-${attStatus}`}
              >
                {attPublished
                  ? (ar ? 'أُرسلت تنبيهات الحضور' : 'Attendance warnings sent')
                  : attAwaitingVda
                    ? (ar ? 'حضور: بانتظار النائب' : 'Attendance: awaiting vice dean')
                    : attStaffReview
                      ? (ar ? 'حضور: قيد تأكيد الكادر' : 'Attendance: staff confirmation')
                      : attAtExams
                        ? (ar ? 'حضور: عند دائرة الامتحانات' : 'Attendance: at Exams Office')
                        : (ar ? 'حضور: قيد تسجيل الكادر' : 'Attendance: with teaching staff')}
              </Badge>
              {!isVda && !isExams && attendanceSheet.can_submit ? (
                <Button
                  type="button"
                  className="rounded-xl"
                  data-testid="submit-attendance-to-exams"
                  disabled={attendanceBusy}
                  onClick={async () => {
                    setAttendanceBusy(true);
                    try {
                      const res = await api.post(`${apiBase}/${catalogId}/attendance/submit`);
                      setCard((prev) => applyAttendanceSheet(prev, res.data));
                      toast.success(ar ? 'أُرسل كشف الحضور إلى دائرة الامتحانات' : 'Attendance sheet sent to the Exams Office');
                    } catch (e) {
                      toast.error(e.response?.data?.detail || (ar ? 'تعذر إرسال كشف الحضور' : 'Failed to send the attendance sheet'));
                    } finally {
                      setAttendanceBusy(false);
                    }
                  }}
                >
                  {ar ? 'إرسال كشف الحضور إلى دائرة الامتحانات' : 'Send attendance sheet to the Exams Office'}
                </Button>
              ) : null}
              {isExams && attendanceSheet.can_adopt ? (
                <Button
                  type="button"
                  className="rounded-xl"
                  data-testid="adopt-attendance"
                  disabled={attendanceBusy}
                  onClick={async () => {
                    setAttendanceBusy(true);
                    try {
                      const res = await api.post(`${apiBase}/${catalogId}/attendance/adopt`);
                      setCard((prev) => applyAttendanceSheet(prev, res.data));
                      toast.success(ar ? 'اعتمدت كشف الحضور. بانتظار تأكيد الكادر.' : 'Attendance adopted. Waiting for teaching-staff confirmation.');
                    } catch (e) {
                      toast.error(e.response?.data?.detail || (ar ? 'تعذر اعتماد كشف الحضور' : 'Failed to adopt the attendance sheet'));
                    } finally {
                      setAttendanceBusy(false);
                    }
                  }}
                >
                  {ar ? 'اعتماد كشف الحضور وإرساله للكادر' : 'Adopt attendance and send to teaching staff'}
                </Button>
              ) : null}
              {!isVda && !isExams && attendanceSheet.can_confirm ? (
                <Button
                  type="button"
                  className="rounded-xl"
                  data-testid="confirm-attendance"
                  disabled={attendanceBusy}
                  onClick={async () => {
                    setAttendanceBusy(true);
                    try {
                      const res = await api.post(`${apiBase}/${catalogId}/attendance/confirm`);
                      setCard((prev) => applyAttendanceSheet(prev, res.data));
                      toast.success(ar ? 'أكّدت كشف الحضور' : 'Attendance sheet confirmed');
                    } catch (e) {
                      toast.error(e.response?.data?.detail || (ar ? 'تعذر تأكيد كشف الحضور' : 'Failed to confirm the attendance sheet'));
                    } finally {
                      setAttendanceBusy(false);
                    }
                  }}
                >
                  {ar ? 'تأكيد كشف الحضور' : 'Confirm attendance sheet'}
                </Button>
              ) : null}
              {isVda && attendanceSheet.can_publish ? (
                <Button
                  type="button"
                  className="rounded-xl"
                  data-testid="publish-attendance"
                  disabled={attendanceBusy}
                  onClick={async () => {
                    setAttendanceBusy(true);
                    try {
                      await api.post(`${apiBase}/${catalogId}/attendance/publish`);
                      await loadCard();
                      toast.success(ar ? 'اعتمدت الحضور وأُرسلت التنبيهات' : 'Attendance published and warnings sent');
                    } catch (e) {
                      toast.error(e.response?.data?.detail || (ar ? 'تعذر اعتماد الحضور' : 'Failed to publish attendance'));
                    } finally {
                      setAttendanceBusy(false);
                    }
                  }}
                >
                  {ar ? 'اعتماد الحضور وإرسال التنبيهات' : 'Publish attendance and send warnings'}
                </Button>
              ) : null}
              {isVda && attendanceSheet.can_cancel ? (
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl"
                  data-testid="cancel-attendance-package"
                  disabled={attendanceBusy}
                  onClick={async () => {
                    setAttendanceBusy(true);
                    try {
                      const res = await api.post(`${apiBase}/${catalogId}/attendance/cancel`);
                      setCard((prev) => applyAttendanceSheet(prev, res.data));
                      toast.success(ar ? 'أُلغي كشف الحضور وأُعيد للكادر' : 'Attendance package cancelled and returned to staff');
                    } catch (e) {
                      toast.error(e.response?.data?.detail || (ar ? 'تعذر إلغاء كشف الحضور' : 'Failed to cancel the attendance package'));
                    } finally {
                      setAttendanceBusy(false);
                    }
                  }}
                >
                  {ar ? 'إلغاء الحزمة وإعادتها للكادر' : 'Cancel package and return to staff'}
                </Button>
              ) : null}
              <AttendanceGrid
                attendance={attendanceSplit.theory}
                ar={ar}
                canEdit={(staffAttEdit && !isTeachingAssistant) || examsAttEdit}
                heading={ar ? 'حضور النظري' : 'Theory attendance'}
                testId="attendance-grid-theory"
                onAddSession={staffAttEdit ? addAttendanceSession : undefined}
                onMark={markAttendance}
                busy={attendanceBusy}
              />
              <AttendanceGrid
                attendance={attendanceSplit.practical}
                ar={ar}
                canEdit={(staffAttEdit && isTeachingAssistant) || examsAttEdit}
                showEvaluation
                canEditEvaluation={staffAttEdit && isTeachingAssistant}
                heading={ar ? 'حضور العملي' : 'Practical attendance'}
                testId="attendance-grid-practical"
                onAddSession={staffAttEdit ? addAttendanceSession : undefined}
                onMark={markAttendance}
                onMarkEval={markAttendanceEval}
                busy={attendanceBusy}
              />
              {(isVda || isExams) ? (
                <DeprivationInbox
                  students={card.attendance?.students || []}
                  deprivations={card.deprivations || []}
                  ar={ar}
                  busy={attendanceBusy}
                  onSet={async (userId, action) => {
                    setAttendanceBusy(true);
                    try {
                      const res = await api.post(`${apiBase}/${catalogId}/deprivations/${userId}`, { action });
                      setCard((prev) => (prev ? { ...prev, deprivations: res.data?.deprivations || [] } : prev));
                      toast.success(action === 'lift' ? (ar ? 'رُفع الحرمان' : 'Deprivation lifted') : (ar ? 'فُعّل الحرمان' : 'Deprivation activated'));
                    } catch (e) {
                      toast.error(e.response?.data?.detail || (ar ? 'تعذر تحديث الحرمان' : 'Failed to update deprivation'));
                    } finally {
                      setAttendanceBusy(false);
                    }
                  }}
                  onDecide={async (requestId, decision) => {
                    setAttendanceBusy(true);
                    try {
                      const res = await api.post(`${apiBase}/${catalogId}/deprivations/requests/${requestId}`, { decision });
                      setCard((prev) => (prev ? { ...prev, deprivations: res.data?.deprivations || [] } : prev));
                      toast.success(decision === 'approve' ? (ar ? 'قُبل طلب الإلغاء' : 'Cancel request approved') : (ar ? 'رُفض طلب الإلغاء' : 'Cancel request rejected'));
                    } catch (e) {
                      toast.error(e.response?.data?.detail || (ar ? 'تعذر البت في الطلب' : 'Failed to decide the request'));
                    } finally {
                      setAttendanceBusy(false);
                    }
                  }}
                />
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="grades">
          <Card className="rounded-[2rem]">
            <CardHeader>
              <CardTitle>{ar ? 'العلامات' : 'Grades'}</CardTitle>
              <CardDescription>
                {sheetPublished
                  ? (ar ? 'أُرسلت العلامات للطلاب. التعديل مقفول.' : 'Marks were sent to students. Editing is locked.')
                  : sheetAwaitingVda
                    ? (ar ? 'أكّد الكادر الكشف. نائب العميد يرسل العلامات للطلاب.' : 'Teaching staff confirmed the sheet. The vice dean sends marks to students.')
                    : sheetStaffReview
                      ? (ar ? 'دائرة الامتحانات اعتمدت الكشف. الكادر يؤكّد دون تعديل.' : 'The Exams Office adopted the sheet. Teaching staff confirm without editing.')
                      : isVda
                        ? (sheetAtExams
                          ? (ar ? 'العلامات عند دائرة الامتحانات للتدقيق.' : 'Marks are with the Exams Office for review.')
                          : (ar ? 'عرض فقط. المدرّس يكتب النظري والمعيد يكتب العملي.' : 'View only. Instructors enter theory marks; TAs enter practical marks.'))
                        : isExams
                          ? (sheetAtExams
                            ? (ar ? 'وصل الكشف. يمكنك إدخال أو تعديل النظري والعملي ثم اعتماده.' : 'The sheet arrived. Enter or edit theory and practical marks, then adopt it.')
                            : (ar ? 'تكتب علامات النظري والعملي لكل طالب.' : 'You can enter theory and practical marks for every student.'))
                          : sheetAtExams
                            ? (ar ? 'أُرسل الكشف لدائرة الامتحانات. التعديل مقفول حتى تعتمده الدائرة.' : 'The sheet was sent to the Exams Office. Editing is locked until they adopt it.')
                            : isTeachingAssistant
                              ? (ar ? 'تكتب علامة العملي فقط. علامات النظري للعرض.' : 'You can enter practical marks only. Theory marks are view-only.')
                              : (ar ? 'تكتب علامات النظري فقط. علامة العملي للعرض.' : 'You can enter theory marks only. Practical marks are view-only.')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!isVda && !isExams && !isTeachingAssistant ? (
                <label className="flex items-start gap-3 rounded-xl border p-3 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    data-testid="theory-midterm-automated"
                    checked={theoryAutomated}
                    disabled={gradesBusy || !gradeSheet.can_set_automated}
                    onChange={async (e) => {
                      setGradesBusy(true);
                      try {
                        const res = await api.patch(`${apiBase}/${catalogId}/grades/sheet`, {
                          theory_midterm_automated: e.target.checked,
                        });
                        setCard((prev) => applySheet(prev, res.data));
                      } catch (err) {
                        toast.error(err.response?.data?.detail || (ar ? 'تعذر حفظ خيار الامتحان المؤتمت' : 'Failed to save the automated-exam option'));
                      } finally {
                        setGradesBusy(false);
                      }
                    }}
                  />
                  <span>
                    <span className="font-medium">{ar ? 'مؤتمت في الميدتيرم والامتحان النهائي النظري' : 'Automated midterm and theory final'}</span>
                    <span className="block text-muted-foreground">
                      {ar
                        ? 'دائرة الامتحانات تصحّح الميدتيرم والامتحان النهائي النظري. أنت تكتب السعي فقط.'
                        : 'The Exams Office grades the midterm and the theory final. You enter coursework only.'}
                    </span>
                  </span>
                </label>
              ) : theoryAutomated ? (
                <p className="text-sm text-muted-foreground" data-testid="theory-midterm-automated-note">
                  {ar ? 'مؤتمت: الميدتيرم والامتحان النهائي النظري من دائرة الامتحانات.' : 'Automated: the Exams Office enters the midterm and the theory final.'}
                </p>
              ) : null}
              {!isVda && !isExams && gradeSheet.can_submit ? (
                <Button
                  type="button"
                  className="rounded-xl"
                  data-testid="submit-sheet-to-exams"
                  disabled={gradesBusy}
                  onClick={async () => {
                    setGradesBusy(true);
                    try {
                      const res = await api.post(`${apiBase}/${catalogId}/grades/submit`);
                      setCard((prev) => applySheet(prev, res.data));
                      toast.success(ar ? 'أُرسل الكشف إلى دائرة الامتحانات' : 'Sheet sent to the Exams Office');
                    } catch (e) {
                      toast.error(e.response?.data?.detail || (ar ? 'تعذر إرسال الكشف' : 'Failed to send the sheet'));
                    } finally {
                      setGradesBusy(false);
                    }
                  }}
                >
                  {ar ? 'إرسال الكشف إلى دائرة الامتحانات' : 'Send sheet to the Exams Office'}
                </Button>
              ) : null}
              {isExams && gradeSheet.can_adopt ? (
                <Button
                  type="button"
                  className="rounded-xl"
                  data-testid="adopt-sheet"
                  disabled={gradesBusy}
                  onClick={async () => {
                    setGradesBusy(true);
                    try {
                      const res = await api.post(`${apiBase}/${catalogId}/grades/adopt`);
                      setCard((prev) => applySheet(prev, res.data));
                      toast.success(ar ? 'اعتمدت الكشف. بانتظار تأكيد الكادر.' : 'Sheet adopted. Waiting for teaching-staff confirmation.');
                    } catch (e) {
                      toast.error(e.response?.data?.detail || (ar ? 'تعذر اعتماد الكشف' : 'Failed to adopt the sheet'));
                    } finally {
                      setGradesBusy(false);
                    }
                  }}
                >
                  {ar ? 'اعتماد الكشف وإرساله للكادر' : 'Adopt sheet and send to teaching staff'}
                </Button>
              ) : null}
              {!isVda && !isExams && gradeSheet.can_confirm ? (
                <Button
                  type="button"
                  className="rounded-xl"
                  data-testid="confirm-sheet"
                  disabled={gradesBusy}
                  onClick={async () => {
                    setGradesBusy(true);
                    try {
                      const res = await api.post(`${apiBase}/${catalogId}/grades/confirm`);
                      setCard((prev) => applySheet(prev, res.data));
                      toast.success(ar ? 'تم تأكيد الكشف' : 'Sheet confirmed');
                    } catch (e) {
                      toast.error(e.response?.data?.detail || (ar ? 'تعذر تأكيد الكشف' : 'Failed to confirm the sheet'));
                    } finally {
                      setGradesBusy(false);
                    }
                  }}
                >
                  {ar ? 'تأكيد العلامات' : 'Confirm marks'}
                </Button>
              ) : null}
              {isVda && gradeSheet.can_publish ? (
                <Button
                  type="button"
                  className="rounded-xl"
                  data-testid="publish-sheet"
                  disabled={gradesBusy}
                  onClick={async () => {
                    setGradesBusy(true);
                    try {
                      const res = await api.post(`${apiBase}/${catalogId}/grades/publish`);
                      setCard((prev) => applySheet(prev, res.data));
                      toast.success(ar ? 'أُرسلت العلامات للطلاب' : 'Marks sent to students');
                    } catch (e) {
                      toast.error(e.response?.data?.detail || (ar ? 'تعذر إرسال العلامات' : 'Failed to send marks'));
                    } finally {
                      setGradesBusy(false);
                    }
                  }}
                >
                  {ar ? 'إرسال العلامات للطلاب' : 'Send marks to students'}
                </Button>
              ) : null}
              {sheetStaffReview ? (
                <p className="text-xs text-muted-foreground" data-testid="sheet-confirm-progress">
                  {gradeSheet.need_instructor_confirm
                    ? (gradeSheet.instructor_confirmed
                      ? (ar ? 'المدرّس أكّد. ' : 'Instructor confirmed. ')
                      : (ar ? 'بانتظار تأكيد المدرّس. ' : 'Waiting for the instructor. '))
                    : ''}
                  {gradeSheet.need_ta_confirm
                    ? (gradeSheet.ta_confirmed
                      ? (ar ? 'المعيد أكّد.' : 'TA confirmed.')
                      : (ar ? 'بانتظار تأكيد المعيد.' : 'Waiting for the TA.'))
                    : ''}
                </p>
              ) : null}
              <CourseWorkAppealsInbox
                appeals={card.appeals}
                ar={ar}
                canDecide={isExams}
                catalogId={catalogId}
                api={api}
                apiBase={apiBase}
                onChanged={() => loadCard()}
                withdrawnUserIds={withdrawnUserIds}
              />
              <CourseGradesTable
                grades={card.grades}
                ar={ar}
                editableComponents={gradeComponents}
                onSave={async (userId, payload) => {
                  setGradesBusy(true);
                  try {
                    const res = await api.put(`${apiBase}/${catalogId}/grades`, {
                      user_id: userId,
                      ...payload,
                    });
                    setCard((prev) => (prev ? {
                      ...prev,
                      grades: res.data,
                      grade_sheet: res.data?.sheet || prev.grade_sheet,
                    } : prev));
                  } catch (e) {
                    toast.error(e.response?.data?.detail || (ar ? 'تعذر حفظ العلامة' : 'Failed to save the mark'));
                  } finally {
                    setGradesBusy(false);
                  }
                }}
                busy={gradesBusy}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {!isExams ? <TabsContent value="files">
          <Card className="rounded-[2rem]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                {ar ? 'ملفات المادة / المحاضرات' : 'Course materials & files'}
              </CardTitle>
              <CardDescription>
                {isVda
                  ? (ar ? 'عاين الملف ثم وافق أو ارفض.' : 'Preview the file, then approve or reject it.')
                  : (ar ? 'ارفع PDF ليراجعه النائب.' : 'Upload a PDF for the vice dean to review.')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CourseLectureFiles
                lectures={card.lectures}
                ar={ar}
                canUpload={!isVda}
                canReview={isVda}
                onUpload={async (payload) => {
                  setLecturesBusy(true);
                  try {
                    const res = await api.post(`${apiBase}/${catalogId}/lectures`, payload);
                    setCard((prev) => (prev ? { ...prev, lectures: res.data } : prev));
                    toast.success(ar ? 'أُرسل الملف للمراجعة' : 'File sent for review');
                  } catch (e) {
                    toast.error(e.response?.data?.detail || (ar ? 'تعذر رفع الملف' : 'Failed to upload the file'));
                  } finally {
                    setLecturesBusy(false);
                  }
                }}
                onDecide={async (fileId, decision, note) => {
                  setLecturesBusy(true);
                  try {
                    const res = await api.post(`${apiBase}/${catalogId}/lectures/${fileId}/decide`, { decision, note });
                    setCard((prev) => (prev ? { ...prev, lectures: res.data } : prev));
                    toast.success(decision === 'approve' ? (ar ? 'اعتُمد الملف' : 'File approved') : (ar ? 'رُفض الملف' : 'File rejected'));
                  } catch (e) {
                    toast.error(e.response?.data?.detail || (ar ? 'تعذر مراجعة الملف' : 'Failed to review the file'));
                  } finally {
                    setLecturesBusy(false);
                  }
                }}
                busy={lecturesBusy}
              />
            </CardContent>
          </Card>
        </TabsContent> : null}

        {!isExams ? <TabsContent value="chat">
          <Card className="rounded-[2rem]">
            <CardHeader>
              <CardTitle>{ar ? 'دردشة المادة' : 'Course chat'}</CardTitle>
              <CardDescription>
                {ar ? 'كادر المادة + نائب العميد للشؤون الأكاديمية فقط.' : 'Course staff and the academic vice dean only.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CourseStaffChat
                chat={card.chat}
                ar={ar}
                canChat
                onSend={async (body) => {
                  setChatBusy(true);
                  try {
                    const res = await api.post(`${apiBase}/${catalogId}/chat`, { body });
                    setCard((prev) => (prev ? { ...prev, chat: res.data } : prev));
                  } catch (e) {
                    toast.error(e.response?.data?.detail || (ar ? 'تعذر إرسال الرسالة' : 'Failed to send the message'));
                  } finally {
                    setChatBusy(false);
                  }
                }}
                busy={chatBusy}
              />
            </CardContent>
          </Card>
        </TabsContent> : null}

        {showSessions ? <TabsContent value="sessions">
          <StaffSessionsPanel catalogId={catalogId} />
        </TabsContent> : null}

        {isVda && isViceDeanAcademic ? <TabsContent value="staff-sessions">
          <VdaCourseSessionsPanel catalogId={catalogId} />
        </TabsContent> : null}
      </Tabs>
    </div>
  );
}
