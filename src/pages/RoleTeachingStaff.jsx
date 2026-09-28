import { useAuth } from '@/lib/AuthContext';
import TeachingStaff from '@/pages/TeachingStaff';
import AcademicViceDeanStaff from '@/pages/AcademicViceDeanStaff';

export default function RoleTeachingStaff() {
  const { isViceDeanAcademic } = useAuth();
  if (isViceDeanAcademic) return <AcademicViceDeanStaff />;
  return <TeachingStaff />;
}
