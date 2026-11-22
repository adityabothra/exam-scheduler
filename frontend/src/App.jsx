import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/layout/Layout';
import { PageLoader } from './components/common/UI';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Students from './pages/Students';
import Faculty from './pages/Faculty';
import Subjects from './pages/Subjects';
import Rooms from './pages/Rooms';
import TimeSlots from './pages/TimeSlots';
import Availability from './pages/Availability';
import Examinations from './pages/Examinations';
import AIOptimizer from './pages/AIOptimizer';
import OptimizationHistory from './pages/OptimizationHistory';
import ConflictDetection from './pages/ConflictDetection';
import Timetable from './pages/Timetable';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import ImportData from './pages/ImportData';

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader label="Restoring session..." />;
  return user ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Protected><Layout /></Protected>}>
        <Route index element={<Dashboard />} />
        <Route path="students" element={<Students />} />
        <Route path="faculty" element={<Faculty />} />
        <Route path="subjects" element={<Subjects />} />
        <Route path="rooms" element={<Rooms />} />
        <Route path="time-slots" element={<TimeSlots />} />
        <Route path="availability" element={<Availability />} />
        <Route path="examinations" element={<Examinations />} />
        <Route path="optimizer" element={<AIOptimizer />} />
        <Route path="history" element={<OptimizationHistory />} />
        <Route path="conflicts" element={<ConflictDetection />} />
        <Route path="timetable" element={<Timetable />} />
        <Route path="reports" element={<Reports />} />
        <Route path="import" element={<ImportData />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
