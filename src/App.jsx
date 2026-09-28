import { useEffect, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import AOS from "aos";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/lib/ThemeContext";
import { LanguageProvider } from "@/lib/LanguageContext";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { CookieConsentBanner } from "@/components/CookieConsentBanner";
import { PageSEO } from "@/components/PageSEO";
import LandingPage from "@/pages/LandingPage";
import { PageEntrance } from "@/components/ui/PageEntrance";
import RoleDashboard from "@/pages/RoleDashboard";
import DeanReport from "@/pages/DeanReport";
import Courses from "@/pages/Courses";
import CourseDetails from "@/pages/CourseDetails";
import AcademicHistory from "@/pages/AcademicHistory";
import Planner from "@/pages/Planner";
import AICoach from "@/pages/AICoach";
import StudyTools from "@/pages/StudyTools";
import Notes from "@/pages/Notes";
import SubjectTree from "@/pages/SubjectTree";
import VoiceToText from "@/pages/VoiceToText";
import VideoTranslate from "@/pages/VideoTranslate";
import ReadTexts from "@/pages/ReadTexts";
import AdminNotifications from "@/pages/AdminNotifications";
import StudentAdminNotifications from "@/pages/StudentAdminNotifications";
import Settings from "@/pages/Settings";
import PrivacyPolicy from "@/pages/PrivacyPolicy";
import TermsOfService from "@/pages/TermsOfService";
import Pricing from "@/pages/Pricing";
import UsersDirectory from "@/pages/UsersDirectory";
import AcademicCalendar from "@/pages/AcademicCalendar";
import RoleCurriculum from "@/pages/RoleCurriculum";
import Registration from "@/pages/Registration";
import RegistrationSections from "@/pages/RegistrationSections";
import WeeklyProgram from "@/pages/WeeklyProgram";
import RoleOfficialGrades from "@/pages/RoleOfficialGrades";
import RoleExams from "@/pages/RoleExams";
import RoleTeachingStaff from "@/pages/RoleTeachingStaff";
import StudentAffairs from "@/pages/StudentAffairs";
import AcademicViceDeanResearch from "@/pages/AcademicViceDeanResearch";
import AcademicViceDeanCourseInfo from "@/pages/AcademicViceDeanCourseInfo";
import StaffMyCourses from "@/pages/StaffMyCourses";
import StaffCourseWorkspace from "@/pages/StaffCourseWorkspace";
import VdaStaffAttendance from "@/pages/VdaStaffAttendance";
import ExamsCourseMarks from "@/pages/ExamsCourseMarks";
import GpaScale from "@/pages/GpaScale";
import RoleSurveys from "@/pages/RoleSurveys";
import StudentProjects from "@/pages/StudentProjects";
import RoleSpecialization from "@/pages/RoleSpecialization";

const Analytics = lazy(() => import("@/pages/Analytics"));
const Infographics = lazy(() => import("@/pages/Infographics"));
const Theses = lazy(() => import("@/pages/Theses"));
const AdminPanel = lazy(() => import("@/pages/AdminPanel"));

function PageFallback() {
  return (
    <div className="flex items-center justify-center min-h-[200px]">
      <div className="w-10 h-10 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );
}

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-primary">Uni</div>
        </div>
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/" replace />;
  return children;
}

function AdminRoute({ children }) {
  const { isAdmin, loading } = useAuth();
  if (loading) return null;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return children;
}

function StudentRoute({ children }) {
  const { isStudent, loading } = useAuth();
  if (loading) return null;
  if (!isStudent) return <Navigate to="/dashboard" replace />;
  return children;
}

function NonStudentRoute({ children }) {
  const { isStudent, loading } = useAuth();
  if (loading) return null;
  if (isStudent) return <Navigate to="/dashboard" replace />;
  return children;
}

function DeanRoute({ children }) {
  const { isDean, loading } = useAuth();
  if (loading) return null;
  if (!isDean) return <Navigate to="/dashboard" replace />;
  return children;
}

function VdaRoute({ children }) {
  const { isViceDeanAcademic, loading } = useAuth();
  if (loading) return null;
  if (!isViceDeanAcademic) return <Navigate to="/dashboard" replace />;
  return children;
}

function TeachingStaffRoute({ children }) {
  const { isTeachingStaff, loading } = useAuth();
  if (loading) return null;
  if (!isTeachingStaff) return <Navigate to="/dashboard" replace />;
  return children;
}

function ExamsOfficeRoute({ children }) {
  const { isExamsOffice, loading } = useAuth();
  if (loading) return null;
  if (!isExamsOffice) return <Navigate to="/dashboard" replace />;
  return children;
}

function GpaScaleRoute({ children }) {
  const { isViceDeanAcademic, isExamsOffice, loading } = useAuth();
  if (loading) return null;
  if (!isViceDeanAcademic && !isExamsOffice) return <Navigate to="/dashboard" replace />;
  return children;
}

function AOSRefresh() {
  const { pathname } = useLocation();
  useEffect(() => {
    AOS.init({ duration: 600, once: false, offset: 50 });
  }, []);
  useEffect(() => {
    AOS.refresh();
  }, [pathname]);
  return null;
}

function AppRoutes() {
  const { isAuthenticated, loading } = useAuth();
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-primary">Uni</div>
        </div>
      </div>
    );
  }
  return (
    <Routes>
      <Route path="/" element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <PageEntrance pathname="/"><LandingPage /></PageEntrance>} />
      <Route path="/privacy" element={<PageEntrance pathname="/privacy"><PrivacyPolicy /></PageEntrance>} />
      <Route path="/terms" element={<PageEntrance pathname="/terms"><TermsOfService /></PageEntrance>} />
      <Route path="/pricing" element={<PageEntrance pathname="/pricing"><Pricing /></PageEntrance>} />
      <Route path="/dashboard" element={<ProtectedRoute><AppLayout><RoleDashboard /></AppLayout></ProtectedRoute>} />
      <Route path="/dashboard/report/:scope/:id?" element={<ProtectedRoute><DeanRoute><AppLayout><DeanReport /></AppLayout></DeanRoute></ProtectedRoute>} />
      <Route path="/courses" element={<ProtectedRoute><StudentRoute><AppLayout><Courses /></AppLayout></StudentRoute></ProtectedRoute>} />
      <Route path="/academic-history" element={<ProtectedRoute><StudentRoute><AppLayout><AcademicHistory /></AppLayout></StudentRoute></ProtectedRoute>} />
      <Route path="/academic-history/all" element={<ProtectedRoute><StudentRoute><AppLayout><AcademicHistory /></AppLayout></StudentRoute></ProtectedRoute>} />
      <Route path="/academic-history/progress" element={<ProtectedRoute><StudentRoute><AppLayout><AcademicHistory /></AppLayout></StudentRoute></ProtectedRoute>} />
      <Route path="/courses/:courseId" element={<ProtectedRoute><StudentRoute><AppLayout><CourseDetails /></AppLayout></StudentRoute></ProtectedRoute>} />
      <Route path="/planner" element={<ProtectedRoute><StudentRoute><AppLayout><Planner /></AppLayout></StudentRoute></ProtectedRoute>} />
      <Route path="/ai-coach" element={<ProtectedRoute><StudentRoute><AppLayout><AICoach /></AppLayout></StudentRoute></ProtectedRoute>} />
      <Route path="/analytics" element={<ProtectedRoute><StudentRoute><AppLayout><Suspense fallback={<PageFallback />}><Analytics /></Suspense></AppLayout></StudentRoute></ProtectedRoute>} />
      <Route path="/study-tools" element={<ProtectedRoute><StudentRoute><AppLayout><StudyTools /></AppLayout></StudentRoute></ProtectedRoute>} />
      <Route path="/notes" element={<ProtectedRoute><StudentRoute><AppLayout><Notes /></AppLayout></StudentRoute></ProtectedRoute>} />
      <Route path="/subject-tree" element={<ProtectedRoute><AppLayout><SubjectTree /></AppLayout></ProtectedRoute>} />
      <Route path="/voice-to-text" element={<ProtectedRoute><AppLayout><VoiceToText /></AppLayout></ProtectedRoute>} />
      <Route path="/translate-video" element={<ProtectedRoute><AppLayout><VideoTranslate /></AppLayout></ProtectedRoute>} />
      <Route path="/read-texts" element={<ProtectedRoute><AppLayout><ReadTexts /></AppLayout></ProtectedRoute>} />
      <Route path="/infographics" element={<ProtectedRoute><AppLayout><Suspense fallback={<PageFallback />}><Infographics /></Suspense></AppLayout></ProtectedRoute>} />
      <Route path="/theses" element={<ProtectedRoute><AppLayout><Suspense fallback={<PageFallback />}><Theses /></Suspense></AppLayout></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute><AdminRoute><AppLayout><Suspense fallback={<PageFallback />}><AdminPanel /></Suspense></AppLayout></AdminRoute></ProtectedRoute>} />
      <Route path="/admin/notifications" element={<ProtectedRoute><AdminRoute><AppLayout><AdminNotifications /></AppLayout></AdminRoute></ProtectedRoute>} />
      <Route path="/admin-notifications" element={<ProtectedRoute><AppLayout><StudentAdminNotifications /></AppLayout></ProtectedRoute>} />
      <Route path="/users" element={<ProtectedRoute><AppLayout><UsersDirectory /></AppLayout></ProtectedRoute>} />
      <Route path="/academic-calendar" element={<ProtectedRoute><AppLayout><AcademicCalendar /></AppLayout></ProtectedRoute>} />
      <Route path="/curriculum" element={<ProtectedRoute><AppLayout><RoleCurriculum /></AppLayout></ProtectedRoute>} />
      <Route path="/registration" element={<ProtectedRoute><StudentRoute><AppLayout><Registration /></AppLayout></StudentRoute></ProtectedRoute>} />
      <Route path="/registration/sections" element={<ProtectedRoute><StudentRoute><AppLayout><RegistrationSections /></AppLayout></StudentRoute></ProtectedRoute>} />
      <Route path="/weekly-program" element={<ProtectedRoute><StudentRoute><AppLayout><WeeklyProgram /></AppLayout></StudentRoute></ProtectedRoute>} />
      <Route path="/projects" element={<ProtectedRoute><StudentRoute><AppLayout><StudentProjects /></AppLayout></StudentRoute></ProtectedRoute>} />
      <Route path="/specialization" element={<ProtectedRoute><AppLayout><RoleSpecialization /></AppLayout></ProtectedRoute>} />
      <Route path="/official-grades" element={<ProtectedRoute><AppLayout><RoleOfficialGrades /></AppLayout></ProtectedRoute>} />
      <Route path="/exams" element={<ProtectedRoute><AppLayout><RoleExams /></AppLayout></ProtectedRoute>} />
      <Route path="/teaching-staff" element={<ProtectedRoute><NonStudentRoute><AppLayout><RoleTeachingStaff /></AppLayout></NonStudentRoute></ProtectedRoute>} />
      <Route path="/student-affairs" element={<ProtectedRoute><AppLayout><StudentAffairs /></AppLayout></ProtectedRoute>} />
      <Route path="/research" element={<ProtectedRoute><VdaRoute><AppLayout><AcademicViceDeanResearch /></AppLayout></VdaRoute></ProtectedRoute>} />
      <Route path="/course-info" element={<ProtectedRoute><VdaRoute><AppLayout><AcademicViceDeanCourseInfo /></AppLayout></VdaRoute></ProtectedRoute>} />
      <Route path="/staff-attendance" element={<ProtectedRoute><VdaRoute><AppLayout><VdaStaffAttendance /></AppLayout></VdaRoute></ProtectedRoute>} />
      <Route path="/course-info/:catalogId" element={<ProtectedRoute><VdaRoute><AppLayout><StaffCourseWorkspace mode="vda" /></AppLayout></VdaRoute></ProtectedRoute>} />
      <Route path="/my-sessions" element={<Navigate to="/my-courses" replace />} />
      <Route path="/my-courses" element={<ProtectedRoute><TeachingStaffRoute><AppLayout><StaffMyCourses /></AppLayout></TeachingStaffRoute></ProtectedRoute>} />
      <Route path="/my-courses/:catalogId" element={<ProtectedRoute><TeachingStaffRoute><AppLayout><StaffCourseWorkspace mode="staff" /></AppLayout></TeachingStaffRoute></ProtectedRoute>} />
      <Route path="/course-marks" element={<ProtectedRoute><ExamsOfficeRoute><AppLayout><ExamsCourseMarks /></AppLayout></ExamsOfficeRoute></ProtectedRoute>} />
      <Route path="/course-marks/:catalogId" element={<ProtectedRoute><ExamsOfficeRoute><AppLayout><StaffCourseWorkspace mode="exams" /></AppLayout></ExamsOfficeRoute></ProtectedRoute>} />
      <Route path="/gpa-scale" element={<ProtectedRoute><GpaScaleRoute><AppLayout><GpaScale /></AppLayout></GpaScaleRoute></ProtectedRoute>} />
      <Route path="/surveys" element={<ProtectedRoute><AppLayout><RoleSurveys /></AppLayout></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><AppLayout><Settings /></AppLayout></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <BrowserRouter>
          <AuthProvider>
            <PageSEO />
            <AOSRefresh />
            <AppRoutes />
            <CookieConsentBanner />
            <Toaster richColors position="top-center" />
          </AuthProvider>
        </BrowserRouter>
      </LanguageProvider>
    </ThemeProvider>
  );
}
