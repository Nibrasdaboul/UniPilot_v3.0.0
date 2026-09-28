import { useAuth } from '@/lib/AuthContext';
import Exams from '@/pages/Exams';
import AcademicViceDeanExams from '@/pages/AcademicViceDeanExams';

export default function RoleExams() {
  const { isViceDeanAcademic } = useAuth();
  if (isViceDeanAcademic) return <AcademicViceDeanExams />;
  return <Exams />;
}
