import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Search } from 'lucide-react';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/AuthContext';
import { useLanguage } from '@/lib/LanguageContext';
import StaffCourseCard from '@/components/academic/StaffCourseCard';
import { buildSessionHints } from '@/lib/staffSessionHints';
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

export default function StaffMyCourses() {
  const { api, isTeachingStaff, isTeachingAssistant } = useAuth();
  const { language } = useLanguage();
  const navigate = useNavigate();
  const ar = language === 'ar';
  const [list, setList] = useState(null);
  const [query, setQuery] = useState('');
  const [sessionHints, setSessionHints] = useState(() => new Map());

  const loadList = async () => {
    try {
      const courses = await api.get('/academic/staff/my-courses');
      setList(courses.data);
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'تعذر تحميل موادك' : 'Failed to load your courses'));
    }
  };

  const loadSessionHints = async () => {
    try {
      const res = await api.get('/academic/staff/sessions');
      setSessionHints(buildSessionHints(res.data));
    } catch {
      setSessionHints(new Map());
    }
  };

  useEffect(() => { if (isTeachingStaff) loadList(); }, [api, ar, isTeachingStaff]);

  useEffect(() => {
    if (!isTeachingStaff) return undefined;
    loadSessionHints();
    const timer = setInterval(loadSessionHints, 60000);
    return () => clearInterval(timer);
  }, [api, isTeachingStaff]);

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
    <div className="p-4 sm:p-6 space-y-6" data-testid="staff-my-courses">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BookOpen className="w-6 h-6" />
          {ar ? 'موادي' : 'My courses'}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {ar
            ? (isTeachingAssistant
              ? 'افتح لوحة المادة لتسجيل الحضور والعلامات ورفع PDF والدردشة.'
              : 'افتح لوحة المادة لمراجعة المعلومات وتسجيل الحضور والعلامات والدردشة.')
            : (isTeachingAssistant
              ? 'Open a course dashboard to mark attendance, grades, upload PDFs, and chat.'
              : 'Open a course dashboard to review details, enter marks, and chat.')}
        </p>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <Stat label={ar ? 'موادي' : 'My courses'} value={list?.counts?.courses} />
        <Stat label={ar ? 'مطروحة' : 'Offered'} value={list?.counts?.offered} />
        <Stat label={ar ? 'لها منهج' : 'With syllabus'} value={list?.counts?.with_syllabus} />
      </div>

      <div className="relative max-w-md">
        <Search className="w-4 h-4 absolute start-3 top-3 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={ar ? 'بحث بالرمز أو الاسم' : 'Search by code or name'}
          className="rounded-xl ps-9"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="staff-my-courses-list">
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">{ar ? 'لا مواد موكلة إليك هذا الفصل.' : 'No courses assigned to you this term.'}</p>
        ) : filtered.map((item) => (
          <StaffCourseCard
            key={item.catalog_course_id}
            item={item}
            ar={ar}
            onOpen={(id) => navigate(`/my-courses/${id}`)}
            sessionHint={sessionHints.get(Number(item.catalog_course_id)) || null}
            onOpenSessions={(id) => navigate(`/my-courses/${id}?tab=sessions`)}
            testId={`staff-course-${item.catalog_course_id}`}
          />
        ))}
      </div>
    </div>
  );
}
