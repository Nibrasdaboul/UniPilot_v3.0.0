import { Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import AcademicViceDeanSurveys from '@/pages/AcademicViceDeanSurveys';
import StudentSurveys from '@/pages/StudentSurveys';

export default function RoleSurveys() {
  const { isViceDeanAcademic, isStudent } = useAuth();
  if (isViceDeanAcademic) return <AcademicViceDeanSurveys />;
  if (isStudent) return <StudentSurveys />;
  return <Navigate to="/dashboard" replace />;
}
