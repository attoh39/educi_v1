import { Navigate, Outlet } from 'react-router-dom';
import { Chargement } from '../../components/Chargement';
import { useAuth } from './AuthProvider';

export function ProtectedRoute() {
  const { session, loading } = useAuth();
  if (loading) return <Chargement />;
  if (!session) return <Navigate to="/connexion" replace />;
  return <Outlet />;
}
