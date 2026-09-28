import { useAuth } from '@/lib/AuthContext';
import Curriculum from '@/pages/Curriculum';
import AcademicViceDeanCurriculum from '@/pages/AcademicViceDeanCurriculum';

export default function RoleCurriculum() {
  const { isViceDeanAcademic } = useAuth();
  if (isViceDeanAcademic) return <AcademicViceDeanCurriculum />;
  return <Curriculum />;
}
