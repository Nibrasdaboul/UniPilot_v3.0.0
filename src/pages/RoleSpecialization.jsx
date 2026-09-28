import { Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import AcademicViceDeanSpecialization from '@/pages/AcademicViceDeanSpecialization';
import StudentSpecialization from '@/pages/StudentSpecialization';

export default function RoleSpecialization() {
  const { isViceDeanAcademic, isStudent } = useAuth();
  if (isViceDeanAcademic) return <AcademicViceDeanSpecialization />;
  if (isStudent) return <StudentSpecialization />;
  return <Navigate to="/dashboard" replace />;
}
