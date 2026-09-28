import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Search } from 'lucide-react';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/AuthContext';
import { useLanguage } from '@/lib/LanguageContext';
import StaffCourseCard from '@/components/academic/StaffCourseCard';
import AbsenceThresholdCard from '@/components/academic/AbsenceThresholdCard';
import { toast } from 'sonner';

function Stat({ label, value }) {
  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{value ?? '—'}</CardTitle>
      </CardHeader>
    </Card>
  );
}

export default function ExamsCourseMarks() {
  const { api, isExamsOffice } = useAuth();
  const { language } = useLanguage();
  const navigate = useNavigate();
  const ar = language === 'ar';
  const [list, setList] = useState(null);
  const [query, setQuery] = useState('');

  const loadList = async () => {
    try {
      const courses = await api.get('/exams/course-marks');
      setList(courses.data);
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'تعذر تحميل المواد والعلامات' : 'Failed to load courses and marks'));
    }
  };

  useEffect(() => { if (isExamsOffice) loadList(); }, [api, ar, isExamsOffice]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (list?.items || []).filter((item) => {
      if (!q) return true;
      const hay = [
        item.course_code,
        item.course_name,
        item.department?.name_ar,
        item.department?.name_en,
        item.department?.code,
      ].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [list, query]);

  return (
    <div className="p-4 sm:p-6 space-y-6" data-testid="exams-course-marks">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BookOpen className="w-6 h-6" />
          {ar ? 'المواد والعلامات' : 'Courses and marks'}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {ar
            ? 'افتح المادة للنظرة العامة والحضور والعلامات. يمكنك إدخال النظري والعملي لكل طالب.'
            : 'Open a course for overview, attendance, and marks. You can enter theory and practical marks for every student.'}
        </p>
      </div>

      <div className="grid sm:grid-cols-4 gap-3">
        <Stat label={ar ? 'مواد الكلية' : 'College courses'} value={list?.counts?.courses} />
        <Stat label={ar ? 'مطروحة هذا الفصل' : 'Offered this term'} value={list?.counts?.offered} />
        <Stat label={ar ? 'لها كادر' : 'Staffed'} value={list?.counts?.staffed} />
        <Stat label={ar ? 'كشوف عند الدائرة' : 'Sheets at exams'} value={list?.counts?.at_exams} />
        <Stat label={ar ? 'اعتمدت وبانتظار الكادر' : 'Adopted, staff review'} value={list?.counts?.staff_review} />
        <Stat label={ar ? 'اعتراضات معلّقة' : 'Pending appeals'} value={list?.counts?.pending_appeals} />
      </div>

      <AbsenceThresholdCard api={api} endpoint="/exams/absence-threshold" ar={ar} />

      <div className="relative max-w-md">
        <Search className="w-4 h-4 absolute start-3 top-3 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={ar ? 'بحث بالرمز أو الاسم أو القسم' : 'Search by code, name, or department'}
          className="rounded-xl ps-9"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="exams-course-marks-list">
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">{ar ? 'لا مواد مطابقة.' : 'No matching courses.'}</p>
        ) : filtered.map((item) => (
          <StaffCourseCard
            key={item.catalog_course_id}
            item={item}
            ar={ar}
            onOpen={(id) => navigate(`/course-marks/${id}`)}
            testId={`exams-course-marks-item-${item.catalog_course_id}`}
          />
        ))}
      </div>
    </div>
  );
}
