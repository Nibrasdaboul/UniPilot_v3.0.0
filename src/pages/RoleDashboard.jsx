import { useAuth } from '@/lib/AuthContext';
import Dashboard from '@/pages/Dashboard';
import DeanDashboard from '@/pages/DeanDashboard';
import AcademicViceDeanDashboard from '@/pages/AcademicViceDeanDashboard';

export default function RoleDashboard() {
  const { isDean, isViceDeanAcademic } = useAuth();
  if (isDean) return <DeanDashboard />;
  if (isViceDeanAcademic) return <AcademicViceDeanDashboard />;
  return <Dashboard />;
}
