import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronRight,
  FolderTree,
  BookOpen,
  Loader2,
  Clock,
  Lock,
  CheckCircle2,
  Search,
  Pencil,
  GraduationCap,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { useAuth } from '@/lib/AuthContext';
import { useLanguage } from '@/lib/LanguageContext';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Collapsible } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { isPassedCourse, isWithdrawnCourse, subjectTreeActionKind } from '@/lib/subjectTreeAction';

function StudentTreeAction({ action, courseId, courseCode, language, testidPrefix = 'tree' }) {
  const code = courseCode || 'course';
  const testid = (kind) => `${testidPrefix}-${kind}-${code}`;
  if (action === 'open' && courseId) {
    return (
      <Link
        to={`/courses/${courseId}`}
        className="shrink-0 text-sm font-medium text-primary hover:underline"
        onClick={(e) => e.stopPropagation()}
        data-testid={testid('open')}
      >
        {language === 'ar' ? 'فتح' : 'Open'} →
      </Link>
    );
  }
  if (action === 'completed') {
    return (
      <span
        className="shrink-0 text-sm font-medium text-emerald-700 dark:text-emerald-300"
        data-testid={testid('completed')}
      >
        {language === 'ar' ? 'تم اجتيازها بالفعل' : 'Already completed'}
      </span>
    );
  }
  if (action === 'enroll') {
    return (
      <Link
        to="/registration"
        className="shrink-0 text-sm font-medium text-primary hover:underline"
        data-testid={testid('enroll')}
      >
        {language === 'ar' ? 'تسجيل من صفحة المواد' : 'Enroll from Courses'}
      </Link>
    );
  }
  if (action === 'closed') {
    return (
      <span
        className="shrink-0 text-sm font-semibold text-rose-700 dark:text-rose-300 bg-rose-500/15 border border-rose-500/40 rounded-full px-2.5 py-1"
        data-testid={testid('closed')}
      >
        {language === 'ar' ? 'التسجيل مغلق' : 'Registration closed'}
      </span>
    );
  }
  return null;
}

function MyCourseLink({ catalogId, courseCode, language, testidPrefix = 'tree' }) {
  return (
    <span className="shrink-0 flex items-center gap-2">
      <Badge className="rounded-full text-xs" data-testid={`${testidPrefix}-mine-${courseCode}`}>
        {language === 'ar' ? 'من موادي' : 'My course'}
      </Badge>
      <Link
        to={`/my-courses/${catalogId}`}
        className="text-sm font-medium text-primary hover:underline"
        onClick={(e) => e.stopPropagation()}
        data-testid={`${testidPrefix}-my-course-${courseCode}`}
      >
        {language === 'ar' ? 'فتح في موادي' : 'Open in My courses'} →
      </Link>
    </span>
  );
}

const emptyDeanForm = {
  course_code: '',
  course_name: '',
  department_id: '',
  description: '',
  credit_hours: 3,
  order: 1,
  prerequisite_id: 'none',
};

// --- Helpers: build student tree from full catalog (guarantee every course is shown) ---

function normalizeCatalog(catalog) {
  if (Array.isArray(catalog)) return catalog;
  if (catalog && typeof catalog === 'object' && Array.isArray(catalog.data)) return catalog.data;
  return [];
}

function buildCatalogById(list) {
  return list.reduce((acc, c) => {
    const id = Number(c.id);
    if (!Number.isNaN(id)) acc[id] = c;
    return acc;
  }, {});
}

/** Get root catalog id for a course (follow prerequisite_id until null or missing). */
function getRootCatalogId(course, catalogById) {
  const id = Number(course.id);
  if (Number.isNaN(id)) return id;
  const seen = new Set([id]);
  let cur = catalogById[id];
  while (cur && cur.prerequisite_id != null) {
    const pid = Number(cur.prerequisite_id);
    if (seen.has(pid)) break;
    seen.add(pid);
    cur = catalogById[pid];
  }
  return cur ? Number(cur.id) : id;
}

/** Topological order: roots first, then by prerequisite. */
function topologicalOrder(list, catalogById) {
  const result = [];
  const added = new Set();
  let remaining = list.slice();
  while (remaining.length > 0) {
    const next = remaining.filter((c) => {
      const pid = c.prerequisite_id != null ? Number(c.prerequisite_id) : null;
      return pid == null || added.has(pid);
    });
    if (next.length === 0) {
      result.push(...remaining);
      break;
    }
    next.forEach((c) => {
      result.push(c);
      added.add(Number(c.id));
    });
    remaining = remaining.filter((c) => !added.has(Number(c.id)));
  }
  return result;
}

/**
 * Group catalog into chains by root. Every course appears in exactly one group.
 * Returns array of groups, each group = array of courses in topological order.
 */
function buildChainGroups(catalogList) {
  const catalogById = buildCatalogById(catalogList);
  const order = topologicalOrder(catalogList, catalogById);
  const orderIdx = order.reduce((acc, c, i) => { acc[Number(c.id)] = i; return acc; }, {});

  const byRoot = {};
  for (const c of catalogList) {
    const rootId = getRootCatalogId(c, catalogById);
    if (!byRoot[rootId]) byRoot[rootId] = [];
    byRoot[rootId].push(c);
  }

  const groups = Object.values(byRoot).map((group) =>
    group.slice().sort((a, b) => (orderIdx[Number(a.id)] ?? 999) - (orderIdx[Number(b.id)] ?? 999))
  );
  groups.sort((a, b) => (orderIdx[Number(a[0]?.id)] ?? 999) - (orderIdx[Number(b[0]?.id)] ?? 999));

  const inGroups = new Set(groups.flatMap((g) => g.map((c) => Number(c.id))));
  const missing = catalogList.filter((c) => !inGroups.has(Number(c.id)));
  if (missing.length > 0) {
    missing.sort((a, b) => (orderIdx[Number(a.id)] ?? 999) - (orderIdx[Number(b.id)] ?? 999));
    groups.push(missing);
  }

  return groups;
}

/** Get prerequisite chain for a course: from root to this course (in order). */
function getPrerequisiteChain(course, catalogById) {
  const chain = [];
  let cur = course;
  const seen = new Set();
  while (cur) {
    const id = Number(cur.id);
    if (seen.has(id)) break;
    seen.add(id);
    chain.unshift(cur);
    const pid = cur.prerequisite_id != null ? Number(cur.prerequisite_id) : null;
    cur = pid != null ? catalogById[pid] : null;
  }
  return chain;
}

/** Filter catalog by search (course name or code, case-insensitive). */
function filterCatalogBySearch(list, query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return list;
  return list.filter(
    (c) =>
      (c.course_name && String(c.course_name).toLowerCase().includes(q)) ||
      (c.course_code && String(c.course_code).toLowerCase().includes(q))
  );
}

export default function SubjectTree() {
  const { api, isAdmin, isDean, isViceDeanAcademic, isStudent, isTeachingStaff } = useAuth();
  const isLeadTree = isDean || isViceDeanAcademic;
  const isReadOnlyTree = !isStudent && !isAdmin && !isLeadTree;
  const showStudentStatus = !isLeadTree && !isReadOnlyTree;
  const { t, language } = useLanguage();
  const [courses, setCourses] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [modulesByCourse, setModulesByCourse] = useState({});
  const [loading, setLoading] = useState(true);
  const [expandedCatalog, setExpandedCatalog] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [deanCourse, setDeanCourse] = useState(null);
  const [deanForm, setDeanForm] = useState(emptyDeanForm);
  const [deanSaving, setDeanSaving] = useState(false);
  const [departments, setDepartments] = useState([]);
  const [windowOpen, setWindowOpen] = useState(false);
  const [currentCourses, setCurrentCourses] = useState([]);
  const [regEnrolledCatalogIds, setRegEnrolledCatalogIds] = useState(() => new Set());
  const [myCourseIds, setMyCourseIds] = useState(() => new Set());
  const containerRef = useRef(null);
  const showMyCourses = isReadOnlyTree && isTeachingStaff;

  useEffect(() => {
    fetchData();
  }, [isAdmin, isLeadTree, isStudent, isTeachingStaff]);

  const fetchData = async () => {
    try {
      if (isAdmin || isLeadTree || isReadOnlyTree) {
        const [res, deptRes, mineRes] = await Promise.all([
          api.get('/catalog/courses'),
          isLeadTree ? api.get('/users/departments').catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
          showMyCourses ? api.get('/academic/staff/my-courses').catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
        ]);
        setCatalog(normalizeCatalog(res?.data));
        setDepartments(Array.isArray(deptRes.data) ? deptRes.data : []);
        const mine = Array.isArray(mineRes?.data) ? mineRes.data : (mineRes?.data?.items || []);
        setMyCourseIds(new Set(
          mine.map((c) => Number(c.catalog_course_id)).filter((id) => !Number.isNaN(id) && id > 0)
        ));
        setCourses([]);
        setCurrentCourses([]);
        setWindowOpen(false);
        setRegEnrolledCatalogIds(new Set());
      } else {
        const [coursesRes, catalogRes, currentRes, regRes] = await Promise.all([
          api.get('/student/courses'),
          api.get('/catalog/courses'),
          api.get('/student/courses?semester=current').catch(() => ({ data: [] })),
          api.get('/academic/registration').catch(() => ({ data: { open: false, courses: [] } })),
        ]);
        const list = Array.isArray(coursesRes?.data) ? coursesRes.data : [];
        const catalogData = normalizeCatalog(catalogRes?.data);
        const currentList = Array.isArray(currentRes?.data) ? currentRes.data : [];
        const reg = regRes?.data || {};
        setCourses(list);
        setCatalog(catalogData);
        setCurrentCourses(currentList);
        setWindowOpen(Boolean(reg.open));
        setRegEnrolledCatalogIds(new Set(
          (Array.isArray(reg.courses) ? reg.courses : [])
            .filter((row) => row?.enrolled)
            .map((row) => Number(row.id))
            .filter((id) => !Number.isNaN(id) && id > 0)
        ));
        const byCourse = {};
        for (const c of list) {
          try {
            const modRes = await api.get(`/courses/${c.id}/modules`);
            byCourse[c.id] = modRes.data || [];
          } catch {
            byCourse[c.id] = [];
          }
        }
        setModulesByCourse(byCourse);
      }
    } catch (error) {
      console.error('Subject tree error:', error);
      toast.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  const catalogList = normalizeCatalog(catalog);
  const catalogById = buildCatalogById(catalogList);
  const chainGroups = buildChainGroups(catalogList);
  const catalogSorted = topologicalOrder(catalogList, catalogById);
  if (catalogSorted.length === 0 && catalogList.length > 0) {
    catalogSorted.push(...catalogList);
  }
  const searchTrimmed = (searchQuery || '').trim();
  const searchMatches = filterCatalogBySearch(catalogList, searchTrimmed);
  const totalCatalogHours = catalogList.reduce((sum, c) => sum + (Number(c.credit_hours) || 0), 0);
  const enrolledCatalogIds = new Set(
    courses.map((c) => Number(c.catalog_course_id)).filter((id) => !Number.isNaN(id) && id > 0)
  );
  const enrolledCodes = new Set(
    courses.map((c) => String(c.course_code || '').trim().toLowerCase()).filter(Boolean)
  );
  const finalizedCatalogIds = new Set(
    courses
      .filter((c) => c.finalized_at != null || c.finalizedAt != null)
      .map((c) => Number(c.catalog_course_id))
      .filter((id) => !Number.isNaN(id) && id > 0)
  );
  const totalEnrolledHours = courses.reduce((sum, c) => sum + (Number(c.credit_hours) || 0), 0);

  const isUnlocked = (cat) => {
    const prereqId = cat.prerequisite_id != null ? Number(cat.prerequisite_id) : null;
    if (prereqId == null) return true;
    return finalizedCatalogIds.has(prereqId);
  };
  const isEnrolled = (cat) =>
    enrolledCatalogIds.has(Number(cat.id))
    || enrolledCodes.has(String(cat.course_code || '').trim().toLowerCase());
  const enrolledCourseByCatalogId = courses.reduce((acc, c) => {
    if (c.catalog_course_id) acc[Number(c.catalog_course_id)] = c;
    const code = String(c.course_code || '').trim().toLowerCase();
    if (code) acc[code] = c;
    return acc;
  }, {});
  const currentTermCatalogIds = new Set([
    ...currentCourses
      .filter((c) => !isWithdrawnCourse(c))
      .map((c) => Number(c.catalog_course_id))
      .filter((id) => !Number.isNaN(id) && id > 0),
    ...regEnrolledCatalogIds,
  ]);
  const currentTermCodes = new Set(
    currentCourses
      .filter((c) => !isWithdrawnCourse(c))
      .map((c) => String(c.course_code || '').trim().toLowerCase())
      .filter(Boolean)
  );
  const passedCatalogIds = new Set(
    courses
      .filter((c) => isPassedCourse(c) && !isWithdrawnCourse(c))
      .map((c) => Number(c.catalog_course_id))
      .filter((id) => !Number.isNaN(id) && id > 0)
  );
  const passedCodes = new Set(
    courses
      .filter((c) => isPassedCourse(c) && !isWithdrawnCourse(c))
      .map((c) => String(c.course_code || '').trim().toLowerCase())
      .filter(Boolean)
  );
  const catalogAction = (cat) => {
    const id = Number(cat.id);
    const code = String(cat.course_code || '').trim().toLowerCase();
    const currentTermEnrolled = currentTermCatalogIds.has(id) || currentTermCodes.has(code);
    const pastCompleted = !currentTermEnrolled && (passedCatalogIds.has(id) || passedCodes.has(code));
    return subjectTreeActionKind({
      unlocked: isUnlocked(cat),
      currentTermEnrolled,
      pastCompleted,
      windowOpen,
    });
  };

  const prereqLabel = (id) => {
    if (id == null) return language === 'ar' ? 'بدون' : 'None';
    const c = catalogById[Number(id)];
    return c ? `${c.course_code} — ${c.course_name}` : `#${id}`;
  };

  const matchDepartmentId = (course) => {
    if (course?.department_id != null) return String(course.department_id);
    const name = String(course?.department || '').trim().toLowerCase();
    const hit = departments.find((d) =>
      String(d.id) === String(course?.department_id)
      || String(d.name_ar || '').trim().toLowerCase() === name
      || String(d.name_en || '').trim().toLowerCase() === name
      || String(d.name || '').trim().toLowerCase() === name
    );
    return hit ? String(hit.id) : '';
  };

  const openDeanCourse = (course) => {
    if (!isLeadTree || !course) return;
    setDeanCourse(course);
    setDeanForm({
      course_code: course.course_code || '',
      course_name: course.course_name || '',
      department_id: matchDepartmentId(course),
      description: course.description || '',
      credit_hours: course.credit_hours ?? 3,
      order: course.order ?? 1,
      prerequisite_id: course.prerequisite_id != null ? String(course.prerequisite_id) : 'none',
    });
  };

  const saveDeanCourse = async (e) => {
    e.preventDefault();
    if (!deanCourse?.id || deanSaving) return;
    if (!deanForm.department_id) {
      toast.error(language === 'ar' ? 'اختر قسماً من أقسام الكلية' : 'Choose a college department');
      return;
    }
    setDeanSaving(true);
    try {
      await api.patch(`/catalog/courses/${deanCourse.id}`, {
        course_code: deanForm.course_code,
        course_name: deanForm.course_name,
        department_id: Number(deanForm.department_id),
        description: deanForm.description || null,
        credit_hours: Number(deanForm.credit_hours) || 3,
        order: Number(deanForm.order) || 1,
        prerequisite_id: deanForm.prerequisite_id === 'none' ? null : Number(deanForm.prerequisite_id),
      });
      toast.success(language === 'ar' ? 'تم تحديث المادة' : 'Course updated');
      setDeanCourse(null);
      await fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || (language === 'ar' ? 'فشل الحفظ' : 'Save failed'));
    } finally {
      setDeanSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[320px]">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  // --- Admin view (unchanged). Dean uses the student-style tree below. ---
  if (isAdmin && !isLeadTree) {
    return (
      <div className="space-y-6 pb-12" data-testid="subject-tree-page">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold font-display tracking-tight text-foreground flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                <FolderTree className="w-5 h-5" />
              </div>
              {language === 'ar' ? 'شجرة المواد' : 'Subject Tree'}
            </h2>
            <p className="text-muted-foreground mt-1">
              {language === 'ar' ? 'شجرة المواد الكاملة (كل الكتالوج)' : 'Full course tree (entire catalog)'}
            </p>
          </div>
          <Badge variant="secondary" className="rounded-full px-4 py-2 text-sm gap-1.5 w-fit">
            <Clock className="w-4 h-4" />
            {t('admin.totalCatalogHours')}: {totalCatalogHours}h
          </Badge>
        </div>
        <div className="flex gap-2 items-center max-w-md w-full">
          <Search className="w-5 h-5 text-muted-foreground shrink-0" />
          <Input
            placeholder={language === 'ar' ? 'بحث باسم المادة أو الرمز...' : 'Search by course name or code...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="rounded-xl flex-1"
          />
        </div>
        {searchTrimmed && searchMatches.length > 0 && (
          <Card className="rounded-2xl border shadow-sm overflow-hidden bg-card/50">
            <CardHeader className="border-b bg-muted/20 px-6 py-4">
              <CardTitle className="text-base font-display flex items-center gap-2">
                <Search className="w-4 h-4 text-primary" />
                {language === 'ar' ? 'نتائج البحث' : 'Search results'} ({searchMatches.length})
              </CardTitle>
              <CardDescription>
                {language === 'ar' ? 'سلسلة المادة ومتطلباتها السابقة' : 'Course chain and prerequisites'}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              {searchMatches.map((course) => {
                const chain = getPrerequisiteChain(course, catalogById);
                return (
                  <div key={course.id} className="rounded-xl border border-border/50 overflow-hidden">
                    <p className="text-xs font-medium text-muted-foreground px-4 py-2 bg-muted/30 border-b">
                      {language === 'ar' ? 'سلسلة المتطلبات السابقة' : 'Prerequisite chain'}
                    </p>
                    <div className="p-4 space-y-2">
                      {chain.map((c, i) => (
                        <div key={c.id} className="flex items-center gap-2">
                          {i > 0 && <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                          <Badge variant="secondary" className="rounded-full text-xs">{c.course_code}</Badge>
                          <span className={c.id === course.id ? 'font-semibold' : 'text-muted-foreground'}>{c.course_name}</span>
                          <span className="text-xs text-muted-foreground">({c.credit_hours ?? 0}h)</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}
        {searchTrimmed && searchMatches.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {language === 'ar' ? 'لا توجد مواد تطابق البحث.' : 'No courses match your search.'}
          </p>
        )}
        <Card className="rounded-2xl sm:rounded-[2rem] border shadow-sm overflow-hidden bg-card/50 backdrop-blur-sm">
          <CardHeader className="border-b bg-muted/20 px-6 py-6">
            <CardTitle className="text-lg font-display flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-primary" />
              {language === 'ar' ? 'المنهج الكامل' : 'Full curriculum'}
            </CardTitle>
            <CardDescription>
              {language === 'ar' ? 'ترتيب المواد حسب المتطلبات السابقة' : 'Courses ordered by prerequisites'}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            {catalogSorted.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <FolderTree className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="font-medium">
                  {language === 'ar' ? 'لا توجد مواد في الكتالوج' : 'No courses in catalog'}
                </p>
              </div>
            ) : (
              <Collapsible open={expandedCatalog} onOpenChange={setExpandedCatalog}>
                <div className="space-y-1">
                  {catalogSorted.map((course) => (
                    <div
                      key={course.id}
                      className="flex items-center gap-3 py-2.5 px-4 rounded-xl border border-border/50 hover:bg-muted/30"
                    >
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                      <Badge variant="secondary" className="rounded-full text-xs shrink-0">
                        {course.course_code}
                      </Badge>
                      <span className="font-medium flex-1">{course.course_name}</span>
                      <span className="text-sm text-muted-foreground">{course.credit_hours ?? 0}h</span>
                    </div>
                  ))}
                </div>
              </Collapsible>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // --- Student view: full catalog in cards (chains + standalone), every course shown ---
  return (
    <div
      className="space-y-6 pb-12"
      data-testid={isDean ? 'dean-subject-tree' : isViceDeanAcademic ? 'vda-subject-tree' : isReadOnlyTree ? 'staff-subject-tree' : 'subject-tree-page'}
      ref={containerRef}
    >
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold font-display tracking-tight text-foreground flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <FolderTree className="w-5 h-5" />
            </div>
            {language === 'ar' ? 'شجرة المواد' : 'Subject Tree'}
          </h2>
          <p className="text-muted-foreground mt-1">
            {isDean
              ? (language === 'ar'
                ? 'نفس سلاسل المتطلبات عند الطالب. اضغط المادة لعرض تفاصيلها وتعديلها.'
                : 'Same prerequisite chains as the student tree. Click a course to view and edit it.')
              : isViceDeanAcademic
                ? (language === 'ar'
                  ? 'نفس سلاسل المتطلبات عند الطالب. اضغط المادة لمراجعتها. التعديل اليومي ليس من هنا.'
                  : 'Same prerequisite chains as the student tree. Click a course to review it. Daily edits are not here.')
              : (language === 'ar'
                ? 'الخطة والمتطلبات تضعها الإدارة العليا. يمكنك مشاهدة الشجرة فقط.'
                : 'The plan and prerequisites are set by academic administration. You can only view the tree.')}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto sm:max-w-md">
          <div className="flex gap-2 items-center flex-1 min-w-0">
            <Search className="w-5 h-5 text-muted-foreground shrink-0" />
            <Input
              placeholder={language === 'ar' ? 'بحث باسم المادة أو الرمز...' : 'Search by course name or code...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="rounded-xl flex-1 min-w-0"
              data-testid="subject-tree-search"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {showStudentStatus && (
            <Badge variant="default" className="rounded-full px-4 py-2 text-sm gap-1.5" data-testid="subject-tree-enrolled-hours">
              <Clock className="w-4 h-4" />
              {t('courses.totalEnrolledHours')}: {totalEnrolledHours}h
            </Badge>
          )}
          <Badge variant="outline" className="rounded-full px-4 py-2 text-sm gap-1.5">
            {t('courses.totalCatalogHours')}: {totalCatalogHours}h
          </Badge>
          {catalogList.length > 0 && (
            <Badge variant="secondary" className="rounded-full px-4 py-2 text-sm gap-1.5">
              {language === 'ar' ? 'عدد المواد' : 'Courses'}: {catalogList.length}
            </Badge>
          )}
          {showMyCourses && (
            <Badge variant="outline" className="rounded-full px-4 py-2 text-sm gap-1.5 border-primary/40 text-primary" data-testid="subject-tree-my-count">
              {language === 'ar' ? 'موادي' : 'My courses'}: {myCourseIds.size}
            </Badge>
          )}
        </div>
      </div>

      {searchTrimmed && searchMatches.length > 0 && (
        <Card className="rounded-2xl border shadow-sm overflow-hidden bg-card/50" data-testid="subject-tree-search-results">
          <CardHeader className="border-b bg-muted/20 px-6 py-4">
            <CardTitle className="text-base font-display flex items-center gap-2">
              <Search className="w-4 h-4 text-primary" />
              {language === 'ar' ? 'نتائج البحث' : 'Search results'} ({searchMatches.length})
            </CardTitle>
            <CardDescription>
              {language === 'ar' ? 'سلسلة المادة ومتطلباتها السابقة' : 'Course chain and prerequisites'}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            {searchMatches.map((course) => {
              const chain = getPrerequisiteChain(course, catalogById);
              return (
                <div key={course.id} className="rounded-xl border border-border/50 overflow-hidden">
                  <p className="text-xs font-medium text-muted-foreground px-4 py-2 bg-muted/30 border-b">
                    {language === 'ar' ? 'سلسلة المتطلبات السابقة' : 'Prerequisite chain'}
                  </p>
                  <div className="p-4 space-y-3">
                    {chain.map((c, i) => {
                      const unlocked = isUnlocked(c);
                      const enrolled = isEnrolled(c);
                      const locked = showStudentStatus && !unlocked && !enrolled;
                      const studentCourse = enrolledCourseByCatalogId[Number(c.id)]
                        || enrolledCourseByCatalogId[String(c.course_code || '').trim().toLowerCase()];
                      return (
                        <div
                          key={c.id}
                          className={cn('flex items-center gap-2 flex-wrap', isLeadTree && 'cursor-pointer rounded-lg px-1 py-0.5 hover:bg-muted/50')}
                          onClick={isLeadTree ? () => openDeanCourse(c) : undefined}
                          role={isLeadTree ? 'button' : undefined}
                        >
                          {i > 0 && <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                          <Badge variant="secondary" className="rounded-full text-xs">{c.course_code}</Badge>
                          <span className={c.id === course.id ? 'font-semibold' : locked ? 'text-muted-foreground' : ''}>{c.course_name}</span>
                          <span className="text-xs text-muted-foreground">({c.credit_hours ?? 0}h)</span>
                          {locked && <Badge variant="outline" className="rounded-full text-xs">{language === 'ar' ? 'مقفل' : 'Locked'}</Badge>}
                          {isLeadTree && (
                            <span className="text-sm text-primary">{language === 'ar' ? 'تفاصيل وتعديل' : 'View and edit'}</span>
                          )}
                          {showStudentStatus && (
                            <StudentTreeAction
                              action={catalogAction(c)}
                              courseId={studentCourse?.id}
                              courseCode={c.course_code}
                              language={language}
                              testidPrefix="tree-search"
                            />
                          )}
                          {showMyCourses && myCourseIds.has(Number(c.id)) && (
                            <MyCourseLink catalogId={c.id} courseCode={c.course_code} language={language} testidPrefix="tree-search" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
      {searchTrimmed && searchMatches.length === 0 && catalogList.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {language === 'ar' ? 'لا توجد مواد تطابق البحث.' : 'No courses match your search.'}
        </p>
      )}

      {catalogList.length === 0 ? (
        <Card className="rounded-2xl sm:rounded-[2rem] border shadow-sm overflow-hidden bg-card/50 backdrop-blur-sm">
          <CardContent className="py-12 text-center text-muted-foreground">
            <FolderTree className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="font-medium">
              {language === 'ar' ? 'لا توجد مواد في الكتالوج' : 'No courses in catalog'}
            </p>
            <p className="text-sm mt-1">
              {isLeadTree
                ? (language === 'ar' ? 'أضف المواد من صفحة الخطة الدراسية.' : 'Add courses from the curriculum page.')
                : (language === 'ar' ? 'لم تُضف مواد إلى الخطة الدراسية بعد. تضيفها عمادة الكلية.' : 'No courses have been added to the study plan yet. The college dean adds them.')}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {chainGroups.map((group, groupIdx) => (
            <Card
              key={groupIdx}
              className="rounded-2xl sm:rounded-[2rem] border shadow-sm overflow-hidden bg-card/50 backdrop-blur-sm"
            >
              <CardHeader className="border-b bg-muted/20 px-6 py-4">
                <CardTitle className="text-base font-display flex items-center gap-2">
                  <FolderTree className="w-4 h-4 text-primary" />
                  {group.length === 1
                    ? (language === 'ar' ? 'مادة بدون متطلب سابق' : 'Standalone course')
                    : (language === 'ar' ? `سلسلة مواد (${group.length})` : `Course chain (${group.length})`)}
                </CardTitle>
                <CardDescription>
                  {group.length === 1
                    ? (!showStudentStatus
                      ? (language === 'ar' ? 'مادة بدون متطلب سابق في الخطة' : 'Course with no prerequisite in the plan')
                      : (language === 'ar' ? 'مادة يمكن تسجيلها مباشرة' : 'Course available to enroll directly'))
                    : (language === 'ar' ? 'الترتيب حسب المتطلبات السابقة' : 'Ordered by prerequisites')}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                <div className="relative">
                  <div
                    className="absolute left-6 top-0 bottom-0 w-0.5 bg-gradient-to-b from-primary/40 via-primary/20 to-transparent rounded-full"
                    aria-hidden
                  />
                  <div className="space-y-4">
                    {group.map((cat, idx) => {
                      const unlocked = isUnlocked(cat);
                      const enrolled = isEnrolled(cat);
                      const studentCourse = enrolledCourseByCatalogId[Number(cat.id)]
                        || enrolledCourseByCatalogId[String(cat.course_code || '').trim().toLowerCase()];
                      const locked = showStudentStatus && !unlocked && !enrolled;
                      const mine = showMyCourses && myCourseIds.has(Number(cat.id));
                      return (
                        <div
                          key={cat.id ?? `g${groupIdx}-${idx}`}
                          className="relative flex items-stretch gap-4 pl-4"
                          data-testid={`subject-tree-node-${cat.course_code}`}
                          data-mine={mine ? 'true' : undefined}
                        >
                          <div className="absolute left-0 top-6 w-4 h-4 rounded-full border-2 border-background bg-primary/20 shrink-0 z-10" />
                          <Card
                            className={cn(
                              'flex-1 transition-all duration-300 ease-out overflow-hidden',
                              'hover:shadow-lg hover:scale-[1.01] hover:z-10',
                              locked && 'opacity-70 border-dashed pointer-events-none',
                              showStudentStatus && enrolled && 'border-primary/30 bg-primary/5 shadow-sm',
                              mine && 'border-primary/50 bg-primary/5 shadow-sm',
                              !locked && 'hover:border-primary/40',
                              isLeadTree && 'cursor-pointer'
                            )}
                            onClick={isLeadTree ? () => openDeanCourse(cat) : undefined}
                            role={isLeadTree ? 'button' : undefined}
                            tabIndex={isLeadTree ? 0 : undefined}
                            onKeyDown={isLeadTree ? (e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                openDeanCourse(cat);
                              }
                            } : undefined}
                          >
                            <CardContent className="p-4 flex flex-wrap items-center gap-3">
                              <div className="flex items-center gap-2 shrink-0">
                                {locked ? (
                                  <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-muted-foreground">
                                    <Lock className="w-5 h-5" />
                                  </div>
                                ) : isLeadTree ? (
                                  <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary">
                                    <Pencil className="w-5 h-5" />
                                  </div>
                                ) : mine ? (
                                  <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary">
                                    <GraduationCap className="w-5 h-5" />
                                  </div>
                                ) : enrolled ? (
                                  <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary">
                                    <CheckCircle2 className="w-5 h-5" />
                                  </div>
                                ) : (
                                  <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-muted-foreground">
                                    <BookOpen className="w-5 h-5" />
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <Badge variant="secondary" className="rounded-full text-xs mb-1">
                                  {cat.course_code}
                                </Badge>
                                <p className="font-semibold text-foreground">{cat.course_name}</p>
                                <p className="text-xs text-muted-foreground">{cat.credit_hours ?? 0}h</p>
                              </div>
                              {locked && (
                                <Badge variant="outline" className="rounded-full text-xs shrink-0">
                                  {language === 'ar' ? 'مقفل' : 'Locked'}
                                </Badge>
                              )}
                              {isLeadTree && (
                                <span className="shrink-0 text-sm font-medium text-primary">
                                  {language === 'ar' ? 'تفاصيل وتعديل' : 'View and edit'} →
                                </span>
                              )}
                              {showStudentStatus && (
                                <StudentTreeAction
                                  action={catalogAction(cat)}
                                  courseId={studentCourse?.id}
                                  courseCode={cat.course_code}
                                  language={language}
                                />
                              )}
                              {mine && (
                                <MyCourseLink catalogId={cat.id} courseCode={cat.course_code} language={language} />
                              )}
                            </CardContent>
                          </Card>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {isLeadTree && (
        <Dialog open={!!deanCourse} onOpenChange={(v) => { if (!v) setDeanCourse(null); }}>
          <DialogContent className="rounded-2xl max-w-lg max-h-[90vh] overflow-y-auto" data-testid={isDean ? 'dean-course-dialog' : 'vda-course-dialog'}>
            <DialogHeader>
              <DialogTitle>
                {isDean
                  ? (language === 'ar' ? 'تفاصيل المادة وتعديلها' : 'Course details and edit')
                  : (language === 'ar' ? 'مراجعة المادة' : 'Course review')}
              </DialogTitle>
              <DialogDescription>
                {deanCourse
                  ? (language === 'ar'
                    ? `المتطلب السابق: ${prereqLabel(deanCourse.prerequisite_id)}`
                    : `Prerequisite: ${prereqLabel(deanCourse.prerequisite_id)}`)
                  : ''}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={isDean ? saveDeanCourse : (e) => e.preventDefault()} className="space-y-3">
              <div className="space-y-1">
                <Label>{language === 'ar' ? 'رمز المادة' : 'Code'}</Label>
                <Input required value={deanForm.course_code} onChange={(e) => setDeanForm({ ...deanForm, course_code: e.target.value })} className="rounded-xl" disabled={!isDean} />
              </div>
              <div className="space-y-1">
                <Label>{language === 'ar' ? 'اسم المادة' : 'Name'}</Label>
                <Input required value={deanForm.course_name} onChange={(e) => setDeanForm({ ...deanForm, course_name: e.target.value })} className="rounded-xl" disabled={!isDean} />
              </div>
              <div className="space-y-1">
                <Label>{language === 'ar' ? 'القسم' : 'Department'}</Label>
                <Select value={deanForm.department_id} onValueChange={(v) => setDeanForm({ ...deanForm, department_id: v })} disabled={!isDean}>
                  <SelectTrigger className="rounded-xl"><SelectValue placeholder={language === 'ar' ? 'اختر القسم' : 'Choose department'} /></SelectTrigger>
                  <SelectContent>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={String(d.id)}>
                        {language === 'ar' ? (d.name_ar || d.name) : (d.name_en || d.name)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{language === 'ar' ? 'الوصف' : 'Description'}</Label>
                <Input value={deanForm.description} onChange={(e) => setDeanForm({ ...deanForm, description: e.target.value })} className="rounded-xl" disabled={!isDean} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{language === 'ar' ? 'ساعات' : 'Credits'}</Label>
                  <Input type="number" min="1" value={deanForm.credit_hours} onChange={(e) => setDeanForm({ ...deanForm, credit_hours: e.target.value })} className="rounded-xl" disabled={!isDean} />
                </div>
                <div className="space-y-1">
                  <Label>{language === 'ar' ? 'الترتيب' : 'Order'}</Label>
                  <Input type="number" min="1" value={deanForm.order} onChange={(e) => setDeanForm({ ...deanForm, order: e.target.value })} className="rounded-xl" disabled={!isDean} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>{language === 'ar' ? 'المتطلب السابق' : 'Prerequisite'}</Label>
                <Select value={deanForm.prerequisite_id} onValueChange={(v) => setDeanForm({ ...deanForm, prerequisite_id: v })} disabled={!isDean}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{language === 'ar' ? 'بدون' : 'None'}</SelectItem>
                    {catalogList.filter((c) => !deanCourse || c.id !== deanCourse.id).map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.course_code} — {c.course_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {isDean && (
              <Button type="submit" className="w-full rounded-xl" disabled={deanSaving}>
                {deanSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : (language === 'ar' ? 'حفظ التعديلات' : 'Save changes')}
              </Button>
              )}
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
