import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import AttendanceGrid from '@/components/academic/AttendanceGrid';
import CourseGradesTable from '@/components/academic/CourseGradesTable';
import CourseLectureFiles from '@/components/academic/CourseLectureFiles';
import CourseStaffChat from '@/components/academic/CourseStaffChat';

function StaffList({ title, items, empty, ar }) {
  return (
    <div className="rounded-xl border p-3 space-y-2">
      <p className="text-sm font-medium">{title}</p>
      {(items || []).length === 0 ? (
        <p className="text-xs text-muted-foreground">{empty}</p>
      ) : (items || []).map((person) => (
        <p key={person.user_id} className="text-sm">
          {person.full_name || '—'}
          {person.person_code ? ` · ${person.person_code}` : ''}
          <span className="text-muted-foreground">
            {` · ${person.staff_role === 'teaching_assistant' ? (ar ? 'معيد' : 'TA') : (ar ? 'مدرّس' : 'Instructor')}`}
          </span>
        </p>
      ))}
    </div>
  );
}

function prereqLabel(card, items, ar) {
  if (card?.prerequisite?.course_code) {
    return `${card.prerequisite.course_code} — ${card.prerequisite.course_name}`;
  }
  const pid = card?.prerequisite?.id;
  if (pid) {
    const hit = (items || []).find((c) => Number(c.catalog_course_id) === Number(pid));
    if (hit) return `${hit.course_code} — ${hit.course_name}`;
  }
  return ar ? 'بدون' : 'None';
}

export default function CourseReviewDialog({
  open,
  onOpenChange,
  card,
  catalogItems = [],
  departments = [],
  ar,
  canEditSyllabus = false,
  theory = '',
  practical = '',
  onTheory,
  onPractical,
  onSaveSyllabus,
  saving = false,
  canEditAttendance = false,
  showEvaluation = false,
  canEditEvaluation = false,
  onAddSession,
  onMarkAttendance,
  onMarkEvaluation,
  attendanceBusy = false,
  canEditGrades = false,
  onSaveGrade,
  gradesBusy = false,
  canUploadLectures = false,
  canReviewLectures = false,
  onUploadLecture,
  onDecideLecture,
  lecturesBusy = false,
  canUseChat = false,
  onSendChat,
  onRefreshChat,
  chatBusy = false,
}) {
  const departmentId = card?.department_id != null
    ? String(card.department_id)
    : (card?.department?.id != null ? String(card.department.id) : '');
  const prerequisiteId = card?.prerequisite?.id != null ? String(card.prerequisite.id) : 'none';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="rounded-2xl max-w-4xl max-h-[90vh] overflow-y-auto"
        data-testid="course-review-dialog"
      >
        <DialogHeader>
          <DialogTitle>{ar ? 'مراجعة المادة' : 'Course review'}</DialogTitle>
          <DialogDescription>
            {card ? `${ar ? 'المتطلب السابق:' : 'Prerequisite:'} ${prereqLabel(card, catalogItems, ar)}` : ''}
          </DialogDescription>
        </DialogHeader>

        {card ? (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>{ar ? 'رمز المادة' : 'Code'}</Label>
              <Input value={card.course_code || ''} readOnly disabled className="rounded-xl" />
            </div>
            <div className="space-y-1">
              <Label>{ar ? 'اسم المادة' : 'Name'}</Label>
              <Input value={card.course_name || ''} readOnly disabled className="rounded-xl" />
            </div>
            <div className="space-y-1">
              <Label>{ar ? 'القسم' : 'Department'}</Label>
              <Select value={departmentId} disabled>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder={ar ? 'اختر القسم' : 'Choose department'} />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      {ar ? (d.name_ar || d.name) : (d.name_en || d.name)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{ar ? 'الوصف' : 'Description'}</Label>
              <Input value={card.description || ''} readOnly disabled className="rounded-xl" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{ar ? 'ساعات' : 'Credits'}</Label>
                <Input type="number" value={card.credit_hours ?? ''} readOnly disabled className="rounded-xl" />
              </div>
              <div className="space-y-1">
                <Label>{ar ? 'الترتيب' : 'Order'}</Label>
                <Input type="number" value={card.order ?? ''} readOnly disabled className="rounded-xl" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>{ar ? 'المتطلب السابق' : 'Prerequisite'}</Label>
              <Select value={prerequisiteId} disabled>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{ar ? 'بدون' : 'None'}</SelectItem>
                  {(catalogItems || [])
                    .filter((c) => Number(c.catalog_course_id) !== Number(card.catalog_course_id))
                    .map((c) => (
                      <SelectItem key={c.catalog_course_id} value={String(c.catalog_course_id)}>
                        {c.course_code} — {c.course_name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <p className="text-xs text-muted-foreground">
              {card.offered
                ? (ar
                  ? `المسجّلون هذا الفصل: ${card.enrolled_count} / ${card.capacity || '—'}`
                  : `Enrolled this term: ${card.enrolled_count} / ${card.capacity || '—'}`)
                : (ar ? 'غير مطروحة في الفصل الحالي.' : 'Not offered in the current term.')}
            </p>

            <div className="grid sm:grid-cols-2 gap-3">
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

            <form onSubmit={canEditSyllabus ? onSaveSyllabus : (e) => e.preventDefault()} className="space-y-3">
              <div className="space-y-1">
                <Label>{ar ? 'المنهج النظري' : 'Theory syllabus'}</Label>
                <textarea
                  rows={5}
                  value={canEditSyllabus ? theory : (card.theory_syllabus || '')}
                  onChange={canEditSyllabus ? (e) => onTheory?.(e.target.value) : undefined}
                  readOnly={!canEditSyllabus}
                  disabled={!canEditSyllabus}
                  className="flex min-h-[100px] w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label>{ar ? 'المنهج العملي' : 'Practical syllabus'}</Label>
                <textarea
                  rows={5}
                  value={canEditSyllabus ? practical : (card.practical_syllabus || '')}
                  onChange={canEditSyllabus ? (e) => onPractical?.(e.target.value) : undefined}
                  readOnly={!canEditSyllabus}
                  disabled={!canEditSyllabus}
                  className="flex min-h-[100px] w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              {canEditSyllabus ? (
                <Button type="submit" className="w-full rounded-xl" disabled={saving}>
                  {ar ? 'حفظ المنهج' : 'Save syllabus'}
                </Button>
              ) : null}
            </form>

            <AttendanceGrid
              attendance={card.attendance}
              ar={ar}
              canEdit={canEditAttendance}
              showEvaluation={showEvaluation}
              canEditEvaluation={canEditEvaluation}
              onAddSession={onAddSession}
              onMark={onMarkAttendance}
              onMarkEval={onMarkEvaluation}
              busy={attendanceBusy}
            />

            <CourseGradesTable
              grades={card.grades}
              ar={ar}
              canEdit={canEditGrades}
              onSave={onSaveGrade}
              busy={gradesBusy}
            />

            <CourseLectureFiles
              lectures={card.lectures}
              ar={ar}
              canUpload={canUploadLectures}
              canReview={canReviewLectures}
              onUpload={onUploadLecture}
              onDecide={onDecideLecture}
              busy={lecturesBusy}
            />

            <CourseStaffChat
              chat={card.chat}
              ar={ar}
              canChat={canUseChat}
              onSend={onSendChat}
              onRefresh={onRefreshChat}
              busy={chatBusy}
            />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
