import { useAuth } from '@/lib/AuthContext';
import OfficialGrades from '@/pages/OfficialGrades';
import AcademicViceDeanGrades from '@/pages/AcademicViceDeanGrades';

export default function RoleOfficialGrades() {
  const { isViceDeanAcademic } = useAuth();
  if (isViceDeanAcademic) return <AcademicViceDeanGrades />;
  return <OfficialGrades />;
}
