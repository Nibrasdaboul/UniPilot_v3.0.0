import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Search } from 'lucide-react';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/AuthContext';
import { useLanguage } from '@/lib/LanguageContext';
import StaffCourseCard from '@/components/academic/StaffCourseCard';
import AbsenceThresholdCard from '@/components/academic/AbsenceThresholdCard';
import StaffSessionsCard from '@/components/academic/StaffSessionsCard';
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

export default function AcademicViceDeanCourseInfo() {
  const { api, isViceDeanAcademic } = useAuth();
  const { language } = useLanguage();
  const navigate = useNavigate();
  const ar = language === 'ar';
  const [list, setList] = useState(null);
  const [query, setQuery] = useState('');

  const loadList = async () => {
    try {
      const courses = await api.get('/vda/course-info');
      setList(courses.data);
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'تعذر تحميل المواد' : 'Failed to load courses'));
    }
  };

  useEffect(() => { if (isViceDeanAcademic) loadList(); }, [api, ar, isViceDeanAcademic]);

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
    <div className="p-4 sm:p-6 space-y-6" data-testid="vda-course-info">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BookOpen className="w-6 h-6" />
          {ar ? 'المناهج ومعلومات المواد' : 'Course syllabi and information'}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {ar
            ? 'افتح لوحة المادة لصفحة كاملة: المنهج، الحضور، العلامات، الملفات، والمحادثة.'
            : 'Open the course dashboard for the syllabus, attendance, marks, files, and chat.'}
        </p>
      </div>

      <div className="grid sm:grid-cols-4 lg:grid-cols-5 gap-3">
        <Stat label={ar ? 'مواد الكلية' : 'College courses'} value={list?.counts?.courses} />
        <Stat label={ar ? 'مطروحة هذا الفصل' : 'Offered this term'} value={list?.counts?.offered} />
        <Stat label={ar ? 'لها منهج محفوظ' : 'With a saved syllabus'} value={list?.counts?.with_syllabus} />
        <Stat label={ar ? 'لها كادر' : 'Staffed'} value={list?.counts?.staffed} />
        <Stat label={ar ? 'عند دائرة الامتحانات' : 'At Exams Office'} value={list?.counts?.at_exams} />
        <Stat label={ar ? 'قيد تدقيق الكادر' : 'Staff review'} value={list?.counts?.staff_review} />
        <Stat label={ar ? 'بانتظار التأكيد' : 'Awaiting you'} value={list?.counts?.awaiting_vda} />
        <Stat label={ar ? 'أُرسلت للطلاب' : 'Sent to students'} value={list?.counts?.published} />
        <Stat label={ar ? 'اعتراضات معلّقة' : 'Pending appeals'} value={list?.counts?.pending_appeals} />
      </div>

      <AbsenceThresholdCard api={api} endpoint="/vda/absence-threshold" ar={ar} />

      {isViceDeanAcademic && <StaffSessionsCard api={api} ar={ar} />}

      <div className="relative max-w-md">
        <Search className="w-4 h-4 absolute start-3 top-3 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={ar ? 'بحث بالرمز أو الاسم أو القسم' : 'Search by code, name, or department'}
          className="rounded-xl ps-9"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="vda-course-info-list">
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">{ar ? 'لا مواد مطابقة.' : 'No matching courses.'}</p>
        ) : filtered.map((item) => (
          <StaffCourseCard
            key={item.catalog_course_id}
            item={item}
            ar={ar}
            onOpen={(id) => navigate(`/course-info/${id}`)}
            testId={`vda-course-info-item-${item.catalog_course_id}`}
            showVdaInbox
          />
        ))}
      </div>
    </div>
  );
}
