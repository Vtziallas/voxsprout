import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import PatientProfile from './pages/PatientProfile';
import NewSession from './pages/NewSession';
import SessionResults from './pages/SessionResults';
import TrainingDashboard from './pages/TrainingDashboard';
import BulkLabeling from './pages/BulkLabeling';
import AcousticAnalysis from './pages/AcousticAnalysis';

function RequireAuth({ children }) {
  const { therapist, loading } = useAuth();
  if (loading) return (
    <div className="loading-screen">
      <div className="spinner" />
    </div>
  );
  return therapist ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<RequireAuth><Dashboard /></RequireAuth>} />
      <Route path="/patients/:id" element={<RequireAuth><PatientProfile /></RequireAuth>} />
      <Route path="/sessions/new" element={<RequireAuth><NewSession /></RequireAuth>} />
      <Route path="/sessions/:id/results" element={<RequireAuth><SessionResults /></RequireAuth>} />
      <Route path="/training" element={<RequireAuth><TrainingDashboard /></RequireAuth>} />
      <Route path="/labeling" element={<RequireAuth><BulkLabeling /></RequireAuth>} />
      <Route path="/sessions/:id/analysis" element={<RequireAuth><AcousticAnalysis /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
